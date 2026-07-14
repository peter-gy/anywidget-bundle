# Vite API

## `anywidgetBundle(options)`

Returns a Vite plugin that builds one self-contained AFM module.

Use Vite 8 or Vite+ 0.2.4 with Node.js 20.19 or newer.

```ts
import anywidgetBundle from "anywidget-bundle";

anywidgetBundle({
  app: "./src/widget.ts",
  outDir: "./src/my_widget/static",
  devEntry: "/@my-widget/entry",
});
```

### Options

| Name       | Type     | Default                    | Behavior                                                         |
| ---------- | -------- | -------------------------- | ---------------------------------------------------------------- |
| `app`      | `string` | required                   | Vite module ID whose default export is an AFM object or factory. |
| `outDir`   | `string` | required                   | Artifact directory outside the Vite root or beneath it.          |
| `devEntry` | `string` | `/@anywidget-bundle/entry` | Absolute Vite path used by the Python development URL.           |

### Output

A production build emits:

- `index.js`, an AFM factory with the compressed application module
- `widget.css` when the app imports CSS

Local JavaScript dependencies and literal dynamic imports are bundled into `index.js`. Imported assets are inlined. HTTP imports remain browser imports. Computed dynamic imports must resolve to HTTP or data URLs.

The browser decompresses the application with `DecompressionStream("gzip")` before anywidget initializes it.

The development entry loads Vite's client and reloads the page after an app update. Set Python's `dev_entry` to the same path when you customize `devEntry`.

### AFM contract

The plugin accepts AFM objects, sync factories, and async factories, then emits an async factory. `initialize` may return exports, cleanup, or `undefined`. `render` receives the host, model, element, experimental APIs, and lifecycle signal from anywidget.
