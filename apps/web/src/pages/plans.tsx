import { Check, Crown, HelpCircle, Minus, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { confetti, PageHeader, useToast } from '../fx/fx';
import { usePrefs } from '../lib/prefs';
import { haptic, play } from '../lib/sound';
import { joinWaitlist, perks, type Tier, tiers, useTier, useWaitlist } from '../lib/tiers';
import { useTr } from '../lib/tr';

const faqs = [
  ['هو فيه دفع أو بطاقة؟', 'لأ خالص. صفقة مفيهاش أي دفع دلوقتي. «مجاني» و«فضّي» شغالين ببلاش، و«ذهبي» و«ماسي» لسه قريبًا ومش هنطلب منك بطاقة لا دلوقتي ولا من غير ما نقولك بوضوح.', 'Is there any payment or card?', 'No. Safqa takes no payment today. Free and Silver work at no cost; Gold and Diamond are coming soon and we will never ask for a card without telling you clearly.'],
  ['إيه الفرق اللي هحسّه فعلًا؟', 'المراقبة والتنبيهات والمجموعات بتكبر مع الباقة، وده شغال من دلوقتي. الحاجات اللي محتاجة سيرفر (الدعم بأولوية، الوصول المبكر، تيليجرام الخاص) مكتوب جنبها «قريبًا».', 'What will I actually notice?', 'Watchlist, alerts and collections grow with your plan, enforced today. Server-side perks (priority support, early access, private Telegram) are marked "coming soon".'],
  ['ليه «فضّي» مجاني؟', 'لأننا في فترة الإطلاق وعايزين أكبر عدد يجرّب. لما يتغير ده هنعرّفك قبلها، ومش هنقفل حاجة عندك فجأة.', 'Why is Silver free?', 'We are in launch. If that changes we will tell you first, and nothing you saved will be locked suddenly.'],
  ['بياناتي بتتحفظ فين؟', 'في المتصفح بتاعك (النسخة دي من غير قاعدة بيانات مشتركة). لو مسحت بيانات الموقع هترجع للباقة المجانية.', 'Where is my data stored?', 'In your browser (this build has no shared database). Clearing site data resets you to Free.'],
  ['الأسعار حقيقية؟', 'أيوه. الأسعار بتتقري كل يوم من صفحات المتاجر نفسها (بي.تك، 2B، راية، أمازون مصر) والباقات مش بتغيّر الأسعار ولا الترتيب.', 'Are prices real?', 'Yes. Prices are read daily from the stores\' own pages, and plans never change prices or ranking.'],
] as const;

export function PlansPage() {
  const tr = useTr();
  const { locale } = usePrefs();
  const toast = useToast();
  const { tier: mine, setTier } = useTier();
  const [waitlist] = useWaitlist();
  const [preview, setPreview] = useState<string | null>(null);

  function choose(t: Tier, el: HTMLElement) {
    play(t.sound, true);
    haptic('success');
    const r = el.getBoundingClientRect();
    if (t.availability === 'soon') {
      joinWaitlist(t.id);
      toast(tr(`تمام! هنبلّغك أول ما باقة ${t.ar} ${t.emoji} تنزل`, `Done! We'll tell you when ${t.en} ${t.emoji} launches`), 'success');
      return;
    }
    const prev = mine;
    setTier(t.id);
    if (t.id !== 'free') confetti({ x: r.left + r.width / 2, y: r.top, count: t.id === 'silver' ? 70 : 120 });
    toast(
      t.id === 'free' ? tr('رجعت للباقة المجانية 🌱', 'Back on Free 🌱') : tr(`مبروك! باقة ${t.ar} ${t.emoji} اتفعّلت ببلاش`, `${t.en} ${t.emoji} is on, free during launch`),
      'success',
      { action: { label: tr('تراجع', 'Undo'), onClick: () => setTier(prev.id) } },
    );
  }

  return (
    <div className="space-y-10">
      <PageHeader
        kicker={tr('الباقات والامتيازات', 'Plans & perks')}
        title={tr('اختار الباقة اللي تناسبك', 'Pick the plan that fits you')}
        lede={tr('مفيش دفع ولا بطاقات. «مجاني» و«فضّي» شغالين دلوقتي ببلاش، و«ذهبي» و«ماسي» قريبًا. كل باقة ليها شارة وصوت وتأثير خاص بيها.', 'No payment, no cards. Free and Silver work today at no cost; Gold and Diamond are coming soon. Each plan has its own badge, sound and effect.')}
        icon={<Crown className="h-6 w-6" />}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label={tr('الباقات', 'Plans')}>
        {tiers.map((t) => {
          const active = mine.id === t.id;
          const waiting = waitlist.includes(t.id);
          return (
            <article key={t.id} className={`relative flex flex-col overflow-hidden rounded-[1.75rem] border bg-card p-5 transition ${t.glow} ${active ? 'border-primary ring-2 ring-primary/40' : 'border-border'}`}>
              <div className="absolute inset-x-0 top-0 h-28 opacity-25" style={{ background: `linear-gradient(135deg, ${t.colors[0]}, ${t.colors[2]})` }} aria-hidden="true" />
              <div className="relative flex items-start justify-between gap-3">
                <button type="button" onClick={() => { play(t.sound, true); setPreview(t.id); setTimeout(() => setPreview(null), 900); }} className={`press relative h-20 w-20 flex-none ${t.id === 'gold' || t.id === 'diamond' ? 'tier-shimmer rounded-3xl' : ''}`} aria-label={tr(`اسمع صوت باقة ${t.ar}`, `Hear the ${t.en} sound`)} title={tr('دوس تسمع صوت الباقة', 'Tap to hear the plan sound')}>
                  <img src={t.badge} alt="" className={`h-20 w-20 drop-shadow-xl transition duration-500 ${preview === t.id ? 'scale-110 rotate-6' : ''}`} />
                  {t.id === 'diamond' ? <span className="sparkle absolute -end-1 -top-1 text-lg" aria-hidden="true">✨</span> : null}
                </button>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${t.availability === 'soon' ? 'bg-accent text-muted' : t.availability === 'launch-free' ? 'bg-palm/15 text-palm' : 'bg-primary/15 text-primary'}`}>
                  {t.availability === 'soon' ? tr('قريبًا', 'Coming soon') : t.availability === 'launch-free' ? tr('مجاني فترة الإطلاق', 'Free during launch') : tr('متاح دايمًا', 'Always free')}
                </span>
              </div>
              <h2 className="relative mt-4 text-2xl font-bold">{t.emoji} {locale === 'ar' ? t.ar : t.en}</h2>
              <p className="relative mt-1 text-sm text-muted">{locale === 'ar' ? t.taglineAr : t.taglineEn}</p>
              <ul className="relative mt-4 space-y-2 text-sm">
                <Li>{tr(`${t.limits.watchlist} منتج في المراقبة`, `${t.limits.watchlist} watched products`)}</Li>
                <Li>{tr(`${t.limits.alerts} تنبيه سعر شغّال`, `${t.limits.alerts} active alerts`)}</Li>
                <Li>{tr(`${t.limits.collections} مجموعة`, `${t.limits.collections} collections`)}</Li>
                <Li>{String(perks.find((p) => p.en === 'Support priority')?.values[t.id])} · {tr('دعم', 'support')}{t.id === 'gold' || t.id === 'diamond' ? <Soon /> : null}</Li>
              </ul>
              <div className="relative mt-auto pt-5">
                <button
                  type="button"
                  disabled={active || (t.availability === 'soon' && waiting)}
                  onClick={(e) => choose(t, e.currentTarget)}
                  className={`press h-11 w-full rounded-full font-semibold transition disabled:cursor-default ${active ? 'bg-accent text-foreground' : t.availability === 'soon' ? (waiting ? 'bg-accent text-muted' : 'border border-border bg-background hover:bg-accent') : 'shine bg-primary text-primary-foreground'}`}
                >
                  {active ? tr('باقتك الحالية ✓', 'Your plan ✓') : t.availability === 'soon' ? (waiting ? tr('هنبلّغك أول ما تنزل 🔔', "You're on the list 🔔") : tr('بلّغني أول ما تنزل', 'Notify me at launch')) : t.id === 'free' ? tr('ارجع للمجاني', 'Switch to Free') : tr('فعّلها ببلاش', 'Switch on for free')}
                </button>
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
        <p className="t-meta mt-2">{tr('«قريبًا» = ميزة محتاجة سيرفر مشترك ولسه بنجهّزه. كل الباقي شغال عندك دلوقتي.', '"Soon" = needs the shared server we are still building. Everything else works for you today.')}</p>
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
  return <span className="ms-1.5 rounded-full bg-accent px-1.5 py-0.5 align-middle text-[10px] font-semibold text-muted">قريبًا</span>;
}
