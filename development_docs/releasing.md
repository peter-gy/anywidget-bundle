# Releasing

The npm and PyPI distributions use the same name and version.

1. Set the version in `packages/vite/package.json` and `packages/widget/pyproject.toml`.
2. Refresh `pnpm-lock.yaml` and `uv.lock`.
3. Run `pnpm ready`.
4. Inspect the npm tarball, wheel, and source distribution.
5. Push the validated commit.
6. Create `vX.Y.Z` after manual release approval.

The publish workflow verifies the tag against both package manifests. Its build job uploads immutable npm and Python artifacts. Separate jobs publish them concurrently through the `npm` and `pypi` environments. The release-notes job runs after both publish jobs complete.

Configure each registry's trusted publisher for `peter-gy/anywidget-bundle`, `.github/workflows/publish.yml`, and its matching GitHub environment before creating the first tag.
