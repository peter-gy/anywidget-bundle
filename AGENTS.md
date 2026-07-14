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

- `packages/vite` publishes npm `anywidget-bundle`. It owns Vite configuration, the development entry, artifact validation, and the `AnyWidget` type export.
- `packages/widget` publishes PyPI `anywidget-bundle`. It owns artifact resolution and the `Bundle` and `BundledWidget` APIs.
- `docs` contains installed-user documentation.
- `apps/docs` contains VitePress tooling.
- `development_docs` contains contributor and release contracts.
- `.github/workflows` owns CI, Pages deployment, and trusted publishing.

## Architecture

The data path is:

```text
AFM source -> Vite plugin -> index.js + optional widget.css -> Bundle -> BundledWidget -> anywidget
```

The npm package must not depend on Python project details. The Python package must not implement JavaScript lifecycle behavior. The generated entry owns decompression and app factory resolution. anywidget owns initialization, exports, render ordering, host composition, and cleanup.

`packages/vite/src/build.ts` is a pack-time file and a consumer-build entry. The Vite plugin replaces its module body with a re-export of the configured app, then compresses the bundled module into the generated entry.

## Fixed artifact contract

Production output contains exactly:

- `index.js`
- optional `widget.css`

Keep output names fixed across TypeScript, Python, tests, and docs. `index.js` must have no concrete relative or bare imports because anywidget evaluates its text through a Blob URL. Bundle local dependencies and literal dynamic imports. Computed imports must resolve to HTTP or data URLs. Inline non-CSS assets. Reject unresolved imports, extra chunks, and extra assets during the Vite build.

## AFM contract

The app default export is the public lifecycle boundary. Accept these forms:

- AFM object
- synchronous zero-argument factory
- asynchronous zero-argument factory
- initialize-only, render-only, and empty definitions

The generated entry normalizes these forms to an async factory that returns the app definition. Preserve `initialize` results. Objects are widget exports. Functions are cleanup callbacks. `undefined` is valid. Pass lifecycle hooks and values to anywidget unchanged.

## Public APIs

The npm package exports:

- default and named `anywidgetBundle`
- `AnyWidgetBundleOptions`
- `AnyWidget`

The Python package exports:

- `Bundle`
- `BundleArtifactError`
- `BundledWidget`

Adding a public export requires tests and updates to the matching API page. Keep the surface small.

## Tests

Test behavior through consumer boundaries:

- Vite changes build a fixture and inspect or import its final artifact.
- AFM changes cover object, factory, async factory, exports, and lifecycle failure shapes.
- Python changes instantiate `Bundle` or `BundledWidget` against real files.
- Path changes cover missing files, invalid development URLs, and symlink containment.
- Package changes inspect and install the packed npm tarball and Python wheel.
- Docs changes build with `BASE_PATH=/anywidget-bundle` and receive a browser smoke check.

Keep tests focused on these contracts. Avoid assertions on generated formatting or private helper structure.

## Versions and releases

`packages/vite/package.json` and `packages/widget/pyproject.toml` carry the registry versions. They must match the release tag exactly. The workspace is currently `0.0.1`.

A `vX.Y.Z` tag starts one build job. That job creates both registry artifacts. npm and PyPI publish the same version concurrently through trusted publishing. Release notes run after both registries accept the artifacts.

## Change discipline

Keep diffs within the package that owns the behavior. Prefer direct code over helper layers. Keep comments for Blob URL constraints, Vite build behavior, lifecycle ordering, or filesystem safety.

Before finishing, remove comments that narrate ordinary code. Exclude build output, caches, temporary fixtures, and local review artifacts from commits.
