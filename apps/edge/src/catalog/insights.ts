// Safqa deal intelligence (pure functions, no I/O; shared by the Worker and tests):
//  • Deal DNA: explains *why* a deal is good or not, factor by factor, from real data only.
//  • Fake-discount radar: inflated "was" prices and pump-then-"sale" patterns in the recorded history.
//  • Price-war detector: two or more stores undercutting each other repeatedly.
//  • Basket optimizer: cheapest way to buy a list of products across stores, including delivery fees.
//  • Egyptian sale-season advice (White Friday, Ramadan, back-to-school…), labelled as approximate.
type H = [number, number][]; // [unixMinutes, price]
export interface OfferLite { s: string; p: number; l: number | null; k: 0 | 1; h: H; src?: string }

export interface DnaFactor { key: string; points: number; ar: string; en: string; tone: 'good' | 'bad' | 'neutral' }
export function dealDna(o: { price: number; offers: OfferLite[]; hot: number; cold: number; checkedAt?: string | null; now?: number }): { score: number; grade: string; factors: DnaFactor[] } {
  const now = o.now ?? Date.now();
  const nowMin = Math.floor(now / 60000);
  const own = o.offers.filter((x) => x.src !== 'user');
  // Time factors use the best offer's own history; cross-store comparison is its own factor (no double count).
  const bestOffer = own.find((x) => x.p === o.price) ?? own[0];
  const pts = bestOffer?.h ?? [];
  const f: DnaFactor[] = [];
  const add = (key: string, points: number, ar: string, en: string) => f.push({ key, points: Math.round(points), ar, en, tone: points > 2 ? 'good' : points < -2 ? 'bad' : 'neutral' });
  const recent = pts.filter(([t]) => t >= nowMin - 30 * 1440).map(([, v]) => v).sort((a, b) => a - b);
  const med = recent.length ? recent[Math.floor(recent.length / 2)]! : null;
  if (med && pts.length >= 2) {
    const d = ((med - o.price) / med) * 100;
    add('median', Math.max(-20, Math.min(25, d * 1.5)), d > 0.5 ? `أرخص من متوسط آخر 30 يوم بـ ${d.toFixed(1)}%` : d < -0.5 ? `أغلى من متوسط آخر 30 يوم بـ ${(-d).toFixed(1)}%` : 'قريب من متوسط آخر 30 يوم', d > 0.5 ? `${d.toFixed(1)}% below its 30-day median` : d < -0.5 ? `${(-d).toFixed(1)}% above its 30-day median` : 'Close to its 30-day median');
  } else add('median', 0, 'لسه بنجمع تاريخ السعر', 'Still collecting price history');
  const low = pts.length ? Math.min(...pts.map(([, v]) => v)) : null;
  if (low && pts.length >= 3) add('low', o.price <= low ? 20 : o.price <= low * 1.03 ? 10 : -5, o.price <= low ? 'أقل سعر اتسجل للمنتج ده' : o.price <= low * 1.03 ? 'في حدود 3% من أقل سعر اتسجل' : `أقل سعر اتسجل كان ${Math.round(low)} ج.م`, o.price <= low ? 'Lowest price ever recorded' : o.price <= low * 1.03 ? 'Within 3% of the lowest recorded' : `Lowest recorded was EGP ${Math.round(low)}`);
  const others = own.filter((x) => x.k && x.p > o.price);
  if (own.filter((x) => x.k).length >= 2) {
    const next = others.length ? Math.min(...others.map((x) => x.p)) : o.price;
    const save = next - o.price;
    add('stores', Math.min(20, (save / o.price) * 100), save > 0 ? `أرخص من المتجر التاني بـ ${Math.round(save)} ج.م` : 'نفس السعر في المتاجر التانية', save > 0 ? `EGP ${Math.round(save)} cheaper than the next store` : 'Same price at other stores');
  } else add('stores', 0, 'متاح في متجر واحد بس عندنا', 'Only one store tracked');
  const best = own.find((x) => x.p === o.price);
  const fake = fakeDiscount(best ?? null);
  if (best?.l && best.l > o.price) {
    if (fake.flag) add('claimed', -15, `الخصم المكتوب مشكوك فيه: ${fake.ar}`, `Claimed discount looks inflated: ${fake.en}`);
    else add('claimed', Math.min(8, ((best.l - o.price) / best.l) * 30), `خصم المتجر ${Math.round(((best.l - o.price) / best.l) * 100)}% ومطابق للتاريخ`, `Store discount ${Math.round(((best.l - o.price) / best.l) * 100)}%, consistent with history`);
  }
  const votes = o.hot - o.cold;
  if (o.hot + o.cold > 0) add('votes', Math.max(-15, Math.min(15, votes * 3)), `المجتمع: ${o.hot} 🔥 / ${o.cold} 🧊`, `Community: ${o.hot} hot / ${o.cold} cold`);
  if (o.checkedAt) {
    const hrs = (now - Date.parse(o.checkedAt)) / 3600_000;
    add('fresh', hrs < 6 ? 3 : hrs < 48 ? 0 : -6, hrs < 6 ? 'السعر متأكد منه من أقل من 6 ساعات' : hrs < 48 ? 'السعر متأكد منه خلال يومين' : 'السعر محتاج تأكيد (أقدم من يومين)', hrs < 6 ? 'Price confirmed < 6 h ago' : hrs < 48 ? 'Confirmed within 2 days' : 'Needs re-check (> 2 days old)');
  }
  if (best && !best.k) add('stock', -10, 'نفد من المتجر', 'Out of stock');
  const score = Math.max(0, Math.min(100, 50 + f.reduce((s, x) => s + x.points, 0)));
  return { score, grade: score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : 'D', factors: f };
}

/** Fake-discount radar for one offer: inflated "was" price, or price pumped shortly before the "sale". */
export function fakeDiscount(o: OfferLite | null): { flag: boolean; kind?: 'inflated_was' | 'pump_then_sale'; ar: string; en: string } {
  if (!o) return { flag: false, ar: '', en: '' };
  const prices = o.h.map(([, v]) => v);
  if (o.l && o.l > o.p && prices.length >= 2) {
    const maxSeen = Math.max(...prices);
    if (o.l > maxSeen * 1.12) return { flag: true, kind: 'inflated_was', ar: `«السعر قبل الخصم» ${Math.round(o.l)} ج.م، بس أعلى سعر شفناه فعلاً ${Math.round(maxSeen)} ج.م`, en: `"Was" EGP ${Math.round(o.l)}, but the highest price we actually saw was EGP ${Math.round(maxSeen)}` };
  }
  const h = o.h;
  if (h.length >= 3) {
    const last = h[h.length - 1]!;
    for (let i = h.length - 2; i >= 1; i--) {
      const [t, peak] = h[i]!; const before = h[i - 1]![1];
      if (last[0] - t > 30 * 1440) break;
      if (peak > before * 1.1 && last[1] >= before * 0.98) return { flag: true, kind: 'pump_then_sale', ar: `السعر اتغلّى لـ ${Math.round(peak)} قبل «الخصم» ورجع تقريبًا لنفس سعره القديم ${Math.round(before)}`, en: `Price was raised to ${Math.round(peak)} before the "sale" and is back near its old ${Math.round(before)}` };
    }
  }
  return { flag: false, ar: '', en: '' };
}

/** Price war: ≥2 stores each dropping ≥2 times on the same product within the window. */
export function priceWars(drops: { product_id: string; store: string; at: string; new: number }[], minStores = 2) {
  const by = new Map<string, Map<string, number>>();
  for (const d of drops) { const m = by.get(d.product_id) ?? new Map(); m.set(d.store, (m.get(d.store) ?? 0) + 1); by.set(d.product_id, m); }
  return [...by.entries()].map(([id, m]) => ({ id, stores: [...m.entries()].filter(([, n]) => n >= 1).map(([s, n]) => ({ store: s, drops: n })) }))
    .filter((w) => w.stores.length >= minStores && w.stores.reduce((s, x) => s + x.drops, 0) >= 3)
    .sort((a, b) => b.stores.reduce((s, x) => s + x.drops, 0) - a.stores.reduce((s, x) => s + x.drops, 0));
}

/** Basket optimizer: exact search over store subsets (≤ 10 stores → ≤ 1024 subsets). */
export function optimizeBasket(items: { id: string; offers: { s: string; p: number; k: 0 | 1 }[] }[], fee: (store: string) => number) {
  const stores = [...new Set(items.flatMap((i) => i.offers.filter((o) => o.k).map((o) => o.s)))].slice(0, 10);
  let best: { total: number; fees: number; plan: { id: string; store: string; price: number }[]; stores: string[] } | null = null;
  for (let mask = 1; mask < 1 << stores.length; mask++) {
    const set = stores.filter((_, i) => mask & (1 << i));
    const plan: { id: string; store: string; price: number }[] = [];
    let ok = true;
    for (const it of items) {
      const o = it.offers.filter((x) => x.k && set.includes(x.s)).sort((a, b) => a.p - b.p)[0];
      if (!o) { ok = false; break; }
      plan.push({ id: it.id, store: o.s, price: o.p });
    }
    if (!ok) continue;
    const used = [...new Set(plan.map((p) => p.store))];
    const fees = used.reduce((s, x) => s + fee(x), 0);
    const total = plan.reduce((s, p) => s + p.price, 0) + fees;
    if (!best || total < best.total - 0.01 || (Math.abs(total - best.total) < 0.01 && used.length < best.stores.length)) best = { total, fees, plan, stores: used };
  }
  const single = stores.map((s) => { const plan = items.map((it) => it.offers.find((o) => o.k && o.s === s)); return plan.every(Boolean) ? { store: s, total: plan.reduce((t, o) => t + o!.p, 0) + fee(s) } : null; }).filter(Boolean).sort((a, b) => a!.total - b!.total)[0] ?? null;
  const missing = items.filter((it) => !it.offers.some((o) => o.k)).map((it) => it.id);
  return { best, single, missing };
}

/** Egyptian sale seasons (approximate dates; Islamic dates move ~11 days a year). */
export const SEASONS = [
  { id: 'white-friday', ar: 'الجمعة البيضاء', en: 'White Friday', from: '2026-11-20', to: '2026-11-30' },
  { id: 'year-end', ar: 'تخفيضات آخر السنة', en: 'Year-end sales', from: '2026-12-20', to: '2027-01-05' },
  { id: 'ramadan', ar: 'عروض رمضان (تقريبًا)', en: 'Ramadan offers (approx.)', from: '2027-02-05', to: '2027-03-09' },
  { id: 'eid-fitr', ar: 'عيد الفطر (تقريبًا)', en: 'Eid al-Fitr (approx.)', from: '2027-03-09', to: '2027-03-14' },
  { id: 'mothers-day', ar: 'عيد الأم', en: "Mother's Day", from: '2027-03-14', to: '2027-03-21' },
  { id: 'eid-adha', ar: 'عيد الأضحى (تقريبًا)', en: 'Eid al-Adha (approx.)', from: '2027-05-14', to: '2027-05-20' },
  { id: 'back-to-school', ar: 'موسم المدارس', en: 'Back to school', from: '2027-08-25', to: '2027-09-25' },
  { id: '11-11', ar: 'عروض 11.11', en: '11.11 sales', from: '2027-11-08', to: '2027-11-12' },
  { id: 'white-friday-27', ar: 'الجمعة البيضاء', en: 'White Friday', from: '2027-11-19', to: '2027-11-29' },
];
export function seasonAdvice(now = Date.now(), category?: string | null) {
  const day = new Date(now).toISOString().slice(0, 10);
  const active = SEASONS.find((s) => s.from <= day && day <= s.to);
  const next = SEASONS.find((s) => s.from > day);
  const days = next ? Math.ceil((Date.parse(next.from) - now) / 86400_000) : null;
  const school = category && ['laptops', 'tablets', 'computing', 'accessories'].includes(category);
  if (active) return { active, next, days, ar: `إحنا في موسم ${active.ar} دلوقتي — قارن كويس: ده وقت الخصومات الحقيقية والوهمية مع بعض.`, en: `${active.en} is on now: compare carefully, real and fake discounts peak together.` };
  if (next && days != null && days <= 21) return { active: null, next, days, ar: `${next.ar} بعد ${days} يوم تقريبًا${school && next.id === 'back-to-school' ? ' — أجهزة المذاكرة غالبًا بتنزل فيه' : ''}. لو مش مستعجل ممكن تستنى.`, en: `${next.en} in about ${days} days. If you can wait, it may be worth it.` };
  return { active: null, next, days, ar: next ? `مفيش موسم خصومات كبير قريب (${next.ar} بعد ${days} يوم).` : '', en: next ? `No big sale season soon (${next.en} in ${days} days).` : '' };
}
