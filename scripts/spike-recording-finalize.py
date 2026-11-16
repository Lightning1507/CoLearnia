"""Record fixed GStreamer or mediasoup sources, Stop/EOS, and verify the WebM."""

import argparse
from contextlib import contextmanager
import json
import os
import pathlib
import re
import selectors
import signal
import subprocess
import tempfile
import time

import gi

gi.require_version("Gst", "1.0")
from gi.repository import Gst


def baseline_pipeline():
    return Gst.parse_launch(
        "webmmux name=mux ! filesink name=output "
        "videotestsrc is-live=true pattern=ball ! video/x-raw,width=320,height=240,framerate=25/1 "
        "! queue ! vp8enc deadline=1 keyframe-max-dist=25 ! mux.video_0 "
        "audiotestsrc is-live=true wave=sine freq=440 ! audio/x-raw,rate=48000,channels=1 "
        "! queue ! opusenc ! mux.audio_0"
    )


SOURCES = ("screen", "camera", "mic")


def read_event(fixture, timeout):
    with selectors.DefaultSelector() as selector:
        selector.register(fixture.stdout, selectors.EVENT_READ)
        if not selector.select(timeout):
            raise RuntimeError("Timed out waiting for the SCRUM-49 fixture")
        line = fixture.stdout.readline()
    if not line:
        raise RuntimeError(f"SCRUM-49 fixture exited: {fixture.poll()}")
    return json.loads(line)


@contextmanager
def rtp_fixture(script, port_base):
    ports = list(range(port_base, port_base + 6))
    fixture = subprocess.Popen(
        ["node", str(script), *map(str, ports)],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, start_new_session=True,
    )
    try:
        descriptor = read_event(fixture, 10)
        tracks = descriptor["tracks"]
        if (
            descriptor["event"] != "descriptor"
            or tuple(track["source"] for track in tracks) != SOURCES
            or [port for track in tracks for port in (track["rtpPort"], track["rtcpPort"])] != ports
            or any(track["ip"] != "127.0.0.1" for track in tracks)
        ):
            raise RuntimeError("Unexpected SCRUM-49 descriptor")
        yield fixture, descriptor
    finally:
        if fixture.poll() is None:
            # The fixture owns a native worker and three FFmpeg children.
            try:
                os.killpg(fixture.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        fixture.wait(timeout=5)
        fixture.stdin.close()
        fixture.stdout.close()


def rtp_pipeline(descriptor):
    parts = [
        "rtpbin name=rtp latency=100",
        "webmmux name=mux ! filesink name=output",
        "compositor name=layout sink_1::xpos=320 "
        "! video/x-raw,width=480,height=240,framerate=25/1 ! queue "
        "! vp8enc deadline=1 keyframe-max-dist=25 ! mux.video_0",
    ]
    for index, track in enumerate(descriptor["tracks"]):
        source = track["source"]
        params = track["rtpParameters"]
        codec, = params["codecs"]
        encoding, = params["encodings"]
        kind, codec_name = ("audio", "OPUS") if source == "mic" else ("video", "VP8")
        if track["kind"] != kind or codec["mimeType"].upper() != f"{kind.upper()}/{codec_name}":
            raise RuntimeError(f"Unexpected codec for {source}")
        caps = (
            f"application/x-rtp,media={kind},encoding-name={codec_name},"
            f"clock-rate={int(codec['clockRate'])},payload={int(codec['payloadType'])},"
            f"ssrc=(uint){int(encoding['ssrc'])}"
        )
        tail = (
            "rtpopusdepay ! opusdec ! audioconvert ! audioresample "
            "! audio/x-raw,rate=48000,channels=1 ! identity name=mic ! opusenc ! mux.audio_0"
            if source == "mic"
            else f"rtpvp8depay ! vp8dec ! videoconvert ! identity name={source} ! layout.sink_{index}"
        )
        parts.extend([
            f'udpsrc name={source}_rtp address=127.0.0.1 port={track["rtpPort"]} '
            f'caps="{caps}" ! rtp.recv_rtp_sink_{index}',
            f'udpsrc name={source}_rtcp address=127.0.0.1 port={track["rtcpPort"]} '
            f'caps="application/x-rtcp" ! rtp.recv_rtcp_sink_{index}',
            f"rtp. ! capsfilter caps={caps} ! queue ! {tail}",
        ])
    return Gst.parse_launch(" ".join(parts))


def record(output, pipeline, fixture=None):
    counts = dict.fromkeys(SOURCES, 0)

    def count_buffer(_pad, _info, source):
        counts[source] += 1
        return Gst.PadProbeReturn.OK

    if fixture:
        for source in SOURCES:
            pipeline.get_by_name(source).get_static_pad("src").add_probe(
                Gst.PadProbeType.BUFFER, count_buffer, source,
            )
    pipeline.get_by_name("output").set_property("location", str(output))
    bus = pipeline.get_bus()
    try:
        pipeline.set_state(Gst.State.PLAYING)
        if fixture:
            sockets = [pipeline.get_by_name(source + suffix)
                       for source in SOURCES for suffix in ("_rtp", "_rtcp")]
            if not all(element.get_property("used-socket") for element in sockets):
                raise RuntimeError("Recorder did not bind all six RTP/RTCP sockets")
            fixture.stdin.write(b"start\n")
            fixture.stdin.flush()
        _, state, _ = pipeline.get_state(5 * Gst.SECOND)
        if state != Gst.State.PLAYING:
            raise RuntimeError("Pipeline failed to reach PLAYING")
        started = time.monotonic()
        terminal_events = Gst.MessageType.ERROR | Gst.MessageType.EOS
        if bus.timed_pop_filtered((3 if fixture else 4) * Gst.SECOND, terminal_events) is not None:
            raise RuntimeError("Pipeline terminated before Stop")
        stop_position = pipeline.query_position(Gst.Format.TIME)
        stopped = time.monotonic()
        if not pipeline.send_event(Gst.Event.new_eos()):
            raise RuntimeError("Pipeline refused EOS")
        message = bus.timed_pop_filtered(10 * Gst.SECOND, terminal_events)
        if message is None:
            raise RuntimeError("Finalize timed out")
        if message.type == Gst.MessageType.ERROR:
            raise RuntimeError(message.parse_error()[0].message)
        if not stop_position[0]:
            raise RuntimeError("No position at Stop")
        if fixture and any(count < 20 for count in counts.values()):
            raise RuntimeError(f"Missing decoded source buffers: {counts}")
        return {
            "recordingSeconds": stopped - started,
            "stopPositionSeconds": stop_position[1] / Gst.SECOND,
            "finalizeSeconds": time.monotonic() - stopped,
            **({"decodedSourceBuffers": counts} if fixture else {}),
        }
    finally:
        pipeline.set_state(Gst.State.NULL)


def inspect(output, stop_position, rtp=False):
    metadata = json.loads(subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(output)],
        timeout=10,
    ))
    duration = float(metadata["format"]["duration"])
    codecs = {stream["codec_type"]: stream["codec_name"] for stream in metadata["streams"]}
    if codecs != {"video": "vp8", "audio": "opus"} or abs(duration - stop_position) > 0.25:
        raise RuntimeError(f"Unexpected codecs or missing tail near Stop: {codecs}, {duration}")

    decoded = {}
    warnings = []
    width = 480 if rtp else 320
    for kind, mapping, options in (
        ("video", "0:v:0", ["-pix_fmt", "rgb24", "-f", "rawvideo"]),
        ("audio", "0:a:0", ["-f", "s16le"]),
    ):
        for position in (1.0, duration - 0.30):
            result = subprocess.run(
                ["ffmpeg", "-v", "warning", "-xerror", "-ss", str(position), "-i", str(output),
                 "-map", mapping, "-t", "0.20", *options, "pipe:1"],
                timeout=10, capture_output=True, check=True,
            )
            warnings.extend(re.sub(r"^\[[^\]]+\] ", "", line)
                            for line in result.stderr.decode().splitlines())
            data = result.stdout
            minimum = width * 240 * 3 * 3 if kind == "video" else 48_000 * 2 * 0.15
            if len(data) < minimum or len(set(data)) < 2:
                raise RuntimeError(f"No usable {kind} at {position:.3f}s")
            if rtp and kind == "video":
                # Sample both tiles in the first decoded frame at each seek position.
                for source, offset, tile_width, tile_height in (
                    ("screen", 0, 320, 240), ("camera", 320, 160, 120),
                ):
                    colors = {
                        tuple(data[(y * width + x) * 3:(y * width + x) * 3 + 3])
                        for y in range(8, tile_height, 16)
                        for x in range(offset + 8, offset + tile_width, 16)
                    }
                    if len(colors) < 5 or not any(max(rgb) - min(rgb) > 60 for rgb in colors):
                        raise RuntimeError(f"Missing visible {source} at {position:.3f}s")
            if rtp and kind == "audio":
                samples = memoryview(data).cast("h")
                crossings = sum(a <= 0 < b for a, b in zip(samples, samples[1:]))
                frequency = crossings * 48000 / len(samples)
                if not 420 <= frequency <= 460:
                    raise RuntimeError(f"Expected 440 Hz mic tone, got {frequency:.1f} Hz")
            decoded[f"{kind}@{position:.3f}s"] = len(data)
    return {
        "durationSeconds": duration, "codecs": codecs, "decodedBytes": decoded,
        "seekWarnings": sorted(set(warnings)),
    }


def run(directory, args):
    output = pathlib.Path(directory) / "recording.webm"
    descriptor = None
    extra = {}
    if args.rtp_fixture:
        with rtp_fixture(args.rtp_fixture.resolve(), args.port_base) as (fixture, descriptor):
            raw = output.with_name("recording-gstreamer.webm")
            measurements = record(raw, rtp_pipeline(descriptor), fixture)
            if read_event(fixture, 8)["event"] != "sources-completed" or fixture.wait(timeout=5):
                raise RuntimeError("SCRUM-49 fixture did not complete")
        raw_evidence = inspect(raw, measurements["stopPositionSeconds"], rtp=True)
        started = time.monotonic()
        subprocess.run(
            ["ffmpeg", "-v", "error", "-xerror", "-i", str(raw), "-map", "0:v:0",
             "-map", "0:a:0", "-c", "copy", str(output)],
            check=True, timeout=10,
        )
        extra = {
            "rawSeekWarnings": raw_evidence["seekWarnings"],
            "remuxSeconds": time.monotonic() - started,
            "sources": [track["source"] for track in descriptor["tracks"]],
        }
    else:
        measurements = record(output, baseline_pipeline())
    verified = inspect(output, measurements["stopPositionSeconds"], rtp=descriptor is not None)
    if descriptor and any("keyframes not correctly marked" in warning
                          for warning in verified["seekWarnings"]):
        raise RuntimeError("Final WebM still reports a keyframe marking warning")
    print(json.dumps({
        "gstreamer": Gst.version_string(),
        **measurements,
        "fileBytes": output.stat().st_size,
        **verified,
        **extra,
    }))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rtp-fixture", type=pathlib.Path)
    parser.add_argument("--port-base", type=int, default=41000)
    parser.add_argument("--output-dir", type=pathlib.Path, help="Keep recording.webm in a new directory")
    args = parser.parse_args()
    if not 1024 <= args.port_base <= 65530:
        parser.error("--port-base must allow six consecutive UDP ports")
    Gst.init(None)
    if args.output_dir:
        args.output_dir.mkdir()
        run(args.output_dir, args)
    else:
        with tempfile.TemporaryDirectory(prefix="scrum-50-") as directory:
            run(directory, args)
