# Releasing

The npm and PyPI distributions use the same name and release line. npm writes a release candidate as `0.0.1-rc.1`. Python normalizes the same version to `0.0.1rc1`.

Configure each registry's trusted publisher for `peter-gy/anywidget-bundle`, `.github/workflows/publish.yml`, and its matching GitHub environment before pushing the first tag.

Run the release script from a clean `main` branch. With no argument, it validates and tags the current package version:

```sh
./scripts/release.sh
```

For a later release, let pnpm apply the version bump across the JavaScript workspace. The script passes the resolved version to uv and synchronizes both package-manager lockfiles:

```sh
./scripts/release.sh patch
```

Use `minor` or `major` for the corresponding version change.

Start a release-candidate series with its exact npm SemVer, then use `rc` for each later candidate:

```sh
./scripts/release.sh 0.0.1-rc.1
./scripts/release.sh rc
```

Use `patch` to promote the current release candidate to its stable version.

The script runs `make check test build`, executes the packed npm package, verifies the Python metadata and import, creates a release commit when versions changed, and adds an annotated `vX.Y.Z` tag. It leaves the release local for review.

Review the release commit and tag, then run the exact atomic push command printed by the script. For a stable `0.0.1` release, it prints:

```sh
git push --atomic origin main v0.0.1
```

The publish workflow checks the tag against both registry package manifests, publishes npm prereleases under the `next` tag, publishes both packages through their GitHub environments, and creates the GitHub release notes after both registries accept the artifacts.
