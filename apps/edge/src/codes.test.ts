import { describe, expect, it } from 'vitest';
import { type CodeRow, evaluateCode, normalizeCode } from './codes';

const base: CodeRow = { code: 'SAFQA20', kind: 'percent', value: 20, tiers: [], expires_at: null, max_uses: null, per_user: 1, uses: 0, upgrade_tier: null, upgrade_days: null, active: true };
const opts = { tier: 'pro' as const, listAmount: 99, userUses: 0, now: new Date('2026-11-18T12:00:00Z') };

describe('evaluateCode', () => {
  it('applies a percentage', () => {
    const r = evaluateCode(base, opts);
    expect(r).toMatchObject({ ok: true, kind: 'discount', discount: 20, amount: 79 });
  });
  it('applies a fixed amount and never goes below zero', () => {
    expect(evaluateCode({ ...base, kind: 'fixed', value: 30 }, opts)).toMatchObject({ amount: 69 });
    expect(evaluateCode({ ...base, kind: 'fixed', value: 500 }, opts)).toMatchObject({ amount: 0, discount: 99 });
  });
  it('rejects unknown, inactive, expired and exhausted codes', () => {
    expect(evaluateCode(null, opts)).toMatchObject({ ok: false, reason: 'not_found' });
    expect(evaluateCode({ ...base, active: false }, opts)).toMatchObject({ ok: false, reason: 'inactive' });
    expect(evaluateCode({ ...base, expires_at: '2026-11-01T00:00:00Z' }, opts)).toMatchObject({ ok: false, reason: 'expired' });
    expect(evaluateCode({ ...base, max_uses: 5, uses: 5 }, opts)).toMatchObject({ ok: false, reason: 'exhausted' });
  });
  it('enforces per-user limits', () => {
    expect(evaluateCode(base, { ...opts, userUses: 1 })).toMatchObject({ ok: false, reason: 'used' });
    expect(evaluateCode({ ...base, per_user: 3 }, { ...opts, userUses: 2 })).toMatchObject({ ok: true });
  });
  it('enforces per-tier rules', () => {
    expect(evaluateCode({ ...base, tiers: ['vip'] }, opts)).toMatchObject({ ok: false, reason: 'tier' });
    expect(evaluateCode({ ...base, tiers: ['pro', 'vip'] }, opts)).toMatchObject({ ok: true });
    expect(evaluateCode(base, { ...opts, tier: 'free', listAmount: 0 })).toMatchObject({ ok: false, reason: 'tier' });
  });
  it('handles free-tier-upgrade codes', () => {
    const up = { ...base, kind: 'upgrade' as const, upgrade_tier: 'plus' as const, upgrade_days: 7 };
    expect(evaluateCode(up, { ...opts, tier: 'free', listAmount: 0 })).toMatchObject({ ok: true, kind: 'upgrade', tier: 'plus', days: 7 });
    expect(evaluateCode({ ...up, upgrade_days: 0 }, opts)).toMatchObject({ ok: false, reason: 'invalid' });
  });
  it('normalizes user input', () => {
    expect(normalizeCode('  safqa 20! ')).toBe('SAFQA20');
  });
});
