"""Serve isolated notebooks using the installed fixture wheel."""

import json
import os
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

import nbformat
from jupyterlab.handlers.announcements import NeverCheckForUpdate
from jupyterlab.labapp import LabApp

NOTEBOOKS = {
    "production": [
        """from IPython.display import display
from e2e_widget import Widget
first = Widget(label="first")
second = Widget(label="second")
display(first, first, second)""",
        """import json
assert first.bundle_status["state"] == second.bundle_status["state"] == "ready"
assert len(first.requests) == len(set(first.requests))
assert len(first.requests) == len(second.requests)
print("TRANSPORT", json.dumps({"requests": len(first.requests), "bytes": first.source_bytes}))""",
        """first.close()
second.close()
print("CLOSED")""",
    ],
    "failures": [
        """from IPython.display import display
from e2e_widget import Widget
faults = ("transport", "evaluate", "initialize", "render")
failures = [Widget(label=fault, fault=fault) for fault in faults]
for widget in failures:
    display(widget)
headless = Widget(label="headless", fault="initialize")
print("FAILURES CREATED")""",
        """import asyncio
async def failed(widget):
    changed = asyncio.Event()
    def observe(change):
        if change["new"]["state"] == "error":
            changed.set()
    widget.observe(observe, names="bundle_status")
    try:
        observe({"new": widget.bundle_status})
        await asyncio.wait_for(changed.wait(), 10)
        error = widget.bundle_status["error"]
        assert error["message"].startswith("fixture")
        assert error["stack"]
        print("ERROR", widget.label, error["phase"], error["message"])
    finally:
        widget.unobserve(observe, names="bundle_status")
await asyncio.gather(*(failed(widget) for widget in [*failures, headless]))""",
        """for widget in [*failures, headless]:
    widget.close()
print("FAILURES CLOSED")""",
    ],
    "development": [
        """from IPython.display import display
from e2e_widget import DevWidget
live = DevWidget(label="live")
stalled = DevWidget(label="stalled", fault="stall")
display(live, stalled)""",
        """assert live.bundle_status["state"] == stalled.bundle_status["state"] == "ready"
print("DEVELOPMENT READY")""",
        """live.close()
stalled.close()
print("DEVELOPMENT CLOSED")""",
    ],
    "scale": [
        """from IPython.display import display
from e2e_widget import Widget
groups = {}
for size in (1, 5, 20):
    groups[size] = [Widget(label=f"scale-{size}-{index}") for index in range(size)]
    for widget in groups[size]:
        display(widget)""",
        """import json
metrics = {}
for size, widgets in groups.items():
    assert all(widget.bundle_status["state"] == "ready" for widget in widgets)
    assert len({tuple(widget.requests) for widget in widgets}) == 1
    metrics[size] = {
        "bytes": sum(widget.source_bytes for widget in widgets),
        "requests": sum(len(widget.requests) for widget in widgets),
    }
print("SCALE", json.dumps(metrics))""",
        """for widgets in groups.values():
    for widget in widgets:
        widget.close()
print("SCALE CLOSED")""",
    ],
}


with TemporaryDirectory(prefix="anywidget-bundle-jupyter-") as directory:
    root = Path(directory)
    kernel = root / "data/kernels/bundle-e2e"
    kernel.mkdir(parents=True)
    (kernel / "kernel.json").write_text(
        json.dumps(
            {
                "argv": [sys.executable, "-m", "ipykernel_launcher", "-f", "{connection_file}"],
                "display_name": "Bundle E2E",
                "language": "python",
            }
        ),
        encoding="utf-8",
    )
    config = root / "config/labconfig"
    config.mkdir(parents=True)
    (config / "page_config.json").write_text(
        json.dumps(
            {
                "disabledExtensions": {
                    "@jupyterlab/debugger-extension": True,
                    "@jupyterlab/notebook-extension:language-server": True,
                }
            }
        ),
        encoding="utf-8",
    )
    notebooks = root / "notebooks"
    notebooks.mkdir()
    for name, cells in NOTEBOOKS.items():
        notebook = nbformat.v4.new_notebook(
            cells=[nbformat.v4.new_code_cell(cell) for cell in cells],
            metadata={
                "kernelspec": {
                    "name": "bundle-e2e",
                    "display_name": "Bundle E2E",
                    "language": "python",
                }
            },
        )
        nbformat.write(notebook, notebooks / f"{name}.ipynb")
    os.environ.update(
        JUPYTER_CONFIG_DIR=str(root / "config"),
        JUPYTER_DATA_DIR=str(root / "data"),
        JUPYTER_RUNTIME_DIR=str(root / "runtime"),
    )
    LabApp.launch_instance(
        check_for_updates_class=NeverCheckForUpdate,
        news_url=None,
        argv=[
            "--no-browser",
            "--ServerApp.ip=127.0.0.1",
            "--ServerApp.port=27354",
            "--ServerApp.port_retries=0",
            "--IdentityProvider.token=",
            f"--ServerApp.root_dir={notebooks}",
            f"--LabApp.user_settings_dir={root / 'settings'}",
            f"--LabApp.workspaces_dir={root / 'workspaces'}",
        ],
    )
