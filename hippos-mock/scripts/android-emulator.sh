#!/usr/bin/env bash
set -euo pipefail

echo "Checking Android SDK..."
SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
if [ -z "$SDK" ]; then
  echo "ANDROID_SDK_ROOT or ANDROID_HOME not set."
  exit 1
fi

EMULATOR="$SDK/emulator/emulator"
ADB="$SDK/platform-tools/adb"

if [ ! -x "$EMULATOR" ]; then
  echo "emulator binary not found at $EMULATOR"
  exit 1
fi
if [ ! -x "$ADB" ]; then
  echo "adb not found at $ADB"
  exit 1
fi

# Start the first available AVD if none running
if "$ADB" devices | grep -q "emulator-"; then
  echo "Android emulator already running."
else
  AVD=$("$EMULATOR" -list-avds | head -n 1)
  if [ -z "$AVD" ]; then
    echo "No AVDs found. Create one via Android Studio."
    exit 1
  fi
  echo "Starting emulator: $AVD"
  nohup "$EMULATOR" -avd "$AVD" >/dev/null 2>&1 &
fi

# Launch expo for Android from the app directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR/.."
APP_DIR="$REPO_ROOT/webapp/hippos"
cd "$APP_DIR"

if command -v npx >/dev/null 2>&1; then
  npx expo start --android
else
  npm run android
fi

