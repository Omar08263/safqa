import { ChannelsCard, WhatsAppButton } from '../components/social';
import { appUrl } from '../components/share';
import { useCatalog as useCatalogQ } from '../lib/catalog';
import { formatEGP } from '@safqa/shared';
import { Link } from '@tanstack/react-router';
import { BellRing, Mail, Moon, Radar, Send, Sparkles, Zap } from 'lucide-react';
import { useState } from 'react';
import { AgentAvatar } from '../components/agent-avatar';
import { defaultNotifyPrefs, FEED_KEY, NOTIFY_PREFS_KEY, type NotifyPrefs, showBrowserNotification, useDealSignals } from '../components/agents-runtime';
import { PriceFreshness } from '../components/price-freshness';
import { Button } from '../components/ui/button';
import { ProductThumb } from '../features/visuals';
import { Card, confetti, PageHeader, Reveal, useToast } from '../fx/fx';
import { agentById } from '../lib/agents';
import type { DealSignal } from '../lib/deal-signals';
import { gapSignal } from '../lib/deal-signals';
import { useLocal } from '../lib/local';
import { usePrefs } from '../lib/prefs';
import { useTr } from '../lib/tr';
import { useQueries } from '@tanstack/react-query';
import { useSession } from '../lib/session';
import { timeAgo } from '../components/community-kit';

const DIGEST_INBOX = 'rxcc@agentmail.to';
const kindLabel: Record<DealSignal['kind'], [string, string, string]> = {
  drop: ['تخفيض حقيقي', 'Real drop', 'bg-[var(--palm)] text-white'],
  all_time_low: ['أقل سعر سجلناه', 'Lowest recorded', 'bg-primary text-primary-foreground'],
  fake_discount: ['خصم مشبوه', 'Suspicious discount', 'bg-destructive text-white'],
  cheapest_store_gap: ['فرق بين المتاجر', 'Store gap', 'bg-sky-600 text-white'],
  back_in_stock: ['رجع متوفر', 'Back in stock', 'bg-violet-600 text-white'],
};

export function RadarPage() {
  const catalogQ = useCatalogQ();
  const tr = useTr();
  const { locale } = usePrefs();
  const toast = useToast();
  const { client } = useSession();
  const { signals, items, ready } = useDealSignals();
  const details = useQueries({ queries: items.map((p) => ({ queryKey: ['product', p.id], queryFn: () => client.product(p.id), staleTime: 10 * 60_000 })) });
  const gaps = details.map((d) => (d.data ? gapSignal(d.data) : null)).filter((x): x is DealSignal => Boolean(x));
  const all = [...signals, ...gaps].sort((a, b) => Number(b.exceptional) - Number(a.exceptional) || (b.pct ?? 0) - (a.pct ?? 0));
  const [prefs, setPrefs] = useLocal<NotifyPrefs>(NOTIFY_PREFS_KEY, defaultNotifyPrefs);
  const [feed] = useLocal<(DealSignal & { deliveredAt: string; via: string[] })[]>(FEED_KEY, []);
  const [filter, setFilter] = useState<DealSignal['kind'] | 'all'>('all');
  const [email, setEmail] = useState(prefs.email?.address ?? '');
  const [consent, setConsent] = useState(false);
  const perm = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
  const shown = all.filter((x) => filter === 'all' || x.kind === filter);
  const barq = agentById('barq');
  const hamsa = agentById('hamsa');

  async function enableBrowser() {
    if (typeof Notification === 'undefined') return toast(tr('المتصفح ده مش بيدعم الإشعارات', 'This browser does not support notifications'), 'error');
    const p = await Notification.requestPermission();
    if (p === 'granted') {
      setPrefs({ ...prefs, browser: true });
      await showBrowserNotification(tr('🔔 إشعارات صفقة اشتغلت', '🔔 Safqa alerts are on'), tr('هنبعتلك بس التخفيضات الحقيقية — من غير إزعاج.', 'Only real drops — no spam.'), '/#/radar');
      toast(tr('الإشعارات اشتغلت ✅', 'Notifications on ✅'));
    } else toast(tr('الإذن مرفوض — تقدر تغيّره من إعدادات المتصفح', 'Permission denied — change it in browser settings'), 'error');
  }

  const subject = 'SAFQA SUBSCRIBE';
  const body = `اشترك من فضلك في ملخص صفقة اليومي للعروض الحقيقية على العنوان ده.\nI explicitly opt in to Safqa's daily deals digest at this address.\nTo stop: send UNSUBSCRIBE.\n(${new Date().toISOString()})`;

  const topDeals = [...(catalogQ.data?.items ?? [])].filter((p) => p.bestOffer && !p.bestOffer.fakeDiscount).sort((a, b) => (b.bestOffer?.dealScore ?? 0) - (a.bestOffer?.dealScore ?? 0));
  return (
    <div className="space-y-8">
      <PageHeader kicker={tr('فريق التنبيهات + صيادو العروض', 'Notifications + deal hunters')} title={tr('رادار العروض', 'Deal radar')} lede={tr('محرك تنبيهات ذكي شغال لوحده: الوكلاء بيفحصوا سجل الأسعار الحقيقي ويطلّعوا التخفيضات الحقيقية والخصومات المشبوهة وفروق الأسعار بين المتاجر، ويكتبوا عناوين تشد — من غير مبالغة ومن غير عروض مخترعة.', 'A self-running alert engine: agents scan the real price history for genuine drops, suspicious discounts and store gaps, and write catchy headlines — no hype, no invented deals.')} icon={<Radar className="h-6 w-6" />}>
        <PriceFreshness />
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-4">
        {[[tr('إشارات دلوقتي', 'Signals now'), all.length], [tr('تخفيضات حقيقية', 'Real drops'), all.filter((x) => x.kind === 'drop').length], [tr('خصومات مشبوهة', 'Suspicious'), all.filter((x) => x.kind === 'fake_discount').length], [tr('اتبعتلك', 'Delivered to you'), feed.length]].map(([k, v]) => (
          <Card key={String(k)}><p className="text-xs text-muted">{k}</p><p className="num text-3xl font-bold">{v}</p></Card>
        ))}
      </div>

      <ChannelsCard items={topDeals} />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] [&>*]:min-w-0">
        <section className="space-y-3">
          <div className="flex flex-wrap gap-1.5 text-xs">
            {(['all', 'drop', 'cheapest_store_gap', 'fake_discount', 'all_time_low'] as const).map((k) => <button key={k} type="button" onClick={() => setFilter(k)} className={`rounded-full px-3 py-1.5 font-semibold ${filter === k ? 'bg-primary text-primary-foreground' : 'bg-accent'}`}>{k === 'all' ? tr('الكل', 'All') : tr(kindLabel[k][0], kindLabel[k][1])}</button>)}
          </div>
          {!ready ? <div className="skeleton h-40 rounded-3xl" /> : null}
          {ready && shown.length === 0 ? (
            <Card><p className="text-sm">{tr('مفيش إشارات من النوع ده في آخر تحديث للأسعار. الوكلاء مش بيخترعوا عروض — أول ما السعر يتحرك فعلًا هتظهر هنا وهيوصلك تنبيه.', 'No signals of this kind in the latest price update. Agents never invent deals — as soon as a price really moves it shows up here and you get an alert.')}</p></Card>
          ) : null}
          {shown.map((x, i) => (
            <Reveal key={x.id} delay={Math.min(i, 8) * 40}>
              <div className={`lift relative flex items-center gap-3 rounded-3xl border bg-card p-3 ${x.exceptional ? 'border-primary shadow-[0_0_0_3px_var(--glow)]' : 'border-border'}`}>
                <Link to="/product/$id" params={{ id: x.productId }} className="absolute inset-0 z-0 rounded-3xl" aria-label={locale === 'ar' ? x.headline : x.headlineEn} />
                <ProductThumb id={x.productId} className="w-16 flex-none sm:w-20" />
                <div className="min-w-0 flex-1">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${kindLabel[x.kind][2]}`}>{tr(kindLabel[x.kind][0], kindLabel[x.kind][1])}{x.exceptional ? ' ⚡' : ''}</span>
                  <p className="t-title mt-1 !min-h-0">{locale === 'ar' ? x.headline : x.headlineEn}</p>
                  <p className="t-meta line-clamp-2">{x.body}</p>
                </div>
                <div className="relative z-10 flex flex-none flex-col items-end gap-2"><p className="t-price">{formatEGP(x.priceEgp, locale)}</p><WhatsAppButton compact text={`${locale === 'ar' ? x.headline : x.headlineEn}\n💰 ${formatEGP(x.priceEgp, locale)}`} url={appUrl(`/product/${x.productId}`)} /></div>
              </div>
            </Reveal>
          ))}
        </section>

        <aside className="space-y-4">
          <Card>
            <div className="flex items-center gap-3">{barq ? <AgentAvatar agent={barq} mood="excited" size={48} /> : null}<div><p className="font-bold">{tr('إعدادات التنبيهات', 'Alert settings')}</p><p className="text-xs text-muted">{tr('برق وجرس بيشتغلوا كل 10 دقايق طول ما الموقع مفتوح + بعد التحديث اليومي', 'Barq & Jaras run every 10 min while the site is open + after the daily refresh')}</p></div></div>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><BellRing className="h-4 w-4" />{tr('إشعارات المتصفح/الموبايل', 'Browser / phone notifications')}</span>{perm === 'granted' && prefs.browser ? <Button size="sm" variant="outline" onClick={() => setPrefs({ ...prefs, browser: false })}>{tr('إيقاف', 'Turn off')}</Button> : <Button size="sm" onClick={() => void enableBrowser()}>{tr('تفعيل', 'Enable')}</Button>}</div>
              <label className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><Sparkles className="h-4 w-4" />{tr('بانر متحرك جوه الموقع', 'Animated in-site banner')}</span><input type="checkbox" checked={prefs.toasts} onChange={(e) => setPrefs({ ...prefs, toasts: e.target.checked })} className="h-4 w-4 accent-[var(--saffron)]" /></label>
              <label className="block"><span className="flex items-center gap-2"><Zap className="h-4 w-4" />{tr(`أقل نسبة تخفيض: ${prefs.minPct}%`, `Minimum drop: ${prefs.minPct}%`)}</span><input type="range" min={1} max={30} value={prefs.minPct} onChange={(e) => setPrefs({ ...prefs, minPct: Number(e.target.value) })} className="mt-1 w-full accent-[var(--saffron)]" /></label>
              <label className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><Moon className="h-4 w-4" />{tr('ساعات هدوء 11م–8ص (القاهرة)', 'Quiet hours 11pm–8am (Cairo)')}</span><input type="checkbox" checked={Boolean(prefs.quietHours)} onChange={(e) => setPrefs({ ...prefs, quietHours: e.target.checked ? [23, 8] : null })} className="h-4 w-4 accent-[var(--saffron)]" /></label>
              <div className="flex flex-wrap gap-1">{['phones', 'laptops', 'tablets', 'audio', 'tvs', 'appliances', 'kitchen', 'gaming', 'lifestyle'].map((c) => { const on = prefs.categories.includes(c); return <button key={c} type="button" onClick={() => setPrefs({ ...prefs, categories: on ? prefs.categories.filter((x) => x !== c) : [...prefs.categories, c] })} className={`rounded-full px-2.5 py-1 text-xs ${on ? 'bg-primary text-primary-foreground' : 'bg-accent'}`}>{({ phones: tr('موبايلات', 'Phones'), laptops: tr('لابتوب', 'Laptops'), tablets: tr('تابلت', 'Tablets'), audio: tr('صوتيات', 'Audio'), tvs: tr('شاشات', 'TVs'), appliances: tr('أجهزة', 'Appliances'), kitchen: tr('مطبخ', 'Kitchen'), gaming: tr('ألعاب', 'Gaming'), lifestyle: tr('ساعات', 'Wearables') } as Record<string, string>)[c]}</button>; })}</div>
              <p className="text-[11px] text-muted">{tr('لو ماختارتش أقسام، هيوصلك من كل الأقسام.', 'No category selected = all categories.')}</p>
              <Button size="sm" variant="outline" onClick={(e) => { confetti({ x: e.clientX, y: e.clientY }); void showBrowserNotification(tr('⚡ تجربة تنبيه من صفقة', '⚡ Safqa test alert'), tr('كده التنبيهات شغالة تمام.', 'Alerts are working.'), '/#/radar'); toast(tr('اتبعت تنبيه تجربة', 'Test alert sent')); }}>{tr('جرّب تنبيه', 'Send a test alert')}</Button>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-3">{hamsa ? <AgentAvatar agent={hamsa} size={48} /> : null}<div><p className="flex items-center gap-1 font-bold"><Mail className="h-4 w-4" />{tr('الملخص اليومي بالإيميل', 'Daily email digest')}</p><p className="text-xs text-muted">{tr('اشتراك صريح بس — مش هنبعت لحد ماطلبش', 'Explicit opt-in only — we never email anyone who did not ask')}</p></div></div>
            <div className="mt-3 space-y-2 text-sm">
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@gmail.com" className="h-10 w-full rounded-xl border border-border bg-background px-3" />
              <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-[var(--saffron)]" />{tr('موافق أستقبل ملخص عروض يومي على الإيميل ده، وأقدر ألغي في أي وقت.', 'I agree to receive a daily deals digest at this address and can unsubscribe any time.')}</label>
              <a
                href={consent && /\S+@\S+\.\S+/.test(email) ? `mailto:${DIGEST_INBOX}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : undefined}
                onClick={(e) => { if (!consent || !/\S+@\S+\.\S+/.test(email)) { e.preventDefault(); toast(tr('اكتب إيميل صحيح ووافق الأول', 'Enter a valid email and tick consent'), 'error'); return; } setPrefs({ ...prefs, email: { address: email, at: new Date().toISOString(), status: 'requested' } }); }}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              ><Send className="h-4 w-4" />{tr('أكّد الاشتراك من إيميلك', 'Confirm from your email')}</a>
              <p className="text-[11px] leading-5 text-muted">{tr(`ليه كده؟ الموقع ثابت ومجاني ومفيهوش سيرفر يخزن إيميلات. فبنفتحلك رسالة جاهزة لـ ${DIGEST_INBOX} — لما تبعتها من إيميلك، ده بيثبت إن الإيميل بتاعك وإنك موافق (Double opt-in). الملخص بيتبعت بس للي اشتركوا بالطريقة دي (أول إرسال أول ما خدمة الإرسال اليومي تتفعّل). لإلغاء الاشتراك ابعت UNSUBSCRIBE.`, `Why? The site is static and free with no server to store emails. We open a ready message to ${DIGEST_INBOX}; sending it from your own mailbox proves the address is yours and that you opted in. The digest goes only to addresses that subscribed this way (first send once the daily sender is switched on). Send UNSUBSCRIBE to stop.`)}</p>
              {prefs.email ? <p className="rounded-xl bg-accent px-2 py-1 text-xs">{tr('آخر طلب اشتراك:', 'Last subscription request:')} {prefs.email.address} · {timeAgo(prefs.email.at, locale)}</p> : null}
            </div>
          </Card>

          <Card>
            <p className="font-bold">{tr('اللي وصلك', 'Delivered to you')}</p>
            <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto text-sm">
              {feed.slice(0, 30).map((x) => <li key={`${x.id}${x.deliveredAt}`} className="border-t border-border pt-2"><Link to="/product/$id" params={{ id: x.productId }} className="font-semibold hover:underline">{locale === 'ar' ? x.headline : x.headlineEn}</Link><p className="text-[11px] text-muted">{timeAgo(x.deliveredAt, locale)} · {x.via.join(' + ') || tr('سجل بس', 'log only')}</p></li>)}
              {feed.length === 0 ? <li className="text-muted">{tr('لسه مفيش تنبيهات — هتظهر أول ما يحصل تخفيض حقيقي.', 'No alerts yet — they appear on the first real drop.')}</li> : null}
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}
