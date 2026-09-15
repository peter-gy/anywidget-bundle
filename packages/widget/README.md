# anywidget-bundle

`anywidget-bundle` loads a manifest-backed Vite build into an anywidget model. It embeds the lean bootstrap in `_esm`, resolves optional CSS, and serves allowlisted JavaScript chunks from the consumer wheel.

```sh
uv add anywidget-bundle
```

```python
from pathlib import Path

from anywidget_bundle import Bundle, BundledWidget


class WeatherWidget(BundledWidget):
    bundle = Bundle(Path(__file__).parent / "static")
```

Package the complete generated `static` directory with the widget. It contains `anywidget.json`, the bootstrap, and every module Python may serve.

Use the `anywidget-bundle` Hatch build hook to validate that directory during packaging. Observe `widget.bundle_status` for browser loading and lifecycle failures, including errors raised before the application loads.

See the [documentation](https://peter-gy.github.io/anywidget-bundle/) for the build and Python APIs.
