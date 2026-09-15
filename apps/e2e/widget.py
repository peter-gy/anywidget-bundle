"""Installed consumer fixture for the bundle transport and lifecycle."""

from pathlib import Path

import traitlets

from anywidget_bundle import Bundle, BundledWidget


class Widget(BundledWidget):
    bundle = Bundle(Path(__file__).parent / "static")
    label = traitlets.Unicode().tag(sync=True)
    fault = traitlets.Unicode().tag(sync=True)

    def __init__(self, **kwargs):
        self.requests = []
        self.source_bytes = 0
        super().__init__(**kwargs)
        self.on_msg(self.ping)

    def ping(self, _, content, buffers):
        if content.get("type") == "fixture:ping":
            self.send({"type": "fixture:pong"})

    def _handle_bundle_message(self, _widget, content, _buffers):
        if content.get("type") == "anywidget-bundle:request":
            self.requests.append(content["path"])
            if self.fault in ("transport", "evaluate"):
                response = {**content, "type": "anywidget-bundle:response"}
                if self.fault == "transport":
                    response["error"] = {"code": "fixture", "message": "fixture transport failed"}
                    self.send(response)
                else:
                    self.send(response, buffers=[b'throw new Error("fixture evaluation failed");'])
                return
        super()._handle_bundle_message(_widget, content, _buffers)

    def send(self, content, buffers=None):
        if content.get("type") == "anywidget-bundle:response":
            self.source_bytes += sum(len(buffer) for buffer in buffers or [])
        super().send(content, buffers=buffers)


class DevWidget(Widget):
    bundle = Bundle(Path(__file__).parent / "static", dev_server_env="BUNDLE_E2E_VITE")
