# Getting started

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

## Package the frontend

The consumer Python wheel owns its generated frontend directory. Include the complete tree so the installed widget can read the manifest and every listed module.

For Hatchling, declare the generated directory as a build artifact:

```toml
[tool.hatch.build]
artifacts = ["src/weather_widget/static/**"]

[tool.hatch.build.targets.wheel]
packages = ["src/weather_widget"]
```

Build the frontend before the Python distribution:

```sh
pnpm exec vite build
uv build
```

Inspect the wheel for `index.js`, `anywidget.json`, `chunks/app.js`, every additional manifest module, and optional `widget.css`.

## Use the Vite development server

Start Vite:

```sh
pnpm exec vite
```

Set the environment variable configured by `dev_server_env` in the shell that launches the Python process:

```sh
export WEATHER_WIDGET_VITE_SERVER=http://localhost:5173
```

In development, `Bundle` gives anywidget the Vite entry URL. Vite serves the application graph, styles, and hot updates directly, so the production manifest transport is bypassed.
