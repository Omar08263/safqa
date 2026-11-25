// SSRF guard for fetches whose URL comes from a user (paste-a-link). Workers already can't
// reach private networks, but a user URL must also not point at IP literals, internal names,
// our own services (request loops / auth confusion) or odd ports — and every redirect hop is
// re-checked instead of blindly followed.
const OWN = /(^|\.)(safqa-api\.safqaeg\.workers\.dev|safqaeg\.pages\.dev|safqa-admin\.pages\.dev|workers\.dev|cloudflareworkers\.com)$/i;
export function outboundOk(raw: string | URL): boolean {
  let u: URL;
  try { u = new URL(String(raw)); } catch { return false; }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return false;
  if (u.port && !['80', '443'].includes(u.port)) return false;
  const h = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!h.includes('.') || h.startsWith('[') || /^[\d.]+$/.test(h) || /^0x/i.test(h)) return false; // IP literals / bare names
  if (/(^|\.)(localhost|local|internal|lan|intranet|home|corp|arpa)$/.test(h)) return false;
  if (OWN.test(h)) return false;
  return true;
}
export async function safeFetch(url: string, init: RequestInit = {}, hops = 4): Promise<Response | null> {
  let cur = url;
  for (let i = 0; i <= hops; i++) {
    if (!outboundOk(cur)) return null;
    const r = await fetch(cur, { ...init, redirect: 'manual' }).catch(() => null);
    if (!r) return null;
    const loc = r.status >= 300 && r.status < 400 ? r.headers.get('location') : null;
    if (!loc) return r;
    cur = new URL(loc, cur).toString();
  }
  return null;
}
