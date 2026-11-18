// Builds the Safqa Android app as a Trusted Web Activity (Bubblewrap core, no prompts).
// The app opens the live PWA full-screen in Chrome, so Google sign-in, push-style
// notifications (notification delegation) and offline mode all keep working.
//
// Needs: JDK 17 (JAVA_HOME), Android SDK (ANDROID_HOME), a keystore outside the repo:
//   SAFQA_KEYSTORE=/home/box/.safqa/android/safqa.keystore SAFQA_KEYSTORE_PASS_FILE=.../keystore.pass
//   cd /workspace/twa-build && npm i @bubblewrap/core && node /workspace/safqa/deploy/android/build-twa.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(join(process.cwd(), 'package.json'));
const { AndroidSdkTools, Config, ConsoleLog, GradleWrapper, JdkHelper, TwaGenerator, TwaManifest } = require('@bubblewrap/core');

const SITE = process.env.SAFQA_SITE || 'https://safqa-eg-safqa.static.hf.space';
const version = process.env.SAFQA_APP_VERSION || '3.0.0';
const versionCode = Number(process.env.SAFQA_APP_VERSION_CODE || 3);
const out = process.env.SAFQA_TWA_DIR || join(process.cwd(), 'project');
const keystore = process.env.SAFQA_KEYSTORE;
const pass = readFileSync(process.env.SAFQA_KEYSTORE_PASS_FILE, 'utf8').trim();
const manifestPath = new URL('../../apps/web/public/manifest.webmanifest', import.meta.url);
const web = JSON.parse(readFileSync(manifestPath, 'utf8'));

const log = new ConsoleLog('safqa-twa');
const twa = TwaManifest.fromWebManifestJson(new URL('/manifest.webmanifest', SITE), web);
Object.assign(twa, {
  packageId: 'space.hf.safqa.twa',
  name: 'صفقة Safqa',
  launcherName: 'صفقة',
  appVersionName: version,
  appVersionCode: versionCode,
  enableNotifications: true,
  fallbackType: 'customtabs',
  startUrl: '/',
  minSdkVersion: 24,
  signingKey: { path: keystore, alias: 'safqa' },
  generatorApp: 'safqa-build-twa',
});
const config = new Config(process.env.JAVA_HOME, process.env.ANDROID_HOME);
const jdk = new JdkHelper(process, config);
const sdk = await AndroidSdkTools.create(process, config, jdk, log);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
await new TwaGenerator().createTwaProject(out, twa, log);
await new GradleWrapper(process, sdk, out).assembleRelease();

const unsigned = join(out, 'app/build/outputs/apk/release/app-release-unsigned.apk');
const aligned = join(out, 'app-release-aligned.apk');
const signed = join(out, 'safqa.apk');
const bt = join(process.env.ANDROID_HOME, 'build-tools', process.env.SAFQA_BUILD_TOOLS || '35.0.0');
execFileSync(join(bt, 'zipalign'), ['-f', '-p', '4', unsigned, aligned], { stdio: 'inherit' });
execFileSync(join(bt, 'apksigner'), ['sign', '--ks', keystore, '--ks-key-alias', 'safqa', '--ks-pass', `pass:${pass}`, '--key-pass', `pass:${pass}`, '--out', signed, aligned], { stdio: 'inherit' });
execFileSync(join(bt, 'apksigner'), ['verify', '--print-certs', signed], { stdio: 'inherit' });
console.log(`APK ready: ${signed}`);
