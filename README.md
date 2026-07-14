# anywidget-bundle

`anywidget-bundle` builds an anywidget frontend into manifest-backed JavaScript chunks and serves those chunks from Python. The npm and PyPI packages share the same name and version.

```ts
// src/widget.ts
import type { AnyWidgetBundleApp } from "anywidget-bundle";

export default {
  render({ el }) {
    el.textContent = "Hello from anywidget";
  },
} satisfies AnyWidgetBundleApp;
```

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

Run `vite build`, then include the generated `static` directory in the consumer Python wheel. The directory contains `index.js`, `anywidget.json`, the application chunks, and optional `widget.css`.

See the [getting started guide](./docs/getting-started.md) for build, development, and wheel configuration.
