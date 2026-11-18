// Google only knows this site as an OAuth redirect URI. The separate admin app
// (Cloudflare Pages) starts Google sign-in with state "admin.<random>"; Google
// returns here, and this forwards the fragment to the fixed admin origin before
// the site's own Google handler or router can read it. The admin app checks
// state + nonce, and the backend verifies the token signature and allowlist.
const ADMIN_ORIGIN = 'https://safqa-admin.pages.dev';
const h = new URLSearchParams(window.location.hash.slice(1));
if ((h.get('id_token') || h.get('error')) && (h.get('state') ?? '').startsWith('admin.')) {
  window.location.replace(`${ADMIN_ORIGIN}/${window.location.hash}`);
  throw new Error('redirecting to admin');
}
export {};
