#!/usr/bin/env bash
set -euo pipefail

# ── Bump MCP server version and update all references ──────────────
# Usage: ./bump-mcp.sh [patch|minor|major]
# Default: patch

BUMP_TYPE="${1:-patch}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MCP_DIR="$SCRIPT_DIR"
SETUP_DIR="$SCRIPT_DIR/../ulink-ai-setup"

# Validate bump type
if [[ "$BUMP_TYPE" != "patch" && "$BUMP_TYPE" != "minor" && "$BUMP_TYPE" != "major" ]]; then
  echo "Usage: $0 [patch|minor|major]"
  exit 1
fi

# Check both repos are clean
if ! git -C "$MCP_DIR" diff --quiet HEAD 2>/dev/null; then
  echo "Error: ulink_mcp_server has uncommitted changes. Commit or stash first."
  exit 1
fi
if ! git -C "$SETUP_DIR" diff --quiet HEAD 2>/dev/null; then
  echo "Error: ulink-ai-setup has uncommitted changes. Commit or stash first."
  exit 1
fi

# Get current version
CURRENT=$(node -p "require('$MCP_DIR/package.json').version")
echo "Current MCP server version: $CURRENT"

# Calculate new version
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
case "$BUMP_TYPE" in
  patch) PATCH=$((PATCH + 1)) ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
esac
NEW_VERSION="$MAJOR.$MINOR.$PATCH"
echo "New version: $NEW_VERSION"
echo ""

# 1. Bump MCP server package.json
echo "==> Bumping ulink_mcp_server to $NEW_VERSION..."
cd "$MCP_DIR"
npm version "$NEW_VERSION" --no-git-tag-version --quiet
npm run build --silent
npm test --silent
git add package.json
git commit -m "chore: bump version to $NEW_VERSION"
git tag "v$NEW_VERSION"
echo "    Committed and tagged v$NEW_VERSION"

# 2. Update pinned version in AI setup
echo "==> Updating ulink-ai-setup references to @$NEW_VERSION..."
cd "$SETUP_DIR"
# Update lib.mjs
sed -i '' "s/@ulinkly\/mcp-server@[0-9]*\.[0-9]*\.[0-9]*/@ulinkly\/mcp-server@$NEW_VERSION/g" bin/lib.mjs
# Update SKILL.md
sed -i '' "s/@ulinkly\/mcp-server@[0-9]*\.[0-9]*\.[0-9]*/@ulinkly\/mcp-server@$NEW_VERSION/g" skills/setup-ulink/SKILL.md

# Verify the update
FOUND=$(grep -r "@ulinkly/mcp-server@" bin/ skills/ | grep -v "$NEW_VERSION" || true)
if [[ -n "$FOUND" ]]; then
  echo "Error: Some references were not updated:"
  echo "$FOUND"
  exit 1
fi

git add bin/lib.mjs skills/setup-ulink/SKILL.md
git commit -m "chore: update pinned MCP server version to $NEW_VERSION"
echo "    Committed AI setup update"

# 3. Push both
echo ""
echo "==> Pushing..."
cd "$MCP_DIR"
git push && git push origin "v$NEW_VERSION"
echo "    MCP server pushed (v$NEW_VERSION)"

cd "$SETUP_DIR"
git push
echo "    AI setup pushed"

echo ""
echo "Done! MCP server v$NEW_VERSION released and all references updated."
echo ""
echo "Next: publish to npm with 'cd ulink_mcp_server && npm publish'"
