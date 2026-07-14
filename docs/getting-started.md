# Getting started

Install the build plugin and Python loader:

```sh
pnpm add -D anywidget-bundle vite
uv add anywidget-bundle
```

Create the widget module:

```ts
// src/widget.ts
import type { AnyWidget } from "anywidget-bundle";

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
} satisfies AnyWidget<State>;
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

Build the frontend, then define the Python widget:

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

`vite build` writes `index.js` and optional `widget.css`. Set `WEATHER_WIDGET_VITE_SERVER=http://localhost:5173` while running Vite to load the development entry.
