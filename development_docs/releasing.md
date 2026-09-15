# Releasing

Run releases from a clean `main` branch with the npm and Python registry versions aligned. npm uses SemVer such as `0.0.2-rc.1`. Python stores the normalized form `0.0.2rc1`.

Each registry's trusted publisher is scoped to `peter-gy/anywidget-bundle`, `.github/workflows/publish.yml`, and its `npm` or `pypi` GitHub environment.

## Create a stable release

Pass `patch`, `minor`, or `major` to update the workspace versions and lockfiles:

```sh
./scripts/release.sh patch
```

With no argument, the script validates and tags the current untagged package version:

```sh
./scripts/release.sh
```

## Create a release candidate

Start a candidate series from the preceding stable version with the exact npm SemVer:

```sh
./scripts/release.sh 0.0.2-rc.1
```

Advance the series with `rc`:

```sh
./scripts/release.sh rc
```

Promote the current candidate to its stable base with `patch`:

```sh
./scripts/release.sh patch
```

## Publish the tag

The script runs `make check test build`, executes the packed npm package, verifies the Python metadata and import, commits version changes, and creates an annotated `v<version>` tag. It leaves the commit and tag local for review.

Push the exact commit and tag with the command printed by the script:

```sh
git push --atomic origin main v0.0.2
```

The publish workflow verifies the tag against both manifests, publishes npm release candidates under `next`, publishes the Python distribution to PyPI, and creates GitHub release notes after both registries accept the artifacts. Stable npm releases use `latest`.

## Recover a failed PyPI upload

If npm succeeded and PyPI failed before accepting either archive, merge the publishing fix, then dispatch `publish.yml` from `main` with the original tag and tag-push run ID:

```sh
gh workflow run publish.yml --ref main \
  -f release-tag=v0.1.0 \
  -f artifact-run-id=34992589457
```

Recovery verifies that the run belongs to the tagged commit and that npm publishing succeeded. It downloads the original `release-packages` artifact, checks the published npm integrity against that tarball, uploads the Python archives, and generates release notes for the original tag. The tag and package contents stay unchanged. Release artifacts are retained for seven days.

If a publishing job succeeded and a later job failed with the same workflow code, rerun failed jobs in GitHub Actions. Recovery requires the original artifact to remain available.
