# anywidget-bundle

The Vite plugin builds a bundle app into a lean anywidget entry and JavaScript chunks that can be served from a Python wheel.

```sh
pnpm add -D anywidget-bundle vite
```

```ts
import anywidgetBundle from "anywidget-bundle";

anywidgetBundle({ app: "./src/widget.ts", outDir: "./src/my_widget/static" });
```

Run `pnpm exec vite build` before building the consumer wheel.

Type the app against the bundle lifecycle contract:

```ts
import type { AnyWidgetBundleApp } from "anywidget-bundle";

export default {
  render({ el }) {
    el.textContent = "ready";
  },
} satisfies AnyWidgetBundleApp;
```

Each build writes:

- `anywidget.json`, which identifies the entry, app, stylesheet, and JavaScript module allowlist
- `index.js`, the self-contained anywidget bootstrap
- `chunks/app.js` and opaque `chunks/chunk-[hash].js` files imported by the app
- `widget.css` when the app imports CSS

Set `output.entry`, `output.app`, or `output.style` to change these artifact paths. Configured artifact paths use portable ASCII names and cannot collide. The [Vite API](https://peter-gy.github.io/anywidget-bundle/vite) defines the full path contract.

The Python `Bundle` reads `anywidget.json`, gives `index.js` to anywidget, and serves manifest-listed modules to the bootstrap through the widget model. Static modules load during model initialization. Literal relative dynamic imports load when executed. A bundle app `initialize` hook may return a cleanup function or `undefined`.

[Read the documentation](https://peter-gy.github.io/anywidget-bundle/).
