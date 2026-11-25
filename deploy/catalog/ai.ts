// Categorise titles the rules could not place, with Workers AI (free allocation), in batches of 40.
import { CATEGORIES } from '../../apps/edge/src/catalog/core.ts';
import { aiRun } from './cf.ts';

const MODEL = process.env.CAT_MODEL ?? '@cf/meta/llama-3.1-8b-instruct-fast';
export async function aiCategorize(titles: string[], maxCalls = Number(process.env.AI_MAX_CALLS ?? 80)): Promise<(string | null)[]> {
  const slugs = CATEGORIES.map((c) => c.slug);
  const out: (string | null)[] = titles.map(() => null);
  let calls = 0;
  for (let i = 0; i < titles.length && calls < maxCalls; i += 40) {
    const chunk = titles.slice(i, i + 40);
    calls++;
    const prompt = `Classify each product title into exactly one category slug from this list: ${slugs.join(', ')}, or "other" if none fits (e.g. clothes, books, toys, furniture, cosmetics).
Return ONLY a JSON array of ${chunk.length} strings in the same order.
${chunk.map((t, k) => `${k + 1}. ${t.slice(0, 140)}`).join('\n')}`;
    const res = await aiRun(MODEL, { messages: [{ role: 'system', content: 'You are a precise e-commerce taxonomy classifier. Output JSON only.' }, { role: 'user', content: prompt }], max_tokens: 700, temperature: 0 });
    const arr = res?.match(/\[[\s\S]*\]/)?.[0];
    if (!arr) continue;
    try {
      const parsed = JSON.parse(arr) as string[];
      parsed.slice(0, chunk.length).forEach((s, k) => { const v = String(s).trim().toLowerCase(); out[i + k] = slugs.includes(v) ? v : null; });
    } catch { /* skip chunk */ }
  }
  return out;
}
