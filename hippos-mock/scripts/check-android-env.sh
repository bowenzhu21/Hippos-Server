#!/usr/bin/env bash
set -euo pipefail

echo "Checking Android environment..."

SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
if [ -z "$SDK" ]; then
  echo "✗ ANDROID_SDK_ROOT or ANDROID_HOME not set"
  exit 1
else
  echo "✓ SDK: $SDK"
fi

check_bin() {
  local p="$1"
  local name
  name=$(basename "$p")
  if [ -x "$p" ]; then
    echo "✓ Found $name at $p"
  else
    echo "✗ Missing $name under SDK"
  fi
}

check_bin "$SDK/platform-tools/adb"
check_bin "$SDK/emulator/emulator"
check_bin "$SDK/tools/bin/sdkmanager"

if command -v java >/dev/null 2>&1; then
  echo "✓ Java: $(java -version 2>&1 | head -n1)"
else
  echo "✗ Java not found"
fi

if command -v node >/dev/null 2>&1; then
  echo "✓ Node: $(node -v)"
else
  echo "✗ Node not found"
fi

if command -v npm >/dev/null 2>&1; then
  echo "✓ npm: $(npm -v)"
else
  echo "✗ npm not found"
fi

if command -v npx >/dev/null 2>&1; then
  echo "✓ npx: $(npx -v)"
fi

exit 0

