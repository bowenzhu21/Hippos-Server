#!/usr/bin/env bash
set -euo pipefail

# Resolve repo root based on this script's location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR/.."
APP_DIR="$REPO_ROOT/webapp/hippos"

if [ ! -d "$APP_DIR" ]; then
  echo "App directory not found at $APP_DIR"
  exit 1
fi

cd "$APP_DIR"

# Prefer npx expo if available, otherwise use npm script
if command -v npx >/dev/null 2>&1; then
  npx expo start
else
  npm run start
fi

