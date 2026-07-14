# Development

Install locked dependencies:

```sh
pnpm install --frozen-lockfile
uv sync --frozen
```

Run the full local gate:

```sh
pnpm ready
```

The root commands are intentionally small:

- `pnpm check` runs formatting, linting, and type checks across both languages.
- `pnpm test` runs Vitest and pytest.
- `pnpm build` packs the npm package, builds the wheel and source distribution, and builds the docs.
- `pnpm dev` starts VitePress.

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
