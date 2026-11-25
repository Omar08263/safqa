// Real, account-wide D1 usage for today (UTC day) from Cloudflare's GraphQL Analytics API.
// The free plan's 100k rows-written/day limit is per ACCOUNT, so this is the number that matters.
export async function accountWrites(day = new Date().toISOString().slice(0, 10)): Promise<{ rowsWritten: number; rowsRead: number } | null> {
  const acc = process.env.CLOUDFLARE_ACCOUNT_ID; const tok = process.env.CLOUDFLARE_API_TOKEN;
  if (!acc || !tok) return null;
  const q = `query($a:String!,$d:Date!){viewer{accounts(filter:{accountTag:$a}){d1AnalyticsAdaptiveGroups(limit:50,filter:{date_geq:$d,date_leq:$d}){sum{rowsWritten rowsRead}}}}}`;
  const r = await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' }, body: JSON.stringify({ query: q, variables: { a: acc, d: day } }) }).catch(() => null);
  if (!r?.ok) return null;
  const j = await r.json() as { data?: { viewer: { accounts: { d1AnalyticsAdaptiveGroups: { sum: { rowsWritten: number; rowsRead: number } }[] }[] } } };
  const g = j.data?.viewer.accounts[0]?.d1AnalyticsAdaptiveGroups ?? [];
  return { rowsWritten: g.reduce((s, x) => s + x.sum.rowsWritten, 0), rowsRead: g.reduce((s, x) => s + x.sum.rowsRead, 0) };
}
/** Bulk pushes from the box must leave room for the live app: stop at this many account rows/day. */
export const BOX_PUSH_CEILING = 55_000;
