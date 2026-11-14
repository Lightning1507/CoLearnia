"""Record two fixed sources, explicitly stop, and verify the finalized WebM."""

import json
import pathlib
import subprocess
import tempfile
import time

import gi

gi.require_version("Gst", "1.0")
from gi.repository import Gst


def record(output):
    pipeline = Gst.parse_launch(
        "webmmux name=mux ! filesink name=output "
        "videotestsrc is-live=true pattern=ball ! video/x-raw,width=320,height=240,framerate=25/1 "
        "! queue ! vp8enc deadline=1 keyframe-max-dist=25 ! mux.video_0 "
        "audiotestsrc is-live=true wave=sine freq=440 ! audio/x-raw,rate=48000,channels=1 "
        "! queue ! opusenc ! mux.audio_0"
    )
    pipeline.get_by_name("output").set_property("location", str(output))
    bus = pipeline.get_bus()
    try:
        pipeline.set_state(Gst.State.PLAYING)
        _, state, _ = pipeline.get_state(5 * Gst.SECOND)
        if state != Gst.State.PLAYING:
            raise RuntimeError("Pipeline failed to reach PLAYING")
        started = time.monotonic()
        terminal_events = Gst.MessageType.ERROR | Gst.MessageType.EOS
        if bus.timed_pop_filtered(4 * Gst.SECOND, terminal_events) is not None:
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
        return stopped - started, stop_position[1] / Gst.SECOND, time.monotonic() - stopped
    finally:
        pipeline.set_state(Gst.State.NULL)


def inspect(output, stop_position):
    metadata = json.loads(subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(output)],
        timeout=10,
    ))
    duration = float(metadata["format"]["duration"])
    codecs = {stream["codec_type"]: stream["codec_name"] for stream in metadata["streams"]}
    if codecs != {"video": "vp8", "audio": "opus"} or abs(duration - stop_position) > 0.25:
        raise RuntimeError(f"Unexpected codecs or missing tail near Stop: {codecs}, {duration}")

    decoded = {}
    for kind, mapping, options in (
        ("video", "0:v:0", ["-pix_fmt", "gray", "-f", "rawvideo"]),
        ("audio", "0:a:0", ["-f", "s16le"]),
    ):
        for position in (1.0, duration - 0.30):
            data = subprocess.check_output(
                ["ffmpeg", "-v", "error", "-xerror", "-ss", str(position), "-i", str(output),
                 "-map", mapping, "-t", "0.20", *options, "pipe:1"],
                timeout=10,
            )
            minimum = 320 * 240 * 3 if kind == "video" else 48_000 * 2 * 0.15
            if len(data) < minimum or len(set(data)) < 2:
                raise RuntimeError(f"No usable {kind} at {position:.3f}s")
            decoded[f"{kind}@{position:.3f}s"] = len(data)
    return {"durationSeconds": duration, "codecs": codecs, "decodedBytes": decoded}


if __name__ == "__main__":
    Gst.init(None)
    with tempfile.TemporaryDirectory(prefix="scrum-50-") as directory:
        output = pathlib.Path(directory) / "recording.webm"
        recording, position, finalize = record(output)
        print(json.dumps({
            "gstreamer": Gst.version_string(),
            "recordingSeconds": recording,
            "stopPositionSeconds": position,
            "finalizeSeconds": finalize,
            "fileBytes": output.stat().st_size,
            **inspect(output, position),
        }))
