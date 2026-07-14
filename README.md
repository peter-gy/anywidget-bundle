# anywidget-bundle

`anywidget-bundle` builds a browser widget with Vite and loads it from Python. The npm and PyPI packages share the same name and version.

```ts
// vite.config.ts
import anywidgetBundle from "anywidget-bundle";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    anywidgetBundle({
      app: "./src/widget.ts",
      outDir: "./src/weather_widget/static",
    }),
  ],
});
```

```python
from pathlib import Path

from anywidget_bundle import Bundle, BundledWidget


class WeatherWidget(BundledWidget):
    bundle = Bundle(Path(__file__).parent / "static")
```

See the [getting started guide](./docs/getting-started.md) for the complete setup.
