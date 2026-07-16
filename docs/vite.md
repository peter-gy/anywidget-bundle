# Vite API

## `anywidgetBundle(options)`

Returns a Vite plugin that builds a bundle app into a lean anywidget frontend module and a manifest-backed JavaScript graph.

Use Vite 8 or Vite+ 0.2.4 with Node.js 20.19 or newer.

```ts
import anywidgetBundle from "anywidget-bundle";

anywidgetBundle({
  app: "./src/widget.ts",
  outDir: "./src/my_widget/static",
  devEntry: "/@my-widget/entry",
  output: {
    entry: "index.js",
    app: "chunks/app.js",
    style: "widget.css",
  },
});
```

### Options

| Name       | Type     | Default                    | Behavior                                                        |
| ---------- | -------- | -------------------------- | --------------------------------------------------------------- |
| `app`      | `string` | required                   | Vite module ID whose default export is a bundle app or factory. |
| `outDir`   | `string` | required                   | Artifact directory for the production build.                    |
| `devEntry` | `string` | `/@anywidget-bundle/entry` | Absolute Vite path used by the Python development URL.          |
| `output`   | `object` | `{}`                       | Overrides production entry, app, and stylesheet paths.          |

`outDir` may be beneath or outside the Vite root. It cannot resolve to the Vite root or one of its ancestors.

`output.entry`, `output.app`, and `output.style` default to `index.js`, `chunks/app.js`, and `widget.css`. Entry and app paths use `.js` or `.mjs`. The style path uses `.css`. The final segment requires a filename before its extension.

Each slash-separated artifact path segment must match `[A-Za-z0-9._-]+`. Segments cannot be `.`, `..`, end in a dot, or use the case-insensitive Windows reserved basenames `CON`, `PRN`, `AUX`, `NUL`, `COM1` through `COM9`, and `LPT1` through `LPT9`. Paths are compared after ASCII lowercase conversion, so case aliases and file-directory overlaps are collisions.

Split chunks are emitted beside `output.app` as opaque `chunk-[hash]` files and reuse the app entry's extension.

### Output

A production build emits:

- `index.js`, a small anywidget frontend module
- `anywidget.json`, the versioned artifact manifest
- `chunks/app.js`, the application entry
- opaque `chunks/chunk-[hash].js` files from the application graph
- `widget.css` when the application imports CSS

The manifest records the bootstrap, stylesheet, app entry, and complete JavaScript module allowlist:

```json
{
  "version": 1,
  "entry": "index.js",
  "style": "widget.css",
  "app": "chunks/app.js",
  "modules": ["chunks/app.js", "chunks/chunk-D7K4.js"]
}
```

The bootstrap is embedded in the widget. During model initialization it requests the app entry and its complete static relative dependency graph from Python. Imported assets are inlined, and imported CSS is combined into the configured stylesheet.

Literal relative dynamic imports use the same model-scoped loader and request their chunks when the import expression runs:

```ts
const { renderPanel } = await import("./panel");
```

Static relative dependencies load before their importers. Views for one model share module identity and cached source. HTTP imports remain browser imports. Computed dynamic imports remain native browser imports, so their runtime value must be a browser-resolvable URL.

The build rejects missing module references, static import cycles, unsafe artifact paths, path collisions, and emitted assets other than the configured stylesheet.

### Development

The development entry imports the application through Vite. Vite owns dependency loading, styles, and hot updates in this mode. Python supplies the development entry URL.

`devEntry` uses a separate absolute URL-path grammar. Its nonempty segments match `[A-Za-z0-9._@-]+` and cannot be `.` or `..`. Queries, fragments, percent escapes, and backslashes are rejected. Set Python's `dev_entry` to the same path when you customize `devEntry`.

### Bundle app contract

The configured module exports an `AnyWidgetBundleApp` object or a zero-argument factory that returns one synchronously or asynchronously. A bundle app provides `initialize`, `render`, or both.

| Export                             | Contract                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------- |
| `AnyWidgetBundleApp<ModelState>`   | Bundle app with an `initialize` hook, a `render` hook, or both.           |
| `AnyWidgetBundleAppModule<State>`  | Bundle app or zero-argument synchronous or asynchronous factory.          |
| `AnyWidgetBundleInitialize<State>` | Model hook that returns cleanup, resolves to cleanup, or returns nothing. |
| `AnyWidgetState`                   | Default record shape for synchronized model state.                        |
| `AnyWidgetBundleOptions`           | Options accepted by `anywidgetBundle`.                                    |
| `AnyWidgetBundleOutputOptions`     | Optional entry, app, and stylesheet artifact paths.                       |

The generated frontend module starts loading during anywidget's `initialize` hook and returns model teardown synchronously. After the bundle app resolves, its own `initialize` hook runs and may return a cleanup function or `undefined`.

`render` waits for module loading and application initialization. It receives the host, model, element, experimental APIs, and lifecycle signal from anywidget. Application code removes its own model listeners through the returned cleanup function or lifecycle signal. Bundle cleanup aborts pending module requests, removes the custom-message listener, and releases generated module URLs.
