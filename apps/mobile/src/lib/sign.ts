/**
 * Request signing for mutating API calls (see docs/security.md, apps/edge/src/security/signing.ts).
 * x-safqa-sig = HMAC-SHA256(key, METHOD \n path?query \n ts \n nonce \n sha256hex(body)), base64url.
 * Honest note: the key ships inside the APK, so this deters scripted abuse and blocks
 * replay/tampering; it is not authentication. The server still checks the JWT and limits.
 * Pure JS (Hermes has no WebCrypto subtle). Key: EXPO_PUBLIC_SAFQA_SIGNING_KEY at build time.
 */
const KEY = process.env.EXPO_PUBLIC_SAFQA_SIGNING_KEY ?? '';
let clockOffset = 0; // server time − device time, learned from the Date header

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
export function sha256(msg: Uint8Array): Uint8Array {
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const l = msg.length;
  const n = (((l + 9 + 63) >> 6) << 6);
  const p = new Uint8Array(n);
  p.set(msg); p[l] = 0x80;
  const bits = l * 8;
  const dv = new DataView(p.buffer);
  dv.setUint32(n - 4, bits >>> 0); dv.setUint32(n - 8, Math.floor(bits / 2 ** 32));
  const w = new Uint32Array(64);
  for (let o = 0; o < n; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15]!, b = w[i - 2]!;
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h as unknown as number[];
    for (let i = 0; i < 64; i++) {
      const S1 = ((e! >>> 6) | (e! << 26)) ^ ((e! >>> 11) | (e! << 21)) ^ ((e! >>> 25) | (e! << 7));
      const t1 = (hh! + S1 + ((e! & f!) ^ (~e! & g!)) + K[i]! + w[i]!) >>> 0;
      const S0 = ((a! >>> 2) | (a! << 30)) ^ ((a! >>> 13) | (a! << 19)) ^ ((a! >>> 22) | (a! << 10));
      const t2 = (S0 + ((a! & b!) ^ (a! & c!) ^ (b! & c!))) >>> 0;
      hh = g; g = f; f = e; e = (d! + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0]! + a!) >>> 0; h[1] = (h[1]! + b!) >>> 0; h[2] = (h[2]! + c!) >>> 0; h[3] = (h[3]! + d!) >>> 0;
    h[4] = (h[4]! + e!) >>> 0; h[5] = (h[5]! + f!) >>> 0; h[6] = (h[6]! + g!) >>> 0; h[7] = (h[7]! + hh!) >>> 0;
  }
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) ov.setUint32(i * 4, h[i]!);
  return out;
}
const utf8 = (s: string) => new TextEncoder().encode(s);
export function hmacSha256(key: Uint8Array, msg: Uint8Array): Uint8Array {
  let k = key.length > 64 ? sha256(key) : key;
  const pad = new Uint8Array(64); pad.set(k);
  const ipad = pad.map((x) => x ^ 0x36), opad = pad.map((x) => x ^ 0x5c);
  const inner = new Uint8Array(64 + msg.length); inner.set(ipad); inner.set(msg, 64);
  const ih = sha256(inner);
  const outer = new Uint8Array(96); outer.set(opad); outer.set(ih, 64);
  return sha256(outer);
}
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const b64url = (b: Uint8Array) => {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let s = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i]! << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    s += A[(n >> 18) & 63]! + A[(n >> 12) & 63]! + (i + 1 < b.length ? A[(n >> 6) & 63]! : '') + (i + 2 < b.length ? A[n & 63]! : '');
  }
  return s;
};
const nonce = () => b64url(Uint8Array.from({ length: 18 }, () => Math.floor(Math.random() * 256)));

export function signHeaders(method: string, pathAndQuery: string, body: string, key = KEY, now = Date.now()): Record<string, string> {
  if (!key || /^(GET|HEAD|OPTIONS)$/i.test(method)) return {};
  const ts = String(Math.round(now + clockOffset));
  const n = nonce();
  const canon = `${method.toUpperCase()}\n${pathAndQuery}\n${ts}\n${n}\n${hex(sha256(utf8(body)))}`;
  return { 'x-safqa-ts': ts, 'x-safqa-nonce': n, 'x-safqa-sig': b64url(hmacSha256(utf8(key), utf8(canon))), 'x-safqa-client': 'android' };
}
/** Learn the server clock from any response so signatures stay inside the 60 s window. */
export function learnClock(res: Response) {
  const d = Date.parse(res.headers.get('date') ?? '');
  if (Number.isFinite(d)) clockOffset = d - Date.now();
}
