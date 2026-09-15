# Architecture

`anywidget-bundle` turns a bundle app into a lean anywidget frontend module and a wheel-packaged JavaScript graph.

```text
bundle app -> Vite -> index.js ---------------------------> anywidget _esm
                   -> anywidget.json -> Bundle allowlist
                   -> chunks/*.js -> Python wheel <-> custom messages <-> browser loader
                   -> widget.css --------------------------> anywidget _css
```

## Vite package

The plugin resolves the configured bundle app and builds two roots. `index.js` is a small frontend module embedded in the widget. `chunks/app.js` and its split dependencies form the application graph. Vite combines imported CSS into `widget.css` and inlines other assets.

`anywidget.json` records the bootstrap, stylesheet, app entry, and every JavaScript module that Python may serve. The build validates portable artifact paths, collisions, module references, and static import cycles before it emits the manifest. Split chunks use opaque `chunk-[hash]` names beside the app entry.

During development, the plugin exposes `devEntry` with Vite's client and the app export. Its separate URL-path grammar accepts `[A-Za-z0-9._@-]+` segments. Vite serves dependencies and styles directly. Hot updates replace the app lifecycle while the development entry remains mounted.

## Python package

`Bundle` parses `anywidget.json` once and uses its module list as a read allowlist. Every resolved artifact target must remain beneath `static_dir`. `BundledWidget` reads the bootstrap and stylesheet before the anywidget base class initializes its synchronized traits, then registers the bundle custom-message handler.

Module requests carry protocol version, request ID, and manifest path. A successful response echoes that metadata and sends JavaScript source in one binary buffer. An error response carries a structured code and message with no source buffer. Envelopes for other widget protocols pass through the shared custom-message channel.

The consuming Python project packages the complete generated static directory in its wheel. The generic `anywidget-bundle` Python distribution provides the loader classes, while each widget distribution owns its bootstrap, manifest, chunks, and stylesheet.

## Browser module loading

One model owns one request reader and one module graph. Static relative dependencies load before their importers, and literal relative dynamic imports re-enter the same loader. Views for the model therefore share JavaScript module identity.

Sibling source reads run concurrently while URL construction remains serialized. Pre-evaluation failures can retry. Native evaluation failures stay cached with their dependency identities until model disposal.

Model cleanup aborts pending requests, removes the custom-message listener, clears loader caches, and revokes generated object URLs. HTTP imports and computed dynamic imports continue through the browser.

When `dev_server_env` selects a Vite server, `Bundle` returns the development entry URL and an empty stylesheet. The browser imports the application through Vite.

## Lifecycle ownership

The bootstrap starts production module loading during `initialize`. It returns model teardown synchronously so custom-message responses can arrive, then invokes the application `initialize` hook after the app module resolves. Application initialization may return cleanup or `undefined`. Rendering waits for loading and initialization before it invokes the application `render` hook. Application cleanup owns model listeners registered by that lifecycle call, while the bundle removes its protocol listener by callback identity.

This boundary requires anywidget 0.11 and `@anywidget/types` 0.4.

`lifecycle.ts` owns the application lifecycle in production and development. Both entries return synchronously from host initialization. Generation cancellation happens before waiting for hot-update cleanup. Model and view controllers abort application resources on failures, while the original failure remains observable by subsequent render calls.

Version 1 `anywidget-bundle:status` messages carry lifecycle state and structured errors to the Python `bundle_status` trait. Reporting starts before application loading, so the application is not responsible for reporting its own import failure.

The Python package registers an optional Hatch build hook that validates a consumer's complete artifact tree before archive creation. The hook uses the same `Bundle.validate()` contract as widget construction.
