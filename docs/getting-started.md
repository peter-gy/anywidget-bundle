# Getting started

The production build gives anywidget a lean `index.js` entry. The consuming Python wheel carries `anywidget.json`, the bundle app, its split chunks, and optional CSS.

Install the build plugin and Python loader:

```sh
pnpm add -D anywidget-bundle vite
uv add anywidget-bundle
```

Create the widget module:

```ts
// src/widget.ts
import type { AnyWidgetBundleApp } from "anywidget-bundle";

type State = { value: string };

export default {
  render({ model, el, signal }) {
    const update = () => {
      el.textContent = model.get("value");
    };
    model.on("change:value", update);
    signal.addEventListener("abort", () => model.off("change:value", update));
    update();
  },
} satisfies AnyWidgetBundleApp<State>;
```

Configure Vite:

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

Build the frontend:

```sh
pnpm exec vite build
```

The default production build writes:

```text
src/weather_widget/static/
├── index.js
├── anywidget.json
└── chunks/
    └── app.js
```

Additional `chunk-[hash].js` files appear when Vite splits the application graph. `widget.css` appears when the widget imports CSS. `anywidget.json` lists every JavaScript module that Python may serve.

Define the Python widget:

```python
from pathlib import Path

import traitlets
from anywidget_bundle import Bundle, BundledWidget


class WeatherWidget(BundledWidget):
    bundle = Bundle(
        Path(__file__).parent / "static",
        dev_server_env="WEATHER_WIDGET_VITE_SERVER",
    )
    value = traitlets.Unicode().tag(sync=True)
```

`BundledWidget` embeds the small `index.js` bootstrap in `_esm`. The bootstrap requests the application chunks through the widget's custom-message channel. Python accepts module paths from the manifest and sends each source file in one binary buffer.

Create the widget in a notebook:

```python
WeatherWidget(value="Hello from anywidget")
```

The widget renders `Hello from anywidget`.

Production loading starts when the model initializes. The app entry and its static relative dependencies load first. A literal relative dynamic import requests its chunk when that import expression runs.

## Package the frontend

The consumer Python wheel owns its generated frontend directory. Include the complete tree so the installed widget can read the manifest and every listed module.

For Hatchling, declare the generated directory as a build artifact:

```toml
[build-system]
requires = ["hatchling", "anywidget-bundle[build]"]
build-backend = "hatchling.build"

[tool.hatch.build]
artifacts = ["src/weather_widget/static/**"]

[tool.hatch.build.targets.wheel]
packages = ["src/weather_widget"]

[tool.hatch.build.hooks.anywidget-bundle]
directory = "src/weather_widget/static"
```

The build hook validates the manifest and every named artifact before packaging. To validate the tree directly:

```python
from weather_widget import WeatherWidget

WeatherWidget.bundle.validate()
```

Build the Python distribution:

```sh
uv build
```

Inspect the wheel for `index.js`, `anywidget.json`, `chunks/app.js`, every additional manifest module, and optional `widget.css`.

## Develop with Vite

Start Vite:

```sh
pnpm exec vite
```

Set the environment variable configured by `dev_server_env` in the shell that launches the Python process:

```sh
export WEATHER_WIDGET_VITE_SERVER=http://localhost:5173
```

In development, `Bundle` gives anywidget the Vite entry URL. Vite serves the application graph, styles, and hot updates directly.
