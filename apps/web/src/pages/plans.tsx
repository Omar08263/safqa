import { Check, Crown, HelpCircle, Minus, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { PageHeader, useToast } from '../fx/fx';
import { usePrefs } from '../lib/prefs';
import { haptic, play } from '../lib/sound';
import { go } from '../lib/nav';
import { payUrl, perks, type Tier, tiers, useTier } from '../lib/tiers';
import { useTr } from '../lib/tr';

const faqs = [
  ['بادفع إزاي؟', 'بإنستاباي بس، من صفحة الدفع: بتحوّل المبلغ بالظبط وتكتب كود الدفع في الملاحظة وترفع صورة الإيصال. وكيل ذكاء اصطناعي 🤖 بيراجع الإيصال فورًا وصاحب الموقع بيأكد. مفيش بطاقات ولا اشتراك بيتجدد لوحده.', 'How do I pay?', 'Only via InstaPay on the payment page: transfer the exact amount with your payment code in the note and upload the receipt. An AI agent 🤖 checks it instantly and the owner confirms. No cards, no auto-renewal.'],
  ['الأسعار كام؟', 'فضّي 49 ج.م، ذهبي 99 ج.م، ماسي 199 ج.م في الشهر. ولو معاك كود خصم اكتبه في صفحة الدفع.', 'How much?', 'Silver EGP 49, Gold EGP 99, Diamond EGP 199 per month. Have a discount code? Enter it on the payment page.'],
  ['هيتجدد لوحده؟', 'لأ. الباقة بتشتغل للمدة اللي دفعتها، وبعدها بترجع مجاني لوحدك من غير ما تخسر حاجة اتحفظت.', 'Does it auto-renew?', 'No. The plan runs for the months you paid, then you go back to Free without losing anything you saved.'],
  ['إيه الفرق اللي هحسّه فعلًا؟', 'المراقبة والتنبيهات والمجموعات وأسئلة الوكلاء بتكبر مع الباقة، وتنبيهات تيليجرام الخاصة بتتفتح من الفضّي. الحدود دي السيرفر هو اللي بيطبّقها.', 'What will I actually notice?', 'Watchlist, alerts, collections and agent questions grow with your plan, and private Telegram alerts start at Silver. The server enforces these limits.'],
  ['باقتي بتتحفظ فين؟', 'على حسابك في السيرفر، فبتبان نفسها على الموقع والتطبيق وتيليجرام. لو النت فصل بنستخدم آخر باقة عرفناها.', 'Where is my plan stored?', 'On your account on the server, so it is the same on the site, the app and Telegram. Offline we use the last known plan.'],
  ['الأسعار حقيقية؟', 'أيوه. الأسعار بتتقري كل يوم من صفحات المتاجر نفسها (بي.تك، 2B، راية، أمازون مصر) والباقات مش بتغيّر الأسعار ولا الترتيب.', 'Are prices real?', 'Yes. Prices are read daily from the stores\' own pages, and plans never change prices or ranking.'],
] as const;

export function PlansPage() {
  const tr = useTr();
  const { locale } = usePrefs();
  const toast = useToast();
  const { tier: mine, until, signedIn } = useTier();
  const [preview, setPreview] = useState<string | null>(null);

  function choose(t: Tier) {
    play(t.sound, true);
    haptic('light');
    if (t.id === 'free') {
      toast(mine.id === 'free' ? tr('إنت على المجاني بالفعل 🌱', "You're already on Free 🌱") : tr('باقتك بترجع مجاني لوحدها لما مدتها تخلص، من غير ما تخسر حاجة.', 'Your plan returns to Free by itself when it ends; nothing is lost.'), 'info');
      return;
    }
    go(payUrl(t.id));
  }

  return (
    <div className="space-y-10">
      <PageHeader
        kicker={tr('الباقات والامتيازات', 'Plans & perks')}
        title={tr('اختار الباقة اللي تناسبك', 'Pick the plan that fits you')}
        lede={tr('ابدأ ببلاش، ورقّي وقت ما تحب: فضّي 49، ذهبي 99، ماسي 199 ج.م في الشهر بإنستاباي، من غير بطاقات ومن غير تجديد تلقائي. كل باقة ليها شارة وصوت وتأثير خاص بيها.', 'Start free and upgrade whenever you like: Silver 49, Gold 99, Diamond 199 EGP / month via InstaPay. No cards, no auto-renewal. Each plan has its own badge, sound and effect.')}
        icon={<Crown className="h-6 w-6" />}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label={tr('الباقات', 'Plans')}>
        {tiers.map((t) => {
          const active = mine.id === t.id;
          return (
            <article key={t.id} className={`relative flex flex-col overflow-hidden rounded-[1.75rem] border bg-card p-5 transition ${t.glow} ${active ? 'border-primary ring-2 ring-primary/40' : 'border-border'}`}>
              <div className="absolute inset-x-0 top-0 h-28 opacity-25" style={{ background: `linear-gradient(135deg, ${t.colors[0]}, ${t.colors[2]})` }} aria-hidden="true" />
              <div className="relative flex items-start justify-between gap-3">
                <button type="button" onClick={() => { play(t.sound, true); setPreview(t.id); setTimeout(() => setPreview(null), 900); }} className={`press relative h-20 w-20 flex-none ${t.id === 'gold' || t.id === 'diamond' ? 'tier-shimmer rounded-3xl' : ''}`} aria-label={tr(`اسمع صوت باقة ${t.ar}`, `Hear the ${t.en} sound`)} title={tr('دوس تسمع صوت الباقة', 'Tap to hear the plan sound')}>
                  <img src={t.badge} alt="" className={`h-20 w-20 drop-shadow-xl transition duration-500 ${preview === t.id ? 'scale-110 rotate-6' : ''}`} />
                  {t.id === 'diamond' ? <span className="sparkle absolute -end-1 -top-1 text-lg" aria-hidden="true">✨</span> : null}
                </button>
                <span className={`num rounded-full px-2.5 py-1 text-[12px] font-bold ${t.priceEgp === 0 ? 'bg-palm/15 text-palm' : 'bg-primary/15 text-primary'}`}>
                  {locale === 'ar' ? t.priceAr : t.priceEn}
                </span>
              </div>
              <h2 className="relative mt-4 text-2xl font-bold">{t.emoji} {locale === 'ar' ? t.ar : t.en}</h2>
              <p className="relative mt-1 text-sm text-muted">{locale === 'ar' ? t.taglineAr : t.taglineEn}</p>
              <ul className="relative mt-4 space-y-2 text-sm">
                <Li>{tr(`${t.limits.watchlist} منتج في المراقبة`, `${t.limits.watchlist} watched products`)}</Li>
                <Li>{tr(`${t.limits.alerts} تنبيه سعر شغّال`, `${t.limits.alerts} active alerts`)}</Li>
                <Li>{tr(`${t.limits.collections} مجموعة`, `${t.limits.collections} collections`)}</Li>
                <Li>{(() => { const sp = perks.find((p) => p.en === 'Support priority'); return tr(`دعم: ${String(sp?.values[t.id])}`, `Support: ${String(sp?.valuesEn?.[t.id] ?? sp?.values[t.id])}`); })()}</Li>
              </ul>
              <div className="relative mt-auto pt-5">
                {active && until ? <p className="t-meta mb-2 text-center text-muted">{tr(`شغالة لحد ${new Date(until).toLocaleDateString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo' })}`, `Active until ${new Date(until).toLocaleDateString('en-GB', { timeZone: 'Africa/Cairo' })}`)}</p> : null}
                {active ? (
                  <span className="flex h-11 w-full items-center justify-center rounded-full bg-accent font-semibold">{tr('باقتك الحالية ✓', 'Your plan ✓')}</span>
                ) : t.id === 'free' ? (
                  <button type="button" onClick={() => choose(t)} className="press h-11 w-full rounded-full border border-border bg-background font-semibold hover:bg-accent">{tr('إزاي أرجع للمجاني؟', 'How do I go back to Free?')}</button>
                ) : (
                  <a href={payUrl(t.id)} onClick={(e) => { e.preventDefault(); choose(t); }} aria-label={tr(`رقّي لباقة ${t.ar} بـ ${t.priceAr}`, `Upgrade to ${t.en} for ${t.priceEn}`)} className="press shine flex h-11 w-full items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground">
                    {mine.priceEgp > t.priceEgp ? tr('باقتك أعلى من دي ✓', 'Your plan is higher ✓') : tr(`رقّي لـ${t.ar} ${t.emoji}`, `Upgrade to ${t.en} ${t.emoji}`)}
                  </a>
                )}
              </div>
            </article>
          );
        })}
      </section>

      <section aria-labelledby="cmp">
        <h2 id="cmp" className="mb-3 flex items-center gap-2 text-xl font-bold"><Sparkles className="h-5 w-5 text-primary" />{tr('مقارنة كاملة بين الباقات', 'Full comparison')}</h2>
        <div className="overflow-x-auto rounded-3xl border border-border bg-card">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border">
                <th scope="col" className="p-3 text-start font-semibold">{tr('الميزة', 'Perk')}</th>
                {tiers.map((t) => <th key={t.id} scope="col" className="p-3 text-center font-semibold"><img src={t.badge} alt="" className="mx-auto mb-1 h-8 w-8" />{locale === 'ar' ? t.ar : t.en}</th>)}
              </tr>
            </thead>
            <tbody>
              {perks.map((p) => (
                <tr key={p.en} className="border-b border-border/60 last:border-0">
                  <th scope="row" className="p-3 text-start font-normal">{locale === 'ar' ? p.ar : p.en}{p.live ? null : <Soon />}</th>
                  {tiers.map((t) => {
                    const val = p.values[t.id];
                    return <td key={t.id} className={`num p-3 text-center ${mine.id === t.id ? 'bg-primary/5' : ''}`}>{val === true ? <Check className="mx-auto h-4 w-4 text-palm" aria-label={tr('متاح', 'Included')} /> : val === false ? <Minus className="mx-auto h-4 w-4 text-muted" aria-label={tr('مش متاح', 'Not included')} /> : val}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="t-meta mt-2">{tr('«بتتفعّل تدريجيًا» = ميزة بنطلقها على مراحل للباقات دي. كل الباقي شغال من أول ما الدفع يتأكد.', '"Rolling out" = a perk being enabled in stages. Everything else is on as soon as the payment is confirmed.')}{signedIn ? null : tr(' سجّل دخول عشان باقتك تتقري من حسابك.', ' Sign in so your plan is read from your account.')}</p>
      </section>

      <section aria-labelledby="faq">
        <h2 id="faq" className="mb-3 flex items-center gap-2 text-xl font-bold"><HelpCircle className="h-5 w-5 text-primary" />{tr('أسئلة بتتسأل كتير', 'FAQ')}</h2>
        <div className="space-y-2">
          {faqs.map(([qa, aa, qe, ae]) => (
            <details key={qe} className="group rounded-2xl border border-border bg-card p-4 open:shadow-md">
              <summary className="cursor-pointer list-none font-semibold marker:hidden">{locale === 'ar' ? qa : qe}<span className="float-end text-muted transition group-open:rotate-45" aria-hidden="true">＋</span></summary>
              <p className="t-body mt-2 text-muted">{locale === 'ar' ? aa : ae}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return <li className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 flex-none text-palm" aria-hidden="true" /><span>{children}</span></li>;
}
function Soon() {
  return <span className="ms-1.5 rounded-full bg-accent px-1.5 py-0.5 align-middle text-[11px] font-semibold text-muted">بتتفعّل تدريجيًا</span>;
}
