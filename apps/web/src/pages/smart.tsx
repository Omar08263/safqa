// Safqa smart tools: fake-discount radar, price-war detector, cross-store basket optimizer,
// smart opt-in alerts (quiet hours, digest/instant), and the Egyptian sale-season calendar.
import { formatEGP } from '@safqa/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { CardGrid } from '../components/v5';
import { PageHeader, Skeleton, useToast } from '../fx/fx';
import { useCompare } from '../lib/compare';
import { signedInToBackend } from '../lib/edge';
import { usePrefs } from '../lib/prefs';
import { useTr } from '../lib/tr';
import { clearViewed, isV5Id, type NotifyPrefs, v5, viewedList } from '../lib/v5';

type Tab = 'radar' | 'wars' | 'basket' | 'alerts' | 'seasons';
const TABS: { id: Tab; ar: string; en: string; e: string }[] = [
  { id: 'radar', ar: 'رادار الخصم الوهمي', en: 'Fake-discount radar', e: '🕵️' },
  { id: 'wars', ar: 'حروب الأسعار', en: 'Price wars', e: '⚔️' },
  { id: 'basket', ar: 'أرخص سلة', en: 'Cheapest basket', e: '🧺' },
  { id: 'alerts', ar: 'تنبيهات ذكية', en: 'Smart alerts', e: '🔔' },
  { id: 'seasons', ar: 'مواسم الخصومات', en: 'Sale seasons', e: '🗓️' },
];

export function SmartPage({ tab = 'radar' }: { tab?: string }) {
  const tr = useTr();
  const [t, setT] = useState<Tab>((TABS.find((x) => x.id === tab)?.id ?? 'radar'));
  return (
    <div className="space-y-6">
      <PageHeader title={tr('أدوات صفقة الذكية 🧠', 'Safqa smart tools 🧠')} lede={tr('أدوات بنحسبها من الأسعار الحقيقية اللي بنسجلها — مش تخمين.', 'Computed from the real prices we record, not guesses.')} />
      <div role="tablist" className="flex flex-wrap gap-2">
        {TABS.map((x) => (
          <button key={x.id} role="tab" type="button" aria-selected={t === x.id} onClick={() => setT(x.id)} className={`press rounded-full px-4 py-2 text-sm font-bold ${t === x.id ? 'bg-foreground text-background' : 'bg-accent'}`}>{x.e} {tr(x.ar, x.en)}</button>
        ))}
      </div>
      {t === 'radar' ? <Radar /> : t === 'wars' ? <Wars /> : t === 'basket' ? <Basket /> : t === 'alerts' ? <Alerts /> : <Seasons />}
    </div>
  );
}

function Empty({ e, ar, en }: { e: string; ar: string; en: string }) {
  const tr = useTr();
  return <div className="rounded-3xl border border-dashed border-border p-8 text-center"><p className="text-4xl" aria-hidden="true">{e}</p><p className="mt-2 text-sm">{tr(ar, en)}</p></div>;
}
const Loading = () => <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="aspect-[3/4] w-full rounded-3xl" />)}</div>;

function Radar() {
  const tr = useTr();
  const { locale } = usePrefs();
  const q = useQuery({ queryKey: ['v5', 'radar'], queryFn: v5.radarFake });
  if (q.isPending) return <Loading />;
  return (
    <div className="space-y-3">
      <p className="text-sm">{tr('بنقارن «السعر قبل الخصم» اللي المتجر كاتبه بأعلى سعر شفناه فعلاً، وبنكشف لو السعر اتغلّى قبل «الخصم» بأيام.', 'We compare the store\'s "was" price with the highest price we actually saw, and catch prices raised just before a "sale".')} <span className="t-meta">({tr(`اتفحص ${q.data?.scanned ?? 0} منتج عليه خصم`, `${q.data?.scanned ?? 0} discounted products scanned`)})</span></p>
      {q.data?.items.length ? (
        <>
          <ul className="space-y-2">{q.data.items.slice(0, 8).map((p) => <li key={p.id} className="rounded-2xl bg-destructive/10 px-4 py-2 text-sm"><Link to="/p/$id" params={{ id: p.id }} className="font-bold hover:underline">{locale === 'ar' ? p.titleAr : p.titleEn}</Link> — {locale === 'ar' ? p.fake.ar : p.fake.en}</li>)}</ul>
          <CardGrid items={q.data.items} showVotes={false} />
        </>
      ) : <Empty e="✅" ar="مفيش خصم وهمي مؤكد لحد دلوقتي. الرادار بيقوى كل يوم مع تراكم تاريخ الأسعار (بدأنا التسجيل نوفمبر 2026)." en="No confirmed fake discounts yet. The radar gets sharper daily as price history accumulates (recording since Nov 2026)." />}
    </div>
  );
}

function Wars() {
  const tr = useTr();
  const { locale } = usePrefs();
  const q = useQuery({ queryKey: ['v5', 'wars'], queryFn: v5.wars });
  if (q.isPending) return <Loading />;
  return q.data?.items.length ? (
    <div className="space-y-3">
      <p className="text-sm">{tr('منتجات متجرين أو أكتر بيكسّروا سعرها على بعض في آخر أسبوعين — غالبًا السعر لسه هينزل.', 'Products two or more stores keep undercutting each other on (last 2 weeks): prices may fall further.')}</p>
      <ul className="space-y-2">{q.data.items.map((p) => <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-4 py-2 text-sm"><span>⚔️</span><Link to="/p/$id" params={{ id: p.id }} className="font-bold hover:underline">{locale === 'ar' ? p.titleAr : p.titleEn}</Link>{p.war.map((s) => <span key={s.slug} className="rounded-full bg-accent px-2 py-0.5 text-xs">{locale === 'ar' ? s.nameAr : s.nameEn} ×{s.drops}</span>)}</li>)}</ul>
    </div>
  ) : <Empty e="🕊️" ar="مفيش حروب أسعار دلوقتي. أول ما متجرين يبدأوا يكسّروا على بعض هتظهر هنا." en="No price wars right now. They show up as soon as two stores start undercutting each other." />;
}

function Basket() {
  const tr = useTr();
  const toast = useToast();
  const { locale } = usePrefs();
  const compare = useCompare();
  const [fee, setFee] = useState(60);
  const pool = [...new Set([...compare.ids.filter(isV5Id), ...viewedList().map((v) => v[0])])].slice(0, 15);
  const [picked, setPicked] = useState<string[]>(pool.slice(0, 5));
  const cards = useQuery({ queryKey: ['v5', 'basket-pool', pool.join(',')], queryFn: () => v5.compare(pool), enabled: pool.length > 0 });
  const run = useMutation({ mutationFn: () => v5.basket(picked, fee), onError: () => toast(tr('مقدرناش نحسب السلة دلوقتي', 'Could not compute the basket'), 'error') });
  const name = (id: string) => { const p = cards.data?.items.find((x) => x.id === id) ?? run.data?.products.find((x) => x.id === id); return p ? (locale === 'ar' ? p.titleAr : p.titleEn) : id; };
  const store = (s: string) => { const x = run.data?.stores.find((y) => y.slug === s); return x ? (locale === 'ar' ? x.nameAr : x.nameEn) : s; };
  if (!pool.length) return <Empty e="🧺" ar="ضيف منتجات للمقارنة أو افتح كام منتج، وإحنا نحسبلك أرخص طريقة تشتريهم بيها من كل المتاجر (بالتوصيل)." en="Add products to compare or open a few, and we'll find the cheapest way to buy them across stores (with delivery)." />;
  return (
    <div className="space-y-4">
      <p className="text-sm">{tr('اختار المنتجات، وإحنا نجرب كل توزيعة ممكنة على المتاجر ونحسب الإجمالي بمصاريف التوصيل.', 'Pick products; we try every split across stores and include delivery fees.')}</p>
      <div className="flex flex-wrap gap-2">
        {pool.map((id) => (
          <button key={id} type="button" aria-pressed={picked.includes(id)} onClick={() => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))} className={`press max-w-[18rem] truncate rounded-full border px-3 py-1.5 text-xs font-semibold ${picked.includes(id) ? 'border-primary bg-primary/15' : 'border-border'}`}>{picked.includes(id) ? '✓ ' : ''}{name(id)}</button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm">{tr('مصاريف التوصيل لكل متجر (تقدير)', 'Delivery fee per store (estimate)')}<input type="number" min={0} max={500} value={fee} onChange={(e) => setFee(Number(e.target.value) || 0)} className="h-9 w-24 rounded-full border border-border bg-background px-3" /> {tr('ج.م', 'EGP')}</label>
      <button type="button" disabled={!picked.length || run.isPending} onClick={() => run.mutate()} className="press rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">{run.isPending ? tr('بنحسب…', 'Computing…') : tr('احسب أرخص سلة 🧮', 'Find the cheapest basket 🧮')}</button>
      {run.data?.best ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-3xl border-2 border-palm/60 bg-card p-4">
            <p className="font-bold">🏆 {tr('أرخص طريقة', 'Cheapest way')}: <span className="num">{formatEGP(run.data.best.total, locale)}</span></p>
            <p className="t-meta">{tr(`من ${run.data.best.stores.length} متجر · توصيل ${Math.round(run.data.best.fees)} ج.م`, `${run.data.best.stores.length} store(s) · delivery EGP ${Math.round(run.data.best.fees)}`)}</p>
            <ul className="mt-2 space-y-1 text-sm">{run.data.best.plan.map((x) => <li key={x.id} className="flex justify-between gap-2"><span className="truncate">{name(x.id)}</span><span className="num flex-none">{store(x.store)} · {formatEGP(x.price, locale)}</span></li>)}</ul>
          </div>
          <div className="rounded-3xl border border-border bg-card p-4">
            <p className="font-bold">🏬 {tr('لو من متجر واحد', 'If from one store')}</p>
            {run.data.single ? <p className="mt-1 text-sm">{store(run.data.single.store)}: <span className="num font-bold">{formatEGP(run.data.single.total, locale)}</span>{run.data.single.total > run.data.best.total ? <span className="text-palm"> — {tr(`السلة الذكية بتوفّر ${Math.round(run.data.single.total - run.data.best.total)} ج.م`, `smart basket saves EGP ${Math.round(run.data.single.total - run.data.best.total)}`)}</span> : null}</p> : <p className="t-meta mt-1">{tr('مفيش متجر واحد عنده كل المنتجات دي.', 'No single store has all of these.')}</p>}
            {run.data.missing.length ? <p className="t-meta mt-2">{tr(`${run.data.missing.length} منتج مش متاح دلوقتي`, `${run.data.missing.length} unavailable now`)}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Alerts() {
  const tr = useTr();
  const toast = useToast();
  const signed = signedInToBackend();
  const q = useQuery({ queryKey: ['v5', 'notify'], queryFn: v5.notify, enabled: signed, retry: 0 });
  const [p, setP] = useState<NotifyPrefs | null>(null);
  useEffect(() => { if (q.data) setP(q.data.prefs); }, [q.data]);
  const save = useMutation({ mutationFn: (x: NotifyPrefs) => v5.saveNotify(x), onSuccess: () => toast(tr('اتحفظ ✓', 'Saved ✓'), 'success'), onError: () => toast(tr('مقدرناش نحفظ', 'Could not save'), 'error') });
  const [auto, setAuto] = useState(() => localStorage.getItem('safqa.v5.autotrack') !== 'off');
  const viewed = viewedList().length;
  const local = (
    <div className="rounded-3xl border border-border bg-card p-4 text-sm">
      <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={auto} onChange={(e) => { setAuto(e.target.checked); localStorage.setItem('safqa.v5.autotrack', e.target.checked ? 'on' : 'off'); }} />{tr('تتبّع تلقائي لكل منتج بتفتحه', 'Auto-track every product you open')}</label>
      <p className="t-meta mt-1">{tr(`متتبَّع على الجهاز ده: ${viewed} منتج. بنعرضلك في الرئيسية لو سعر أي واحد فيهم نزل عن السعر اللي شفته بيه.`, `${viewed} products tracked on this device; Home shows any that got cheaper than when you saw them.`)}</p>
      {viewed ? <button type="button" onClick={() => { clearViewed(); toast(tr('اتمسح', 'Cleared')); }} className="mt-2 text-xs font-semibold text-primary">{tr('امسح المتتبَّع', 'Clear tracked')}</button> : null}
    </div>
  );
  if (!signed) return <div className="space-y-3">{local}<Empty e="🔔" ar="التنبيهات الذكية (على تيليجرام وجوه صفقة) محتاجة تسجيل دخول — وبتشتغل بس لو وافقت." en="Smart alerts (Telegram + in-app) need sign-in, and only run if you opt in." /><div className="text-center"><Link to="/login" className="press rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">{tr('سجّل دخول', 'Sign in')}</Link></div></div>;
  if (!p) return <Loading />;
  const set = (patch: Partial<NotifyPrefs>) => setP({ ...p, ...patch });
  const hours = Array.from({ length: 24 }, (_, i) => i);
  return (
    <div className="space-y-3">
      {local}
      <div className="space-y-3 rounded-3xl border border-border bg-card p-4 text-sm">
        <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={Boolean(p.opted_in)} onChange={(e) => set({ opted_in: e.target.checked ? 1 : 0 })} />{tr('أيوه، ابعتلي تنبيهات ذكية على ذوقي', 'Yes, send me smart alerts tailored to me')}</label>
        <div className="flex flex-wrap gap-2">
          {(['instant', 'digest', 'off'] as const).map((m) => <button key={m} type="button" aria-pressed={p.mode === m} onClick={() => set({ mode: m })} className={`press rounded-full px-3 py-1.5 text-xs font-bold ${p.mode === m ? 'bg-foreground text-background' : 'bg-accent'}`}>{m === 'instant' ? tr('⚡ فوري', '⚡ Instant') : m === 'digest' ? tr('☀️ ملخص يومي', '☀️ Daily digest') : tr('⏸️ وقّف', '⏸️ Off')}</button>)}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label>{tr('هدوء من', 'Quiet from')}<select value={p.quiet_start} onChange={(e) => set({ quiet_start: Number(e.target.value) })} className="mt-1 h-9 w-full rounded-full border border-border bg-background px-2">{hours.map((h) => <option key={h} value={h}>{h}:00</option>)}</select></label>
          <label>{tr('لحد', 'until')}<select value={p.quiet_end} onChange={(e) => set({ quiet_end: Number(e.target.value) })} className="mt-1 h-9 w-full rounded-full border border-border bg-background px-2">{hours.map((h) => <option key={h} value={h}>{h}:00</option>)}</select></label>
          <label>{tr('ساعة الملخص', 'Digest hour')}<select value={p.digest_hour} onChange={(e) => set({ digest_hour: Number(e.target.value) })} className="mt-1 h-9 w-full rounded-full border border-border bg-background px-2">{hours.map((h) => <option key={h} value={h}>{h}:00</option>)}</select></label>
          <label>{tr('أقصى عدد يوميًا', 'Max per day')}<input type="number" min={1} max={10} value={p.max_per_day} onChange={(e) => set({ max_per_day: Number(e.target.value) })} className="mt-1 h-9 w-full rounded-full border border-border bg-background px-3" /></label>
        </div>
        <label className="flex items-center gap-2">{tr('أقل نزول يستاهل تنبيه', 'Minimum drop')}<input type="number" min={1} max={50} value={p.min_drop} onChange={(e) => set({ min_drop: Number(e.target.value) })} className="h-9 w-20 rounded-full border border-border bg-background px-3" />%</label>
        <p className="t-meta">{tr('بنرتب النزولات الحقيقية على ذوقك (اللي شفته، دوّرت عليه، أقسامك وماركاتك)، ومن غير تكرار. وقت التوقيت بتوقيت القاهرة.', 'We rank real drops by your taste (viewed, searched, categories, brands), deduplicated; hours are Cairo time.')} {q.data?.telegram ? tr('التوصيل: جوه صفقة + تيليجرام ✓', 'Delivery: in-app + Telegram ✓') : tr('التوصيل: جوه صفقة (اربط تيليجرام من الإعدادات عشان توصلك برّه).', 'Delivery: in-app (link Telegram in settings for push).')} {tr('الإيميل لسه مش متاح على الخطة المجانية.', 'Email is not available on the free stack yet.')}</p>
        <button type="button" onClick={() => save.mutate(p)} className="press rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground">{tr('احفظ', 'Save')}</button>
      </div>
    </div>
  );
}

function Seasons() {
  const tr = useTr();
  const { locale } = usePrefs();
  const q = useQuery({ queryKey: ['v5', 'seasons'], queryFn: v5.seasons });
  if (q.isPending) return <Loading />;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-3">
      {q.data?.now.ar ? <p className="rounded-2xl bg-primary/10 px-4 py-3 text-sm font-semibold">🗓️ {locale === 'ar' ? q.data.now.ar : q.data.now.en}</p> : null}
      <ol className="relative space-y-2 border-s-2 border-border ps-4">
        {(q.data?.seasons ?? []).filter((s) => s.to >= today).map((s) => {
          const active = s.from <= today && today <= s.to;
          const days = Math.ceil((Date.parse(s.from) - Date.now()) / 86400_000);
          return (
            <li key={s.id + s.from} className={`rounded-2xl border px-4 py-2 text-sm ${active ? 'border-primary bg-primary/10' : 'border-border bg-card'}`}>
              <span className="font-bold">{locale === 'ar' ? s.ar : s.en}</span> <span className="num t-meta">{s.from} → {s.to}</span>
              <span className="t-meta"> · {active ? tr('شغّال دلوقتي 🔥', 'on now 🔥') : tr(`بعد ${days} يوم`, `in ${days} days`)}</span>
            </li>
          );
        })}
      </ol>
      <p className="t-meta">{tr('مواعيد المواسم الإسلامية تقريبية (بتتحرك حوالي 11 يوم كل سنة). هنضيف توقع حجم الخصم لكل قسم لما يتجمع تاريخ موسم كامل.', 'Islamic-calendar dates are approximate. Per-category discount forecasts come once a full season of history exists.')}</p>
    </div>
  );
}
