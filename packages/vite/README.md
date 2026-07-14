# anywidget-bundle

The Vite plugin builds an anywidget app as a manifest-backed JavaScript module graph.

```ts
import anywidgetBundle from "anywidget-bundle";

anywidgetBundle({ app: "./src/widget.ts", outDir: "./src/my_widget/static" });
```

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

Set `output.entry`, `output.app`, or `output.style` to change these artifact paths. Each path segment accepts ASCII letters, digits, `.`, `_`, and `-`. Segments cannot be `.`, `..`, a Windows reserved basename, or end in a dot. The final segment requires a filename before `.js`, `.mjs`, or `.css`. The manifest records the configured paths and places opaque `chunk-[hash]` files beside the app entry.

The Python `Bundle` reads `anywidget.json`, gives `index.js` to anywidget, and serves manifest-listed modules to the bootstrap through the widget model. An app `initialize` hook may return a cleanup function or `undefined`.

[Read the documentation](https://peter-gy.github.io/anywidget-bundle/).
