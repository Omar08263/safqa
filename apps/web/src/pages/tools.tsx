import { formatEGP } from '@safqa/shared';
import { BadgePercent, Calculator, Coins, Landmark, Percent, RefreshCw, Ruler, Truck, Hourglass } from 'lucide-react';
import { ReactNode, useEffect, useState } from 'react';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Card, PageHeader } from '../fx/fx';
import { track } from '../lib/activity';
import { useLocal } from '../lib/local';
import { usePrefs } from '../lib/prefs';
import { useTr } from '../lib/tr';

function Field({ label, value, onChange, suffix, step = 1 }: { label: string; value: number; onChange: (n: number) => void; suffix?: string; step?: number }) {
  return (
    <label className="block text-sm">
      <span className="text-muted">{label}</span>
      <div className="relative mt-1">
        <Input type="number" inputMode="decimal" step={step} value={Number.isFinite(value) ? value : 0} min={0} onChange={(e) => onChange(Number(e.target.value))} className="num pe-14" />
        {suffix ? <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs text-muted">{suffix}</span> : null}
      </div>
    </label>
  );
}
function Result({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="rounded-2xl bg-accent p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`num mt-0.5 font-bold ${big ? 'text-2xl text-primary' : 'text-lg'}`}>{value}</p>
    </div>
  );
}

const tabs = [
  { id: 'installment', icon: Landmark, ar: 'التقسيط', en: 'Installments' },
  { id: 'vat', icon: Percent, ar: 'ضريبة القيمة المضافة', en: 'VAT 14%' },
  { id: 'currency', icon: Coins, ar: 'تحويل العملات', en: 'Currency' },
  { id: 'discount', icon: BadgePercent, ar: 'حاسبة الخصم', en: 'Discount' },
  { id: 'true', icon: Truck, ar: 'السعر الحقيقي', en: 'True cost' },
  { id: 'unit', icon: Ruler, ar: 'سعر الوحدة', en: 'Unit price' },
  { id: 'use', icon: Hourglass, ar: 'تكلفة الاستخدام', en: 'Cost per use' },
] as const;
type Tab = (typeof tabs)[number]['id'];

export function ToolsPage({ price }: { price?: number }) {
  const tr = useTr();
  const { locale } = usePrefs();
  const [tab, setTab] = useState<Tab>('installment');
  useEffect(() => track.tool(tab), [tab]);
  const m = (n: number) => formatEGP(Math.round(Number.isFinite(n) ? n : 0), locale);
  return (
    <div>
      <PageHeader icon={<Calculator className="h-6 w-6" />} kicker={tr('٧ أدوات مالية', '7 money tools')} title={tr('أدوات التوفير', 'Saving tools')} lede={tr('احسب القسط الحقيقي، الضريبة، تحويل العملة، والسعر النهائي بعد الشحن والكاش باك — كله على جهازك.', 'Work out the real installment, VAT, currency, and final price after shipping and cashback — all on your device.')} />
      <div className="mb-6 flex gap-2 overflow-x-auto pb-1" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`press flex flex-none items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${tab === t.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'}`}>
            <t.icon className="h-4 w-4" />{locale === 'ar' ? t.ar : t.en}
          </button>
        ))}
      </div>
      <div key={tab} className="page-enter">
        {tab === 'installment' ? <Installment initial={price} m={m} /> : null}
        {tab === 'vat' ? <Vat initial={price} m={m} /> : null}
        {tab === 'currency' ? <Currency initial={price} /> : null}
        {tab === 'discount' ? <DiscountCalc initial={price} m={m} /> : null}
        {tab === 'true' ? <TrueCost initial={price} m={m} /> : null}
        {tab === 'unit' ? <UnitPrice m={m} /> : null}
        {tab === 'use' ? <CostPerUse initial={price} m={m} /> : null}
      </div>
    </div>
  );
}

function Two({ left, right }: { left: ReactNode; right: ReactNode }) {
  return <div className="grid gap-6 lg:grid-cols-2"><Card className="space-y-3">{left}</Card><Card>{right}</Card></div>;
}

function Installment({ initial, m }: { initial?: number; m: (n: number) => string }) {
  const tr = useTr();
  const [price, setPrice] = useState(initial ?? 30000);
  const [down, setDown] = useState(0);
  const [months, setMonths] = useState(12);
  const [rate, setRate] = useState(12);
  const [fee, setFee] = useState(1.5);
  const principal = Math.max(0, price - down);
  const interest = principal * (rate / 100) * (months / 12);
  const admin = principal * (fee / 100);
  const total = principal + interest + admin;
  const monthly = months ? total / months : 0;
  const extraPct = price ? ((total + down - price) / price) * 100 : 0;
  const presets = [
    { ar: '٠٪ على ٦ شهور', en: '0% for 6 months', months: 6, rate: 0, fee: 0 },
    { ar: 'فايدة ثابتة ١٢٪ سنويًا · ١٢ شهر', en: '12% flat / year · 12 months', months: 12, rate: 12, fee: 1.5 },
    { ar: 'فايدة ثابتة ٢٠٪ سنويًا · ٢٤ شهر', en: '20% flat / year · 24 months', months: 24, rate: 20, fee: 2 },
  ];
  return (
    <Two
      left={
        <>
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => <Button key={p.en} size="sm" variant="outline" onClick={() => { setMonths(p.months); setRate(p.rate); setFee(p.fee); }}>{tr(p.ar, p.en)}</Button>)}
          </div>
          <p className="text-xs text-muted">{tr('الاختيارات دي أمثلة شائعة، مش عروض بنك معيّن. راجع شروط بنكك.', 'Presets are common examples, not a specific bank offer. Check your bank terms.')}</p>
          <Field label={tr('سعر المنتج', 'Product price')} value={price} onChange={setPrice} suffix="EGP" step={100} />
          <Field label={tr('المقدّم', 'Down payment')} value={down} onChange={setDown} suffix="EGP" step={100} />
          <label className="block text-sm"><span className="text-muted">{tr('عدد الشهور', 'Months')}: <b className="num">{months}</b></span><input type="range" min={3} max={60} step={3} value={months} onChange={(e) => setMonths(Number(e.target.value))} className="mt-2 w-full accent-[var(--saffron)]" /></label>
          <Field label={tr('الفايدة الثابتة السنوية', 'Flat annual rate')} value={rate} onChange={setRate} suffix="%" step={0.5} />
          <Field label={tr('مصاريف إدارية', 'Admin fee')} value={fee} onChange={setFee} suffix="%" step={0.25} />
        </>
      }
      right={
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Result big label={tr('القسط الشهري', 'Monthly payment')} value={m(monthly)} /></div>
            <Result label={tr('إجمالي الفوايد', 'Total interest')} value={m(interest)} />
            <Result label={tr('المصاريف', 'Fees')} value={m(admin)} />
            <Result label={tr('هتدفع إجمالي', 'Total paid')} value={m(total + down)} />
            <Result label={tr('زيادة عن الكاش', 'Over cash price')} value={`${extraPct.toFixed(1)}%`} />
          </div>
          <div className="mt-4 h-4 overflow-hidden rounded-full bg-accent" title={tr('توزيع المبلغ', 'Breakdown')}>
            <div className="flex h-full">
              <span style={{ width: `${(principal / (total + down || 1)) * 100}%`, background: 'var(--palm)' }} />
              <span style={{ width: `${(down / (total + down || 1)) * 100}%`, background: 'var(--muted)' }} />
              <span style={{ width: `${((interest + admin) / (total + down || 1)) * 100}%`, background: 'var(--clay)' }} />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">🟩 {tr('أصل المبلغ', 'Principal')} · ⬜ {tr('المقدّم', 'Down')} · 🟥 {tr('فوايد ومصاريف', 'Interest & fees')}</p>
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer font-semibold">{tr('جدول السداد', 'Payment schedule')}</summary>
            <ol className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs">
              {Array.from({ length: Math.min(months, 60) }, (_, i) => (
                <li key={i} className="num flex justify-between rounded-lg bg-accent px-3 py-1"><span>{tr('شهر', 'Month')} {i + 1}</span><span>{m(monthly)}</span><span className="text-muted">{tr('متبقي', 'left')} {m(total - monthly * (i + 1))}</span></li>
              ))}
            </ol>
          </details>
        </>
      }
    />
  );
}

function Vat({ initial, m }: { initial?: number; m: (n: number) => string }) {
  const tr = useTr();
  const [amount, setAmount] = useState(initial ?? 10000);
  const [rate, setRate] = useState(14);
  return (
    <Two
      left={<><Field label={tr('المبلغ', 'Amount')} value={amount} onChange={setAmount} suffix="EGP" /><Field label={tr('نسبة الضريبة (مصر ١٤٪)', 'VAT rate (Egypt 14%)')} value={rate} onChange={setRate} suffix="%" /></>}
      right={
        <div className="grid gap-3 sm:grid-cols-2">
          <Result label={tr('لو المبلغ من غير ضريبة → بالضريبة', 'If amount excludes VAT → with VAT')} value={m(amount * (1 + rate / 100))} big />
          <Result label={tr('قيمة الضريبة المضافة', 'VAT added')} value={m(amount * (rate / 100))} />
          <Result label={tr('لو المبلغ شامل الضريبة → من غيرها', 'If amount includes VAT → without')} value={m(amount / (1 + rate / 100))} big />
          <Result label={tr('الضريبة جوه السعر', 'VAT inside the price')} value={m(amount - amount / (1 + rate / 100))} />
        </div>
      }
    />
  );
}

function Currency({ initial }: { initial?: number }) {
  const tr = useTr();
  const { locale } = usePrefs();
  const [rates, setRates] = useLocal<{ at: string | null; source: string; perEgp: Record<string, number> }>('safqa.fx.v1', { at: null, source: 'manual', perEgp: { USD: 0.0203, EUR: 0.0175, SAR: 0.076, AED: 0.0745, GBP: 0.0152 } });
  const [amount, setAmount] = useState(initial ?? 1000);
  const [dir, setDir] = useState<'from' | 'to'>('from');
  const [status, setStatus] = useState<string | null>(null);
  async function refresh() {
    setStatus(tr('بجيب الأسعار…', 'Fetching rates…'));
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/EGP');
      const data = await res.json();
      if (data?.result !== 'success') throw new Error('bad');
      const pick = ['USD', 'EUR', 'SAR', 'AED', 'GBP'];
      setRates({ at: new Date().toISOString(), source: 'open.er-api.com', perEgp: Object.fromEntries(pick.map((c) => [c, data.rates[c]])) });
      setStatus(null);
    } catch {
      setStatus(tr('مقدرتش أجيب الأسعار — استخدم آخر أسعار محفوظة أو عدّلها بإيدك.', 'Could not fetch — using saved rates; you can edit them.'));
    }
  }
  useEffect(() => {
    if (!rates.at || Date.now() - new Date(rates.at).getTime() > 6 * 3600_000) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Two
      left={
        <>
          <div className="grid grid-cols-2 rounded-full bg-accent p-1 text-sm">
            <button type="button" onClick={() => setDir('from')} className={`rounded-full py-1.5 font-semibold ${dir === 'from' ? 'bg-card shadow' : 'text-muted'}`}>{tr('من الجنيه', 'From EGP')}</button>
            <button type="button" onClick={() => setDir('to')} className={`rounded-full py-1.5 font-semibold ${dir === 'to' ? 'bg-card shadow' : 'text-muted'}`}>{tr('للجنيه', 'To EGP')}</button>
          </div>
          <Field label={dir === 'from' ? tr('المبلغ بالجنيه', 'Amount in EGP') : tr('المبلغ بالعملة', 'Amount in currency')} value={amount} onChange={setAmount} />
          <div className="flex items-center gap-2 text-xs text-muted">
            <Button size="sm" variant="outline" onClick={() => void refresh()}><RefreshCw className="h-3.5 w-3.5" />{tr('حدّث الأسعار', 'Refresh rates')}</Button>
            <span>{rates.at ? tr(`المصدر: ${rates.source} · ${new Date(rates.at).toLocaleString('ar-EG')}`, `Source: ${rates.source} · ${new Date(rates.at).toLocaleString('en-GB')}`) : tr('أسعار يدوية تقريبية — حدّثها', 'Approximate manual rates — refresh them')}</span>
          </div>
          {status ? <p className="text-xs text-destructive">{status}</p> : null}
        </>
      }
      right={
        <ul className="space-y-2">
          {Object.entries(rates.perEgp).map(([code, r]) => (
            <li key={code} className="flex items-center justify-between rounded-2xl bg-accent px-4 py-3">
              <span className="font-bold">{code}</span>
              <span className="num text-lg font-bold">{dir === 'from' ? (amount * r).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en', { maximumFractionDigits: 2 }) : formatEGP(Math.round(amount / r), locale)}</span>
              <label className="text-xs text-muted">1 EGP = <input aria-label={`${code} rate`} className="num w-20 rounded-md border border-border bg-card px-1" type="number" step="0.0001" value={r} onChange={(e) => setRates({ ...rates, source: 'manual', perEgp: { ...rates.perEgp, [code]: Number(e.target.value) } })} /></label>
            </li>
          ))}
        </ul>
      }
    />
  );
}

function DiscountCalc({ initial, m }: { initial?: number; m: (n: number) => string }) {
  const tr = useTr();
  const [price, setPrice] = useState(initial ?? 5000);
  const [pct, setPct] = useState(20);
  const [extra, setExtra] = useState(10);
  const after = price * (1 - pct / 100);
  const stacked = after * (1 - extra / 100);
  const effective = price ? (1 - stacked / price) * 100 : 0;
  return (
    <Two
      left={<><Field label={tr('السعر الأصلي', 'Original price')} value={price} onChange={setPrice} suffix="EGP" /><Field label={tr('الخصم الأول', 'First discount')} value={pct} onChange={setPct} suffix="%" /><Field label={tr('خصم إضافي (كوبون/بنك)', 'Extra discount (coupon/bank)')} value={extra} onChange={setExtra} suffix="%" /></>}
      right={
        <div className="grid gap-3 sm:grid-cols-2">
          <Result label={tr('بعد الخصم الأول', 'After first discount')} value={m(after)} />
          <Result label={tr('بعد الخصمين', 'After both')} value={m(stacked)} big />
          <Result label={tr('الخصم الفعلي الإجمالي', 'Effective total discount')} value={`${effective.toFixed(1)}%`} />
          <Result label={tr('وفّرت', 'You save')} value={m(price - stacked)} />
          <p className="text-xs text-muted sm:col-span-2">{tr(`خصم ${pct}% + ${extra}% مش ${pct + extra}%! الخصم التاني بيتحسب على السعر بعد الأول.`, `${pct}% + ${extra}% is not ${pct + extra}%! The second applies to the already-reduced price.`)}</p>
        </div>
      }
    />
  );
}

function TrueCost({ initial, m }: { initial?: number; m: (n: number) => string }) {
  const tr = useTr();
  const [price, setPrice] = useState(initial ?? 12000);
  const [ship, setShip] = useState(60);
  const [cod, setCod] = useState(15);
  const [cashback, setCashback] = useState(3);
  const [warranty, setWarranty] = useState(0);
  const total = price + ship + cod + warranty - price * (cashback / 100);
  return (
    <Two
      left={<><Field label={tr('سعر المنتج', 'Price')} value={price} onChange={setPrice} suffix="EGP" /><Field label={tr('الشحن', 'Shipping')} value={ship} onChange={setShip} suffix="EGP" /><Field label={tr('رسوم الدفع عند الاستلام', 'Cash-on-delivery fee')} value={cod} onChange={setCod} suffix="EGP" /><Field label={tr('ضمان إضافي', 'Extended warranty')} value={warranty} onChange={setWarranty} suffix="EGP" /><Field label={tr('كاش باك', 'Cashback')} value={cashback} onChange={setCashback} suffix="%" step={0.5} /></>}
      right={<div className="grid gap-3"><Result big label={tr('السعر الحقيقي اللي هتدفعه', 'What you really pay')} value={m(total)} /><Result label={tr('فرق عن السعر المعروض', 'Versus listed price')} value={`${total >= price ? '+' : ''}${m(total - price)}`} /></div>}
    />
  );
}

function UnitPrice({ m }: { m: (n: number) => string }) {
  const tr = useTr();
  const [a, setA] = useState({ price: 11499, qty: 256 });
  const [b, setB] = useState({ price: 17999, qty: 512 });
  const ua = a.qty ? a.price / a.qty : 0;
  const ub = b.qty ? b.price / b.qty : 0;
  const better = ua && ub ? (ua < ub ? 'A' : 'B') : null;
  return (
    <Two
      left={
        <div className="grid grid-cols-2 gap-3">
          <p className="col-span-2 text-xs text-muted">{tr('قارن سعر الجيجا، اللتر، الكيلو، أو الوحدة بين اختيارين.', 'Compare price per GB, litre, kilo or unit between two options.')}</p>
          <Field label={tr('السعر (أ)', 'Price (A)')} value={a.price} onChange={(price) => setA({ ...a, price })} suffix="EGP" />
          <Field label={tr('الكمية (أ)', 'Quantity (A)')} value={a.qty} onChange={(qty) => setA({ ...a, qty })} />
          <Field label={tr('السعر (ب)', 'Price (B)')} value={b.price} onChange={(price) => setB({ ...b, price })} suffix="EGP" />
          <Field label={tr('الكمية (ب)', 'Quantity (B)')} value={b.qty} onChange={(qty) => setB({ ...b, qty })} />
        </div>
      }
      right={
        <div className="grid gap-3 sm:grid-cols-2">
          <Result label={tr('سعر الوحدة (أ)', 'Unit price (A)')} value={m(ua * 100) + ' / 100'} big={better === 'A'} />
          <Result label={tr('سعر الوحدة (ب)', 'Unit price (B)')} value={m(ub * 100) + ' / 100'} big={better === 'B'} />
          {better ? <p className="text-sm font-semibold text-palm sm:col-span-2">{tr(`الاختيار (${better === 'A' ? 'أ' : 'ب'}) أوفر بـ ${(Math.abs(ua - ub) / Math.max(ua, ub) * 100).toFixed(1)}% للوحدة`, `Option ${better} is ${(Math.abs(ua - ub) / Math.max(ua, ub) * 100).toFixed(1)}% cheaper per unit`)}</p> : null}
        </div>
      }
    />
  );
}

function CostPerUse({ initial, m }: { initial?: number; m: (n: number) => string }) {
  const tr = useTr();
  const [price, setPrice] = useState(initial ?? 54999);
  const [years, setYears] = useState(3);
  const [resale, setResale] = useState(35);
  const [uses, setUses] = useState(1);
  const net = price * (1 - resale / 100);
  const months = years * 12;
  return (
    <Two
      left={<><Field label={tr('السعر', 'Price')} value={price} onChange={setPrice} suffix="EGP" /><Field label={tr('هتستخدمه كام سنة', 'Years of use')} value={years} onChange={setYears} step={0.5} /><Field label={tr('قيمة إعادة البيع المتوقعة', 'Expected resale value')} value={resale} onChange={setResale} suffix="%" /><Field label={tr('مرات الاستخدام في اليوم', 'Uses per day')} value={uses} onChange={setUses} /></>}
      right={<div className="grid gap-3 sm:grid-cols-2"><Result big label={tr('تكلفته عليك في الشهر', 'Cost per month')} value={m(months ? net / months : 0)} /><Result label={tr('في اليوم', 'Per day')} value={m(years ? net / (years * 365) : 0)} /><Result label={tr('في كل استخدام', 'Per use')} value={formatEGP(Number(((years && uses) ? net / (years * 365 * uses) : 0).toFixed(2)), 'en')} /><Result label={tr('التكلفة الصافية بعد البيع', 'Net cost after resale')} value={m(net)} /></div>}
    />
  );
}
