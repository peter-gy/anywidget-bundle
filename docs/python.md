# Python API

## `Bundle`

```python
Bundle(
    static_dir: str | Path,
    dev_server_env: str | None = None,
    dev_entry: str = "/@anywidget-bundle/entry",
)
```

Resolves a Vite build from `static_dir`. The directory contains `anywidget.json` and every artifact named by the manifest.

| Argument         | Behavior                                                                         |
| ---------------- | -------------------------------------------------------------------------------- |
| `static_dir`     | Build directory. The path is expanded and resolved when `Bundle` is created.     |
| `dev_server_env` | Environment variable that selects a Vite server when populated.                  |
| `dev_entry`      | Absolute Vite path served by the plugin. Defaults to `/@anywidget-bundle/entry`. |

The manifest is parsed on first access and cached. Its `modules` array is the exact JavaScript read allowlist.

Manifest artifact paths use slash-separated segments matching `[A-Za-z0-9._-]+`. The final segment requires a filename before `.js`, `.mjs`, or `.css`. The loader rejects dot segments, trailing dots, case-insensitive Windows reserved basenames, ASCII case aliases, and file-directory overlaps.

`dev_entry` uses a separate absolute URL-path grammar whose nonempty segments match `[A-Za-z0-9._@-]+`. Construction raises `ValueError` for dot segments, queries, fragments, percent escapes, backslashes, or characters outside that grammar.

### `Bundle.anywidget_assets()`

```python
bundle.anywidget_assets() -> tuple[str | Path, str | Path]
```

Validates the production graph and returns the bootstrap and stylesheet for anywidget. A CSS-free build returns an empty string for the stylesheet.

When `dev_server_env` contains a server address, this method returns the server URL joined with `dev_entry` and an empty stylesheet. Addresses without a scheme use `http`. Invalid HTTP or HTTPS addresses raise `ValueError`.

Production validation raises `BundleArtifactError` when the manifest is missing or invalid, an artifact path is unsafe, artifacts collide, or a named artifact is missing or is not a regular file.

### `Bundle.validate()`

```python
bundle.validate() -> None
```

Checks that the bootstrap, application modules, split chunks, and optional stylesheet resolve to regular files inside `static_dir`. Call it after the frontend build to verify the tree that will enter the consumer wheel. Missing or invalid artifacts raise `BundleArtifactError`.

### `Bundle.read_module(module_path)`

```python
bundle.read_module(module_path: object) -> str
```

Returns UTF-8 source for a JavaScript module listed in `anywidget.json`. Manifest failures raise `BundleArtifactError`. Invalid requests and module reads raise `BundleModuleError`.

### `Bundle.read_style()`

```python
bundle.read_style() -> str
```

Returns the production stylesheet as UTF-8 text. It returns an empty string for a CSS-free bundle and while the configured Vite server owns style loading. Missing or unreadable styles raise `BundleArtifactError`.

## Exceptions

### `BundleArtifactError`

Signals an invalid manifest or generated artifact tree. `Bundle.validate()`, `Bundle.anywidget_assets()`, widget construction, and asset reads may raise it.

### `BundleModuleError`

Signals that a requested JavaScript module could not be served. The `code` attribute has one of these values:

| Code           | Condition                                                                        |
| -------------- | -------------------------------------------------------------------------------- |
| `invalid_path` | The value is unsafe, absent from the manifest, or resolves outside `static_dir`. |
| `not_found`    | The allowlisted module file is missing.                                          |
| `read_failed`  | The module cannot be read as UTF-8 text.                                         |

## `BundledWidget`

```python
from pathlib import Path

from anywidget_bundle import Bundle, BundledWidget


class Widget(BundledWidget):
    bundle = Bundle(Path(__file__).parent / "static")
```

Set the class-level `bundle` attribute to the widget's generated frontend directory. `BundledWidget` reads the bootstrap and stylesheet into `_esm` and `_css` before `anywidget.AnyWidget` initializes its synchronized traits.

The widget handles version 1 `anywidget-bundle:request` custom messages. Valid requests name an allowlisted module and receive its UTF-8 source in one binary buffer. Invalid request shapes and protocol versions receive structured errors. Other custom-message envelopes remain available to the bundle app.

Set `include_bundle_css = False` on the widget class when the application owns stylesheet loading.

### `BundledWidget.bundle_status` {#bundle-status}

```python
widget.bundle_status -> dict
```

A read-only trait containing the latest browser lifecycle report. It starts as `{"state": "idle"}`. Subsequent states are `loading`, `ready`, `error`, and `disposed`. `ready` means application initialization completed, before any view is rendered. Model teardown reports `disposed` when its communication channel remains available.

An error report includes `error.phase` (`load`, `initialize`, or `render`), `error.name`, `error.message`, and `error.stack`. A render error describes the failed view. Other views may remain active. A later development generation starts with a fresh `loading` report.

Observe reports before displaying the widget:

```python
widget = WeatherWidget()


def report_bundle(change):
    status = change["new"]
    if status["state"] == "error":
        print(status["error"]["message"])


widget.observe(report_bundle, names="bundle_status")
```

Applications with readiness or request APIs can use error reports to reject pending work with the original bundle failure. The browser also reports the original error to its console.

## Hatch build hook

The `anywidget-bundle` Hatch hook calls `Bundle.validate()` before wheel and source-distribution builds. Configure the complete generated directory:

```toml
[build-system]
requires = ["hatchling", "anywidget-bundle[build]"]
build-backend = "hatchling.build"

[tool.hatch.build.hooks.anywidget-bundle]
directory = "src/weather_widget/static"
```

Use matching npm and Python bundle versions. The hook raises `BundleArtifactError` for invalid manifests, unsafe paths, or missing artifacts. Editable installs skip validation so the frontend can be built after workspace setup. Include the generated directory in the distribution as described in [getting started](./getting-started.md#package-the-frontend).
