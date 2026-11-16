"""SCRUM-51: M3 RTP capture into an M2-owned local seekable sink (Linux PoC)."""

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import os
import shutil
import subprocess
import tempfile
from threading import Event, Thread
import time


spec = importlib.util.spec_from_file_location(
    "recorder", Path(__file__).with_name("spike-recording-finalize.py"),
)
recorder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recorder)
Gst = recorder.Gst


def rss_kib():
    return int(next(line.split()[1] for line in Path("/proc/self/status").read_text().splitlines()
                    if line.startswith("VmRSS:")))


def capture(raw, fixture_path, delay_ms, cancel_after_bytes=None):
    metrics = {"writerBuffers": 0, "writerBytes": 0, "writerWaitMs": 0, "byteSegmentOffsets": []}
    cancel_requested = False
    with recorder.rtp_fixture(fixture_path, 41000) as (fixture, descriptor):
        pipeline = recorder.rtp_pipeline(descriptor)
        writer = pipeline.get_by_name("output")
        writer.set_property("buffer-mode", "unbuffered")

        def measure_writer(_pad, info):
            nonlocal cancel_requested
            if info.type & Gst.PadProbeType.BUFFER:
                size = info.get_buffer().get_size()
                before = time.monotonic()
                if delay_ms:
                    time.sleep(delay_ms / 1000)
                metrics["writerBuffers"] += 1
                metrics["writerBytes"] += size
                metrics["writerWaitMs"] += (time.monotonic() - before) * 1000
                if cancel_after_bytes and not cancel_requested and metrics["writerBytes"] >= cancel_after_bytes:
                    cancel_requested = True
                    pipeline.post_message(Gst.Message.new_application(
                        pipeline, Gst.Structure.new_empty(recorder.CANCEL_MESSAGE),
                    ))
            else:
                event = info.get_event()
                if event.type == Gst.EventType.SEGMENT:
                    segment = event.parse_segment()
                    if segment.format == Gst.Format.BYTES:
                        metrics["byteSegmentOffsets"].append(segment.start)
            return Gst.PadProbeReturn.OK

        writer.get_static_pad("sink").add_probe(
            Gst.PadProbeType.BUFFER | Gst.PadProbeType.EVENT_DOWNSTREAM, measure_writer,
        )
        try:
            result = recorder.record(raw, pipeline, fixture, cancel_during_capture=bool(cancel_after_bytes))
        except RuntimeError as error:
            return {**metrics, "captureError": str(error)}
        if not result.get("cancelled") and (
            recorder.read_event(fixture, 8)["event"] != "sources-completed" or fixture.wait(timeout=5)
        ):
            raise RuntimeError("RTP fixture did not complete")
    return {**metrics, **result, "eos": not result.get("cancelled", False),
            "writerStopped": pipeline.get_state(0)[1] == Gst.State.NULL,
            "fixtureStopped": fixture.poll() is not None}


def read_receipt(published):
    with published.open("rb") as file:
        digest = hashlib.file_digest(file, "sha256").hexdigest()
        stat = os.fstat(file.fileno())
    return {"attempt": published.parent.name, "storedBytes": stat.st_size, "sha256": digest}


def finalize(raw, stage, published, stop_position):
    # One operation per private attempt directory in this sequential local fixture.
    if published.exists():
        return {"receipt": read_receipt(published), "replayed": True}
    started = time.monotonic()
    subprocess.run(
        ["ffmpeg", "-v", "error", "-xerror", "-i", str(raw), "-map", "0:v:0",
         "-map", "0:a:0", "-c", "copy", str(stage)],
        timeout=10, check=True,
    )
    with stage.open("r+b") as file:
        os.fsync(file.fileno())
    verified = recorder.inspect(stage, stop_position, rtp=True)
    if verified["seekWarnings"]:
        raise RuntimeError(f"WebM seek warnings: {verified['seekWarnings']}")
    stage.replace(published)
    return {**verified, "receipt": read_receipt(published), "replayed": False,
            "sinkFinalizeMs": (time.monotonic() - started) * 1000}


def run_case(name, fixture, root, delay_ms=0, disk_full=False, cancel=False, replay=False):
    attempt = Path(tempfile.mkdtemp(prefix="attempt-", dir=root))
    raw, stage, published = (attempt / filename for filename in ("m3.webm", "stage.webm", "stored.webm"))
    baseline = rss_kib()
    peak = baseline
    done = Event()

    def sample():
        nonlocal peak
        while not done.wait(0.02):
            peak = max(peak, rss_kib())

    sampler = Thread(target=sample)
    sampler.start()
    try:
        result = capture(raw, fixture, delay_ms, cancel_after_bytes=16 * 1024 if cancel else None)
        if not raw.is_file():
            raise RuntimeError(f"Capture did not open the sink: {result}")
        result["rawBytes"] = raw.stat().st_size
        if cancel:
            if (not result.get("cancelled") or result["eos"] or not result["writerStopped"]
                    or not result["fixtureStopped"] or result["rawBytes"] <= 0
                    or published.exists() or stage.exists()):
                raise RuntimeError(f"Cancel did not stop input and writer with only partial bytes: {result}")
        elif disk_full:
            if "no space left" not in result.get("captureError", "").lower():
                raise RuntimeError(f"Expected a GStreamer disk-full error, got {result}")
            result["eos"] = False
            if result["rawBytes"] <= 0 or published.exists() or stage.exists():
                raise RuntimeError("Disk-full scenario did not leave only a partial capture")
        else:
            if not result.get("eos"):
                raise RuntimeError(result["captureError"])
            if not result["writerStopped"] or not result["fixtureStopped"]:
                raise RuntimeError("Finalize requires a stopped input and writer")
            offsets = result["byteSegmentOffsets"]
            if not any(previous > current for previous, current in zip(offsets, offsets[1:])):
                raise RuntimeError("Muxer did not seek backwards during capture")
            try:
                args = (raw, stage, published, result["stopPositionSeconds"])
                result.update(finalize(*args))
            except RuntimeError as error:
                # Record the measured failure under pressure and reject the artifact.
                if not delay_ms or published.exists():
                    raise
                result["finalizeError"] = str(error)
            if replay:
                before = published.stat()
                # Drop the first response at the caller boundary after successful local publish.
                receipt = result.pop("receipt")
                repeated = finalize(*args)
                after = published.stat()
                if (not repeated["replayed"] or repeated["receipt"] != receipt
                        or (before.st_ino, before.st_mtime_ns) != (after.st_ino, after.st_mtime_ns)
                        or set(attempt.iterdir()) != {raw, published}):
                    raise RuntimeError("Finalize replay changed the artifact or receipt")
                result.update(repeated, initialAckDropped=True, artifactCount=1)
    finally:
        done.set()
        sampler.join()
        shutil.rmtree(attempt)
    if attempt.exists():
        raise RuntimeError(f"Attempt cleanup failed: {attempt}")
    print(json.dumps({"case": name, "delayPerBufferMs": delay_ms, **result,
                      "rssStartKiB": baseline, "rssPeakKiB": peak, "cleaned": True}),
          flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("rtp_fixture", type=Path)
    parser.add_argument("--full-root", required=True, type=Path, help="Dedicated small tmpfs mount")
    args = parser.parse_args()
    if shutil.disk_usage(args.full_root).total > 128 * 1024:
        parser.error("--full-root must be a dedicated filesystem of at most 128 KiB")
    Gst.init(None)
    print(json.dumps({"gstreamer": Gst.version_string()}), flush=True)
    with tempfile.TemporaryDirectory(prefix="scrum-51-") as directory:
        run_case("baseline", args.rtp_fixture.resolve(), directory)
        run_case("slow-writer", args.rtp_fixture.resolve(), directory, delay_ms=4)
        run_case("overloaded-writer", args.rtp_fixture.resolve(), directory, delay_ms=12)
        run_case("cancel-during-write", args.rtp_fixture.resolve(), directory, cancel=True)
        run_case("finalize-replay", args.rtp_fixture.resolve(), directory, replay=True)
    run_case("disk-full", args.rtp_fixture.resolve(), args.full_root, disk_full=True)
