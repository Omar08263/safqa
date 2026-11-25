// Field-level encryption for sensitive data at rest (AES-256-GCM, WebCrypto).
//
// Keyring secret FIELD_KEYS = "k2:<base64 32 bytes>,k1:<base64 32 bytes>" — the FIRST
// key encrypts, every listed key can decrypt (rotation: prepend a new key, run the
// re-encrypt job, then drop the old key). Ciphertext format:
//   enc:v1:<kid>:<iv b64url>:<ciphertext+tag b64url>
// The kid and a per-purpose label are bound as AES-GCM additional data, so a value
// can't be swapped between fields (e.g. a receipt moved into an email column).
// Values without the "enc:" prefix are legacy plaintext and are returned as-is,
// so encryption can be switched on without a big-bang migration.
import { b64url, b64urlDecode } from '../util';

const te = new TextEncoder();
const td = new TextDecoder();
const PREFIX = 'enc:v1:';

export interface Keyring { active: string; keys: Map<string, CryptoKey> }
const cache = new Map<string, Promise<Keyring | null>>();

export function parseKeyring(spec: string | undefined): { kid: string; raw: Uint8Array }[] {
  if (!spec) return [];
  return spec.split(',').map((p) => p.trim()).filter(Boolean).map((p) => {
    const i = p.indexOf(':');
    if (i < 1) throw new Error('FIELD_KEYS entry must be kid:base64');
    const kid = p.slice(0, i);
    if (!/^[a-z0-9]{1,8}$/i.test(kid)) throw new Error('bad kid');
    const raw = b64urlDecode(p.slice(i + 1).replace(/=+$/, ''));
    if (raw.length !== 32) throw new Error('FIELD_KEYS keys must be 32 bytes');
    return { kid, raw };
  });
}

export function keyring(spec: string | undefined): Promise<Keyring | null> {
  const k = spec ?? '';
  let p = cache.get(k);
  if (!p) {
    p = (async () => {
      const list = parseKeyring(spec);
      if (!list.length) return null;
      const keys = new Map<string, CryptoKey>();
      for (const { kid, raw } of list) keys.set(kid, await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']));
      return { active: list[0]!.kid, keys };
    })();
    cache.set(k, p);
  }
  return p;
}

export const isSealed = (v: unknown): v is string => typeof v === 'string' && v.startsWith(PREFIX);

/** Encrypt `plain` for `purpose`. Without a keyring (dev/tests) returns plaintext and says so. */
export async function seal(spec: string | undefined, purpose: string, plain: string): Promise<string> {
  const ring = await keyring(spec);
  if (!ring) return plain;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(`${ring.active}|${purpose}`) }, ring.keys.get(ring.active)!, te.encode(plain));
  return `${PREFIX}${ring.active}:${b64url(iv)}:${b64url(ct)}`;
}

/** Decrypt a sealed value; plaintext (legacy) passes through. Throws on tampering or unknown key. */
export async function open(spec: string | undefined, purpose: string, value: string): Promise<string> {
  if (!isSealed(value)) return value;
  const [kid, ivS, ctS] = value.slice(PREFIX.length).split(':');
  const ring = await keyring(spec);
  const key = ring?.keys.get(kid ?? '');
  if (!key || !ivS || !ctS) throw new Error('field key not available');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64urlDecode(ivS), additionalData: te.encode(`${kid}|${purpose}`) }, key, b64urlDecode(ctS));
  return td.decode(pt);
}

/** Key id a sealed value was written with (for the rotation job). */
export const sealedKid = (v: string) => (isSealed(v) ? v.slice(PREFIX.length).split(':')[0] ?? null : null);

/** Deterministic keyed hash for lookups on encrypted columns (blind index). */
export async function blindIndex(secret: string, purpose: string, value: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', te.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', k, te.encode(`${purpose}|${value.trim().toLowerCase()}`)));
}
