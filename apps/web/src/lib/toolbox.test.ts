import { describe, expect, it } from 'vitest';
import { allTools, type Ctx } from './toolbox';

const ctx: Ctx = {
  fx: { USD: 1, EGP: 50, EUR: 0.9, SAR: 3.75, AED: 3.67, KWD: 0.31, GBP: 0.78, QAR: 3.64, CNY: 7.2, TRY: 34, JOD: 0.71, OMR: 0.385, BHD: 0.376, CHF: 0.88, CAD: 1.37, AUD: 1.5, JPY: 150, INR: 84, LYD: 4.8 },
  fxDate: '2026-11-18',
  products: [],
  specOf: () => ({}),
};

describe('toolbox', () => {
  it('has hundreds of unique tools', () => {
    expect(allTools.length).toBeGreaterThanOrEqual(300);
    expect(new Set(allTools.map((t) => t.id)).size).toBe(allTools.length);
  });
  it('every tool runs with its defaults and shows no NaN', () => {
    for (const t of allTools) {
      const v = Object.fromEntries(t.fields.map((f) => [f.id, f.def]));
      const r = t.run(v, ctx);
      expect(r.rows.length, t.id).toBeGreaterThan(0);
      for (const row of r.rows) expect(row.value, `${t.id}: ${row.en}`).not.toMatch(/NaN|undefined|Infinity/);
    }
  });
  it('converts USD to EGP with cached rates', () => {
    const t = allTools.find((x) => x.id === 'fx-usd-egp');
    expect(t?.run({ amt: 2, manual: 0 }, ctx).rows[0]?.value).toBe('100 ج');
  });
  it('computes a 12-month reducing loan', () => {
    const t = allTools.find((x) => x.id === 'inst-reducing-12');
    expect(t?.run({ price: 12000, apr: 0, fee: 0 }, ctx).rows[0]?.value).toBe('1,000 ج');
  });
});
