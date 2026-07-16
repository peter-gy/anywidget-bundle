# anywidget-bundle

[![License](https://img.shields.io/pypi/l/anywidget-bundle)](./LICENSE) [![PyPI](https://img.shields.io/pypi/v/anywidget-bundle)](https://pypi.org/project/anywidget-bundle/) [![npm](https://img.shields.io/npm/v/anywidget-bundle)](https://www.npmjs.com/package/anywidget-bundle)

`anywidget-bundle` splits an [anywidget](https://anywidget.dev/) frontend into a lean entry module and Vite chunks packaged in the widget's Python wheel. When a model initializes, the entry requests the bundle app and its static module graph from Python. Literal relative dynamic imports request their chunks when executed.

## When to use

This approach is most relevant when a widget depends on larger frontend libraries that would make its `_esm` bundle heavy. For simple widgets with few or no external dependencies, the [standard anywidget bundling workflow](https://anywidget.dev/en/bundling/), which uses esbuild in most project templates, is a good fit.

That split is especially relevant in Pyodide-based hosts such as [marimo islands](https://docs.marimo.io/guides/island_example/), where marimo represents inline `_esm` as a base64 data URL for each widget model. Pages with many islands attach the lean entry to each model, then request its static graph from the installed wheel during initialization. This wheel-backed transport also works with Jupyter, VS Code, and other anywidget hosts.

## Getting started

```sh
pnpm add -D anywidget-bundle vite
uv add anywidget-bundle
```

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

Run `pnpm exec vite build`, then include the generated `static` directory in the consumer Python wheel. The directory contains `index.js`, `anywidget.json`, the application chunks, and optional `widget.css`.

See the [getting started guide](./docs/getting-started.md) for build, development, and wheel configuration.
