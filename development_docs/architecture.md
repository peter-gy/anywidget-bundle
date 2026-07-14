# Architecture

`anywidget-bundle` builds an anywidget frontend module (AFM) with Vite and loads it into `anywidget.AnyWidget` through two packages with one registry name.

```text
AFM source -> Vite -> index.js ---------------------------> anywidget _esm
                  -> anywidget.json -> Bundle allowlist
                  -> chunks/*.js <-> custom messages <-> browser module loader
                  -> widget.css --------------------------> anywidget _css
```

## Vite package

The plugin resolves the configured `app` and builds two roots. `index.js` is a small bootstrap embedded in the widget. `chunks/app.js` and its split dependencies form the application module graph. Vite combines imported CSS into `widget.css` and inlines other assets.

`anywidget.json` records the bootstrap, stylesheet, app entry, and every JavaScript module that Python may serve. Artifact path segments match `[A-Za-z0-9._-]+`, and the final segment requires a filename before its extension. The build rejects dot segments, trailing dots, case-insensitive Windows reserved basenames, ASCII-case collisions, file-directory overlaps, invalid module references, and static import cycles before emitting the manifest. Split chunks use opaque `chunk-[hash]` names beside the app entry.

During development, the plugin exposes `devEntry` with Vite's client and the app export. Its separate URL-path grammar accepts `[A-Za-z0-9._@-]+` segments. Vite serves dependencies and styles directly. Hot updates replace the app lifecycle while the development entry remains mounted.

## Python package

`Bundle` parses `anywidget.json` once and uses its module list as a read allowlist. Every resolved artifact target must remain beneath `static_dir`. `BundledWidget` reads the bootstrap and stylesheet before the anywidget base class initializes its synchronized traits, then registers the bundle custom-message handler.

Module requests carry protocol version, request ID, and manifest path. A successful response echoes that metadata and sends JavaScript source in one binary buffer. An error response carries a structured code and message with no source buffer. Envelopes for other widget protocols pass through the shared custom-message channel.

The consuming Python project packages the complete generated static directory in its wheel. The generic `anywidget-bundle` Python distribution provides the loader classes, while each widget distribution owns its bootstrap, manifest, chunks, and stylesheet.

## Browser module loading

One model owns one request reader and one module graph. Static relative dependencies load before their importers, and literal relative dynamic imports re-enter the same loader. Views for the model therefore share JavaScript module identity.

Model cleanup aborts pending requests, removes the custom-message listener, clears loader caches, and revokes generated object URLs. HTTP imports and computed dynamic imports continue through the browser.

When `dev_server_env` selects a Vite server, `Bundle` returns the development entry URL and an empty stylesheet. The browser imports the application through Vite and bypasses the production manifest transport.

## AFM ownership

The bootstrap starts production module loading during `initialize`. It returns model teardown synchronously so custom-message responses can arrive, then invokes the application `initialize` hook after the app module resolves. Application initialization may return cleanup or `undefined`. Rendering waits for loading and initialization before it invokes the application `render` hook. Application cleanup owns model listeners registered by that lifecycle call, while the bundle removes its protocol listener by callback identity.

This boundary requires anywidget 0.11 and `@anywidget/types` 0.4.
