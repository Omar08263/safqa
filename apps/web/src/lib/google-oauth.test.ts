import { describe, expect, it } from 'vitest';
import {
  buildGoogleAuthorizeUrl,
  decodeJwtPayload,
  GOOGLE_AUTHORIZE_URL,
  GOOGLE_REDIRECT_URI,
  parseOAuthHash,
  redirectUriForOrigin,
  verifyGoogleIdToken,
} from './google-oauth';

function encodeJwt(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json).toString('base64url');
  return `header.${b64}.sig`;
}

const clientId =
  '700154178904-k0hi0kp5v19m775u8t1bt6m6mnfhrghc.apps.googleusercontent.com';

describe('buildGoogleAuthorizeUrl', () => {
  it('builds the OpenID implicit authorize URL with the exact registered redirect URI', () => {
    const url = new URL(
      buildGoogleAuthorizeUrl({
        clientId,
        redirectUri: GOOGLE_REDIRECT_URI,
        state: 'state-token',
        nonce: 'nonce-token',
      }),
    );
    expect(url.origin + url.pathname).toBe(GOOGLE_AUTHORIZE_URL);
    expect(url.searchParams.get('client_id')).toBe(clientId);
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://safqaeg.pages.dev/auth/callback',
    );
    expect(url.searchParams.get('redirect_uri')?.endsWith('/')).toBe(false);
    expect(url.searchParams.get('response_type')).toBe('id_token');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('nonce')).toBe('nonce-token');
    expect(url.searchParams.get('state')).toBe('state-token');
    expect(url.searchParams.get('prompt')).toBe('select_account');
  });
});

describe('redirectUriForOrigin', () => {
  it('uses the clean /auth/callback path on the site origin', () => {
    expect(redirectUriForOrigin('https://safqaeg.pages.dev')).toBe('https://safqaeg.pages.dev/auth/callback');
    expect(redirectUriForOrigin('https://safqaeg.pages.dev/')).toBe('https://safqaeg.pages.dev/auth/callback');
  });
  it('keeps the legacy HF origin exact (no path)', () => {
    expect(redirectUriForOrigin('https://safqa-eg-safqa.static.hf.space')).toBe(
      'https://safqa-eg-safqa.static.hf.space',
    );
    expect(
      redirectUriForOrigin('https://safqa-eg-safqa.static.hf.space/'),
    ).toBe('https://safqa-eg-safqa.static.hf.space');
  });
});

describe('parseOAuthHash', () => {
  it('reads id_token and state from a Google implicit callback hash', () => {
    const parsed = parseOAuthHash(
      '#id_token=abc.def.ghi&state=xyz&authuser=0&prompt=select_account',
    );
    expect(parsed).toEqual({
      id_token: 'abc.def.ghi',
      state: 'xyz',
      error: undefined,
      error_description: undefined,
    });
  });

  it('ignores hash-router paths so #/login is not treated as a callback', () => {
    expect(parseOAuthHash('#/login')).toBeNull();
    expect(parseOAuthHash('#/dashboard')).toBeNull();
    expect(parseOAuthHash('#/login?accessToken=tok')).toBeNull();
    expect(parseOAuthHash('')).toBeNull();
    expect(parseOAuthHash('#')).toBeNull();
  });

  it('reads error responses from Google', () => {
    const parsed = parseOAuthHash(
      '#error=access_denied&error_description=The%20user%20denied&state=xyz',
    );
    expect(parsed?.error).toBe('access_denied');
    expect(parsed?.error_description).toBe('The user denied');
    expect(parsed?.state).toBe('xyz');
  });
});

describe('verifyGoogleIdToken', () => {
  const now = 1_700_000_000_000;
  const base = {
    iss: 'https://accounts.google.com',
    aud: clientId,
    exp: Math.floor(now / 1000) + 3600,
    nonce: 'nonce-token',
    email: 'omar@example.com',
    email_verified: true,
    name: 'Omar',
    picture: 'https://example.com/p.png',
  };

  it('accepts a token with matching aud, nonce, exp and issuer', () => {
    const token = encodeJwt(base);
    const result = verifyGoogleIdToken(token, {
      clientId,
      nonce: 'nonce-token',
      now,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims.email).toBe('omar@example.com');
      expect(result.claims.name).toBe('Omar');
    }
  });

  it('rejects a wrong audience', () => {
    const token = encodeJwt({
      ...base,
      aud: 'someone-else.apps.googleusercontent.com',
    });
    expect(
      verifyGoogleIdToken(token, { clientId, nonce: 'nonce-token', now }).ok,
    ).toBe(false);
  });

  it('rejects an expired token', () => {
    const token = encodeJwt({ ...base, exp: Math.floor(now / 1000) - 10 });
    expect(
      verifyGoogleIdToken(token, { clientId, nonce: 'nonce-token', now }).ok,
    ).toBe(false);
  });

  it('rejects a nonce mismatch', () => {
    const token = encodeJwt(base);
    expect(
      verifyGoogleIdToken(token, { clientId, nonce: 'other-nonce', now }).ok,
    ).toBe(false);
  });

  it('rejects an unverified email', () => {
    const token = encodeJwt({ ...base, email_verified: false });
    expect(
      verifyGoogleIdToken(token, { clientId, nonce: 'nonce-token', now }).ok,
    ).toBe(false);
  });

  it('rejects a bad issuer', () => {
    const token = encodeJwt({ ...base, iss: 'https://evil.example' });
    expect(
      verifyGoogleIdToken(token, { clientId, nonce: 'nonce-token', now }).ok,
    ).toBe(false);
  });
});

describe('decodeJwtPayload', () => {
  it('returns null for garbage', () => {
    expect(decodeJwtPayload('not-a-jwt')).toBeNull();
    expect(decodeJwtPayload('')).toBeNull();
  });
});
