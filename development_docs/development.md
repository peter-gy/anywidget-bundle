# Development

Install locked dependencies:

Use uv 0.12.14 or newer. Dependency resolution waits two days after publication in both pnpm and uv. The workspace records an exact exception for the requested Vite+ 0.3.2 release and its native packages.

```sh
pnpm install --frozen-lockfile
uv sync --frozen
pnpm --filter @anywidget-bundle/e2e exec playwright install --with-deps chromium
```

Run workspace validation:

```sh
make check test build
```

The Makefile exposes these workspace targets:

- `make build` builds the npm package, wheel, source distribution, and documentation site.
- `make check` runs formatting, Oxlint with all generic anti-slop rules, Knip, and type checks across both languages.
- `make format` formats JavaScript and Python sources.
- `make test` runs Vitest, pytest, and the packed-package browser suite.
- `make e2e` builds and installs the npm tarball and Python wheels, then runs JupyterLab browser checks.

The browser suite validates a consumer wheel rebuilt from its source distribution, missing-chunk rejection during packaging, binary transport, lazy imports, model isolation, URL cleanup, Python error reports, and Vite hot updates. Startup cases with 1, 5, and 20 independent models attach source-byte and request counts to the test results under `dist/e2e`.

Start VitePress from its workspace package:

```sh
pnpm exec vp run -t @anywidget-bundle/docs#dev
```

## Validation by change

| Change           | Required evidence                                           |
| ---------------- | ----------------------------------------------------------- |
| Vite plugin      | Built fixture, manifest graph, bootstrap, and imported app  |
| Bundle app types | Object, sync factory, async factory, and cleanup coverage   |
| Module runtime   | Request correlation, import rewriting, caching, and cleanup |
| Python loader    | Manifest, allowlist, binary response, and error-path tests  |
| Package metadata | npm tarball and loader wheel contents, isolated imports     |
| Documentation    | Production base-path build and browser smoke test           |
| Workflow         | Local commands match workflow commands and artifact paths   |

Build output belongs under `dist` and package-local VitePress output. These paths stay untracked.

## Code analysis

`tools/oxlint/anti-slop` contains the vendored Oxlint plugin. Its `UPSTREAM.md` records the source commit and configuration. Vite+ applies the generic rules to owned source and tests, with runtime type checks confined to explicit type guards. The vendored tree keeps its upstream formatting and licenses.

Run `pnpm check:knip` to check unused files, dependencies, exports, and configuration hints. `knip.jsonc` records Vite's dynamically resolved build roots and the browser fixture entry points. The `uv` executable is supplied by the Python toolchain. Vendored rule internals are excluded from unused-code findings.
