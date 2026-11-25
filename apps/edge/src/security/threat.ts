// Threat engine (pure, no I/O): attack-signature scoring, honeypot/decoy paths and the
// tarpit. Defense + deception on OUR OWN endpoints only — nothing here contacts an
// attacker's systems. Scores feed the strike counter (limiter-do.ts); 30 points in an
// hour = automatic ban with escalating duration.

export interface Verdict { score: number; reasons: string[]; trap: string | null; scanner: boolean }

/** Decoy paths nobody legitimate requests (the site's robots.txt even lists some as Disallow). */
export const TRAPS: [RegExp, string][] = [
  [/^\/\.(env|git|svn|hg|aws|ssh|docker|npmrc|htpasswd|DS_Store)(\/|$|\.)/i, 'dotfile'],
  [/^\/(wp-(login|admin|config|content|includes)|xmlrpc\.php|wordpress)/i, 'wordpress'],
  [/^\/(phpmyadmin|pma|myadmin|adminer|phpinfo|info\.php|admin\.php|config\.php|setup\.php|shell\.php)/i, 'php-admin'],
  [/^\/(actuator|server-status|server-info|jmx-console|manager\/html|console|solr|_profiler|telescope|horizon)(\/|$)/i, 'admin-console'],
  [/^\/(cgi-bin|vendor\/phpunit|HNAP1|boaform|owa|ecp|autodiscover|remote\/login|sslvpn|dana-na|global-protect)(\/|$)/i, 'device-exploit'],
  [/^\/(?!api\/v2\/media\/)[^?]*\.(sql|bak|old|swp|zip|tar|tgz|7z|rar)$/i, 'backup-file'],
  // Decoys advertised in robots.txt / fake admin API (never real routes).
  [/^\/(admin-backup|old-admin|db-export|internal-panel)(\/|$)/i, 'robots-decoy'],
  [/^\/api\/(admin|internal|debug|v1\/admin|auth\/admin|v2\/admin\/export-users|v2\/admin\/db|graphql-admin)(\/|$)/i, 'fake-admin-api'],
];
export function trapOf(path: string): string | null {
  for (const [re, name] of TRAPS) if (re.test(path)) return name;
  return null;
}

const SIGS: [RegExp, number, string][] = [
  // SQL injection
  [/(\bunion\b[\s\S]{0,40}\bselect\b|\bselect\b[\s\S]{0,60}\bfrom\b[\s\S]{0,40}\b(information_schema|sqlite_master|pg_catalog|mysql\.user)|\b(sleep|benchmark|pg_sleep|waitfor\s+delay)\s*\(|'\s*(or|and)\s+'?\d+'?\s*=\s*'?\d+|;\s*(drop|truncate|alter)\s+table|'\s*or\s+1\s*=\s*1\b|\/\*!\d+)/i, 25, 'sqli'],
  // XSS
  [/(<\s*script\b|<\s*svg[^>]*\bon\w+\s*=|<\s*img[^>]*\bon\w+\s*=|javascript\s*:|\bon(error|load|mouseover|focus)\s*=|<\s*iframe\b|document\.cookie|alert\s*\(\s*document)/i, 25, 'xss'],
  // Path traversal / file inclusion
  [/(\.\.\/|\.\.\\|%2e%2e(%2f|%5c|\/)|\/etc\/(passwd|shadow|hosts)|c:\\windows|win\.ini|boot\.ini|\/proc\/self\/environ|php:\/\/(input|filter)|file:\/\/)/i, 30, 'traversal'],
  // Command injection / template injection / Log4Shell / SSRF to metadata
  [/(\$\{jndi:|\$\{\$\{|\{\{\s*7\s*\*\s*7\s*\}\}|<%=|;\s*(cat|wget|curl|nc|bash|sh)\s+[\/\-]|;\s*(id|uname|whoami)\s*($|[;|&])|\|\s*(id|whoami|uname)\b|`(id|whoami)`|\$\((id|whoami|uname)\)|169\.254\.169\.254|metadata\.google\.internal)/i, 35, 'injection'],
];
/** Known offensive scanners / attack tools (clients that announce themselves). */
const SCANNER_UA = /(sqlmap|nikto|nmap|masscan|zgrab|nuclei|acunetix|netsparker|wpscan|dirbuster|gobuster|ffuf|feroxbuster|wfuzz|hydra|medusa|burp ?collaborator|openvas|nessus|arachni|w3af|jaeles|xsstrike|commix|zmeu|morfeus|havij|httpx-scanner)/i;

function decode(s: string) {
  let out = s;
  for (let i = 0; i < 2; i++) { try { out = decodeURIComponent(out.replace(/\+/g, ' ')); } catch { break; } }
  return out;
}

/** Score the request line + headers (bodies are not scanned: users may legitimately post code in the community). */
export function scoreRequest(req: Request, url: URL): Verdict {
  const v: Verdict = { score: 0, reasons: [], trap: trapOf(url.pathname), scanner: false };
  if (v.trap) { v.score += 100; v.reasons.push(`trap:${v.trap}`); }
  const ua = req.headers.get('user-agent') ?? '';
  if (SCANNER_UA.test(ua)) { v.score += 60; v.scanner = true; v.reasons.push('scanner-ua'); }
  const target = decode(url.pathname + url.search);
  const hdrs = ['user-agent', 'referer', 'x-forwarded-for', 'x-api-version', 'cookie'].map((h) => req.headers.get(h) ?? '').join('\n');
  for (const [re, pts, name] of SIGS) {
    if (re.test(target)) { v.score += pts; v.reasons.push(name); }
    else if (re.test(hdrs)) { v.score += pts; v.reasons.push(`${name}-hdr`); }
  }
  // Protocol oddities typical of tools, not browsers/apps.
  if (/^(TRACE|TRACK|CONNECT|PROPFIND|DEBUG)$/.test(req.method)) { v.score += 30; v.reasons.push(`method:${req.method}`); }
  if (url.pathname.length > 2048 || url.search.length > 4096) { v.score += 15; v.reasons.push('oversized-url'); }
  if (req.headers.get('x-original-url') || req.headers.get('x-rewrite-url')) { v.score += 20; v.reasons.push('override-header'); }
  return v;
}

/** Escalating ban durations (minutes) for the 1st, 2nd, 3rd, 4th+ ban of the same client. */
export const BAN_STEPS = [60, 6 * 60, 24 * 60, 7 * 24 * 60];
export const banMinutes = (level: number) => BAN_STEPS[Math.min(BAN_STEPS.length, Math.max(1, level)) - 1]!;
export const BAN_AT = 30;

// ---------- tarpit: waste a malicious client's time, not ours (no CPU while waiting) ----------
let active = 0;
export const MAX_TARPITS = 25;
const FAKE: Record<string, { type: string; body: string }> = {
  wordpress: { type: 'text/html; charset=utf-8', body: '<!doctype html><html><head><title>Log In &lsaquo; Site &mdash; WordPress</title></head><body class="login"><form name="loginform" method="post"><input name="log"><input name="pwd" type="password"><input type="submit" value="Log In"></form>' },
  dotfile: { type: 'text/plain; charset=utf-8', body: '# nothing to see here\nAPP_ENV=production\n' },
  'fake-admin-api': { type: 'application/json', body: '{"status":"pending","items":[' },
};
/** Slow-drip response (one small chunk every ~2 s, ~40 s total). Falls back to a plain 403 when busy. */
export function tarpit(kind: string | null, extra: Record<string, string> = {}): Response {
  if (active >= MAX_TARPITS) return new Response('Forbidden', { status: 403, headers: { 'content-type': 'text/plain', ...extra } });
  const fake = FAKE[kind ?? ''] ?? { type: 'text/html; charset=utf-8', body: '<!doctype html><html><head><title>Admin</title></head><body>' };
  active++;
  let i = 0;
  let done = false;
  const finish = () => { if (!done) { done = true; active--; } };
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(c) { c.enqueue(enc.encode(fake.body)); },
    async pull(c) {
      await new Promise((r) => setTimeout(r, 2000));
      if (++i >= 20) { finish(); c.close(); return; }
      c.enqueue(enc.encode(fake.type.includes('json') ? ' ' : '\n<!-- -->'));
    },
    cancel() { finish(); },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': fake.type, 'cache-control': 'no-store', 'x-robots-tag': 'noindex', ...extra } });
}
export const _tarpitActive = () => active;

/** robots.txt served by the API: decoys only (legit crawlers obey and never come). */
export const API_ROBOTS = 'User-agent: *\nDisallow: /api/\nDisallow: /api/internal/\nDisallow: /api/v1/admin/\nDisallow: /admin-backup/\n';
