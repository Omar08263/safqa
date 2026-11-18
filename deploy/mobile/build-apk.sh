#!/usr/bin/env bash
# Build the signed native Android release APK of apps/mobile.
# Keystore stays outside the repo: ~/.safqa/android/{safqa.keystore,keystore.pass}
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP="$ROOT/apps/mobile"
export JAVA_HOME="${JAVA_HOME:-/home/box/.safqa/jdk/jdk-17.0.21+9}"
export ANDROID_HOME="${ANDROID_HOME:-/home/box/Android/Sdk}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
KDIR="${SAFQA_ANDROID_DIR:-$HOME/.safqa/android}"
if [[ -f "$KDIR/safqa.keystore" && -f "$KDIR/keystore.pass" ]]; then
  export SAFQA_KEYSTORE="$KDIR/safqa.keystore"
  SAFQA_KEYSTORE_PASS="$(tr -d '\n' < "$KDIR/keystore.pass")"
  export SAFQA_KEYSTORE_PASS SAFQA_KEY_ALIAS="${SAFQA_KEY_ALIAS:-safqa}"
else
  echo "warning: no keystore in $KDIR, release will be signed with the debug key" >&2
fi
cd "$APP"
[[ -d node_modules ]] || npm ci
if [[ "${SKIP_PREBUILD:-0}" != 1 ]]; then
  CI=1 npx expo prebuild --platform android --clean
  sed -i 's/^reactNativeArchitectures=.*/reactNativeArchitectures=arm64-v8a,armeabi-v7a,x86_64/; s/^org.gradle.jvmargs=.*/org.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=1g/' android/gradle.properties
fi
cd android
./gradlew --no-daemon assembleRelease
OUT="$APP/android/app/build/outputs/apk/release/app-release.apk"
mkdir -p "$ROOT/dist"
cp "$OUT" "$ROOT/dist/safqa.apk"
"$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --print-certs "$ROOT/dist/safqa.apk" | grep -E "Signer #1 certificate (DN|SHA-256)" || true
ls -la "$ROOT/dist/safqa.apk"
