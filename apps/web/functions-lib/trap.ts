// 🪤 Site honeypots (Pages Functions). These paths are listed as Disallow in robots.txt or are
// classic exploit targets; no visitor or polite crawler ever opens them. A hit reports the
// client to the API's strike ledger (instant ban across the API) and gets a slow-drip decoy page.
// Defense/deception on our own site only: nothing is sent to the visitor's systems.
interface Env { TRAP_SECRET?: string }
const API = 'https://safqa-api.safqaeg.workers.dev';
const DECOY = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Admin Login</title></head><body><form method="post"><input name="user" autocomplete="off"><input name="pass" type="password"><button>Sign in</button></form>';

export function trap(kind: string) {
  return async (ctx: { request: Request; env: Env; waitUntil: (p: Promise<unknown>) => void }) => {
    const req = ctx.request;
    const ip = req.headers.get('cf-connecting-ip') ?? '';
    const path = new URL(req.url).pathname.slice(0, 160);
    if (ctx.env.TRAP_SECRET && ip) {
      ctx.waitUntil(fetch(`${API}/api/v2/sec/beacon`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-safqa-trap': ctx.env.TRAP_SECRET },
        body: JSON.stringify({ ip, path, kind, ua: (req.headers.get('user-agent') ?? '').slice(0, 160) }),
      }).catch(() => undefined));
    }
    const enc = new TextEncoder();
    let i = 0;
    const stream = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(enc.encode(DECOY)); },
      async pull(c) {
        await new Promise((r) => setTimeout(r, 2000));
        if (++i >= 12) { c.close(); return; }
        c.enqueue(enc.encode('\n<!-- -->'));
      },
    });
    return new Response(stream, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' } });
  };
}
