// Cloudflare REST helpers (D1 query + Workers AI) using the account token from the environment.
// The token is never printed; errors show only the API message.
const acc = () => process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
const tok = () => process.env.CLOUDFLARE_API_TOKEN ?? '';
export const D1_ID = process.env.D1_ID ?? '63fe0a16-276c-493c-9889-d7c971422783';

// biome-ignore lint/suspicious/noExplicitAny: D1 rows.
export async function d1(sql: string, params?: unknown[]): Promise<any[]> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acc()}/d1/database/${D1_ID}/query`, {
      method: 'POST', headers: { authorization: `Bearer ${tok()}`, 'content-type': 'application/json' }, body: JSON.stringify(params ? { sql, params } : { sql }),
    });
    // biome-ignore lint/suspicious/noExplicitAny: API JSON.
    const j: any = await r.json().catch(() => ({}));
    if (r.ok && j.success) return j.result as unknown[] as never;
    const msg = JSON.stringify(j.errors ?? j).slice(0, 400);
    if (r.status >= 500 || r.status === 429 || /overloaded|timeout|reset/i.test(msg)) { await new Promise((s) => setTimeout(s, 3000 * (attempt + 1))); continue; }
    throw new Error(`D1 ${r.status}: ${msg}`);
  }
  throw new Error('D1: retries exhausted');
}

export async function aiRun(model: string, body: unknown): Promise<string | null> {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acc()}/ai/run/${model}`, {
    method: 'POST', headers: { authorization: `Bearer ${tok()}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  // biome-ignore lint/suspicious/noExplicitAny: API JSON.
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.success) { console.log('AI error', r.status, JSON.stringify(j.errors ?? '').slice(0, 200)); return null; }
  const res = j.result?.response;
  return typeof res === 'string' ? res : JSON.stringify(res);
}

export const sqlStr = (v: unknown): string => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  return `'${String(v).replace(/'/g, "''").replace(/\u0000/g, '')}'`;
};
