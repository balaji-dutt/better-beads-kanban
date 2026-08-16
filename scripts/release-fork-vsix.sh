#!/usr/bin/env bash
#
# Cuts a fork VSIX release for balaji-dutt/Beads-Kanban.
#
# This fork is not published to the VS Code Marketplace. It ships as a VSIX
# attached to a GitHub release, which the dotfiles repo installs from a pinned
# tag + asset name + SHA256. This script produces all three and prints them in
# the shape those pinned scripts expect.
#
# The VSIX filename carries the branch and short SHA so a downloaded asset can
# be identified without guessing, but package.json is packaged exactly as
# committed. That is the difference from scripts/build-local-vsix.sh, which also
# patches displayName: an iteration build has no version to identify it, a
# release does. This script also refuses to run on a dirty tree.
#
# Usage: scripts/release-fork-vsix.sh [--dry-run]
#
# Requires: gh (authenticated), node, npx, shasum or sha256sum.

set -euo pipefail

DRY_RUN=0
if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN=1
elif [ -n "${1:-}" ]; then
  echo "ERROR: unknown argument '${1}'. Usage: $0 [--dry-run]" >&2
  exit 1
fi

cd "$(git rev-parse --show-toplevel)"

FORK_REPO="balaji-dutt/Beads-Kanban"

# --- Preconditions -----------------------------------------------------------

if [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: working tree is dirty." >&2
  echo "  A release must be reproducible from the tagged commit." >&2
  echo "  Commit or stash, or use scripts/build-local-vsix.sh to iterate." >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: gh is required to create the release." >&2
  exit 1
fi

BRANCH=$(git rev-parse --abbrev-ref HEAD | tr '/' '-')
SHA=$(git rev-parse --short HEAD)
# Full SHA for gh's --target: the API accepts a branch name or a full commit
# SHA, and does not reliably resolve an abbreviated one.
FULL_SHA=$(git rev-parse HEAD)
ORIG_NAME=$(node -p "require('./package.json').displayName")
PACKAGE_NAME=$(node -p "require('./package.json').name")
VERSION=$(node -p "require('./package.json').version")

# This used to require an X.Y.Z-bd.N suffix so a fork build could not be mistaken
# for upstream's. That rationale is gone: the extension IDs differ
# (balaji-dutt.better-beads-kanban vs davidcforbes.beads-kanban), this fork is not
# on the marketplace, and since 2.2.0 it is the maintained line rather than a
# patch series on top of one. Plain X.Y.Z is now the normal case; -bd.N stays
# accepted so the older tags remain reproducible. Anything else is still a typo.
# Same shape as SEMVER_RE in scripts/bump-version.js — keep the two in sync.
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-bd\.[0-9]+)?$ ]]; then
  echo "ERROR: version '${VERSION}' is not X.Y.Z or X.Y.Z-bd.N." >&2
  echo "  Run: node scripts/bump-version.js X.Y.Z" >&2
  exit 1
fi

TAG="v${VERSION}-${SHA}"
TARGET_VSIX="${PACKAGE_NAME}-${VERSION}-${BRANCH}-${SHA}.vsix"
RELEASE_TITLE="${ORIG_NAME} ${VERSION} ${SHA}"

if git rev-parse -q --verify "refs/tags/${TAG}" >/dev/null 2>&1; then
  echo "ERROR: tag ${TAG} already exists locally." >&2
  echo "  Bump the version before cutting another release." >&2
  exit 1
fi

if gh release view "$TAG" --repo "$FORK_REPO" >/dev/null 2>&1; then
  echo "ERROR: release ${TAG} already exists on ${FORK_REPO}." >&2
  exit 1
fi

# The tag must point at a commit that exists on the remote, or the release will
# reference something nobody else can fetch.
if ! git branch -r --contains HEAD 2>/dev/null | grep -q .; then
  echo "ERROR: HEAD (${SHA}) has not been pushed to any remote." >&2
  echo "  Push the branch first, then re-run." >&2
  exit 1
fi

sha256_file() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1"
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1"
  else
    echo "ERROR: neither shasum nor sha256sum is available." >&2
    return 1
  fi
}

# --- Verify ------------------------------------------------------------------

echo "==> Verifying (tsc --noEmit, eslint, tests)"
npm run verify

# --- Build -------------------------------------------------------------------

# A release build packages package.json exactly as committed. Earlier versions
# patched displayName to "<name> [<branch>+<sha>]" here and restored it via an
# EXIT trap, so an installed build could be traced back to a commit. That is now
# the version number's job: releases carry a real X.Y.Z and a matching tag, and
# the branch is always main. build-local-vsix.sh still tags its displayName —
# that is the point of an iteration build, which has no version to identify it.

# SHA256SUMS is written after packaging, so one left behind by an earlier run
# or by --dry-run would be picked up as extension content.
rm -f SHA256SUMS

echo "==> Packaging ${TARGET_VSIX}"
npx @vscode/vsce package --out "${TARGET_VSIX}"

sha256_file "${TARGET_VSIX}" > SHA256SUMS
EXPECTED_SHA=$(cut -d ' ' -f 1 < SHA256SUMS)

# --- Release -----------------------------------------------------------------

if [ "$DRY_RUN" -eq 1 ]; then
  echo ""
  echo "==> Dry run: skipping 'gh release create'."
  echo "    Would create tag ${TAG} on ${FORK_REPO}."
else
  echo "==> Creating release ${TAG} on ${FORK_REPO}"
  # Without --target, GitHub creates the tag on the repository's default branch
  # rather than on the commit that was built, so checking out the tag yields the
  # wrong tree. Releases bd.1 through bd.3 all carry this defect.
  gh release create "${TAG}" \
    --repo "${FORK_REPO}" \
    --target "${FULL_SHA}" \
    --title "${RELEASE_TITLE}" \
    --notes "Fork build of ${PACKAGE_NAME} ${VERSION} from ${BRANCH} at ${SHA}. See CHANGELOG.md for what changed." \
    "${TARGET_VSIX}" SHA256SUMS
fi

# --- Pin block ---------------------------------------------------------------

cat <<EOF

Pin values for the dotfiles install scripts:

  TAG="${TAG}"
  ASSET="${TARGET_VSIX}"
  EXPECTED_SHA="${EXPECTED_SHA}"
  FORK_VERSION="${VERSION}"

Update all three of:
  .chezmoiscripts/run_onchange_after_install_beads_kanban_bd_fixes.sh.tmpl
  .chezmoiscripts/run_onchange_after_install_beads_kanban_bd_fixes.ps1.tmpl
  private_Documents/.../dot_devcontainer/devcontainer-common.sh

The two chezmoi scripts also carry the tag and sha in a header comment — that
comment is the run_onchange hash trigger, so it has to change too or the script
will not re-run.
EOF
