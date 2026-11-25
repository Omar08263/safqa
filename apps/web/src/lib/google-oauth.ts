/**
 * Google sign-in for the static demo.
 *
 * Hugging Face Static Spaces send `Cross-Origin-Opener-Policy: same-origin`
 * (not something this app can change — it is not a meta tag, and Vite does
 * not set it). GIS popup / postMessage therefore never reaches the opener:
 * the popup sits on accounts.google.com/gsi/transform and the callback never
 * fires. The OpenID implicit redirect flow does not need the opener, so it
 * is the primary path.
 *
 * Google returns to `/auth/callback#id_token=...&state=...`; that fragment is
 * read and cleared before the router starts.
 */

export const GOOGLE_CLIENT_ID = String(
  import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '',
);
export const GOOGLE_AUTHORIZE_URL =
  'https://accounts.google.com/o/oauth2/v2/auth';
/** Must match a registered Authorized redirect URI exactly. */
export const SITE_ORIGIN = 'https://safqaeg.pages.dev';
export const GOOGLE_REDIRECT_URI = `${SITE_ORIGIN}/auth/callback`;
/** The old Hugging Face origin (now a redirect) is registered without a path; the admin app still uses it. */
export const LEGACY_REDIRECT_ORIGIN = 'https://safqa-eg-safqa.static.hf.space';

const STATE_KEY = 'safqa.google.oauth.state';
const NONCE_KEY = 'safqa.google.oauth.nonce';
const PENDING_KEY = 'safqa.google.oauth.pending';
export const GOOGLE_OAUTH_ERROR_KEY = 'safqa.google.oauth.error';

export type OAuthHashParams = {
  id_token?: string;
  state?: string;
  error?: string;
  error_description?: string;
};

export type GoogleClaims = {
  iss?: string;
  aud?: string;
  exp?: number;
  iat?: number;
  nonce?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  picture?: string;
};

export function randomOAuthToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function redirectUriForOrigin(origin: string): string {
  // location.origin never has a trailing slash. On the live Space this is
  // exactly the registered URI. Elsewhere (local dev) use the current origin
  // so a mismatch is obvious instead of silently bouncing to production.
  const o = origin.replace(/\/$/, '');
  if (!o) return GOOGLE_REDIRECT_URI;
  return o === LEGACY_REDIRECT_ORIGIN ? o : `${o}/auth/callback`;
}

export function buildGoogleAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
}): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: 'id_token',
    scope: 'openid email profile',
    nonce: opts.nonce,
    state: opts.state,
    prompt: 'select_account',
  });
  return `${GOOGLE_AUTHORIZE_URL}?${params.toString()}`;
}

/** Returns null for hash-router paths like `#/login` or empty hashes. */
export function parseOAuthHash(hash: string): OAuthHashParams | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw || raw.startsWith('/')) return null;
  const params = new URLSearchParams(raw);
  if (!params.has('id_token') && !params.has('error')) return null;
  return {
    id_token: params.get('id_token') ?? undefined,
    state: params.get('state') ?? undefined,
    error: params.get('error') ?? undefined,
    error_description: params.get('error_description') ?? undefined,
  };
}

export function decodeJwtPayload(credential: string): GoogleClaims | null {
  try {
    const part = credential.split('.')[1] ?? '';
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as GoogleClaims;
  } catch {
    return null;
  }
}

export function verifyGoogleIdToken(
  credential: string,
  opts: { clientId: string; nonce: string; now?: number },
): { ok: true; claims: GoogleClaims } | { ok: false; error: string } {
  const claims = decodeJwtPayload(credential);
  if (!claims) return { ok: false, error: 'invalid_token' };
  const iss = String(claims.iss || '');
  if (iss !== 'https://accounts.google.com' && iss !== 'accounts.google.com')
    return { ok: false, error: 'invalid_issuer' };
  if (!opts.clientId || claims.aud !== opts.clientId)
    return { ok: false, error: 'invalid_audience' };
  const now = opts.now ?? Date.now();
  if (typeof claims.exp !== 'number' || claims.exp * 1000 < now)
    return { ok: false, error: 'expired' };
  if (!opts.nonce || claims.nonce !== opts.nonce)
    return { ok: false, error: 'invalid_nonce' };
  const email = String(claims.email || '').toLowerCase();
  if (
    !email ||
    claims.email_verified === false ||
    claims.email_verified === 'false'
  )
    return { ok: false, error: 'unverified_email' };
  return { ok: true, claims };
}

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Read `#id_token=...` (or a previously stashed pending hash) and clear the URL. */
export function captureGoogleRedirectFromLocation(): boolean {
  const store = storage();
  const fromUrl = parseOAuthHash(window.location.hash);
  let parsed = fromUrl;
  if (!parsed && store) {
    const stashed = store.getItem(PENDING_KEY);
    if (stashed) {
      try {
        const asJson = JSON.parse(stashed) as OAuthHashParams | string;
        parsed =
          typeof asJson === 'string'
            ? parseOAuthHash(asJson)
            : parseOAuthHashParams(asJson);
      } catch {
        parsed = parseOAuthHash(stashed);
      }
    }
  }
  if (!parsed) return false;
  store?.setItem(PENDING_KEY, JSON.stringify(parsed));
  if (fromUrl) {
    const next = `${window.location.pathname}${window.location.search}` || '/';
    window.history.replaceState(null, '', next);
  }
  return true;
}

function parseOAuthHashParams(value: OAuthHashParams): OAuthHashParams | null {
  if (!value.id_token && !value.error) return null;
  return value;
}

export function startGoogleRedirectLogin(
  origin = window.location.origin,
): void {
  if (!GOOGLE_CLIENT_ID) throw new Error('Google Client ID is not configured');
  const state = randomOAuthToken();
  const nonce = randomOAuthToken();
  const store = storage();
  store?.setItem(STATE_KEY, state);
  store?.setItem(NONCE_KEY, nonce);
  store?.removeItem(GOOGLE_OAUTH_ERROR_KEY);
  const url = buildGoogleAuthorizeUrl({
    clientId: GOOGLE_CLIENT_ID,
    redirectUri: redirectUriForOrigin(origin),
    state,
    nonce,
  });
  window.location.assign(url);
}

export type GoogleRedirectResult =
  | { ok: true; credential: string; claims: GoogleClaims }
  | { ok: false; error: string }
  | null;

export function consumeGoogleRedirectResult(opts?: {
  clientId?: string;
  now?: number;
}): GoogleRedirectResult {
  const store = storage();
  if (!store) return null;
  const raw = store.getItem(PENDING_KEY);
  if (!raw) return null;
  store.removeItem(PENDING_KEY);
  let parsed: OAuthHashParams | null = null;
  try {
    const asJson = JSON.parse(raw) as OAuthHashParams | string;
    parsed =
      typeof asJson === 'string'
        ? parseOAuthHash(asJson)
        : parseOAuthHashParams(asJson);
  } catch {
    parsed = parseOAuthHash(raw);
  }
  const expectedState = store.getItem(STATE_KEY);
  const expectedNonce = store.getItem(NONCE_KEY);
  store.removeItem(STATE_KEY);
  store.removeItem(NONCE_KEY);
  if (!parsed) return { ok: false, error: 'invalid_callback' };
  if (parsed.error)
    return { ok: false, error: parsed.error_description || parsed.error };
  if (!parsed.id_token) return { ok: false, error: 'missing_token' };
  if (!expectedState || parsed.state !== expectedState)
    return { ok: false, error: 'invalid_state' };
  const verified = verifyGoogleIdToken(parsed.id_token, {
    clientId: opts?.clientId || GOOGLE_CLIENT_ID,
    nonce: expectedNonce || '',
    now: opts?.now,
  });
  if (!verified.ok) return verified;
  return { ok: true, credential: parsed.id_token, claims: verified.claims };
}

/** After the demo API is installed, turn a verified redirect into a local session. */
export async function completeGoogleRedirectLogin(): Promise<
  { ok: true } | { ok: false; error: string } | null
> {
  const result = consumeGoogleRedirectResult();
  if (!result) return null;
  if (!result.ok) {
    storage()?.setItem(GOOGLE_OAUTH_ERROR_KEY, result.error);
    return result;
  }
  try {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credential: result.credential }),
    });
    const data = (await res.json().catch(() => null)) as {
      accessToken?: string;
      refreshToken?: string;
      picture?: string | null;
      error?: { message?: string };
    } | null;
    if (!res.ok || !data?.accessToken || !data?.refreshToken) {
      const message = data?.error?.message || 'google_login_failed';
      storage()?.setItem(GOOGLE_OAUTH_ERROR_KEY, message);
      return { ok: false, error: message };
    }
    window.localStorage.setItem('safqa.access', data.accessToken);
    window.localStorage.setItem('safqa.refresh', data.refreshToken);
    if (data.picture)
      window.localStorage.setItem('safqa.googlePicture', data.picture);
    else if (result.claims.picture)
      window.localStorage.setItem(
        'safqa.googlePicture',
        String(result.claims.picture),
      );
    storage()?.removeItem(GOOGLE_OAUTH_ERROR_KEY);
    return { ok: true };
  } catch {
    storage()?.setItem(GOOGLE_OAUTH_ERROR_KEY, 'network');
    return { ok: false, error: 'network' };
  }
}
