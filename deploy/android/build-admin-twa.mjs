// Builds the Safqa ADMIN Android app (Trusted Web Activity around https://safqa-admin.pages.dev).
// Same toolchain and keystore as build-twa.mjs; different package id so both apps can be installed.
//   cd /workspace/twa-build && SAFQA_KEYSTORE=... SAFQA_KEYSTORE_PASS_FILE=... node /workspace/safqa/deploy/android/build-admin-twa.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(join(process.cwd(), 'package.json'));
const { AndroidSdkTools, Config, ConsoleLog, GradleWrapper, JdkHelper, TwaGenerator, TwaManifest } = require('@bubblewrap/core');

const SITE = process.env.SAFQA_ADMIN_SITE || 'https://safqa-admin.pages.dev';
const out = process.env.SAFQA_TWA_DIR || join(process.cwd(), 'admin-project');
const keystore = process.env.SAFQA_KEYSTORE;
const pass = readFileSync(process.env.SAFQA_KEYSTORE_PASS_FILE, 'utf8').trim();
const web = JSON.parse(readFileSync(new URL('../../apps/admin/public/manifest.webmanifest', import.meta.url), 'utf8'));

const log = new ConsoleLog('safqa-admin-twa');
const twa = TwaManifest.fromWebManifestJson(new URL('/manifest.webmanifest', SITE), web);
Object.assign(twa, {
  packageId: 'dev.pages.safqa_admin.twa',
  name: 'إدارة صفقة',
  launcherName: 'إدارة صفقة',
  appVersionName: process.env.SAFQA_APP_VERSION || '1.0.0',
  appVersionCode: Number(process.env.SAFQA_APP_VERSION_CODE || 1),
  enableNotifications: true,
  fallbackType: 'customtabs',
  startUrl: '/',
  minSdkVersion: 24,
  signingKey: { path: keystore, alias: 'safqa' },
  generatorApp: 'safqa-build-admin-twa',
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
const signed = join(out, 'safqa-admin.apk');
const env = { ...process.env, PATH: `${join(process.env.JAVA_HOME, 'bin')}:${process.env.PATH}` };
const bt = join(process.env.ANDROID_HOME, 'build-tools', process.env.SAFQA_BUILD_TOOLS || '35.0.0');
execFileSync(join(bt, 'zipalign'), ['-f', '-p', '4', unsigned, aligned], { stdio: 'inherit', env });
execFileSync(join(bt, 'apksigner'), ['sign', '--ks', keystore, '--ks-key-alias', 'safqa', '--ks-pass', `pass:${pass}`, '--key-pass', `pass:${pass}`, '--out', signed, aligned], { stdio: 'inherit', env });
execFileSync(join(bt, 'apksigner'), ['verify', signed], { stdio: 'inherit', env });
console.log(`APK ready: ${signed}`);
