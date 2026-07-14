# Architecture

`anywidget-bundle` connects a Vite build to `anywidget.AnyWidget` through two packages with one registry name.

```text
packages/vite                      packages/widget
AFM source -> Vite -> index.js -> Bundle -> BundledWidget -> anywidget host
                         +-------> widget.css
```

## Vite package

The plugin resolves the configured `app`, bundles its local module graph, and compresses that module into `index.js`. The generated async AFM factory decompresses and imports the application before returning its widget definition. Vite combines imported CSS into `widget.css` and inlines other assets. The build fails when another artifact escapes this boundary.

During development, the plugin exposes `devEntry` with Vite's client and the app export. An app update reloads the page and creates a fresh anywidget lifecycle.

## Python package

`Bundle` resolves fixed artifact names beneath `static_dir`. A configured development server selects the Vite URL. `BundledWidget` reads the resolved JavaScript and CSS before the anywidget base class initializes its synchronized traits.

## AFM ownership

The production JavaScript resolves the app's AFM object or factory before returning the widget definition to anywidget. anywidget awaits `initialize`, exposes returned objects, creates views, passes `host`, and aborts lifecycle signals. The wrapper does not proxy lifecycle hooks or values.

This boundary requires anywidget 0.11 and `@anywidget/types` 0.4.
