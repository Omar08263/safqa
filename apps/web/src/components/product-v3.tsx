// Product page building blocks (Safqa v3): gallery, AI summary, specs,
// store ratings, reviews with uploads, Q&A with spec-grounded agent answers,
// related rows, spec diff, sticky buy bar and section tabs.
import { formatEGP, localized, type PriceHistory, type ProductCard, type ProductDetail } from '@safqa/shared';
import { Link } from '@tanstack/react-router';
import { BadgeCheck, Bot, Camera, ChevronLeft, ChevronRight, Copy, ExternalLink, Expand, FlaskConical, MessageCircleQuestion, Move3d, Search, Sparkles, Star, ThumbsUp, X, ZoomIn } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ProductArt, ProductThumb } from '../features/visuals';
import { Card, useToast } from '../fx/fx';
import { keys, type Purchase, useActivity } from '../lib/activity';
import { agentById } from '../lib/agents';
import { grantBadge, grantXp, readCommunity, type Review, writeCommunity, XP, ensureMember } from '../lib/community';
import { useLocal } from '../lib/local';
import type { ProductMedia } from '../lib/media';
import { storeNames } from '../lib/media';
import { usePrefs } from '../lib/prefs';
import { answerFromSpecs, canonical, canonLabels, type Summary } from '../lib/product-intel';
import { useSession } from '../lib/session';
import { useTr } from '../lib/tr';
import type { Attachment } from '../lib/uploads';
import { AgentAvatar } from './agent-avatar';
import { Composer, MemberAvatar, MemberName, timeAgo, useCommunityState, useGuard, RuleChip } from './community-kit';
import { Button } from './ui/button';
import { Attachments, Uploader } from './uploader';

const storeLabel = (slug: string, locale: string) => (storeNames[slug] ? storeNames[slug][locale === 'ar' ? 0 : 1] : slug);

// ---------------------------------------------------------------- Gallery
export function Gallery({ media, slug, title }: { media: ProductMedia | null | undefined; slug?: string | null; title: string }) {
  const tr = useTr();
  const { locale } = usePrefs();
  const imgs = media?.images ?? [];
  const [i, setI] = useState(0);
  const [lens, setLens] = useState<{ x: number; y: number } | null>(null);
  const [full, setFull] = useState(false);
  const [spin, setSpin] = useState(false);
  const drag = useRef<{ x: number; i: number } | null>(null);
  const touch = useRef<number | null>(null);
  const n = imgs.length;
  const go = (d: number) => setI((v) => (v + d + n) % n);
  useEffect(() => {
    if (!full) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFull(false);
      if (e.key === 'ArrowLeft') go(locale === 'ar' ? 1 : -1);
      if (e.key === 'ArrowRight') go(locale === 'ar' ? -1 : 1);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });
  if (n === 0) return <ProductArt slug={slug} className="h-72 sm:h-96" />;
  const cur = imgs[i] ?? imgs[0];
  if (!cur) return null;
  return (
    <div className="space-y-3">
      <div
        className="group relative aspect-square cursor-zoom-in overflow-hidden rounded-3xl border border-border bg-white"
        onMouseMove={(e) => { if (spin && drag.current) { const dx = e.clientX - drag.current.x; setI(((drag.current.i + Math.round(dx / 40)) % n + n) % n); return; } const r = e.currentTarget.getBoundingClientRect(); setLens({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }); }}
        onMouseLeave={() => { setLens(null); drag.current = null; }}
        onMouseDown={(e) => { if (spin) drag.current = { x: e.clientX, i }; }}
        onMouseUp={() => { drag.current = null; }}
        onTouchStart={(e) => { touch.current = e.touches[0]?.clientX ?? null; }}
        onTouchEnd={(e) => { const s = touch.current; const x = e.changedTouches[0]?.clientX; if (s != null && x != null && Math.abs(x - s) > 40) go((x < s ? 1 : -1) * (locale === 'ar' ? -1 : 1)); touch.current = null; }}
        onClick={() => !spin && setFull(true)}
        onKeyDown={(e) => e.key === 'Enter' && setFull(true)}
        role="button"
        tabIndex={0}
        aria-label={tr('كبّر الصورة', 'Enlarge image')}
      >
        <img src={cur.full} alt={`${title} — ${i + 1}`} className="h-full w-full select-none object-contain p-6 transition duration-300" draggable={false} style={lens && !spin ? { transform: 'scale(2.2)', transformOrigin: `${lens.x}% ${lens.y}%` } : undefined} />
        <div className="pointer-events-none absolute start-3 top-3 flex gap-1.5">
          <span className="rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white">{i + 1}/{n}</span>
          <span className="rounded-full bg-black/60 px-2.5 py-1 text-[11px] text-white">{tr('صورة من', 'Photo from')} {storeLabel(cur.store, locale)}</span>
        </div>
        <div className="absolute end-3 top-3 flex gap-1.5">
          {n > 2 ? <button type="button" onClick={(e) => { e.stopPropagation(); setSpin((s) => !s); }} className={`grid h-9 w-9 place-items-center rounded-full backdrop-blur ${spin ? 'bg-primary text-primary-foreground' : 'bg-black/50 text-white'}`} title={tr('عرض دوّار: اسحب يمين وشمال', 'Spin view: drag left/right')} aria-pressed={spin}><Move3d className="h-4 w-4" /></button> : null}
          <button type="button" onClick={(e) => { e.stopPropagation(); setFull(true); }} className="grid h-9 w-9 place-items-center rounded-full bg-black/50 text-white backdrop-blur" aria-label={tr('ملء الشاشة', 'Fullscreen')}><Expand className="h-4 w-4" /></button>
        </div>
        {!spin ? <span className="pointer-events-none absolute bottom-3 start-3 flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-[11px] text-white opacity-0 transition group-hover:opacity-100"><ZoomIn className="h-3 w-3" />{tr('حرّك الماوس للتكبير', 'Hover to zoom')}</span> : <span className="pointer-events-none absolute bottom-3 start-3 rounded-full bg-primary px-2 py-1 text-[11px] font-bold text-primary-foreground">{tr('↔ اسحب للف المنتج', '↔ Drag to spin')}</span>}
        {n > 1 ? (
          <>
            <button type="button" onClick={(e) => { e.stopPropagation(); go(-1); }} className="absolute start-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/80 text-black opacity-0 shadow transition group-hover:opacity-100" aria-label={tr('السابقة', 'Previous')}><ChevronRight className="h-5 w-5 ltr:rotate-180" /></button>
            <button type="button" onClick={(e) => { e.stopPropagation(); go(1); }} className="absolute end-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/80 text-black opacity-0 shadow transition group-hover:opacity-100" aria-label={tr('التالية', 'Next')}><ChevronLeft className="h-5 w-5 ltr:rotate-180" /></button>
          </>
        ) : null}
      </div>
      {n > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {imgs.map((im, k) => (
            <button key={im.thumb} type="button" onClick={() => setI(k)} onMouseEnter={() => setI(k)} className={`h-16 w-16 flex-none overflow-hidden rounded-xl border-2 bg-white transition ${k === i ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100'}`} aria-label={`${k + 1}`}>
              <img src={im.thumb} alt="" className="h-full w-full object-contain p-1" loading="lazy" />
            </button>
          ))}
        </div>
      ) : null}
      {full ? (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[90] flex flex-col bg-black/92 backdrop-blur" onClick={() => setFull(false)} onKeyDown={() => undefined}>
          <div className="flex items-center justify-between p-3 text-white">
            <span className="text-sm">{i + 1}/{n} · {tr('المصدر', 'Source')}: <a href={cur.src} target="_blank" rel="noreferrer" className="underline" onClick={(e) => e.stopPropagation()}>{storeLabel(cur.store, locale)}</a></span>
            <button type="button" className="grid h-10 w-10 place-items-center rounded-full bg-white/15" aria-label={tr('قفل', 'Close')}><X className="h-5 w-5" /></button>
          </div>
          <div className="relative flex-1" onClick={(e) => e.stopPropagation()} onKeyDown={() => undefined}>
            <img src={cur.full} alt={title} className="absolute inset-0 m-auto max-h-full max-w-full object-contain p-4" />
            {n > 1 ? <><button type="button" onClick={() => go(-1)} className="absolute start-3 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white"><ChevronRight className="h-6 w-6 ltr:rotate-180" /></button><button type="button" onClick={() => go(1)} className="absolute end-3 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white"><ChevronLeft className="h-6 w-6 ltr:rotate-180" /></button></> : null}
          </div>
          <div className="flex justify-center gap-2 overflow-x-auto p-3" onClick={(e) => e.stopPropagation()} onKeyDown={() => undefined}>
            {imgs.map((im, k) => <button key={im.thumb} type="button" onClick={() => setI(k)} className={`h-14 w-14 flex-none overflow-hidden rounded-lg bg-white ${k === i ? 'ring-2 ring-primary' : 'opacity-60'}`}><img src={im.thumb} alt="" className="h-full w-full object-contain" /></button>)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- AI summary
export function AiSummaryCard({ s }: { s: Summary }) {
  const tr = useTr();
  const { locale } = usePrefs();
  const L = (l: { ar: string; en: string }) => (locale === 'ar' ? l.ar : l.en);
  const tone = { great: 'from-[var(--palm)]/25', good: 'from-primary/25', wait: 'from-sky-500/20', careful: 'from-destructive/25' }[s.verdict.kind];
  return (
    <section id="ai-summary" className={`relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br ${tone} to-transparent p-5`}>
      <div className="absolute -end-10 -top-10 h-40 w-40 rounded-full bg-primary/20 blur-3xl" aria-hidden />
      <div className="relative flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground"><Sparkles className="h-3.5 w-3.5" />{tr('ملخص ذكي', 'Smart summary')}</span>
        <span className="text-[11px] text-muted">{tr('متولّد تلقائي من مواصفات المتجر وسجل الأسعار الحقيقي — بقواعد ثابتة أوفلاين، مش رأي بشري', 'Generated offline from the store specs and the real price history — rule-based, not a human opinion')}</span>
      </div>
      <p className="relative mt-3 text-lg font-semibold leading-8">{L(s.what)}</p>
      <div className="relative mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl bg-card/80 p-4">
          <p className="mb-2 font-bold text-palm">✅ {tr('المميزات', 'Pros')}</p>
          {s.pros.length ? <ul className="space-y-1.5 text-sm">{s.pros.map((p) => <li key={p.ar} className="flex gap-2"><span className="text-palm">+</span>{L(p)}</li>)}</ul> : <p className="text-sm text-muted">{tr('مفيش مواصفات كفاية نطلع منها مميزات', 'Not enough specs to derive pros')}</p>}
        </div>
        <div className="rounded-2xl bg-card/80 p-4">
          <p className="mb-2 font-bold text-destructive">⚠️ {tr('العيوب', 'Cons')}</p>
          {s.cons.length ? <ul className="space-y-1.5 text-sm">{s.cons.map((p) => <li key={p.ar} className="flex gap-2"><span className="text-destructive">−</span>{L(p)}</li>)}</ul> : <p className="text-sm text-muted">{tr('مالقيناش عيوب واضحة في المواصفات', 'No clear cons in the specs')}</p>}
        </div>
      </div>
      <div className="relative mt-3 rounded-2xl border border-border bg-card p-4">
        <p className="text-base font-bold">{tr('يستاهل سعره؟', 'Worth the price?')} <span className="ms-1">{L(s.verdict)}</span></p>
        <ul className="mt-2 space-y-1 text-sm text-muted">{s.verdict.reasons.map((r) => <li key={r.ar}>• {L(r)}</li>)}</ul>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted">
          <span>{tr('اتبنى على:', 'Based on:')}</span>
          {s.basis.map((b) => <span key={b.ar} className="rounded-full bg-accent px-2 py-0.5">{L(b)}</span>)}
          <span className="rounded-full bg-accent px-2 py-0.5">{tr('ثقة', 'Confidence')} {Math.round(s.confidence * 100)}%</span>
        </div>
        {s.historyDays < 14 ? <p className="mt-2 text-[11px] text-muted">{tr(`سجل الأسعار الحقيقي بدأ من ${s.historyDays} يوم بس، فالحكم هيبقى أدق كل يوم مع التحديث اليومي.`, `Real price tracking started ${s.historyDays} day(s) ago; the verdict sharpens with each daily update.`)}</p> : null}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Description + specs
export function DescriptionCard({ media }: { media: ProductMedia | null | undefined }) {
  const tr = useTr();
  const { locale } = usePrefs();
  const [more, setMore] = useState(false);
  const d = media?.description;
  if (!d) return null;
  const lines = d.text.split('\n').map((l) => l.trim());
  const short = lines.slice(0, 8);
  return (
    <Card>
      <h2 className="mb-2 text-lg font-bold">{tr('الوصف', 'Description')}</h2>
      <div className="space-y-1 text-sm leading-7" dir="auto">
        {(more ? lines : short).map((l, k) => (l ? <p key={`${k}-${l.slice(0, 8)}`} className={/:$/.test(l) ? 'mt-2 font-semibold' : l.startsWith('-') ? 'ps-3 text-muted' : ''}>{l}</p> : null))}
      </div>
      {lines.length > short.length ? <button type="button" className="mt-2 text-sm font-semibold text-primary" onClick={() => setMore((m) => !m)}>{more ? tr('اعرض أقل', 'Show less') : tr('اقرا أكتر', 'Read more')}</button> : null}
      <p className="mt-3 text-[11px] text-muted">{tr('الوصف منقول كما هو من صفحة', 'Description quoted from')} <a href={d.url} target="_blank" rel="noreferrer" className="underline">{storeLabel(d.store, locale)}</a></p>
    </Card>
  );
}

export function SpecsTable({ media, item }: { media: ProductMedia | null | undefined; item: ProductDetail }) {
  const tr = useTr();
  const toast = useToast();
  const { locale } = usePrefs();
  const [q, setQ] = useState('');
  const specs = media?.specs ?? [];
  const c = canonical(item, media);
  const chips = canonLabels.filter((l) => c[l.key] != null).slice(0, 8);
  const rows = specs.filter((s) => !q || `${s.key} ${s.value}`.toLowerCase().includes(q.toLowerCase()));
  if (!specs.length && !chips.length) return null;
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{tr('المواصفات', 'Specifications')}</h2>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 rounded-full border border-border px-2"><Search className="h-3.5 w-3.5 text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('دوّر في المواصفات', 'Filter specs')} className="h-8 w-36 bg-transparent text-xs outline-none" /></label>
          <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(specs.map((s) => `${s.key}: ${s.value}`).join('\n')); toast(tr('اتنسخت المواصفات', 'Specs copied')); }}><Copy className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
      {chips.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {chips.map((l) => <span key={l.key} className="rounded-full bg-primary/12 px-2.5 py-1 text-xs font-semibold">{locale === 'ar' ? l.ar : l.en}: <span className="num">{String(c[l.key] === true ? '✓' : c[l.key])}</span></span>)}
        </div>
      ) : null}
      {rows.length ? (
        <table className="mt-3 w-full text-sm">
          <tbody>
            {rows.map((s) => (
              <tr key={`${s.key}${s.value}`} className="border-b border-border last:border-0 odd:bg-accent/40">
                <th className="w-2/5 px-3 py-2 text-start font-semibold text-muted" dir="auto">{s.key}</th>
                <td className="px-3 py-2" dir="auto">{s.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {specs[0] ? <p className="mt-2 text-[11px] text-muted">{tr('المصدر: جدول المواصفات في صفحة', 'Source: the spec table on')} {storeLabel(specs[0].store, locale)}</p> : null}
    </Card>
  );
}

// ---------------------------------------------------------------- Store ratings + user reviews
export function ReviewsSection({ item, media }: { item: ProductDetail; media: ProductMedia | null | undefined }) {
  const tr = useTr();
  const { locale } = usePrefs();
  const toast = useToast();
  const { user } = useSession();
  const guard = useGuard();
  const state = useCommunityState();
  const [purchases] = useLocal<Purchase[]>(keys.purchases, []);
  const [stars, setStars] = useState(5);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [files, setFiles] = useState<Attachment[]>([]);
  const [filter, setFilter] = useState<'all' | 'media' | 1 | 2 | 3 | 4 | 5>('all');
  const [sort, setSort] = useState<'new' | 'helpful' | 'high' | 'low'>('helpful');
  const reviews = (state?.reviews ?? []).filter((r) => r.productId === item.id);
  const hist = [5, 4, 3, 2, 1].map((s) => reviews.filter((r) => r.stars === s).length);
  const avg = reviews.length ? reviews.reduce((s, r) => s + r.stars, 0) / reviews.length : 0;
  const shown = reviews
    .filter((r) => (filter === 'all' ? true : filter === 'media' ? r.attachments.length > 0 : r.stars === filter))
    .sort((a, b) => (sort === 'new' ? b.at.localeCompare(a.at) : sort === 'helpful' ? b.helpful.length - a.helpful.length : sort === 'high' ? b.stars - a.stars : a.stars - b.stars));
  const meId = guard.meId;
  const already = meId ? reviews.some((r) => r.authorId === meId) : false;

  async function submit() {
    if (text.trim().length < 10) return toast(tr('اكتب 10 حروف على الأقل', 'Write at least 10 characters'), 'error');
    const v = await guard.check(`${title}\n${text}`, files, 'review');
    if (!v.ok || !user) return;
    const s = readCommunity();
    if (!s) return;
    const m = ensureMember(s, user);
    const r: Review = { id: crypto.randomUUID(), productId: item.id, authorId: m.id, stars, title: title.trim(), text: text.trim(), attachments: files, at: new Date().toISOString(), helpful: [], verified: purchases.some((p) => p.productId === item.id) };
    s.reviews.unshift(r);
    grantXp(s, m.id, XP.review + (files.length ? XP.reviewMedia : 0), 'تقييم منتج');
    grantBadge(s, m.id, 'reviewer');
    if (files.some((f) => f.kind === 'image' || f.kind === 'video')) grantBadge(s, m.id, 'photographer');
    writeCommunity(s);
    setTitle(''); setText(''); setFiles([]); setStars(5);
    toast(tr(`اتنشر تقييمك! +${XP.review + (files.length ? XP.reviewMedia : 0)} XP ⭐`, 'Review posted! ⭐'));
  }

  return (
    <section id="reviews" className="space-y-4">
      {guard.dialog}
      <h2 className="text-xl font-bold">{tr('التقييمات', 'Ratings & reviews')}</h2>
      <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr] [&>*]:min-w-0">
        <div className="space-y-3">
          {(media?.ratings ?? []).length ? (
            <Card>
              <p className="text-sm font-bold">{tr('تقييمات المتاجر (حقيقية)', 'Store ratings (real)')}</p>
              {(media?.ratings ?? []).map((r) => (
                <a key={r.store} href={r.url} target="_blank" rel="noreferrer" className="mt-2 flex items-center justify-between rounded-xl bg-accent px-3 py-2 text-sm hover:bg-primary/10">
                  <span>{storeLabel(r.store, locale)}</span>
                  <span className="flex items-center gap-1"><Stars value={r.value} /><span className="num font-bold">{r.value}</span>{r.count ? <span className="text-xs text-muted">({r.count})</span> : null}<ExternalLink className="h-3 w-3" /></span>
                </a>
              ))}
              <p className="mt-2 text-[11px] text-muted">{tr('من بيانات JSON-LD في صفحة المتجر نفسه.', 'From the store page’s own JSON-LD.')}</p>
            </Card>
          ) : null}
          <Card>
            <p className="text-sm font-bold">{tr('تقييمات أعضاء صفقة', 'Safqa member reviews')}</p>
            <div className="mt-2 flex items-center gap-3">
              <p className="num text-4xl font-bold">{reviews.length ? avg.toFixed(1) : '—'}</p>
              <div><Stars value={avg} /><p className="text-xs text-muted">{reviews.length} {tr('تقييم', 'reviews')}</p></div>
            </div>
            <div className="mt-3 space-y-1">
              {hist.map((c, k) => (
                <button key={5 - k} type="button" onClick={() => setFilter((5 - k) as 1)} className="flex w-full items-center gap-2 text-xs">
                  <span className="w-8 text-start">{5 - k}★</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-accent"><span className="bar-grow block h-full rounded-full bg-[var(--saffron)]" style={{ width: `${reviews.length ? (c / reviews.length) * 100 : 0}%` }} /></span>
                  <span className="num w-6">{c}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted">{tr('التقييمات بتتحفظ على جهازك في النسخة التجريبية الثابتة — مفيش سيرفر بيجمعها.', 'Reviews are stored on this device in the static demo — no server collects them.')}</p>
          </Card>
        </div>
        <Card>
          {already ? <p className="text-sm text-muted">{tr('إنت قيّمت المنتج ده قبل كده — شكرًا! 🙏', 'You already reviewed this product — thanks! 🙏')}</p> : (
            <div className="space-y-2">
              <p className="font-bold">{tr('اكتب تقييمك', 'Write a review')}</p>
              <div className="flex gap-1" role="radiogroup" aria-label={tr('النجوم', 'Stars')}>
                {[1, 2, 3, 4, 5].map((s) => <button key={s} type="button" onClick={() => setStars(s)} aria-checked={stars === s} role="radio" className="transition hover:scale-125"><Star className={`h-7 w-7 ${s <= stars ? 'fill-[var(--saffron)] text-[var(--saffron)]' : 'text-muted'}`} /></button>)}
              </div>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tr('عنوان قصير', 'Short title')} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm" maxLength={80} />
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder={tr('جرّبته؟ قول رأيك بصراحة (بدون شتيمة أو بيانات شخصية)', 'Tried it? Be honest (no profanity or personal data)')} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" maxLength={3000} />
              <Uploader value={files} onChange={setFiles} />
              <Button onClick={() => void submit()}><Camera className="h-4 w-4" />{tr('انشر التقييم', 'Post review')}</Button>
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs">
            {(['all', 'media', 5, 4, 3, 2, 1] as const).map((f) => <button key={String(f)} type="button" onClick={() => setFilter(f)} className={`rounded-full px-2.5 py-1 ${filter === f ? 'bg-primary text-primary-foreground' : 'bg-accent'}`}>{f === 'all' ? tr('الكل', 'All') : f === 'media' ? tr('بصور/فيديو', 'With media') : `${f}★`}</button>)}
            <select value={sort} onChange={(e) => setSort(e.target.value as 'new')} className="ms-auto h-7 rounded-full border border-border bg-card px-2">
              <option value="helpful">{tr('الأكثر إفادة', 'Most helpful')}</option>
              <option value="new">{tr('الأحدث', 'Newest')}</option>
              <option value="high">{tr('الأعلى', 'Highest')}</option>
              <option value="low">{tr('الأقل', 'Lowest')}</option>
            </select>
          </div>
          <div className="mt-3 space-y-3">
            {shown.length === 0 ? <p className="py-6 text-center text-sm text-muted">{tr('لسه مفيش تقييمات من أعضاء صفقة — كن أول واحد ✍️', 'No member reviews yet — be the first ✍️')}</p> : null}
            {shown.map((r) => {
              const m = state?.members[r.authorId];
              const mine = meId ? r.helpful.includes(meId) : false;
              return (
                <article key={r.id} className="rounded-2xl border border-border p-3">
                  <div className="flex items-center gap-2"><MemberAvatar m={m} size={32} /><MemberName m={m} /><span className="ms-auto text-[11px] text-muted">{timeAgo(r.at, locale)}</span></div>
                  <div className="mt-2 flex items-center gap-2"><Stars value={r.stars} />{r.title ? <p className="font-semibold">{r.title}</p> : null}{r.verified ? <span className="inline-flex items-center gap-1 rounded-full bg-[var(--palm)]/15 px-2 py-0.5 text-[10px] font-bold text-palm"><BadgeCheck className="h-3 w-3" />{tr('سجّل إنه اشتراه', 'Logged purchase')}</span> : null}</div>
                  <p className="mt-1 whitespace-pre-line text-sm leading-7">{r.text}</p>
                  <Attachments items={r.attachments} size={80} />
                  <button type="button" disabled={!meId || r.authorId === meId} onClick={() => { const s = readCommunity(); const x = s?.reviews.find((y) => y.id === r.id); if (!s || !x || !meId) return; x.helpful = mine ? x.helpful.filter((h) => h !== meId) : [...x.helpful, meId]; if (!mine) grantXp(s, x.authorId, XP.reactionReceived, 'تقييمه مفيد'); writeCommunity(s); }} className={`mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${mine ? 'bg-primary/20' : 'bg-accent'}`}><ThumbsUp className="h-3.5 w-3.5" />{tr('مفيد', 'Helpful')} <span className="num">{r.helpful.length}</span></button>
                </article>
              );
            })}
          </div>
        </Card>
      </div>
    </section>
  );
}

export function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex" aria-label={`${value.toFixed(1)}/5`}>
      {[1, 2, 3, 4, 5].map((s) => <Star key={s} className={`h-4 w-4 ${value >= s - 0.25 ? 'fill-[var(--saffron)] text-[var(--saffron)]' : value >= s - 0.75 ? 'fill-[var(--saffron)]/50 text-[var(--saffron)]' : 'text-muted'}`} />)}
    </span>
  );
}

// ---------------------------------------------------------------- Q&A
export function QASection({ item, media }: { item: ProductDetail; media: ProductMedia | null | undefined }) {
  const tr = useTr();
  const { locale } = usePrefs();
  const toast = useToast();
  const { user } = useSession();
  const guard = useGuard();
  const state = useCommunityState();
  const qs = (state?.questions ?? []).filter((q) => q.productId === item.id);
  const hala = agentById(item.category?.slug === 'appliances' ? 'abuali' : 'hala');
  const suggestions = [tr('البطارية قد إيه؟', 'How big is the battery?'), tr('فيه ضمان؟', 'Is there a warranty?'), tr('الشاشة مقاسها كام؟', 'Screen size?'), tr('أرخص سعر فين؟', 'Where is it cheapest?')];
  const [preview, setPreview] = useState('');
  const instant = preview.trim().length > 3 ? answerFromSpecs(preview, item, media) : null;

  async function ask(text: string) {
    const v = await guard.check(text, [], 'qa');
    if (!v.ok || !user) return false;
    const s = readCommunity();
    if (!s) return false;
    const m = ensureMember(s, user);
    const auto = answerFromSpecs(text, item, media);
    s.questions.unshift({ id: crypto.randomUUID(), productId: item.id, authorId: m.id, text, at: new Date().toISOString(), answers: [{ id: crypto.randomUUID(), authorId: `agent:${hala?.id ?? 'hala'}`, text: auto.ar, at: new Date().toISOString(), votes: [], fromSpecs: auto.found }] });
    grantXp(s, m.id, XP.question, 'سؤال عن منتج');
    writeCommunity(s);
    toast(tr('اتنشر سؤالك وجالك رد من الوكيل 🤖', 'Question posted with an agent answer 🤖'));
    setPreview('');
    return true;
  }
  async function answer(qid: string, text: string) {
    const v = await guard.check(text, [], 'qa');
    if (!v.ok || !user) return false;
    const s = readCommunity();
    const q = s?.questions.find((x) => x.id === qid);
    if (!s || !q) return false;
    const m = ensureMember(s, user);
    q.answers.push({ id: crypto.randomUUID(), authorId: m.id, text, at: new Date().toISOString(), votes: [] });
    grantXp(s, m.id, XP.answer, 'إجابة سؤال');
    grantBadge(s, m.id, 'helper');
    writeCommunity(s);
    return true;
  }

  return (
    <section id="qa" className="space-y-3">
      {guard.dialog}
      <h2 className="flex items-center gap-2 text-xl font-bold"><MessageCircleQuestion className="h-5 w-5 text-primary" />{tr('أسئلة وأجوبة', 'Questions & answers')}</h2>
      <Card>
        <div className="flex flex-wrap gap-1.5">{suggestions.map((s) => <button key={s} type="button" onClick={() => setPreview(s)} className="rounded-full bg-accent px-2.5 py-1 text-xs hover:bg-primary/15">{s}</button>)}</div>
        <div className="mt-3">
          <input value={preview} onChange={(e) => setPreview(e.target.value)} placeholder={tr('اسأل عن المنتج — هتلاقي إجابة فورية من المواصفات', 'Ask about this product — instant answer from the specs')} className="h-11 w-full rounded-2xl border border-border bg-background px-3 text-sm" />
          {instant ? (
            <div className="mt-2 flex items-start gap-2 rounded-2xl bg-primary/10 p-3 text-sm">
              {hala ? <AgentAvatar agent={hala} size={32} /> : <Bot className="h-5 w-5" />}
              <div className="flex-1"><p className="text-xs font-bold">{hala?.name} · {tr('إجابة فورية', 'Instant answer')}</p><p className="mt-0.5">{locale === 'ar' ? instant.ar : instant.en}</p></div>
              <Button size="sm" onClick={() => void ask(preview.trim())}>{tr('انشر السؤال', 'Post question')}</Button>
            </div>
          ) : null}
        </div>
      </Card>
      {qs.map((q) => (
        <Card key={q.id}>
          <div className="flex items-center gap-2 text-sm"><MemberAvatar m={state?.members[q.authorId]} size={26} /><span className="font-bold">س:</span> {q.text}<span className="ms-auto text-[11px] text-muted">{timeAgo(q.at, locale)}</span></div>
          <div className="mt-2 space-y-2 border-s-2 border-primary/30 ps-3">
            {q.answers.map((a) => (
              <div key={a.id} className="text-sm">
                <div className="flex items-center gap-2"><MemberAvatar m={state?.members[a.authorId]} size={22} /><MemberName m={state?.members[a.authorId]} showRank={false} />{a.fromSpecs ? <span className="rounded-full bg-[var(--palm)]/15 px-2 text-[10px] font-bold text-palm">{tr('من المواصفات', 'From specs')}</span> : null}</div>
                <p className="mt-0.5 ps-8">{a.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-2"><Composer compact allowFiles={false} placeholder={tr('جاوب السؤال…', 'Answer…')} onSubmit={(t) => answer(q.id, t)} /></div>
        </Card>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------- Related rows, recently viewed, spec diff
export function ProductRow({ title, items }: { title: string; items: ProductCard[] }) {
  const { locale } = usePrefs();
  if (!items.length) return null;
  return (
    <section>
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      <div className="flex snap-x gap-3 overflow-x-auto pb-2">
        {items.map((p, k) => (
          <Link key={p.id} to="/product/$id" params={{ id: p.id }} className="lift group w-44 flex-none snap-start rounded-2xl border border-border bg-card p-2">
            <ProductThumb id={p.id} slug={p.category?.slug} className="h-28" seed={k} />
            <p className="mt-2 line-clamp-2 text-xs font-semibold">{localized(locale, { ar: p.titleAr, en: p.titleEn })}</p>
            <p className="num mt-1 text-sm font-bold">{p.lowestPriceEgp ? formatEGP(p.lowestPriceEgp, locale) : '—'}</p>
            {p.bestOffer?.discountPct && !p.bestOffer.fakeDiscount ? <span className="text-[10px] font-bold text-palm">-{Math.round(p.bestOffer.discountPct)}%</span> : null}
          </Link>
        ))}
      </div>
    </section>
  );
}

export function useRelated(item: ProductDetail | undefined, all: ProductCard[]) {
  const [activity] = useActivity();
  return useMemo(() => {
    if (!item) return { same: [], similar: [], brand: [], recent: [] };
    const price = item.lowestPriceEgp ?? 0;
    const others = all.filter((p) => p.id !== item.id && p.bestOffer);
    const same = others.filter((p) => p.category?.slug === item.category?.slug).sort((a, b) => Math.abs((a.lowestPriceEgp ?? 0) - price) - Math.abs((b.lowestPriceEgp ?? 0) - price));
    const similar = others.filter((p) => p.lowestPriceEgp && Math.abs(p.lowestPriceEgp - price) / Math.max(1, price) < 0.35 && p.category?.slug !== item.category?.slug);
    const brand = others.filter((p) => p.brand && p.brand === item.brand);
    const recent = activity.views.map((v) => all.find((p) => p.id === v.id)).filter((p): p is ProductCard => Boolean(p) && p?.id !== item.id).slice(0, 10);
    return { same: same.slice(0, 10), similar: similar.slice(0, 10), brand: brand.slice(0, 10), recent };
  }, [item, all, activity.views]);
}

export function SpecDiff({ item, media, rivals, loadMedia }: { item: ProductDetail; media: ProductMedia | null | undefined; rivals: ProductCard[]; loadMedia: (id: string) => Promise<{ detail: ProductDetail | null; media: ProductMedia | null }> }) {
  const tr = useTr();
  const { locale } = usePrefs();
  const [picked, setRid] = useState('');
  // Rivals arrive after the catalog loads, so default to the first one lazily.
  const rid = picked || rivals[0]?.id || '';
  const [rival, setRival] = useState<{ detail: ProductDetail | null; media: ProductMedia | null } | null>(null);
  useEffect(() => { if (rid) void loadMedia(rid).then(setRival); }, [rid, loadMedia]);
  if (!rivals.length) return null;
  const a = canonical(item, media);
  const b = rival?.detail ? canonical(rival.detail, rival.media) : {};
  const rows = canonLabels.filter((l) => a[l.key] != null || (b as Record<string, unknown>)[l.key] != null);
  const win = (l: (typeof canonLabels)[number], x: unknown, y: unknown) => (l.better && typeof x === 'number' && typeof y === 'number' && x !== y ? ((l.better === 'high' ? x > y : x < y) ? 'a' : 'b') : null);
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{tr('فرق المواصفات', 'Spec diff')}</h2>
        <select value={rid} onChange={(e) => setRid(e.target.value)} className="h-9 max-w-xs rounded-full border border-border bg-card px-3 text-sm">
          {rivals.map((r) => <option key={r.id} value={r.id}>{localized(locale, { ar: r.titleAr, en: r.titleEn })}</option>)}
        </select>
      </div>
      <table className="mt-3 w-full text-sm">
        <thead><tr className="text-xs text-muted"><th className="py-1 text-start">{tr('المواصفة', 'Spec')}</th><th className="py-1 text-start">{tr('ده', 'This')}</th><th className="py-1 text-start">{tr('المنافس', 'Rival')}</th></tr></thead>
        <tbody>
          <tr className="border-t border-border"><td className="py-1.5 font-semibold">{tr('السعر', 'Price')}</td><td className="num py-1.5">{formatEGP(item.lowestPriceEgp ?? 0, locale)}</td><td className="num py-1.5">{rival?.detail ? formatEGP(rival.detail.lowestPriceEgp ?? 0, locale) : '…'}</td></tr>
          {rows.map((l) => {
            const x = a[l.key];
            const y = (b as Record<string, unknown>)[l.key];
            const w = win(l, x, y);
            const f = (v: unknown) => (v == null ? '—' : v === true ? '✓' : String(v));
            return <tr key={l.key} className="border-t border-border"><td className="py-1.5 font-semibold">{locale === 'ar' ? l.ar : l.en}</td><td className={`num py-1.5 ${w === 'a' ? 'font-bold text-palm' : ''}`}>{f(x)}{w === 'a' ? ' ▲' : ''}</td><td className={`num py-1.5 ${w === 'b' ? 'font-bold text-palm' : ''}`}>{f(y)}{w === 'b' ? ' ▲' : ''}</td></tr>;
          })}
        </tbody>
      </table>
      <Link to="/compare" search={{ ids: [item.id, rid].join(',') }} className="mt-3 inline-block text-sm font-semibold text-primary">{tr('مقارنة كاملة ←', 'Full comparison →')}</Link>
    </Card>
  );
}

// ---------------------------------------------------------------- Price badges, tabs, sticky bar
export function PriceBadges({ item, history }: { item: ProductDetail; history: PriceHistory | undefined }) {
  const tr = useTr();
  const b = item.bestOffer;
  if (!b) return null;
  const pts = (history?.series ?? []).flatMap((s) => s.points);
  const all = pts.map((p) => p.priceEgp);
  const min = all.length ? Math.min(...all) : null;
  const days = new Set(pts.map((p) => p.t.slice(0, 10))).size;
  const prev = (history?.series ?? []).map((s) => s.points.at(-2)?.priceEgp).filter((v): v is number => typeof v === 'number');
  const before = prev.length ? Math.min(...prev) : null;
  const badges: { t: string; c: string }[] = [];
  if (before && b.priceEgp < before) badges.push({ t: tr(`⬇ نزل ${Math.round(((before - b.priceEgp) / before) * 100)}% من آخر تحديث`, `⬇ ${Math.round(((before - b.priceEgp) / before) * 100)}% since last update`), c: 'bg-[var(--palm)] text-white' });
  if (before && b.priceEgp > before) badges.push({ t: tr(`⬆ زاد ${Math.round(((b.priceEgp - before) / before) * 100)}% من آخر تحديث`, `⬆ up since last update`), c: 'bg-destructive text-white' });
  if (min != null && b.priceEgp <= min && days >= 3) badges.push({ t: tr('🏆 أقل سعر سجلناه', '🏆 Lowest recorded'), c: 'bg-primary text-primary-foreground' });
  if (b.fakeDiscount) badges.push({ t: tr('⚠️ خصم مشبوه', '⚠️ Suspicious discount'), c: 'bg-destructive text-white' });
  if (b.discountPct && !b.fakeDiscount) badges.push({ t: tr(`✔ خصم ${Math.round(b.discountPct)}% مُتحقق منه`, `✔ ${Math.round(b.discountPct)}% verified discount`), c: 'bg-[var(--palm)]/15 text-palm' });
  if (!b.inStock) badges.push({ t: tr('غير متوفر', 'Out of stock'), c: 'bg-accent text-muted' });
  if (item.offers.length > 1) badges.push({ t: tr(`${item.offers.length} متاجر`, `${item.offers.length} stores`), c: 'bg-accent' });
  return <div className="mt-3 flex flex-wrap gap-1.5">{badges.map((x) => <span key={x.t} className={`rounded-full px-2.5 py-1 text-xs font-bold ${x.c}`}>{x.t}</span>)}</div>;
}

export function SectionTabs({ sections }: { sections: [string, string][] }) {
  const [active, setActive] = useState(sections[0]?.[0]);
  useEffect(() => {
    const obs = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) setActive(e.target.id); }, { rootMargin: '-40% 0px -55% 0px' });
    for (const [id] of sections) { const el = document.getElementById(id); if (el) obs.observe(el); }
    return () => obs.disconnect();
  }, [sections]);
  return (
    <nav className="no-print sticky top-16 z-30 -mx-2 overflow-x-auto rounded-full border border-border bg-card/90 p-1 shadow-sm backdrop-blur" aria-label="sections">
      <div className="flex gap-1">
        {sections.map(([id, label]) => <a key={id} href={`#${id}`} onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition ${active === id ? 'bg-primary text-primary-foreground' : 'text-muted hover:text-foreground'}`}>{label}</a>)}
      </div>
    </nav>
  );
}

export function StickyBuyBar({ item, title }: { item: ProductDetail; title: string }) {
  const tr = useTr();
  const { locale } = usePrefs();
  const [show, setShow] = useState(false);
  useEffect(() => {
    const f = () => setShow(window.scrollY > 700);
    f();
    window.addEventListener('scroll', f, { passive: true });
    return () => window.removeEventListener('scroll', f);
  }, []);
  const b = item.bestOffer;
  if (!b || !show) return null;
  return (
    <div className="no-print page-enter fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 p-3 shadow-2xl backdrop-blur md:bottom-4 md:mx-auto md:max-w-3xl md:rounded-full md:border">
      <div className="flex items-center gap-3">
        <ProductThumb id={item.id} slug={item.category?.slug} className="h-10 w-10 flex-none" />
        <p className="line-clamp-1 flex-1 text-sm font-semibold">{title}</p>
        <p className="num font-bold">{formatEGP(b.priceEgp, locale)}</p>
        <a href={b.url} target="_blank" rel="noreferrer"><Button size="sm">{tr('روح للمتجر', 'Go to store')} <ExternalLink className="h-3.5 w-3.5" /></Button></a>
      </div>
    </div>
  );
}

export function DemoNote({ children }: { children: React.ReactNode }) {
  return <p className="flex items-center gap-1.5 text-[11px] text-muted"><FlaskConical className="h-3 w-3" />{children}</p>;
}
export { RuleChip };
