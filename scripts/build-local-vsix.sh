#!/usr/bin/env bash
#
# Local VSIX build wrapper for the Beads-Kanban fork.
#
# Produces a VSIX whose filename AND in-VS-Code displayName clearly
# identify the source branch + short SHA, so the installed extension
# can be told apart from any other variant (upstream, integration,
# feature branch, etc.).
#
# Dirty-tree builds: when the working tree has uncommitted changes,
# the filename gets a "-dirty-HHMMSS" suffix and the displayName
# gets a "+dirty" tag. This supports the "build, test, then commit"
# iteration loop: failed fix attempts disappear with a re-edit
# instead of becoming permanent commit-history noise.
#
# WHY: vsce package alone produces <package-name>-X.Y.Z.vsix with the
# base displayName — indistinguishable across branches and
# across pre/post-commit iterations. This wrapper tags both
# surfaces.
#
# WHAT IT DOES NOT DO: this script is fork-local only. It must never
# be used for upstream release packaging (`npm run release:package`).
# That flow requires the pristine displayName and version.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# Guard: refuse to run if package.json already has uncommitted edits.
# The trap below restores package.json from HEAD on exit, so a
# pre-existing edit would be silently reverted — defensively avoid.
if ! git diff --quiet HEAD -- package.json; then
  echo "ERROR: package.json has uncommitted changes." >&2
  echo "  This script's exit trap restores package.json from HEAD;" >&2
  echo "  running with pre-existing edits would silently revert them." >&2
  echo "  Commit or stash package.json first, then re-run." >&2
  exit 1
fi

# Detect dirty working tree BEFORE patching package.json (otherwise
# the patch itself would register as dirt).
DIRTY_STATE=$(git status --porcelain)

BRANCH=$(git rev-parse --abbrev-ref HEAD | tr '/' '-')
SHA=$(git rev-parse --short HEAD)
ORIG_NAME=$(node -p "require('./package.json').displayName")
PACKAGE_NAME=$(node -p "require('./package.json').name")
VERSION=$(node -p "require('./package.json').version")

DIRTY_SUFFIX=""
DIRTY_TAG=""
if [ -n "$DIRTY_STATE" ]; then
  TIMESTAMP=$(date +%H%M%S)
  DIRTY_SUFFIX="-dirty-${TIMESTAMP}"
  DIRTY_TAG="+dirty"
fi

TAGGED_NAME="${ORIG_NAME} [${BRANCH}+${SHA}${DIRTY_TAG}]"
TARGET_VSIX="${PACKAGE_NAME}-${VERSION}-${BRANCH}-${SHA}${DIRTY_SUFFIX}.vsix"

# Always restore package.json on exit (success, failure, or interrupt)
# so the temporary displayName patch never leaks into a commit.
trap 'git checkout -- package.json 2>/dev/null || true' EXIT

# Patch displayName in place.
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.displayName = '${TAGGED_NAME//\'/\\\'}';
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# Build. vsce will pick up the patched displayName and bake it into
# the VSIX. The compile step is part of vsce's prepublish hook.
npx @vscode/vsce package --out "${TARGET_VSIX}"

echo ""
echo "✓ Built: ${TARGET_VSIX}"
echo "  displayName tagged as: ${TAGGED_NAME}"
if [ -n "$DIRTY_STATE" ]; then
  echo "  (Working tree was dirty during build — '+dirty' tag applied.)"
  echo "  This is an iteration artifact; rebuild after committing for a"
  echo "  clean-state VSIX."
fi
echo "  Install with: code --install-extension ${TARGET_VSIX} --force"
