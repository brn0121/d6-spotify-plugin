#!/bin/bash
# release.sh — packages the distributable plugin for the public GitHub repo.
#
# Usage:
#   chmod +x scripts/release.sh
#   ./scripts/release.sh [/path/to/public-repo]
#
# If no destination is given, output goes to ./dist/com.spotify.controller.sdPlugin

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEST="${1:-$PLUGIN_ROOT/dist/com.spotify.controller.sdPlugin}"

echo "Building bundle..."
cd "$PLUGIN_ROOT/plugin"
npm run build
cd "$PLUGIN_ROOT"

echo "Packaging release to: $DEST"
rm -rf "$DEST"
mkdir -p "$DEST/images"
mkdir -p "$DEST/plugin/build"
mkdir -p "$DEST/plugin/log"

# Root files
cp manifest.json "$DEST/"
cp README.md     "$DEST/"

# Images (PNG only — SVGs are source files)
cp images/*.png "$DEST/images/"

# Plugin runtime files (no source, no dev artifacts)
cp plugin/build/index.js "$DEST/plugin/build/"
cp plugin/launch.sh      "$DEST/plugin/"
cp plugin/pi.html        "$DEST/plugin/"

# Placeholder so the log directory exists in the repo
touch "$DEST/plugin/log/.gitkeep"

# Copy the public .gitignore
cp scripts/release.gitignore "$DEST/.gitignore"

echo ""
echo "Release ready at: $DEST"
echo ""
echo "To publish:"
echo "  cd $DEST"
echo "  git init && git add . && git commit -m 'Release vX.X.X'"
echo "  git remote add origin <public-repo-url>"
echo "  git push -u origin main"
