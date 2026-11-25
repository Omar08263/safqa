import { describe, expect, it } from 'vitest';
import { diagnose, planFixes, type Done, type Signals } from './core';
import { rulePlan } from './index';

const base: Signals = { now: Date.parse('2026-11-25T12:00:00Z'), d1Ok: true, kvOk: true, site: { ok: true, status: 200, ms: 300 } };

describe('العقل الرئيسي — diagnose', () => {
  it('healthy platform → no findings', () => { expect(diagnose(base)).toEqual([]); });
  it('broken extractor → relearn + pause + issue', () => {
    const f = diagnose({ ...base, wildDrops: [{ store: 'btech', n: 10, wild: 7 }], storeHosts: { btech: 'btech.com' }, healIndex: { 'btech.com': 'price @ 2026-11-20' } });
    expect(f[0]!.id).toBe('extractor:btech');
    expect(f[0]!.fixes.map((x) => x.t)).toEqual(['extractor_relearn', 'source_pause', 'issue']);
  });
  it('a few big drops are normal sales', () => { expect(diagnose({ ...base, wildDrops: [{ store: 'x', n: 40, wild: 6 }] })).toEqual([]); });
  it('stale feed, unless the brain paused it', () => {
    const stores = [{ store: 'kimo', products: 500, newestCheck: '2026-11-25T01:00:00Z', checked24h: 0, feed: true, pausedUntil: null }];
    expect(diagnose({ ...base, stores })[0]!.id).toBe('feed_stale:kimo');
    expect(diagnose({ ...base, stores, paused: { kimo: base.now + 1000 } })).toEqual([]);
  });
  it('site down is critical', () => { expect(diagnose({ ...base, site: { ok: false, status: 503, ms: 100 } })[0]!.sev).toBe('crit'); });
  it('security: short JWT', () => { expect(diagnose({ ...base, secrets: { jwtLen: 10, corsWildcard: false, adminEmails: 1 } })[0]!.id).toBe('jwt_weak'); });
});

describe('العقل الرئيسي — planFixes guardrails', () => {
  const f = diagnose({ ...base, wildDrops: [{ store: 'btech', n: 10, wild: 7 }], storeHosts: { btech: 'btech.com' }, healIndex: { 'btech.com': 'x' } });
  it('autopilot on → safe fixes act, issue becomes a draft', () => {
    const p = planFixes(f, [], base.now, true);
    expect(p.act.map((a) => a.fix.t)).toEqual(['extractor_relearn', 'source_pause']);
    expect(p.drafts).toHaveLength(1); expect(p.propose).toHaveLength(0);
  });
  it('autopilot off → everything is a proposal', () => {
    const p = planFixes(f, [], base.now, false);
    expect(p.act).toHaveLength(0); expect(p.propose).toHaveLength(2);
  });
  it('cooldown: same target is not touched twice within 6 h', () => {
    const done: Done[] = [{ id: '1', at: new Date(base.now - 3600_000).toISOString(), key: 'source_pause:btech', fix: { t: 'source_pause', target: 'btech', hours: 6 }, finding: 'x', by: 'auto', status: 'applied' }];
    expect(planFixes(f, done, base.now, true).act.map((a) => a.fix.t)).toEqual(['extractor_relearn']);
  });
  it('daily cap', () => {
    const done: Done[] = Array.from({ length: 6 }, (_, i) => ({ id: String(i), at: new Date(base.now - 8 * 3600_000).toISOString(), key: `source_pause:s${i}`, fix: { t: 'source_pause' as const, target: `s${i}`, hours: 6 }, finding: 'x', by: 'auto' as const, status: 'applied' as const }));
    const p = planFixes(f, done, base.now, true);
    expect(p.act.map((a) => a.fix.t)).toEqual(['extractor_relearn']); expect(p.propose.map((a) => a.fix.t)).toEqual(['source_pause']);
  });
  it('forbidden targets never act or get proposed', () => {
    const p = planFixes([{ id: 'x', spec: 'amn', sev: 'crit', title: 't', fixes: [{ t: 'flag_off', target: 'payments' }] }], [], base.now, true);
    expect(p.act).toHaveLength(0); expect(p.propose).toHaveLength(0);
  });
  it('rule plan narrative', () => { expect(rulePlan([], 0, 0).summary).toContain('كله تمام'); });
});
