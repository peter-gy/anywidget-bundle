#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERSION_FILES=(
  package.json
  apps/docs/package.json
  apps/e2e/package.json
  packages/vite/package.json
  packages/widget/pyproject.toml
  pnpm-lock.yaml
  uv.lock
)

usage() {
  cat <<'EOF'
Usage: ./scripts/release.sh [major|minor|patch|rc|X.Y.Z-rc.N]

With no argument, release the current package version. A bump updates every
JavaScript workspace version with pnpm and applies the result to Python with uv.
Pass an exact SemVer to start a release-candidate series, then use rc to advance
it. The script validates the packages, creates any needed release commit, and
adds an annotated v<version> tag locally.
EOF
}

die() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

step() {
  printf '\n==> %s\n' "$1"
}

confirm() {
  local reply
  printf '%s [y/N] ' "$1"
  read -r reply
  [[ "$reply" == "y" || "$reply" == "yes" ]]
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

npm_version() {
  local versions
  versions="$({
    node -p "require('./package.json').version"
    pnpm --silent --recursive exec node -p "require('./package.json').version"
  } | sort -u)"
  if [[ "$versions" == *$'\n'* ]]; then
    printf 'JavaScript versions:\n%s\n' "$versions" >&2
    die "JavaScript package versions must match"
  fi
  printf '%s\n' "$versions"
}

python_version_for() {
  uv version --package anywidget-bundle --dry-run --frozen \
    --output-format json "$1" \
    | node -p "JSON.parse(require('node:fs').readFileSync(0, 'utf8')).version"
}

version_is_newer() {
  node - "$1" "$2" <<'EOF'
const [candidate, current] = process.argv
  .slice(2)
  .map((value) => value.split(".").map(Number));
for (let index = 0; index < 3; index += 1) {
  if (candidate[index] === current[index]) continue;
  process.exit(candidate[index] > current[index] ? 0 : 1);
}
process.exit(1);
EOF
}

release_version() {
  local npm python expected_python
  npm="$(npm_version)"
  python="$(uv version --package anywidget-bundle --short)"
  expected_python="$(python_version_for "$npm")"
  if [[ "$python" != "$expected_python" ]]; then
    printf 'npm version: %s\nPython version: %s\n' "$npm" "$python" >&2
    die "Package versions must match"
  fi
  printf '%s\n' "$npm"
}

restore_versions() {
  local status=$?
  if [[ -n "${NPM_TEST_DIR:-}" ]]; then
    rm -rf "$NPM_TEST_DIR"
  fi
  if [[ "$status" -ne 0 && "${VERSION_UPDATED:-0}" == "1" && "${COMMITTED:-0}" == "0" ]]; then
    git restore --staged --worktree -- "${VERSION_FILES[@]}"
    printf '\nRestored package versions and lockfiles.\n' >&2
  fi
  exit "$status"
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi
if [[ "$#" -gt 1 ]]; then
  usage >&2
  exit 1
fi

EXACT_RC=0
BUMP="${1:-}"
case "$BUMP" in
  "" | major | minor | patch | rc) ;;
  *)
    if [[ "$BUMP" =~ ^[0-9]+\.[0-9]+\.[0-9]+-rc\.[0-9]+$ ]]; then
      EXACT_RC=1
      RC_BASE="${BUMP%%-rc.*}"
    else
      usage >&2
      exit 1
    fi
    ;;
esac

for command in git make node npm pnpm uv uvx; do
  require_command "$command"
done

[[ "$(git branch --show-current)" == "main" ]] || die "Releases must run from main"
[[ -z "$(git status --porcelain)" ]] || die "Git working directory must be clean"

step "Updating main"
git pull --ff-only --tags origin main

CURRENT_VERSION="$(release_version)"
if [[ "$EXACT_RC" == "1" ]]; then
  [[ "$CURRENT_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] \
    || die "Start a release-candidate series from a stable version"
  version_is_newer "$RC_BASE" "$CURRENT_VERSION" \
    || die "Release-candidate base $RC_BASE must be newer than $CURRENT_VERSION"
  git rev-parse -q --verify "refs/tags/v$RC_BASE" >/dev/null \
    && die "Stable release v$RC_BASE already exists"
fi
if [[ -n "$BUMP" ]]; then
  SUMMARY="Set all packages from $CURRENT_VERSION with pnpm $BUMP"
else
  SUMMARY="Release current package version $CURRENT_VERSION"
fi

printf '\n%s\n' "$SUMMARY"
confirm "Continue?" || die "Release cancelled"

VERSION_UPDATED=0
COMMITTED=0
trap restore_versions EXIT

if [[ -n "$BUMP" ]]; then
  step "Bumping package versions"
  VERSION_UPDATED=1
  if [[ "$BUMP" == "rc" ]]; then
    [[ "$CURRENT_VERSION" == *-rc.* ]] \
      || die "Start an RC series with an exact version such as 0.0.1-rc.1"
    pnpm --recursive version prerelease --preid rc --no-git-tag-version
  else
    pnpm --recursive version "$BUMP" --no-git-tag-version
  fi
  NPM_VERSION="$(npm_version)"
  uv version --package anywidget-bundle --frozen "$NPM_VERSION" >/dev/null
  pnpm install --lockfile-only
  uv lock
else
  NPM_VERSION="$CURRENT_VERSION"
fi

[[ "$(release_version)" == "$NPM_VERSION" ]] \
  || die "Version update did not converge on $NPM_VERSION"
PYTHON_VERSION="$(uv version --package anywidget-bundle --short)"
TAG="v$NPM_VERSION"
git rev-parse -q --verify "refs/tags/$TAG" >/dev/null && die "Tag already exists: $TAG"

step "Validating $TAG"
rm -rf dist
make check test build
pnpm --filter anywidget-bundle pack --pack-destination dist/npm

NPM_PACKAGE="dist/npm/anywidget-bundle-$NPM_VERSION.tgz"
WHEEL="dist/python/anywidget_bundle-$PYTHON_VERSION-py3-none-any.whl"
SDIST="dist/python/anywidget_bundle-$PYTHON_VERSION.tar.gz"
[[ -f "$NPM_PACKAGE" ]] || die "Missing npm package: $NPM_PACKAGE"
[[ -f "$WHEEL" ]] || die "Missing Python wheel: $WHEEL"
[[ -f "$SDIST" ]] || die "Missing Python source distribution: $SDIST"

NPM_TEST_DIR="$(mktemp -d)"
npm install --prefix "$NPM_TEST_DIR" --ignore-scripts --no-audit --no-fund \
  "$ROOT/$NPM_PACKAGE" vite@8
cp packages/vite/tests/compatibility.mjs "$NPM_TEST_DIR/compatibility.mjs"
(cd "$NPM_TEST_DIR" && node compatibility.mjs)
rm -rf "$NPM_TEST_DIR"
NPM_TEST_DIR=""

uvx twine check "$WHEEL" "$SDIST"
uv run --isolated --no-project --with "$WHEEL" python -c 'import anywidget_bundle'

git add -- "${VERSION_FILES[@]}"
git diff --quiet || die "Release checks changed tracked files outside the version update"

if ! git diff --cached --quiet; then
  step "Committing $NPM_VERSION"
  git commit -m "release: $NPM_VERSION"
  COMMITTED=1
fi

step "Tagging $TAG"
git tag -a "$TAG" -m "release: $NPM_VERSION"
trap - EXIT

cat <<EOF

$TAG is ready locally. Push the commit and tag atomically to publish npm and PyPI:

  git push --atomic origin main "$TAG"
EOF
