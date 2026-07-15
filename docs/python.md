# Python API

## `Bundle`

```python
Bundle(
    static_dir,
    dev_server_env=None,
    dev_entry="/@anywidget-bundle/entry",
)
```

`static_dir` contains `anywidget.json` and every artifact it names. The path is resolved when the bundle is created. The manifest is parsed once and defines the exact JavaScript module allowlist.

Manifest artifact paths use slash-separated segments matching `[A-Za-z0-9._-]+`. The final segment requires a filename before `.js`, `.mjs`, or `.css`. The loader rejects `.` and `..`, trailing dots, case-insensitive Windows reserved basenames, ASCII case aliases, and file-directory overlaps.

When `dev_server_env` names a populated environment variable, `anywidget_assets()` returns its HTTP server URL joined with `dev_entry` and an empty stylesheet. Vite serves the module graph and styles directly in this mode. Otherwise the method returns the manifest's bootstrap and stylesheet paths.

`dev_entry` uses a separate absolute URL-path grammar whose nonempty segments match `[A-Za-z0-9._@-]+`. `Bundle` raises `ValueError` for dot segments, queries, fragments, percent escapes, backslashes, or characters outside that grammar. `anywidget_assets()` raises `ValueError` when the configured development server cannot be parsed as an HTTP or HTTPS URL or includes a query or fragment.

`anywidget_assets()` validates the complete production graph before returning its bootstrap and stylesheet. It raises `BundleArtifactError` when the manifest is missing or invalid, an artifact path is unsafe, artifacts collide, or a named artifact is missing or is not a regular file. Widget construction also raises `BundleArtifactError` when the bootstrap or stylesheet is unreadable or invalid UTF-8.

### `Bundle.validate()`

Validates the manifest and checks that its bootstrap, application modules, split chunks, and optional stylesheet resolve to regular files inside `static_dir`. Call this after building the frontend to verify the source tree that will be packaged. Missing or invalid artifacts raise `BundleArtifactError`.

### `Bundle.read_module(module_path)`

Returns the UTF-8 source for a JavaScript module listed in `anywidget.json`.

Loading a missing or invalid manifest raises `BundleArtifactError`. With a valid manifest, module lookup and reads raise `BundleModuleError`. Its `code` attribute has one of these values:

| Code           | Condition                                                                        |
| -------------- | -------------------------------------------------------------------------------- |
| `invalid_path` | The value is unsafe, absent from the manifest, or resolves outside `static_dir`. |
| `not_found`    | The allowlisted module file is missing.                                          |
| `read_failed`  | The module cannot be read as UTF-8 text.                                         |

### `Bundle.read_style()`

Returns the production stylesheet as UTF-8 text. It returns an empty string for a CSS-free bundle and while the configured Vite development server owns style loading.

## `BundledWidget`

```python
from pathlib import Path

from anywidget_bundle import Bundle, BundledWidget


class Widget(BundledWidget):
    bundle = Bundle(Path(__file__).parent / "static")
```

`BundledWidget` reads the bootstrap and stylesheet into the `_esm` and `_css` traits before `anywidget.AnyWidget` initializes them. It also registers a handler for version 1 `anywidget-bundle:request` custom messages.

The handler accepts an allowlisted module path, echoes the request ID and path, and sends UTF-8 source in one binary buffer. Structured error responses carry the `BundleModuleError` code. Other custom-message envelopes remain available to the widget application.

Set `include_bundle_css = False` when the application owns stylesheet loading.
