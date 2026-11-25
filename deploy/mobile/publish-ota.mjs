#!/usr/bin/env node
// 📦 Publish an over-the-air update of apps/mobile to our own free update server (Cloudflare Pages).
//   node deploy/mobile/publish-ota.mjs            build + sign + stage → then run deploy/pages/deploy.sh
//   node deploy/mobile/publish-ota.mjs --rollback  stage a signed «rollBackToEmbedded» kill switch
//   node deploy/mobile/publish-ota.mjs --clear-rollback
// Output goes to $ASSETS_DIR/ota (default ~/.safqa/pages-assets/ota), which deploy/pages/deploy.sh ships.
// Signing key: ~/.safqa/ota/keys/private-key.pem (never committed; cert is apps/mobile/certs/certificate.pem).
// Only JS/asset changes may ship over the air. Native changes (new native module, permissions, SDK bump)
// need a new APK with a new app version, because runtimeVersion follows the app version ("appVersion" policy).
import { createHash, createSign } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const APP = path.join(ROOT, 'apps/mobile');
const SITE = process.env.SITE_URL || 'https://safqaeg.pages.dev';
const ASSETS = process.env.ASSETS_DIR || path.join(os.homedir(), '.safqa/pages-assets');
const KEY = process.env.OTA_PRIVATE_KEY || path.join(os.homedir(), '.safqa/ota/keys/private-key.pem');
const PLATFORM = 'android';
const OTA = path.join(ASSETS, 'ota');
const args = new Set(process.argv.slice(2));

const sh = (cmd, a, opts = {}) => execFileSync(cmd, a, { cwd: APP, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...opts });
const b64url = (b) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sign = (s) => { const k = fs.readFileSync(KEY, 'utf8'); const g = createSign('RSA-SHA256'); g.update(s, 'utf8'); g.end(); return g.sign(k, 'base64'); };
const uuidFrom = (hex) => `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${((parseInt(hex[16], 16) & 3) | 8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', json: 'application/json' };

if (!fs.existsSync(KEY)) { console.error(`missing signing key ${KEY}`); process.exit(1); }
const runtime = JSON.parse(sh('node', ['node_modules/expo-updates/bin/cli.js', 'runtimeversion:resolve', '--platform', PLATFORM])).runtimeVersion;
const dir = path.join(OTA, PLATFORM, runtime);
fs.mkdirSync(dir, { recursive: true });

if (args.has('--rollback') || args.has('--clear-rollback')) {
  for (const f of ['directive.json', 'directive.sig']) fs.rmSync(path.join(dir, f), { force: true });
  if (args.has('--rollback')) {
    const body = JSON.stringify({ type: 'rollBackToEmbedded', parameters: { commitTime: new Date().toISOString() } });
    fs.writeFileSync(path.join(dir, 'directive.json'), body);
    fs.writeFileSync(path.join(dir, 'directive.sig'), sign(body));
    console.log(`rollback staged for runtime ${runtime}; now run deploy/pages/deploy.sh`);
  } else console.log(`rollback cleared for runtime ${runtime}; now run deploy/pages/deploy.sh`);
  process.exit(0);
}

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'safqa-ota-'));
console.log(`exporting ${PLATFORM} bundle (runtime ${runtime})…`);
// Security T-4: the app signs API requests with keys from ~/.safqa/security.env (same as the APK build).
const secEnv = path.join(os.homedir(), '.safqa/security.env');
const env = { ...process.env, CI: '1' };
if (fs.existsSync(secEnv)) for (const line of fs.readFileSync(secEnv, 'utf8').split('\n')) { const m = /^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/.exec(line); if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); }
execFileSync('npx', ['expo', 'export', '--platform', PLATFORM, '--output-dir', out], { cwd: APP, stdio: 'inherit', env });
const meta = JSON.parse(fs.readFileSync(path.join(out, 'metadata.json'), 'utf8'));
const fm = meta.fileMetadata[PLATFORM];
const expoClient = JSON.parse(sh('npx', ['expo', 'config', '--json', '--type', 'public'], { env }));

const assetsDir = path.join(OTA, 'assets');
fs.mkdirSync(assetsDir, { recursive: true });
function asset(rel, ext, launch) {
  const buf = fs.readFileSync(path.join(out, rel));
  const sha = createHash('sha256').update(buf);
  const hex = createHash('sha256').update(buf).digest('hex');
  const file = `${hex}.${launch ? 'bundle' : ext}`;
  fs.writeFileSync(path.join(assetsDir, file), buf);
  return { hash: b64url(sha.digest()), key: createHash('md5').update(buf).digest('hex'), fileExtension: `.${launch ? 'bundle' : ext}`, contentType: launch ? 'application/javascript' : MIME[ext] ?? 'application/octet-stream', url: `${SITE}/ota/assets/${file}` };
}
const launchAsset = asset(fm.bundle, 'js', true);
const assets = fm.assets.map((a) => asset(a.path, a.ext, false));
const createdAt = new Date().toISOString();
const id = uuidFrom(createHash('sha256').update(JSON.stringify({ launchAsset, assets, createdAt })).digest('hex'));
const manifest = JSON.stringify({ id, createdAt, runtimeVersion: runtime, launchAsset, assets, metadata: {}, extra: { expoClient } });
fs.writeFileSync(path.join(dir, 'manifest.json'), manifest);
fs.writeFileSync(path.join(dir, 'manifest.sig'), sign(manifest));
// A fresh publish always cancels a previous kill switch.
for (const f of ['directive.json', 'directive.sig']) fs.rmSync(path.join(dir, f), { force: true });
fs.writeFileSync(path.join(OTA, 'history.jsonl'), `${JSON.stringify({ id, createdAt, runtime, bundle: launchAsset.url, assets: assets.length })}\n`, { flag: 'a' });
fs.rmSync(out, { recursive: true, force: true });
// Prune assets no live manifest references (Pages caps a deploy at 20k files / 25 MB each).
const live = new Set();
for (const p of fs.readdirSync(path.join(OTA, PLATFORM))) {
  const m = path.join(OTA, PLATFORM, p, 'manifest.json');
  if (fs.existsSync(m)) { const j = JSON.parse(fs.readFileSync(m, 'utf8')); for (const a of [j.launchAsset, ...j.assets]) live.add(path.basename(new URL(a.url).pathname)); }
}
for (const f of fs.readdirSync(assetsDir)) if (!live.has(f)) fs.rmSync(path.join(assetsDir, f));
console.log(`staged update ${id} (runtime ${runtime}, ${assets.length} assets) in ${dir}\nnext: deploy/pages/deploy.sh`);
