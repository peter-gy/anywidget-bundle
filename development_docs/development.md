# Development

Install locked dependencies:

```sh
pnpm install --frozen-lockfile
uv sync --frozen
```

Run workspace validation:

```sh
make check test build
```

The Makefile exposes four workspace targets:

- `make build` builds the npm package, wheel, source distribution, and docs.
- `make check` runs formatting, linting, and type checks across both languages.
- `make format` formats JavaScript and Python sources.
- `make test` runs Vitest and pytest.

Start VitePress from its workspace package:

```sh
pnpm exec vp run -t @anywidget-bundle/docs#dev
```

## Validation by change

| Change           | Required evidence                                         |
| ---------------- | --------------------------------------------------------- |
| Vite plugin      | Built fixture, final file list, imported `index.js`       |
| AFM typing       | Object, sync factory, async factory, and exports coverage |
| Python loader    | pytest with real artifacts and error paths                |
| Package metadata | npm tarball and wheel contents, isolated imports          |
| Documentation    | Production base-path build and browser smoke test         |
| Workflow         | Local commands match workflow commands and artifact paths |

Build output belongs under `dist` and package-local VitePress output. These paths stay untracked.
