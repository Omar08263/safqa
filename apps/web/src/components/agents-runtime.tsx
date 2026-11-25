// Client-side scheduler for the agent teams. Runs while the site is open:
// - deal hunters + notifications: detect REAL drops / lows / fake discounts
//   from the snapshot's price history; animated toast + banner for exceptional
//   ones; browser notification when the visitor opted in.
// - legal: decide pending appeals (Judge Salma).
// - deal hunters: post one "deal of the day" per day to the community, from real data.
// - ops: log the real crawl status.
import type { PriceHistory, ProductCard } from '@safqa/shared';
import { useQueries } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { confetti } from '../fx/fx';
import { agentById, type Signals } from '../lib/agents';
import { logAgent } from '../lib/agent-log';
import { readCommunity, writeCommunity } from '../lib/community';
import { type DealSignal, signalsFrom } from '../lib/deal-signals';
import { readLocal, useLocal, writeLocal } from '../lib/local';
import { loadMod, processAppeals } from '../lib/moderation';
import { useSession } from '../lib/session';
import { useTr } from '../lib/tr';
import { useCatalog } from '../lib/catalog';
import { usePriceStatus } from './price-freshness';
import { AgentAvatar } from './agent-avatar';

export const NOTIFY_PREFS_KEY = 'safqa.notify.prefs.v1';
export interface NotifyPrefs { browser: boolean; toasts: boolean; minPct: number; categories: string[]; quietHours: [number, number] | null; email?: { address: string; at: string; status: 'local' | 'requested' } }
export const defaultNotifyPrefs: NotifyPrefs = { browser: false, toasts: true, minPct: 3, categories: [], quietHours: [23, 8] };
const SEEN_KEY = 'safqa.notify.seen.v1';
export const FEED_KEY = 'safqa.notify.feed.v1';

export function useDealSignals() {
  const catalog = useCatalog();
  const { client } = useSession();
  const items = (catalog.data?.items ?? []) as ProductCard[];
  const histories = useQueries({ queries: items.map((p) => ({ queryKey: ['history', p.id], queryFn: () => client.history(p.id), staleTime: 10 * 60_000 })) });
  const ready = items.length > 0 && histories.every((h) => !h.isLoading);
  const map: Record<string, PriceHistory | undefined> = {};
  items.forEach((p, i) => { map[p.id] = histories[i]?.data; });
  const key = histories.map((h) => h.dataUpdatedAt).join(',');
  // biome-ignore lint/correctness/useExhaustiveDependencies: recompute when any history changes
  const signals = useMemo(() => (ready ? signalsFrom(items, map) : []), [ready, items, key]);
  return { signals, items, histories: map, ready };
}

export function useSignals(): Signals {
  const status = usePriceStatus();
  const { signals, items } = useDealSignals();
  const mod = loadMod();
  const s = readCommunity();
  const hourAgo = Date.now() - 3600_000;
  const msgs = Object.values(s?.messages ?? {}).flat().filter((m) => Date.parse(m.at) > hourAgo).length;
  return {
    dropsToday: signals.filter((x) => x.kind === 'drop').length,
    fakeFlags: items.filter((p) => p.bestOffer?.fakeDiscount).length,
    storeFailures: status.data?.offersFailed ?? 0,
    violationsHour: mod.penalties.filter((p) => Date.parse(p.at) > hourAgo).length,
    pendingAppeals: mod.penalties.filter((p) => p.appeal?.status === 'pending').length,
    newMembers: Object.values(s?.members ?? {}).filter((m) => !m.demo && !m.agent && Date.parse(m.joinedAt) > Date.now() - 86_400_000).length,
    chatMessagesHour: msgs,
    productsLive: items.length,
    hoursSinceRefresh: status.data?.updatedAt ? (Date.now() - Date.parse(status.data.updatedAt)) / 3600_000 : 0,
  };
}

function inQuiet(q: [number, number] | null) {
  if (!q) return false;
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', hour12: false }).format(new Date())) % 24;
  return q[0] > q[1] ? h >= q[0] || h < q[1] : h >= q[0] && h < q[1];
}

export async function showBrowserNotification(title: string, body: string, url: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker?.getRegistration?.();
  const opts: NotificationOptions = { body, icon: '/brand/icon-192.png', badge: '/brand/icon-64.png', tag: url, data: { url } };
  if (reg) await reg.showNotification(title, opts);
  else new Notification(title, opts);
  return true;
}

export function AgentsRuntime() {
  const tr = useTr();
  const { signals, items, ready } = useDealSignals();
  const status = usePriceStatus();
  const [prefs] = useLocal<NotifyPrefs>(NOTIFY_PREFS_KEY, defaultNotifyPrefs);
  const [banner, setBanner] = useState<DealSignal | null>(null);

  // Appeals + ops log on a schedule.
  useEffect(() => {
    const tick = () => {
      const before = loadMod().penalties.filter((p) => p.appeal?.status === 'pending').map((p) => p.id);
      if (processAppeals()) {
        for (const p of loadMod().penalties.filter((x) => before.includes(x.id) && x.appeal?.status !== 'pending'))
          logAgent({ id: `appeal:${p.id}`, agentId: 'salma', kind: 'appeal', ar: `حكمت في تظلم ${p.memberName}: ${p.appeal?.status === 'accepted' ? 'مقبول ✅' : 'مرفوض ❌'} — ${p.appeal?.decisionAr ?? ''}`, en: `Ruled on ${p.memberName}'s appeal: ${p.appeal?.status}` });
      }
    };
    tick();
    const t = setInterval(tick, 10_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const st = status.data;
    if (!st?.updatedAt) return;
    logAgent({ id: `ops:${st.updatedAt}`, agentId: 'adel', kind: 'ops', at: st.updatedAt, ar: `خلص سحب الأسعار: ${st.productsWithPrice ?? 0} منتج بسعر حقيقي، ${st.offersUpdated ?? 0} عرض اتحدث، ${st.offersFailed ?? 0} صفحة رفضت (من غير تنكّر).`, en: `Crawl done: ${st.productsWithPrice ?? 0} products priced, ${st.offersUpdated ?? 0} offers updated, ${st.offersFailed ?? 0} refused.` });
    for (const [store, n] of Object.entries(st.perStore ?? {})) if (n.failed > 0 && n.ok === 0) logAgent({ id: `ops:${st.updatedAt}:${store}`, agentId: 'dalia', kind: 'ops', at: st.updatedAt, ar: `${store}: كل الصفحات (${n.failed}) رفضت البوت الصريح بتاعنا — بنحتفظ بآخر سعر سليم ونعلّمه قديم.`, en: `${store}: all ${n.failed} pages refused our honest bot — kept last good price, marked stale.` });
  }, [status.data]);

  // Deal of the day (once per Cairo day) from real data.
  useEffect(() => {
    if (!ready || !items.length) return;
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
    const s = readCommunity();
    if (!s || s.posts.some((p) => p.id === `deal-${day}`)) return;
    const top = signals.find((x) => x.kind === 'drop') ?? null;
    const best = [...items].filter((p) => p.bestOffer && !p.bestOffer.fakeDiscount && p.bestOffer.inStock).sort((a, b) => (b.bestOffer?.dealScore ?? 0) - (a.bestOffer?.dealScore ?? 0))[0];
    const text = top
      ? `🎯 صفقة اليوم من صقر: ${top.headline}\n${top.body}`
      : best
        ? `🎯 صفقة اليوم من صقر: ${best.titleAr} بـ ${Math.round(best.bestOffer?.priceEgp ?? 0).toLocaleString('en-US')} ج في ${best.bestOffer?.store.nameAr} — أعلى درجة صفقة النهارده (${best.bestOffer?.dealScore}/100). مفيش تخفيض كبير حقيقي في آخر تحديث، فمش هنبالغ 😉`
        : null;
    if (!text) return;
    s.posts.unshift({ id: `deal-${day}`, authorId: 'agent:saqr', groupId: 'general', text, attachments: [], productId: top?.productId ?? best?.id, at: new Date().toISOString(), reactions: {}, comments: [], kind: 'deal', pinned: false });
    writeCommunity(s);
    logAgent({ id: `deal:${day}`, agentId: 'saqr', kind: 'deal', ar: `نشر صفقة اليوم في المجتمع: ${top?.title ?? best?.titleAr}`, en: `Posted the deal of the day: ${top?.titleEn ?? best?.titleEn}` });
  }, [ready, items, signals]);

  // Notifications engine.
  useEffect(() => {
    if (!ready) return;
    const run = () => {
      const seen = readLocal<string[]>(SEEN_KEY, []);
      const fresh = signals.filter((x) => !seen.includes(x.id) && (x.pct ?? 100) >= prefs.minPct && (!prefs.categories.length || prefs.categories.includes(items.find((p) => p.id === x.productId)?.category?.slug ?? '')));
      if (!fresh.length) return;
      writeLocal(SEEN_KEY, [...seen, ...fresh.map((x) => x.id)].slice(-500));
      const feed = readLocal<(DealSignal & { deliveredAt: string; via: string[] })[]>(FEED_KEY, []);
      const quiet = inQuiet(prefs.quietHours);
      const delivered = fresh.map((x) => ({ ...x, deliveredAt: new Date().toISOString(), via: [prefs.toasts ? 'banner' : '', prefs.browser && !quiet ? 'browser' : ''].filter(Boolean) }));
      writeLocal(FEED_KEY, [...delivered, ...feed].slice(0, 200));
      const star = fresh.find((x) => x.exceptional) ?? fresh[0];
      if (star && prefs.toasts) {
        setBanner(star);
        if (star.exceptional) setTimeout(() => confetti({ x: window.innerWidth / 2, y: 120, count: 120 }), 300);
      }
      if (prefs.browser && !quiet) for (const x of fresh.slice(0, 3)) void showBrowserNotification(x.headline, x.body, `/product/${x.productId}`);
      for (const x of fresh.slice(0, 5)) logAgent({ id: `notify:${x.id}`, agentId: x.exceptional ? 'barq' : 'jaras', kind: 'notify', ar: `بعت تنبيه: ${x.headline}`, en: `Sent alert: ${x.headlineEn}` });
    };
    run();
    const t = setInterval(run, 10 * 60_000);
    return () => clearInterval(t);
  }, [ready, signals, prefs, items]);

  if (!banner) return null;
  const agent = agentById(banner.exceptional ? 'barq' : 'jaras');
  return (
    <div className="no-print fixed inset-x-0 top-20 z-[70] mx-auto w-[min(92vw,640px)]" role="status">
      <div className={`page-enter relative overflow-hidden rounded-3xl border p-4 shadow-2xl backdrop-blur ${banner.exceptional ? 'border-primary bg-gradient-to-r from-primary/30 via-card/95 to-[var(--palm)]/25' : 'border-border bg-card/95'}`}>
        {banner.exceptional ? <span className="shine absolute inset-0" aria-hidden /> : null}
        <div className="relative flex items-start gap-3">
          {agent ? <AgentAvatar agent={agent} mood="excited" size={52} /> : null}
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 text-[11px] font-bold text-primary"><Sparkles className="h-3 w-3" />{agent?.name} · {tr('تنبيه من بيانات حقيقية', 'Alert from real data')}</p>
            <p className="mt-0.5 font-bold leading-6">{banner.headline}</p>
            <p className="text-xs text-muted">{banner.body}</p>
            <Link to="/product/$id" params={{ id: banner.productId }} onClick={() => setBanner(null)} className="mt-2 inline-block rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">{tr('شوف العرض', 'See the deal')}</Link>
          </div>
          <button type="button" onClick={() => setBanner(null)} aria-label={tr('قفل', 'Close')} className="text-muted"><X className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );
}
