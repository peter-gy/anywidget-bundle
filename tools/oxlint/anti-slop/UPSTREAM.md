# Anti-slop provenance

Source: https://github.com/dmmulroy/anti-slop

Revision: c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b.

The upstream `skills/install-anti-slop/assets/anti-slop` tree was copied with its installer to `tools/oxlint/anti-slop`. The generic plugin is registered in `vite.config.ts`. The optional Effect plugin is present in the upstream copy and is inactive because this workspace does not use Effect.

Rule behavior is unchanged. Imports from `@oxlint/plugins` use `vite-plus/lint/plugins` so the authoring API comes from the active Vite+ toolchain. Other local additions are this provenance record, the root license, and a private ESM package declaration. Formatting and linting exclude the vendored tree. Runtime type checks are permitted inside explicit type guards through upstream's `allowInTypeGuards` option.

Vite+ 0.3.2 supplies both the Oxlint runtime and plugin authoring API. See the [Vite+ JS plugin guidance](https://viteplus.dev/guide/lint#js-plugins).
