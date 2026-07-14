# Python API

## `Bundle`

```python
Bundle(
    static_dir,
    dev_server_env=None,
    dev_entry="/@anywidget-bundle/entry",
)
```

`static_dir` contains `index.js` and optional `widget.css`. The path is resolved when the bundle is created.

When `dev_server_env` names a populated environment variable, `anywidget_assets()` returns its HTTP server URL joined with `dev_entry`. Otherwise it returns the production artifact paths.

`anywidget_assets()` raises `BundleArtifactError` when the JavaScript entry is missing or an artifact resolves outside `static_dir`. Widget construction also raises `BundleArtifactError` for unreadable or invalid UTF-8 assets.

## `BundledWidget`

```python
class Widget(BundledWidget):
    bundle = Bundle(Path(__file__).parent / "static")
```

`BundledWidget` reads the bundle into the `_esm` and `_css` traits before `anywidget.AnyWidget` initializes them. Set `include_bundle_css = False` when the application owns stylesheet loading.
