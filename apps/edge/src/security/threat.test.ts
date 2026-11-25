import { describe, expect, it } from 'vitest';
import { signJwt } from '../util';
import { anomaly, classify, classOf, patchDrafts, triage } from './agents';
import { bannedUntil, tierOf } from './audit';
import { hasValidSession, note404, noteLoginFail, strike } from './defense';
import { guard } from './guard';
import { banMinutes, scoreRequest, tarpit, trapOf } from './threat';

const kv = () => { const m = new Map<string, string>(); return { m, get: async (k: string, t?: string) => (m.has(k) ? (t === 'json' ? JSON.parse(m.get(k)!) : m.get(k)) : null), put: async (k: string, v: string) => void m.set(k, v), delete: async (k: string) => void m.delete(k) }; };
const R = (path: string, h: Record<string, string> = {}, method = 'GET') => new Request(`https://api${path}`, { method, headers: { 'cf-connecting-ip': '7.7.7.7', ...h } });
const sc = (path: string, h: Record<string, string> = {}) => scoreRequest(R(path, h), new URL(`https://api${path}`));

describe('threat scoring', () => {
  it('recognises honeypot / decoy paths', () => {
    for (const p of ['/.env', '/.git/config', '/wp-login.php', '/wp-admin/', '/phpmyadmin/index.php', '/xmlrpc.php', '/api/admin/users', '/api/v1/admin/login', '/api/internal/config', '/api/debug', '/admin-backup/', '/actuator/env', '/backup.sql', '/vendor/phpunit/x'])
      expect(trapOf(p), p).not.toBeNull();
  });
  it('never traps real routes', () => {
    for (const p of ['/', '/api/health', '/api/products', '/api/v2/admin/security', '/api/v2/admin/2fa', '/api/auth/login', '/.well-known/security.txt', '/robots.txt', '/api/v2/media/abc.zip', '/api/v5/hunter/run', '/api/v2/hub/pair/claim'])
      expect(trapOf(p), p).toBeNull();
  });
  it('flags attack payloads in the URL and headers', () => {
    expect(sc("/api/products?q=1' OR '1'='1").reasons).toContain('sqli');
    expect(sc('/api/products?q=1 UNION SELECT password FROM users').reasons).toContain('sqli');
    expect(sc('/api/search?q=<script>alert(1)</script>').reasons).toContain('xss');
    expect(sc('/api/v2/media/..%2f..%2fetc%2fpasswd').reasons).toContain('traversal');
    expect(sc('/api/products', { 'user-agent': '${jndi:ldap://x/a}' }).reasons).toContain('injection-hdr');
    expect(sc('/api/products', { 'user-agent': 'sqlmap/1.7' }).scanner).toBe(true);
  });
  it('leaves normal traffic (incl. Arabic searches and punctuation) alone', () => {
    for (const p of ['/api/products?q=شاي ليبتون 100 كيس', '/api/products?q=dog; cat food', '/api/products?q=select box', '/api/products?q=AT&T -- deal', '/api/products?q=or 1=1 tv', '/api/v2/community/posts?cursor=abc'])
      expect(sc(p).score, p).toBe(0);
    expect(sc('/api/products', { 'user-agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/130' }).score).toBe(0);
    expect(sc('/api/products', { 'user-agent': 'okhttp/4.12.0' }).score).toBe(0);
  });
  it('escalates ban length 1h → 6h → 24h → 7d', () => {
    expect([1, 2, 3, 4, 9].map(banMinutes)).toEqual([60, 360, 1440, 10080, 10080]);
  });
});

describe('strike ledger + guard', () => {
  it('trap hit → instant ban, tarpit, and the next clean request is refused', async () => {
    const env: any = { ALLOWED_ORIGINS: 'https://safqaeg.pages.dev', KV: kv() };
    const ip = { 'cf-connecting-ip': '203.0.113.9' };
    const r = await guard(env, R('/wp-login.php', ip), new URL('https://api/wp-login.php'), {});
    expect(r?.status).toBe(200); // decoy page, slow-dripped
    expect(r?.headers.get('content-type')).toContain('text/html');
    await r?.body?.cancel();
    expect(await bannedUntil(env, '203.0.113.9')).toBeGreaterThan(Date.now() + 50 * 60_000);
    expect(JSON.parse(env.KV.m.get('sec:bans'))['203.0.113.9']).toBeGreaterThan(Date.now());
    const next = await guard(env, R('/api/products', ip), new URL('https://api/api/products'), {});
    expect(next?.status).toBe(403);
  });
  it('a real signed-in user behind the same (CGNAT) IP still gets through', async () => {
    const env: any = { ALLOWED_ORIGINS: 'https://safqaeg.pages.dev', KV: kv(), JWT_SECRET: 'x'.repeat(40) };
    await strike(env, '198.51.100.4', 100, 'trap:test');
    const tok = await signJwt({ sub: 'u1', typ: 'access' }, env.JWT_SECRET, 600);
    const ok = await guard(env, R('/api/products', { 'cf-connecting-ip': '198.51.100.4', authorization: `Bearer ${tok}` }), new URL('https://api/api/products'), {});
    expect(ok).toBeNull();
    expect(await hasValidSession(env, R('/', { authorization: 'Bearer forged.jwt.value' }))).toBe(false);
    const attack = await guard(env, R("/api/products?q=' OR '1'='1", { 'cf-connecting-ip': '198.51.100.4', authorization: `Bearer ${tok}` }), new URL("https://api/api/products?q=' OR '1'='1"), {});
    expect(attack?.status).toBe(200); // attack from a banned client → tarpit, token or not
    await attack?.body?.cancel();
  });
  it('blocks a SQLi request outright and bans after repeated attempts', async () => {
    const env: any = { ALLOWED_ORIGINS: 'https://safqaeg.pages.dev', KV: kv() };
    const h = { 'cf-connecting-ip': '192.0.2.77' };
    const u = "/api/products?q=1 UNION SELECT 1 FROM sqlite_master";
    expect((await guard(env, R(u, h), new URL(`https://api${u}`), {}))?.status).toBe(403);
    await (await guard(env, R(u, h), new URL(`https://api${u}`), {}))?.body?.cancel();
    expect(await bannedUntil(env, '192.0.2.77')).toBeGreaterThan(Date.now());
  });
  it('IPv6 attackers are banned per /64 (rotating addresses do not escape)', async () => {
    const env: any = { ALLOWED_ORIGINS: 'https://safqaeg.pages.dev', KV: kv() };
    const r = await guard(env, R('/.env', { 'cf-connecting-ip': '2001:db8:aa:bb::1' }), new URL('https://api/.env'), {});
    await r?.body?.cancel();
    const r2 = await guard(env, R('/api/products', { 'cf-connecting-ip': '2001:db8:aa:bb:ffff::9' }), new URL('https://api/api/products'), {});
    expect(r2?.status).toBe(403);
  });
  it('rapid 404s and credential stuffing earn points; typos do not', () => {
    let pts = 0;
    for (let i = 0; i < 24; i++) pts += note404('100.64.0.1');
    expect(pts).toBe(30);
    let p = 0;
    for (let i = 0; i < 5; i++) p += noteLoginFail('100.64.0.2', 'same@x.co');
    expect(p).toBe(0);
    for (let i = 0; i < 10; i++) p = noteLoginFail('100.64.0.3', `u${i}@x.co`);
    expect(p).toBe(20);
  });
  it('tarpit falls back to 403 when saturated', async () => {
    const open: Response[] = [];
    for (let i = 0; i < 25; i++) open.push(tarpit('dotfile'));
    expect(tarpit('dotfile').status).toBe(403);
    await Promise.all(open.map((r) => r.body?.cancel()));
    expect(tarpit('dotfile').status).toBe(200);
  });
  it('alert tiers', () => {
    expect(tierOf('trap_hit')).toBe('crit');
    expect(tierOf('attack_sig')).toBe('high');
    expect(tierOf('path_scan')).toBe('med');
    expect(tierOf('csp_report')).toBe('low');
  });
});

describe('security agents (pure parts)', () => {
  const now = Date.now();
  const feed = [
    { at: now, client: 'a', points: 25, reason: 'sqli', path: '/api/products', ua: null },
    { at: now, client: 'b', points: 25, reason: 'sqli', path: '/api/products', ua: null },
    { at: now, client: 'c', points: 25, reason: 'sqli-hdr', path: '/api/products', ua: null },
    { at: now, client: 'd', points: 100, reason: 'trap:wordpress', path: '/wp-login.php', ua: null },
  ];
  it('threat-analyst classifies and spots campaigns', () => {
    expect(classOf('trap:dotfile')).toBe('trap');
    expect(classOf('xss-hdr')).toBe('xss');
    const c = classify(feed);
    expect(c.classes[0]).toMatchObject({ id: 'sqli', n: 3, clients: 3 });
    expect(c.campaigns.length).toBe(1);
  });
  it('anomaly-detector flags spikes only', () => {
    expect(anomaly([2, 3, 1, 2, 4, 2], 3).level).toBe('ok');
    expect(anomaly([2, 3, 1, 2, 4, 2], 60).level).toBe('crit');
    expect(anomaly([], 15).level).toBe('warn');
  });
  it('honeypot-triage separates targeted attacks from random bots', () => {
    const t = triage([
      { client: 'x', score: 0, hits: 3, last: now, reasons: ['trap:wordpress'], bans: 1, until: now + 1, ua: '', paths: [] },
      { client: 'y', score: 0, hits: 9, last: now, reasons: ['trap:fake-admin-api', 'sqli'], bans: 2, until: now + 1, ua: '', paths: [] },
      { client: 'z', score: 0, hits: 9, last: now, reasons: ['rapid-404'], bans: 0, until: 0, ua: '', paths: [] },
    ]);
    expect(t.map((x) => x.verdict)).toEqual(['targeted', 'bot-scan']);
  });
  it('patch-advisor drafts one issue per new (class, real route), never for traps', () => {
    const d = patchDrafts(feed, []);
    expect(d.length).toBe(1);
    expect(d[0]!.title).toContain('/api/products');
    expect(d[0]!.body).toContain('prepare().bind()');
    expect(patchDrafts(feed, [d[0]!.key]).length).toBe(0);
  });
});

import { outboundOk } from './outbound';
describe('SSRF guard (paste-a-link)', () => {
  it('allows store URLs, refuses internal / IP / own-service targets', () => {
    expect(outboundOk('https://www.amazon.eg/dp/B0ABCDEF12')).toBe(true);
    expect(outboundOk('http://btech.com/ar/x')).toBe(true);
    for (const u of ['http://127.0.0.1/', 'http://169.254.169.254/latest/meta-data', 'http://[::1]/', 'http://localhost:8787/', 'https://safqa-api.safqaeg.workers.dev/api/v2/admin/security', 'https://x.workers.dev/', 'https://user:pw@shop.com/', 'https://shop.com:8443/', 'file:///etc/passwd', 'http://0x7f000001/', 'http://metadata.google.internal/', 'gopher://x.com/'])
      expect(outboundOk(u), u).toBe(false);
  });
});
