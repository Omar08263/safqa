// Verifies Google ID tokens (RS256) against Google's published JWKS.
import { b64urlDecode } from './util';

interface Jwk { kid: string; n: string; e: string; kty: string; alg?: string }
let cache: { keys: Jwk[]; exp: number } | null = null;

async function jwks(): Promise<Jwk[]> {
  if (cache && cache.exp > Date.now()) return cache.keys;
  const res = await fetch('https://www.googleapis.com/oauth2/v3/certs', { cf: { cacheTtl: 3600 } } as RequestInit);
  if (!res.ok) throw new Error(`jwks ${res.status}`);
  const body = (await res.json()) as { keys: Jwk[] };
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1] ?? 3600);
  cache = { keys: body.keys, exp: Date.now() + maxAge * 1000 };
  return body.keys;
}

export interface GoogleClaims { sub: string; email: string; email_verified?: boolean; name?: string; picture?: string; aud: string; iss: string; exp: number; nonce?: string }

export async function verifyGoogleIdToken(token: string, clientId: string): Promise<GoogleClaims> {
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) throw new Error('malformed');
  const header = JSON.parse(new TextDecoder().decode(b64urlDecode(h)));
  if (header.alg !== 'RS256') throw new Error('alg');
  const keys = await jwks();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('unknown kid');
  const key = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlDecode(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw new Error('signature');
  const c = JSON.parse(new TextDecoder().decode(b64urlDecode(p))) as GoogleClaims;
  if (c.aud !== clientId) throw new Error('audience');
  if (c.iss !== 'https://accounts.google.com' && c.iss !== 'accounts.google.com') throw new Error('issuer');
  if (c.exp * 1000 < Date.now() - 60_000) throw new Error('expired');
  if (!c.email || c.email_verified === false) throw new Error('email not verified');
  return c;
}
