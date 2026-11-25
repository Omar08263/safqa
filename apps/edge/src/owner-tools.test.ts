import { describe, expect, it } from 'vitest';
import { pageSignals, parseCommand, validAction, verifyDeal } from './owner-tools';

const env = { DB: { prepare: () => ({ bind: () => ({ all: async () => ({ results: [{ code: 'GOLD15' }] }) }) }) } } as never;
const now = new Date().toISOString();

describe('owner command agent', () => {
  it('maps Egyptian Arabic to safe actions', async () => {
    const r = await parseCommand(env, 'حط بانر رمضان');
    expect(r.actions[0]).toMatchObject({ t: 'banner', on: true, level: 'deal' });
    expect((await parseCommand(env, 'وقّف عدسة الأسعار')).actions[0]).toMatchObject({ t: 'flag', key: 'price_lens', enabled: false });
    expect((await parseCommand(env, 'وقف برومو الباقة الذهبي')).actions[0]).toMatchObject({ t: 'code', code: 'GOLD15', active: false });
    expect((await parseCommand(env, 'شيل البانر')).actions[0]).toMatchObject({ t: 'banner', on: false });
    expect((await parseCommand(env, 'شغل الأصوات 50%')).actions[0]).toMatchObject({ t: 'flag', key: 'ui_sounds', enabled: true, rollout: 50 });
  });
  it('refuses money, bans and deletions', async () => {
    for (const t of ['رجّع فلوس العضو أحمد', 'احظر المستخدم ده', 'امسح كل المنشورات', 'اعتمد الدفع ده']) expect((await parseCommand(env, t)).blocked).toBeTruthy();
  });
  it('validates AI plans strictly', () => {
    expect(validAction({ t: 'flag', key: 'DROP TABLE', enabled: true })).toBeNull();
    expect(validAction({ t: 'delete_user', id: 'x' })).toBeNull();
    expect(validAction({ t: 'flag', key: 'ui_sounds', rollout: 400 })).toMatchObject({ rollout: 100 });
  });
});

describe('deal hunter verification', () => {
  const base = { price: 800, list_price: 1500, med30: 1000, low: 790, drop_pct: 47, in_stock: 1, checked_at: now, updated_at: now };
  it('computes the real discount from the 30-day median', () => {
    const v = verifyDeal(base);
    expect(v.ok).toBe(true);
    expect(v.real).toBe(20);
  });
  it('rejects stale, fake and out-of-stock deals', () => {
    expect(verifyDeal({ ...base, price: 980 }).ok).toBe(false);
    expect(verifyDeal({ ...base, in_stock: 0 }).ok).toBe(false);
    expect(verifyDeal({ ...base, checked_at: '2020-01-01T00:00:00Z' }).ok).toBe(false);
    expect(verifyDeal({ ...base, list_price: 5000 }).why.join()).toContain('منفوخ');
  });
});

describe('competitor page signals', () => {
  it('extracts titles, headings and promo lines', () => {
    const s = pageSignals('<title>متجر X</title><meta name="description" content="أحسن الأسعار"><h2>عروض الجمعة البيضاء</h2><p>خصم 30% على الموبايلات</p><script>var a="خصم"</script>');
    expect(s.title).toBe('متجر X');
    expect(s.heads).toContain('عروض الجمعة البيضاء');
    expect(s.promo.join()).toContain('خصم 30%');
  });
});
