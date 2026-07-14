# AGENTS.md

Guidance for coding agents working in this Vite+ and uv workspace. Read this file before changing a package contract.

## Commands

| Purpose            | Command                          | Expected result                               |
| ------------------ | -------------------------------- | --------------------------------------------- |
| Install JavaScript | `pnpm install --frozen-lockfile` | Lockfile accepted                             |
| Install Python     | `uv sync --frozen`               | Lockfile accepted                             |
| Format             | `make format`                    | JavaScript and Python sources are formatted   |
| Check              | `make check`                     | Vite+, TypeScript, Ruff, ty, and Pyrefly pass |
| Test               | `make test`                      | Vitest and pytest pass                        |
| Build              | `make build`                     | npm, PyPI, and docs artifacts build           |
| Full gate          | `make check test build`          | Check, test, and build pass                   |

Run `make check test build` before handoff. Use the narrower target while iterating.

## Repository map

- `packages/vite` publishes npm `anywidget-bundle`. It owns Vite configuration, the browser module loader, the lifecycle bridge, development behavior, and artifact validation.
- `packages/widget` publishes PyPI `anywidget-bundle`. It owns manifest resolution, the module allowlist, custom-message responses, and the `Bundle` and `BundledWidget` APIs.
- `docs` contains installed-user documentation.
- `apps/docs` contains VitePress tooling.
- `development_docs` contains contributor and release contracts.
- `.github/workflows` owns CI, Pages deployment, and trusted publishing.

## Architecture

The data path is:

```text
AFM source -> Vite -> index.js ---------------------------> anywidget _esm
                  -> anywidget.json -> Bundle allowlist
                  -> chunks/*.js <-> custom messages <-> browser module loader
                  -> widget.css --------------------------> anywidget _css
```

The npm package must not depend on Python project details. The Python package must not implement JavaScript lifecycle behavior. Python validates the manifest and sends allowlisted module source as binary comm buffers. The generated entry requests and evaluates the module graph. anywidget owns host composition and lifecycle signals.

`packages/vite/src/build.ts` is a consumer-build entry for the small bootstrap. `packages/vite/src/app-entry.ts` is the application root. The Vite plugin replaces the application root with a re-export of the configured app and defines its manifest path in the bootstrap.

## Manifest contract

Default production output contains:

- `anywidget.json`
- `index.js`
- `chunks/app.js`
- opaque `chunks/chunk-[hash].js` application chunks
- optional `widget.css`

The `output` option may replace the entry, app, and stylesheet paths. Keep `anywidget.json` fixed. Its `modules` list is the Python read allowlist and must contain the app entry, every split chunk, and no bootstrap.

Each slash-separated artifact path segment must match `[A-Za-z0-9._-]+`. Reject `.` and `..`, trailing dots, and the case-insensitive Windows reserved basenames `CON`, `PRN`, `AUX`, `NUL`, `COM1` through `COM9`, and `LPT1` through `LPT9`. JavaScript and stylesheet paths require a filename before their extension. Compare artifact paths using ASCII lowercase and reject both case aliases and file-directory overlaps. Emit split chunks beside the app entry as opaque `chunk-[hash]` files with the app entry's extension.

`devEntry` uses a separate absolute URL-path grammar. Its nonempty segments match `[A-Za-z0-9._@-]+` and cannot be `.` or `..`. Reject queries, fragments, percent escapes, and backslashes.

`index.js` must be self-contained because anywidget evaluates its text through a Blob URL. Application chunks may reference other manifest modules or HTTP URLs. Keep the static module graph acyclic. Literal relative dynamic imports re-enter the model-scoped loader. Computed imports must resolve to browser URLs. Inline non-CSS assets and reject unlisted chunks, extra assets, unsafe paths, and artifact collisions during the Vite build.

## AFM contract

The app default export is the public lifecycle boundary. Accept these forms:

- AFM object
- synchronous zero-argument factory
- asynchronous zero-argument factory
- initialize-only and render-only definitions

The production bootstrap starts module loading during `initialize` and returns model teardown synchronously so anywidget can deliver custom-message responses. The app `initialize` hook may return cleanup or `undefined`. Object exports are outside this transport contract. Rendering waits for module loading and app initialization, then passes model, element, host, experimental APIs, and lifecycle signal to the app.

## Public APIs

The npm package exports:

- default and named `anywidgetBundle`
- plugin option and output option types
- bundle app, app module, initialize, and model-state types

The Python package exports:

- `Bundle`
- `BundleArtifactError`
- `BundleModuleError`
- `BundledWidget`

Adding a public export requires tests and updates to the matching API page. Keep the surface small.

## Tests

Test behavior through consumer boundaries:

- Vite changes build a fixture and inspect its manifest, bootstrap, app root, and split chunks.
- Runtime changes cover request correlation, import rewriting, module identity, aborts, and URL cleanup.
- AFM changes cover object, factory, async factory, cleanup, ordering, and lifecycle failures.
- Python changes instantiate `Bundle` or `BundledWidget` against real manifests and binary responses.
- Path changes cover the portable ASCII grammar, reserved basenames, ASCII-case collisions, invalid development URLs, missing files, and symlink containment.
- Package changes inspect and install the packed npm tarball and Python wheel.
- Docs changes build with `BASE_PATH=/anywidget-bundle` and receive a browser smoke check.

Keep tests focused on these contracts. Avoid assertions on generated formatting or private helper structure.

## Versions and releases

`packages/vite/package.json` and `packages/widget/pyproject.toml` carry the registry versions. They must match the release tag exactly. The workspace is currently `0.0.1`.

A `vX.Y.Z` tag starts one build job. That job creates both registry artifacts. npm and PyPI publish the same version concurrently through trusted publishing. Release notes run after both registries accept the artifacts.

## Change discipline

Keep diffs within the package that owns the behavior. Prefer direct code over helper layers. Keep comments for Blob URL constraints, Vite build behavior, lifecycle ordering, or filesystem safety.

Before finishing, remove comments that narrate ordinary code. Exclude build output, caches, temporary fixtures, and local review artifacts from commits.
