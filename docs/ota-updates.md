# 📦 Over-the-air (OTA) updates — Android app

Future JS/UI fixes reach installed apps **without a new APK**. It's free and self-hosted, so no EAS account is needed.

| Piece | Where |
|---|---|
| Client | `expo-updates` in `apps/mobile` (`app.json → updates`, `runtimeVersion`) + `src/lib/ota.ts` |
| Update server | Cloudflare Pages Function `apps/web/functions/ota/manifest.ts` → `https://safqaeg.pages.dev/ota/manifest` (Expo Updates protocol v0/v1) |
| Update files | static: `/ota/android/<runtime>/manifest.json` + `.sig`, `/ota/assets/<sha256>.<ext>` (immutable) |
| Publisher | `deploy/mobile/publish-ota.mjs` (export → hash → sign → stage in `~/.safqa/pages-assets/ota`) |
| Signing | RSA-SHA256 code signing. Private key: `~/.safqa/ota/keys/private-key.pem` (box only, mode 600). Public cert: `apps/mobile/certs/certificate.pem` (embedded in the APK) |

## How it behaves on the phone
- **Check on launch:** `checkAutomatically: ON_LOAD` with `fallbackToCacheTimeout: 0`. The app never waits for the network. A downloaded update runs on the next cold start.
- **Background fetch:** when the app comes back to the foreground (at most every 30 min) and 8 s after launch, `ota.ts` checks and downloads in the background. The update applies quietly the next time the app goes to the background, so the screen never reloads while someone is using it.
- **Settings:** shows «📦 آخر تحديث تلقائي: <date>» and a «🔎 دوّر على تحديث / ✨ طبّق التحديث» button.
- **Automatic rollback:**
  - expo-updates only runs an update whose signature matches the embedded certificate.
  - If a new update crashes before it finishes launching, the app goes back to the last working update, or to the bundle inside the APK. Settings then shows «🛟 رجعنا لنسخة سليمة تلقائيًا» (`isEmergencyLaunch`).
- **Kill switch:** `publish-ota.mjs --rollback` stages a signed `rollBackToEmbedded` directive, which sends every phone on that runtime back to its APK code. `--clear-rollback` removes it, and so does any new publish.

## runtimeVersion policy: `appVersion`
`runtimeVersion` = `expo.version` (e.g. `5.3.0`). An OTA only reaches APKs with the same app version.
- **JS / styles / images / copy:** publish an OTA. Keep `expo.version` unchanged.
- **Native changes** (new native module, permission, Expo SDK bump, `app.json` plugin change): build a new APK, which needs a version bump. The old runtime simply stops receiving updates.

## Publish an update
```bash
cd /workspace/safqa && git pull --rebase origin main
node deploy/mobile/publish-ota.mjs          # stages ~/.safqa/pages-assets/ota/android/<runtime>/
deploy/pages/deploy.sh                      # ships it with the site (functions included)
curl -s -H 'expo-protocol-version: 1' -H 'expo-platform: android' -H 'expo-runtime-version: 5.3.0' https://safqaeg.pages.dev/ota/manifest | head
```
Emergency: `node deploy/mobile/publish-ota.mjs --rollback && deploy/pages/deploy.sh`.

## Verified (Nov 25, 2026)
Tested locally with `wrangler pages dev` against a real `expo export`:
- The multipart response has `expo-protocol-version: 1` and `expo-sfv-version: 0`.
- The manifest signature verifies with `certificate.pem`.
- The launch-asset SHA-256 matches.
- An unknown runtime gets `noUpdateAvailable`.
- The rollback directive is served.

On-device behaviour needs the next APK, which is the first one to contain `expo-updates`.

## Why not EAS Update?
It needs an Expo account login/token on this box, and the free tier has limits. The self-hosted protocol is the documented alternative (expo/custom-expo-updates-server), and it costs nothing on Cloudflare Pages.
