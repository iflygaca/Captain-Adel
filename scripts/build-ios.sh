#!/bin/bash
set -euo pipefail

# build-ios.sh — Builds the Captain Adel standalone iOS app and runs test suites.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
IOS_DIR="$REPO_ROOT/ios"

export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode-beta.app/Contents/Developer}"
export PATH="/opt/homebrew/bin:$PATH"

echo "ℹ Step 1: Running AdelCore test suites..."
swift test --package-path "$IOS_DIR/AdelCore" --build-path "/tmp/AdelCore-build"

echo "ℹ Step 2: Regenerating CaptainAdel.xcodeproj..."
(cd "$IOS_DIR" && xcodegen generate)

echo "ℹ Step 3: Compiling CaptainAdel app target..."
xcodebuild \
  -project "$IOS_DIR/CaptainAdel.xcodeproj" \
  -scheme "CaptainAdel" \
  -configuration "Debug" \
  -destination "generic/platform=iOS Simulator" \
  -derivedDataPath "$IOS_DIR/.build" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  build

echo "✓ Captain Adel iOS app built successfully!"
