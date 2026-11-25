// 📦 Over-the-air updates for the Safqa Android app: a free, self-hosted Expo Updates server
// (protocol v0/v1, https://docs.expo.dev/technical-specs/expo-updates-1/) as one Pages Function.
// Everything is precomputed by deploy/mobile/publish-ota.mjs and shipped as static files:
//   /ota/android/<runtimeVersion>/manifest.json   exact manifest body (string that was signed)
//   /ota/android/<runtimeVersion>/manifest.sig    RSA-SHA256 signature (base64) of that body
//   /ota/android/<runtimeVersion>/directive.json  optional: {"type":"rollBackToEmbedded",...} kill switch
//   /ota/android/<runtimeVersion>/directive.sig
//   /ota/assets/<sha256>.<ext>                     bundle + images (immutable)
// The private signing key never leaves the box; this function only relays signed bytes.
interface Env { ASSETS: { fetch: (r: Request | string) => Promise<Response> } }

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

function multipart(parts: { name: string; body: string; sig?: string | null }[], protocol: number) {
  const boundary = `safqa-ota-${crypto.randomUUID()}`;
  let out = '';
  for (const p of parts) {
    out += `--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"\r\nContent-Type: application/json; charset=utf-8\r\n`;
    if (p.sig) out += `expo-signature: sig="${p.sig}", keyid="main"\r\n`;
    out += `\r\n${p.body}\r\n`;
  }
  out += `--${boundary}--\r\n`;
  return new Response(out, {
    status: 200,
    headers: { 'content-type': `multipart/mixed; boundary=${boundary}`, 'expo-protocol-version': String(protocol), 'expo-sfv-version': '0', 'cache-control': 'private, max-age=0' },
  });
}

async function text(env: Env, origin: string, path: string): Promise<string | null> {
  const r = await env.ASSETS.fetch(new Request(new URL(path, origin).toString()));
  if (!r.ok) return null;
  const t = await r.text();
  // The SPA fallback (/* → index.html) must never be mistaken for a manifest.
  return t.trimStart().startsWith('<') ? null : t.trim();
}

export const onRequestGet = async (ctx: { request: Request; env: Env }) => {
  const req = ctx.request;
  const url = new URL(req.url);
  const h = (k: string) => req.headers.get(k) ?? url.searchParams.get(k.replace(/^expo-/, '')) ?? '';
  const protocol = Number.parseInt(req.headers.get('expo-protocol-version') ?? '0', 10) === 1 ? 1 : 0;
  const platform = h('expo-platform');
  const runtime = h('expo-runtime-version');
  if (platform !== 'android' && platform !== 'ios') return json(400, { error: 'Unsupported platform. Expected ios or android.' });
  if (!runtime || !/^[\w.\-]{1,80}$/.test(runtime)) return json(400, { error: 'No (valid) runtimeVersion provided.' });
  const dir = `/ota/${platform}/${runtime}`;
  const wantsSig = Boolean(req.headers.get('expo-expect-signature'));

  // Kill switch: send everyone on this runtime back to the code embedded in their APK.
  const directive = protocol === 1 ? await text(ctx.env, url.origin, `${dir}/directive.json`) : null;
  if (directive) {
    const embedded = req.headers.get('expo-embedded-update-id');
    const current = req.headers.get('expo-current-update-id');
    if (embedded && current && embedded === current) return multipart([{ name: 'directive', body: JSON.stringify({ type: 'noUpdateAvailable' }) }], 1);
    const sig = wantsSig ? await text(ctx.env, url.origin, `${dir}/directive.sig`) : null;
    if (wantsSig && !sig) return json(400, { error: 'Code signing requested but the directive is unsigned.' });
    return multipart([{ name: 'directive', body: directive, sig }], 1);
  }

  const manifest = await text(ctx.env, url.origin, `${dir}/manifest.json`);
  if (!manifest) {
    // No OTA published for this runtime yet: the app keeps running its embedded bundle.
    return protocol === 1 ? multipart([{ name: 'directive', body: JSON.stringify({ type: 'noUpdateAvailable' }) }], 1) : json(404, { error: 'No update for this runtime version.' });
  }
  let id = '';
  try { id = (JSON.parse(manifest) as { id: string }).id; } catch { return json(500, { error: 'Bad manifest' }); }
  if (protocol === 1 && req.headers.get('expo-current-update-id') === id) return multipart([{ name: 'directive', body: JSON.stringify({ type: 'noUpdateAvailable' }) }], 1);
  const sig = wantsSig ? await text(ctx.env, url.origin, `${dir}/manifest.sig`) : null;
  if (wantsSig && !sig) return json(400, { error: 'Code signing requested but the manifest is unsigned.' });
  return multipart([{ name: 'manifest', body: manifest, sig }, { name: 'extensions', body: JSON.stringify({ assetRequestHeaders: {} }) }], protocol);
};
