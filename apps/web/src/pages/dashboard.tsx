import { formatEGP, localized } from '@safqa/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Award, Bell, Eye, Flame, LayoutDashboard, Layers, PiggyBank, Sparkles, Trash2, Zap } from 'lucide-react';
import { DealCard } from '../components/bits';
import { Avatar } from '../components/shell';
import { Button } from '../components/ui/button';
import { Card, CountUp, PageHeader, Reveal } from '../fx/fx';
import { type Collection, keys, levelOf, type Purchase, streak, track, useActivity, xpOf } from '../lib/activity';
import { badges } from '../lib/badges';
import { useCatalog } from '../lib/catalog';
import { useLocal } from '../lib/local';
import { usePrefs } from '../lib/prefs';
import { useSession } from '../lib/session';
import { useTr } from '../lib/tr';

export function useGamification() {
  const { user, client } = useSession();
  const [a] = useActivity();
  const [purchases] = useLocal<Purchase[]>(keys.purchases, []);
  const [collections] = useLocal<Collection[]>(keys.collections, []);
  const watch = useQuery({ queryKey: ['watchlist'], queryFn: () => client.watchlist(), enabled: Boolean(user) });
  const ctx = { a, purchases, collections, watchCount: watch.data?.items.length ?? 0, signedIn: Boolean(user) };
  const xp = xpOf(a, purchases, collections) + (user ? 50 : 0) + ctx.watchCount * 20;
  return { ctx, xp, level: levelOf(xp), earned: badges.filter((b) => b.test(ctx)), streak: streak(a.visitDays), watch };
}

export function DashboardPage() {
  const tr = useTr();
  const { locale } = usePrefs();
  const { user } = useSession();
  const catalog = useCatalog();
  const { ctx, xp, level, earned, streak: days, watch } = useGamification();
  const saved = ctx.purchases.reduce((s, p) => s + Math.max(0, p.referenceEgp - p.paidEgp), 0);
  const recent = ctx.a.views.map((v) => catalog.data?.items.find((p) => p.id === v.id)).filter((p): p is NonNullable<typeof p> => Boolean(p)).slice(0, 8);
  const hits = (watch.data?.items ?? []).filter((w) => w.targetPriceEgp && w.product.bestOffer && w.product.bestOffer.priceEgp <= w.targetPriceEgp);
  const hour = new Date().getHours();
  const greet = hour < 12 ? tr('صباح الخير', 'Good morning') : hour < 18 ? tr('مساء الخير', 'Good afternoon') : tr('مساء النور', 'Good evening');
  return (
    <div className="space-y-6">
      <PageHeader icon={<LayoutDashboard className="h-6 w-6" />} kicker={greet} title={user ? tr(`أهلًا ${user.name}`, `Hi ${user.name}`) : tr('لوحة التحكم', 'Dashboard')} lede={tr('كل نشاطك في مكان واحد: التوفير، المراقبة، المستوى، والشارات.', 'All your activity in one place: savings, watchlist, level, and badges.')}>
        {user ? <Avatar name={user.name} size={64} /> : <Link to="/login"><Button>{tr('سجّل دخول عشان المراقبة', 'Sign in for watchlists')}</Button></Link>}
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: PiggyBank, l: tr('وفّرت', 'Saved'), v: saved, f: (n: number) => formatEGP(Math.round(n), locale), c: 'text-palm', to: '/savings' },
          { icon: Eye, l: tr('بتراقب', 'Watching'), v: ctx.watchCount, c: '', to: '/watchlist' },
          { icon: Layers, l: tr('مجموعات', 'Collections'), v: ctx.collections.length, c: '', to: '/collections' },
          { icon: Flame, l: tr('أيام ورا بعض', 'Day streak'), v: days, c: 'text-primary', to: '/achievements' },
        ].map((s, i) => (
          <Reveal key={s.l} delay={i * 70}>
            <Link to={s.to as '/'}><Card className="lift"><s.icon className="h-5 w-5 text-primary" /><p className={`mt-2 text-3xl font-bold ${s.c}`}><CountUp value={s.v} format={s.f} /></p><p className="text-sm text-muted">{s.l}</p></Card></Link>
          </Reveal>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold"><Zap className="h-5 w-5 text-primary" />{tr('المستوى', 'Level')} <span className="num">{level.level}</span></h2>
            <span className="num text-sm text-muted">{xp} XP</span>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-accent"><div className="bar-grow h-full rounded-full bg-gradient-to-r from-[var(--saffron)] to-[var(--palm)]" style={{ width: `${Math.round(level.progress * 100)}%` }} /></div>
          <p className="mt-1 text-xs text-muted">{tr(`فاضل ${level.next - xp} XP للمستوى ${level.level + 1}`, `${level.next - xp} XP to level ${level.level + 1}`)}</p>
          <h3 className="mt-5 flex items-center gap-2 font-bold"><Award className="h-4 w-4 text-primary" />{tr('الشارات', 'Badges')} <span className="num text-sm text-muted">{earned.length}/{badges.length}</span></h3>
          <div className="mt-2 flex flex-wrap gap-2">{badges.map((b) => <span key={b.id} title={locale === 'ar' ? b.ar : b.en} className={`grid h-10 w-10 place-items-center rounded-xl text-xl ${earned.includes(b) ? 'bg-primary/15' : 'bg-accent opacity-35 grayscale'}`}>{b.emoji}</span>)}</div>
          <Link to="/achievements" className="mt-3 inline-block text-sm font-semibold text-primary">{tr('كل الإنجازات', 'All achievements')}</Link>
        </Card>
        <Card>
          <h2 className="flex items-center gap-2 text-lg font-bold"><Bell className="h-5 w-5 text-primary" />{tr('وصلت لهدفك', 'Hit your target')}</h2>
          {!user ? <p className="mt-2 text-sm text-muted">{tr('سجّل دخول عشان تشوف المنتجات اللي وصلت للسعر اللي حطيته.', 'Sign in to see products that reached your target price.')}</p> : hits.length === 0 ? <p className="mt-2 text-sm text-muted">{tr('لسه مفيش منتج وصل لهدفك. هنبلّغك أول ما يحصل.', 'Nothing has hit your target yet. We will tell you.')}</p> : (
            <ul className="mt-3 space-y-2">
              {hits.map((w) => (
                <li key={w.id}><Link to="/product/$id" params={{ id: w.product.id }} className="flex items-center gap-3 rounded-2xl bg-[var(--palm)]/10 px-3 py-2 text-sm"><Sparkles className="h-4 w-4 text-palm" /><span className="flex-1 truncate">{localized(locale, { ar: w.product.titleAr, en: w.product.titleEn })}</span><span className="num font-bold text-palm">{formatEGP(w.product.bestOffer?.priceEgp ?? 0, locale)}</span></Link></li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">{tr('شفته مؤخرًا', 'Recently viewed')}</h2>
          {recent.length ? <Button variant="ghost" size="sm" onClick={() => track.clearViews()}><Trash2 className="h-4 w-4" />{tr('امسح السجل', 'Clear history')}</Button> : null}
        </div>
        {recent.length === 0 ? <p className="text-sm text-muted">{tr('لسه مفتحتش منتجات.', 'You have not opened any products yet.')}</p> : <div className="deal-grid">{recent.map((p, i) => <DealCard key={p.id} product={p} index={i} />)}</div>}
      </section>
    </div>
  );
}

export function AchievementsPage() {
  const tr = useTr();
  const { locale } = usePrefs();
  const { ctx, xp, level, earned, streak: days } = useGamification();
  const last30 = Array.from({ length: 28 }, (_, i) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - (27 - i));
    return d.toISOString().slice(0, 10);
  });
  return (
    <div className="space-y-6">
      <PageHeader icon={<Award className="h-6 w-6" />} kicker={tr(`المستوى ${level.level} · ${xp} XP`, `Level ${level.level} · ${xp} XP`)} title={tr('الإنجازات', 'Achievements')} lede={tr('اجمع نقاط خبرة وشارات وانت بتوفّر. كل حاجة محسوبة من نشاطك الحقيقي على الجهاز ده.', 'Earn XP and badges as you save. Everything is computed from your real activity on this device.')} />
      <Card>
        <h2 className="flex items-center gap-2 text-lg font-bold"><Flame className="h-5 w-5 text-primary" />{tr(`سلسلة ${days} يوم`, `${days}-day streak`)}</h2>
        <div className="mt-3 flex flex-wrap gap-1.5" dir="ltr">
          {last30.map((d) => <span key={d} title={d} className={`h-7 w-7 rounded-md ${ctx.a.visitDays.includes(d) ? 'bg-[var(--saffron)]' : 'bg-accent'}`} />)}
        </div>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {badges.map((b, i) => {
          const [v, goal] = b.progress(ctx);
          const got = earned.includes(b);
          return (
            <Reveal key={b.id} delay={(i % 3) * 70}>
              <Card className={got ? 'ring-2 ring-primary/50' : ''}>
                <div className="flex items-center gap-3">
                  <span className={`grid h-14 w-14 place-items-center rounded-2xl text-3xl ${got ? 'bg-primary/15' : 'bg-accent grayscale'}`}>{b.emoji}</span>
                  <div className="flex-1"><p className="font-bold">{locale === 'ar' ? b.ar : b.en}</p><p className="text-xs text-muted">{locale === 'ar' ? b.dar : b.den}</p></div>
                  {got ? <span className="rounded-full bg-[var(--palm)]/15 px-2 py-0.5 text-xs font-bold text-palm">✓</span> : null}
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-accent"><div className="h-full rounded-full bg-primary" style={{ width: `${(v / goal) * 100}%` }} /></div>
                <p className="num mt-1 text-xs text-muted">{Math.round(v).toLocaleString('en-US')} / {goal.toLocaleString('en-US')}</p>
              </Card>
            </Reveal>
          );
        })}
      </div>
    </div>
  );
}
