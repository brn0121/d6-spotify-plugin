#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE="/Applications/fifine Control Deck.app/Contents/Helpers/node20"
exec "$NODE" "$SCRIPT_DIR/build/index.js" "$@"
