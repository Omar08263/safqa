// Canonical, clean URLs: https://safqaeg.pages.dev/login, never /index.html or #/login.
// Runs before anything reads the location. Old links (#/product/x from the HF Space,
// shared links, notifications, the APK) are rewritten in place to /product/x.
// OAuth fragments (#id_token=...) are left alone for the Google handler.
const { pathname, search, hash } = window.location;
let path = pathname.replace(/\/index\.html$/, '/');
let q = search;
let h = hash;
if (hash.startsWith('#/')) {
  const [p, qs] = hash.slice(1).split('?');
  path = p || '/';
  q = qs ? `?${qs}` : search;
  h = '';
}
const next = `${path}${q}${h}`;
if (next !== `${pathname}${search}${hash}`) window.history.replaceState(window.history.state, '', next);

// An old #/ link clicked while the app is already open (same document, no reload).
window.addEventListener('hashchange', () => {
  if (!window.location.hash.startsWith('#/')) return;
  const to = window.location.hash.slice(1);
  void import('./nav').then(({ go }) => go(to, true));
});
export {};
