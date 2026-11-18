import { formatEGP, localized } from '@safqa/shared';
import { Download, PiggyBank, Plus, Target, Trash2, Wallet } from 'lucide-react';
import { FormEvent } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ScoreRing } from '../components/bits';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, confetti, CountUp, PageHeader, useToast } from '../fx/fx';
import { type Budget, defaultBudget, keys, type Purchase } from '../lib/activity';
import { useCatalog } from '../lib/catalog';
import { downloadFile, toCsv, useLocal } from '../lib/local';
import { usePrefs } from '../lib/prefs';
import { useTr } from '../lib/tr';

export function SavingsPage() {
  const tr = useTr();
  const toast = useToast();
  const { locale } = usePrefs();
  const catalog = useCatalog();
  const [purchases, setPurchases] = useLocal<Purchase[]>(keys.purchases, []);
  const [budget, setBudget] = useLocal<Budget>(keys.budget, defaultBudget);
  const m = (n: number) => formatEGP(Math.round(n), locale);
  const saved = purchases.reduce((s, p) => s + Math.max(0, p.referenceEgp - p.paidEgp), 0);
  const month = new Date().toISOString().slice(0, 7);
  const spentMonth = purchases.filter((p) => p.at.startsWith(month)).reduce((s, p) => s + p.paidEgp, 0);
  const plannedOpen = budget.planned.filter((p) => !p.bought).reduce((s, p) => s + p.priceEgp, 0);
  const left = budget.monthlyEgp - spentMonth - plannedOpen;
  const goalPct = budget.goalEgp ? Math.min(100, Math.round((saved / budget.goalEgp) * 100)) : 0;

  let running = 0;
  const chart = [...purchases].reverse().map((p) => {
    running += Math.max(0, p.referenceEgp - p.paidEgp);
    return { d: new Date(p.at).toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short' }), v: running };
  });

  function addPurchase(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const paid = Number(f.get('paid'));
    const ref = Number(f.get('ref'));
    if (!paid || !ref) return;
    setPurchases([{ id: crypto.randomUUID(), title: String(f.get('title') || tr('مشتريات', 'Purchase')), paidEgp: paid, referenceEgp: ref, at: new Date().toISOString() }, ...purchases]);
    if (ref > paid) {
      confetti();
      toast(tr(`وفّرت ${m(ref - paid)}!`, `You saved ${m(ref - paid)}!`));
    }
    e.currentTarget.reset();
  }
  function addPlanned(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const pid = String(f.get('product') || '');
    const p = catalog.data?.items.find((x) => x.id === pid);
    const title = p ? localized(locale, { ar: p.titleAr, en: p.titleEn }) : String(f.get('title') || '');
    const price = p?.bestOffer?.priceEgp ?? Number(f.get('price'));
    if (!title || !price) return;
    setBudget({ ...budget, planned: [...budget.planned, { id: crypto.randomUUID(), title, priceEgp: price, productId: p?.id }] });
    e.currentTarget.reset();
  }

  return (
    <div className="space-y-6">
      <PageHeader icon={<PiggyBank className="h-6 w-6" />} kicker={tr('فلوسك تحت السيطرة', 'Money under control')} title={tr('التوفير والميزانية', 'Savings & budget')} lede={tr('سجّل اللي اشتريته واعرف وفّرت قد إيه مقارنة بالسعر العادي، وخطّط مشترياتك الجاية جوه ميزانية شهرية.', 'Log what you bought, see what you saved versus the usual price, and plan upcoming buys inside a monthly budget.')}>
        <Button variant="outline" size="sm" onClick={() => downloadFile('safqa-savings.csv', toCsv([['date', 'item', 'paid_egp', 'reference_egp', 'saved_egp'], ...purchases.map((p) => [p.at.slice(0, 10), p.title, p.paidEgp, p.referenceEgp, Math.max(0, p.referenceEgp - p.paidEgp)])]), 'text/csv')}><Download className="h-4 w-4" />CSV</Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><p className="text-sm text-muted">{tr('إجمالي التوفير', 'Total saved')}</p><p className="mt-1 text-3xl font-bold text-palm"><CountUp value={saved} format={(n) => m(n)} /></p></Card>
        <Card><p className="text-sm text-muted">{tr('صرفت الشهر ده', 'Spent this month')}</p><p className="mt-1 text-3xl font-bold"><CountUp value={spentMonth} format={(n) => m(n)} /></p></Card>
        <Card><p className="text-sm text-muted">{tr('متبقي من الميزانية', 'Budget left')}</p><p className={`mt-1 text-3xl font-bold ${left < 0 ? 'text-destructive' : ''}`}>{m(left)}</p></Card>
        <Card className="flex items-center gap-3"><ScoreRing score={goalPct} /><div><p className="text-sm text-muted">{tr('هدف التوفير', 'Savings goal')}</p><p className="num font-bold">{m(budget.goalEgp)}</p></div></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="flex items-center gap-2 text-lg font-bold"><Wallet className="h-5 w-5 text-primary" />{tr('مخطط الميزانية', 'Budget planner')}</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="text-sm"><span className="text-muted">{tr('الميزانية الشهرية', 'Monthly budget')}</span><Input type="number" className="num mt-1" value={budget.monthlyEgp} onChange={(e) => setBudget({ ...budget, monthlyEgp: Number(e.target.value) })} /></label>
            <label className="text-sm"><span className="text-muted">{tr('هدف التوفير', 'Savings goal')}</span><Input type="number" className="num mt-1" value={budget.goalEgp} onChange={(e) => setBudget({ ...budget, goalEgp: Number(e.target.value) })} /></label>
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-accent"><div className="bar-grow h-full rounded-full" style={{ width: `${Math.min(100, ((spentMonth + plannedOpen) / (budget.monthlyEgp || 1)) * 100)}%`, background: left < 0 ? 'var(--clay)' : 'var(--saffron)' }} /></div>
          <p className="mt-1 text-xs text-muted">{tr(`مصروف ${m(spentMonth)} + مخطط ${m(plannedOpen)} من ${m(budget.monthlyEgp)}`, `Spent ${m(spentMonth)} + planned ${m(plannedOpen)} of ${m(budget.monthlyEgp)}`)}</p>
          <form onSubmit={addPlanned} className="mt-4 flex flex-wrap gap-2">
            <select name="product" className="h-10 flex-1 rounded-full border border-border bg-card px-3 text-sm" aria-label={tr('منتج', 'Product')}>
              <option value="">{tr('اختار منتج من صفقة…', 'Pick a Safqa product…')}</option>
              {(catalog.data?.items ?? []).map((p) => <option key={p.id} value={p.id}>{localized(locale, { ar: p.titleAr, en: p.titleEn })}</option>)}
            </select>
            <Input name="title" placeholder={tr('أو اكتب اسم', 'or type a name')} className="w-36" />
            <Input name="price" type="number" placeholder={tr('السعر', 'Price')} className="w-28" />
            <Button type="submit" size="sm"><Plus className="h-4 w-4" />{tr('ضيف', 'Add')}</Button>
          </form>
          <ul className="mt-3 space-y-2">
            {budget.planned.map((p) => (
              <li key={p.id} className={`flex items-center gap-2 rounded-2xl bg-accent px-3 py-2 text-sm ${p.bought ? 'opacity-60 line-through' : ''}`}>
                <input type="checkbox" checked={Boolean(p.bought)} aria-label={tr('اتشرى', 'Bought')} onChange={() => setBudget({ ...budget, planned: budget.planned.map((x) => (x.id === p.id ? { ...x, bought: !x.bought } : x)) })} className="accent-[var(--saffron)]" />
                <span className="flex-1 truncate">{p.title}</span>
                <span className="num font-semibold">{m(p.priceEgp)}</span>
                <button type="button" aria-label={tr('امسح', 'Delete')} onClick={() => setBudget({ ...budget, planned: budget.planned.filter((x) => x.id !== p.id) })}><Trash2 className="h-4 w-4 text-muted" /></button>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 className="flex items-center gap-2 text-lg font-bold"><Target className="h-5 w-5 text-primary" />{tr('متتبع التوفير', 'Savings tracker')}</h2>
          <form onSubmit={addPurchase} className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Input name="title" placeholder={tr('اشتريت إيه؟', 'What did you buy?')} className="col-span-2" required />
            <Input name="paid" type="number" placeholder={tr('دفعت', 'Paid')} required />
            <Input name="ref" type="number" placeholder={tr('السعر العادي', 'Usual price')} required />
            <Button type="submit" size="sm" className="col-span-2 sm:col-span-4"><Plus className="h-4 w-4" />{tr('سجّل', 'Log it')}</Button>
          </form>
          {chart.length > 1 ? (
            <div className="mt-4 h-40" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart}><defs><linearGradient id="sv" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0e6b52" stopOpacity={0.35} /><stop offset="100%" stopColor="#0e6b52" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="var(--line)" strokeDasharray="3 3" /><XAxis dataKey="d" tick={{ fontSize: 10, fill: 'var(--muted)' }} /><YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} width={50} /><Tooltip formatter={(v) => m(Number(v))} contentStyle={{ background: 'var(--elev)', borderRadius: 12, border: '1px solid var(--line)' }} /><Area dataKey="v" stroke="#0e6b52" fill="url(#sv)" strokeWidth={2} /></AreaChart>
              </ResponsiveContainer>
            </div>
          ) : null}
          <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto">
            {purchases.length === 0 ? <li className="text-sm text-muted">{tr('لسه مسجّلتش حاجة. من صفحة أي منتج دوس "اشتريته".', 'Nothing yet. Tap "I bought it" on any product page.')}</li> : null}
            {purchases.map((p) => (
              <li key={p.id} className="flex items-center gap-2 rounded-2xl bg-accent px-3 py-2 text-sm">
                <span className="flex-1 truncate">{p.title}<span className="block text-xs text-muted">{new Date(p.at).toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-GB')}</span></span>
                <span className="num">{m(p.paidEgp)}</span>
                <span className={`num text-xs font-bold ${p.referenceEgp > p.paidEgp ? 'text-palm' : 'text-muted'}`}>{p.referenceEgp > p.paidEgp ? `-${m(p.referenceEgp - p.paidEgp)}` : '±0'}</span>
                <button type="button" aria-label={tr('امسح', 'Delete')} onClick={() => setPurchases(purchases.filter((x) => x.id !== p.id))}><Trash2 className="h-4 w-4 text-muted" /></button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
