"""SCRUM-48 Linux smoke test using synthetic data and disposable sinks."""

import argparse
import json
import platform
import time

import gi

gi.require_version("Gst", "1.0")
from gi.repository import GLib, Gst


PIPELINES = {
    "eos": "videotestsrc is-live=true num-buffers=10 ! fakesink",
    "error": "filesrc location=/dev/null/colearnia-missing ! fakesink",
    "timeout": "videotestsrc is-live=true ! fakesink",
}
PLUGIN_GROUPS = (
    ("videotestsrc", "fakesink", "filesrc", "filesink"),
    ("udpsrc", "udpsink", "rtpbin", "rtpjitterbuffer"),
    ("rtpvp8depay", "rtph264depay", "rtpopusdepay"),
    ("vp8dec", "avdec_h264", "opusdec", "compositor", "audiomixer"),
    ("vp8enc", "opusenc", "webmmux", "x264enc", "mp4mux"),
)


def emit(event, **fields):
    print(json.dumps({"event": event, **fields}), flush=True)


def inventory():
    plugins = {}
    for group in PLUGIN_GROUPS:
        for element in group:
            factory = Gst.ElementFactory.find(element)
            plugin = factory.get_plugin() if factory is not None else None
            plugins[element] = (
                {"plugin": plugin.get_name(), "version": plugin.get_version()}
                if plugin is not None
                else None
            )
    emit(
        "inventory",
        python=platform.python_version(),
        arch=platform.machine(),
        os=platform.freedesktop_os_release()["PRETTY_NAME"],
        pygobject=gi.__version__,
        glib=f"{GLib.MAJOR_VERSION}.{GLib.MINOR_VERSION}.{GLib.MICRO_VERSION}",
        gstreamer=Gst.version_string(),
        plugins=plugins,
    )


def run(case):
    started = time.monotonic()
    pipeline = Gst.parse_launch(PIPELINES[case])
    bus = pipeline.get_bus()
    deadline = started + (1 if case == "timeout" else 5)
    events = Gst.MessageType.STATE_CHANGED | Gst.MessageType.EOS | Gst.MessageType.ERROR
    ready = False
    try:
        pipeline.set_state(Gst.State.PLAYING)
        while True:
            remaining = max(0, deadline - time.monotonic())
            message = bus.timed_pop_filtered(int(remaining * Gst.SECOND), events)
            elapsed = round((time.monotonic() - started) * 1000)
            if message is None or remaining == 0:
                emit("error", case=case, reason="deadline", elapsedMs=elapsed)
                return 2
            if message.type == Gst.MessageType.ERROR:
                error, _ = message.parse_error()
                emit("error", case=case, reason="pipeline", detail=error.message, elapsedMs=elapsed)
                return 1
            if message.type == Gst.MessageType.EOS:
                if not ready:
                    emit("error", case=case, reason="eos_before_ready", elapsedMs=elapsed)
                    return 1
                emit("eos", case=case, elapsedMs=elapsed)
                return 0
            if message.src == pipeline:
                _, state, _ = message.parse_state_changed()
                if state == Gst.State.PLAYING:
                    ready = True
                    emit("ready", case=case, state="PLAYING", elapsedMs=elapsed)
    finally:
        pipeline.set_state(Gst.State.NULL)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("case", choices=("inventory", *PIPELINES))
    args = parser.parse_args()
    Gst.init(None)
    if args.case == "inventory":
        inventory()
    else:
        raise SystemExit(run(args.case))
