// RFC 6238 TOTP (HMAC-SHA1, 6 digits, 30 s) for owner 2FA in Safqa Hub. Works with
// Google Authenticator, Microsoft Authenticator, Aegis, 1Password, etc.
const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0, value = 0, out = '';
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += A[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += A[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(s: string): Uint8Array {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | A.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}

export const newTotpSecret = () => base32Encode(crypto.getRandomValues(new Uint8Array(20)));

export async function totpAt(secretB32: string, counter: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', base32Decode(secretB32), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const msg = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) { msg[i] = c & 0xff; c = Math.floor(c / 256); }
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const o = h[h.length - 1]! & 0x0f;
  const bin = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(bin % 1_000_000).padStart(6, '0');
}

/** Returns the matched time-step (for replay protection) or null. Accepts ±1 step of clock drift. */
export async function verifyTotp(secretB32: string, code: string, now = Date.now()): Promise<number | null> {
  const c = String(code).replace(/\D/g, '');
  if (c.length !== 6) return null;
  const step = Math.floor(now / 30_000);
  for (const d of [0, -1, 1]) if ((await totpAt(secretB32, step + d)) === c) return step + d;
  return null;
}

export const otpauthUri = (secret: string, account: string, issuer = 'Safqa Hub') =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
