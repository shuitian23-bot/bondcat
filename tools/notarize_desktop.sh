#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TEAM_ID="${BONDCAT_TEAM_ID:-FC748AG3Z3}"
APP_NAME="BondCat Desktop.app"
VERSION="$(python3 - <<'PY'
import json
print(json.load(open("package.json"))["version"])
PY
)"
OUT_DIR="$ROOT/.omc/desktop-notarized"
STAGE_DIR="/tmp/bondcat-desktop-notarize"
APP_SRC="$ROOT/src-tauri/target/release/bundle/macos/$APP_NAME"
APP_STAGE="$STAGE_DIR/$APP_NAME"
DMG_OUT="$OUT_DIR/BondCatDesktop_${VERSION}_aarch64_notarized.dmg"
DMG_TMP="/tmp/BondCatDesktop_${VERSION}_aarch64_notarized.dmg"

SIGNING_IDENTITY="${BONDCAT_DEVELOPER_ID_IDENTITY:-}"
if [[ -z "$SIGNING_IDENTITY" ]]; then
  SIGNING_IDENTITY="$(security find-identity -v -p codesigning 2>/dev/null \
    | sed -n 's/.*"\(Developer ID Application: .*\)"/\1/p' \
    | grep "($TEAM_ID)" \
    | head -1 || true)"
fi

if [[ -z "$SIGNING_IDENTITY" ]]; then
  echo "Missing Developer ID Application certificate for team $TEAM_ID."
  echo "Install it in Keychain, or set BONDCAT_DEVELOPER_ID_IDENTITY."
  exit 2
fi

read -r API_KEY_ID API_ISSUER API_KEY_PATH < <(python3 - <<'PY'
import json, pathlib
cfg=json.load(open("fastlane/app_store_connect_api_key.json"))
print(cfg["key_id"], cfg["issuer_id"], pathlib.Path(cfg["key_filepath"]).expanduser())
PY
)

if [[ ! -f "$API_KEY_PATH" ]]; then
  echo "Missing App Store Connect API key file: $API_KEY_PATH"
  exit 2
fi

echo "Building Desktop Enhanced..."
set +e
CI=true COPYFILE_DISABLE=1 npm run build:desktop
BUILD_STATUS=$?
set -e
if [[ ! -x "$APP_SRC/Contents/MacOS/bondcat" ]]; then
  echo "Desktop app bundle was not generated."
  exit "$BUILD_STATUS"
fi
if [[ "$BUILD_STATUS" -ne 0 ]]; then
  echo "Tauri bundle signing failed; continuing with generated app bundle and manual Developer ID signing."
fi

echo "Signing with: $SIGNING_IDENTITY"
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR" "$OUT_DIR"
ditto --norsrc --noextattr --noqtn --noacl "$APP_SRC" "$APP_STAGE"
xattr -cr "$APP_STAGE" || true
codesign --force --deep --options runtime --timestamp --sign "$SIGNING_IDENTITY" "$APP_STAGE"
codesign --verify --deep --strict --verbose=2 "$APP_STAGE"

echo "Creating DMG..."
ln -s /Applications "$STAGE_DIR/Applications"
rm -f "$DMG_TMP" "$DMG_OUT"
hdiutil create -volname "BondCat Desktop" -srcfolder "$STAGE_DIR" -ov -format UDZO "$DMG_TMP"
xattr -cr "$DMG_TMP" || true
codesign --force --timestamp --sign "$SIGNING_IDENTITY" "$DMG_TMP"
codesign --verify --verbose=2 "$DMG_TMP"

echo "Submitting to Apple notary service..."
xcrun notarytool submit "$DMG_TMP" \
  --key "$API_KEY_PATH" \
  --key-id "$API_KEY_ID" \
  --issuer "$API_ISSUER" \
  --wait \
  --output-format json

echo "Stapling ticket..."
xcrun stapler staple "$DMG_TMP"
xcrun stapler validate "$DMG_TMP"
ditto --norsrc --noextattr --noqtn --noacl "$DMG_TMP" "$DMG_OUT"
xcrun stapler validate "$DMG_OUT"

echo "Gatekeeper check:"
spctl -a -vv --type open --context context:primary-signature "$DMG_OUT"

echo "Ready: $DMG_OUT"
