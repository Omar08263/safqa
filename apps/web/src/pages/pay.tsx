// Memberships checkout with InstaPay + discount codes, on the real backend.
import { Check, Copy, ExternalLink, Loader2, ShieldCheck, Ticket, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { TelegramFollowButton } from '../components/telegram-follow';
import { Card, PageHeader } from '../fx/fx';
import { compressImage, edge, EdgeError, edgeUp, type EdgeTier, type PayInfo, type Payment, signedInToBackend } from '../lib/edge';
import { useSession } from '../lib/session';
import { useTr } from '../lib/tr';

const SUPPORT_EN: Record<string, string> = { free: 'Community', silver: 'Within 48 hours', gold: 'Within 24 hours', diamond: 'Same day' };

const STATUS: Record<Payment['status'], [string, string]> = {
  awaiting: ['مستني التحويل', 'bg-slate-500/15 text-slate-500'],
  pending: ['بيتراجع ⏳', 'bg-amber-500/15 text-amber-600'],
  provisional: ['متفعّل مبدئيًا 🎉', 'bg-sky-500/15 text-sky-600'],
  approved: ['اتأكد ✅', 'bg-emerald-500/15 text-emerald-600'],
  rejected: ['اترفض ❌', 'bg-red-500/15 text-red-600'],
  revoked: ['اتلغى', 'bg-red-500/15 text-red-600'],
};

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="press inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs" onClick={() => { void navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); }}>
      {ok ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{ok ? 'اتنسخ' : 'نسخ'}
    </button>
  );
}

export function PayPage() {
  const tr = useTr();
  const { user } = useSession();
  const [tiers, setTiers] = useState<EdgeTier[]>([]);
  const [pay, setPay] = useState<PayInfo | null>(null);
  const [up, setUp] = useState<boolean | null>(null);
  const [tier, setTier] = useState<EdgeTier['id']>(() => (new URLSearchParams(window.location.search).get('tier') as EdgeTier['id']) || 'gold');
  const [months, setMonths] = useState(1);
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState('');
  const [codeMsg, setCodeMsg] = useState<{ ok: boolean; text: string; amount?: number } | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [mine, setMine] = useState<Payment[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [txn, setTxn] = useState('');
  const [result, setResult] = useState<Payment | null>(null);
  const linked = signedInToBackend();

  useEffect(() => {
    void edgeUp(true).then(setUp);
    edge<{ tiers: EdgeTier[]; pay: PayInfo }>('/api/v2/tiers').then((r) => { setTiers(r.tiers); setPay(r.pay); }).catch(() => setUp(false));
  }, []);
  useEffect(() => { if (linked) edge<{ items: Payment[] }>('/api/v2/payments/mine').then((r) => setMine(r.items)).catch(() => 0); }, [linked, result]);

  const t = tiers.find((x) => x.id === tier);
  const list = (t?.price ?? 0) * months;

  async function checkCode() {
    setCodeMsg(null);
    try {
      const r = await edge<any>('/api/v2/codes/check', { body: { code, tier, months } });
      if (r.ok && r.kind === 'upgrade') {
        const u = await edge<any>('/api/v2/codes/redeem', { body: { code } });
        setCodeMsg({ ok: true, text: `🎁 ${u.label} — باقتك بقت ${u.tier} لحد ${new Date(u.until).toLocaleDateString('ar-EG')}` });
      } else if (r.ok) setCodeMsg({ ok: true, text: `🎉 ${r.label}: هتدفع ${r.amount} ج بدل ${r.listAmount} ج`, amount: r.amount });
      else setCodeMsg({ ok: false, text: r.message });
    } catch (e) { setCodeMsg({ ok: false, text: (e as Error).message }); }
  }
  async function start() {
    setErr(''); setBusy(true); setResult(null);
    try { setPayment(await edge<Payment>('/api/v2/payments', { body: { tier, months, code: codeMsg?.ok && codeMsg.amount != null ? code : undefined } })); }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }
  async function submit() {
    if (!payment || !file) return;
    setErr(''); setBusy(true);
    try {
      const img = await compressImage(file, 1400, 0.82);
      const r = await edge<Payment>(`/api/v2/payments/${payment.id}/receipt`, { body: { image: img.b64, mime: img.mime, txnRef: txn } });
      setResult(r); setPayment(null); setFile(null); setTxn('');
    } catch (e) { setErr(e instanceof EdgeError ? e.message : 'حصلت مشكلة في الرفع'); }
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      <PageHeader kicker={tr('الباقات والدفع', 'Plans & payment')} title={tr('رقّي باقتك بإنستاباي', 'Upgrade with InstaPay')} lede={tr('حوّل المبلغ بالظبط على إنستاباي واكتب كود الدفع في الملاحظة، وارفع صورة الإيصال. وكيل ذكاء اصطناعي 🤖 بيراجع الإيصال فورًا، وصاحب الموقع بيأكد.', 'Transfer the exact amount via InstaPay with your payment code in the note, then upload the receipt. An AI agent 🤖 checks it instantly and the owner confirms.')} icon={<ShieldCheck className="h-6 w-6" />}>
        <TelegramFollowButton compact />
      </PageHeader>
      {up === false ? <Card><p>⚠️ {tr('الدفع محتاج السيرفر وهو مش متاح دلوقتي — جرّب كمان شوية.', 'Payments need the server, which is unreachable right now.')}</p></Card> : null}
      {!user || !linked ? <Card><p className="font-semibold">{tr('سجّل دخول الأول عشان باقتك تتربط بحسابك على الموقع والتطبيق وتيليجرام.', 'Sign in first so your plan syncs across web, app and Telegram.')}</p><a href="/login" className="press mt-3 inline-flex rounded-full bg-primary px-4 py-2 font-semibold text-primary-foreground">{tr('تسجيل الدخول', 'Sign in')}</a>{user && !linked ? <p className="t-meta mt-2">{tr('حسابك الحالي محفوظ في المتصفح بس — اخرج وادخل تاني بنفس الإيميل والباسورد وهيتنقل للسيرفر تلقائي.', 'Your current account lives only in this browser — sign out and back in and it moves to the server automatically.')}</p> : null}</Card> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiers.map((x) => (
          <button key={x.id} type="button" disabled={x.price === 0} onClick={() => { setTier(x.id); setPayment(null); setCodeMsg(null); }} className={`press glass rounded-3xl p-5 text-start transition ${tier === x.id ? 'ring-2 ring-primary' : ''} ${x.price === 0 ? 'opacity-70' : ''}`} style={{ borderTop: `4px solid ${x.color}` }}>
            <div className="text-3xl">{x.emoji}</div>
            <p className="mt-1 text-lg font-extrabold">{tr(x.ar, x.en || x.ar)}</p>
            <p className="text-2xl font-black">{x.price ? `${x.price} ج` : tr('ببلاش', 'Free')}<span className="text-sm font-normal text-muted">{x.price ? tr(' / شهر', ' / mo') : ''}</span></p>
            <ul className="t-meta mt-2 space-y-1" lang="ar">{x.perks.map((p) => <li key={p}>• {p}</li>)}</ul>
            <p className="t-meta mt-2">🛟 {tr('الدعم:', 'Support:')} {tr(x.support, SUPPORT_EN[x.id] ?? x.support)}</p>
          </button>
        ))}
      </div>

      {t && t.price > 0 && user && linked ? (
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-lg font-bold">{t.emoji} {t.ar}</p>
            <select value={months} onChange={(e) => { setMonths(Number(e.target.value)); setPayment(null); }} className="rounded-xl border border-border bg-transparent px-3 py-2">
              {[1, 3, 6, 12].map((m) => <option key={m} value={m}>{m} {tr('شهر', 'mo')}</option>)}
            </select>
            <p className="text-xl font-black">{codeMsg?.amount != null ? <><s className="text-muted">{list}</s> {codeMsg.amount}</> : list} ج</p>
            <button type="button" className="press inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-semibold" onClick={() => setCodeOpen((v) => !v)}><Ticket className="h-4 w-4" />{tr('عندك كود؟', 'Have a code?')}</button>
          </div>
          {codeOpen ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="SAFQA20" className="h-10 w-48 rounded-xl border border-border bg-transparent px-3 font-mono" dir="ltr" />
              <button type="button" onClick={checkCode} disabled={!code} className="press h-10 rounded-xl bg-primary px-4 font-semibold text-primary-foreground">{tr('تطبيق', 'Apply')}</button>
              {codeMsg ? <span className={codeMsg.ok ? 'text-emerald-600' : 'text-red-600'}>{codeMsg.text}</span> : null}
            </div>
          ) : null}
          {!payment ? <button type="button" onClick={start} disabled={busy} className="press mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 font-bold text-primary-foreground">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{tr('ابدأ الدفع بإنستاباي', 'Pay with InstaPay')}</button> : null}
          {payment && pay ? (
            <div className="mt-5 grid gap-5 md:grid-cols-[220px_1fr]">
              <div className="text-center">
                <img src={`${import.meta.env.BASE_URL}pay/instapay-qr.jpg`} alt="InstaPay QR" className="mx-auto w-52 rounded-2xl bg-white p-2" />
                <a href={pay.link} target="_blank" rel="noreferrer" className="press mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#5b2a86] px-4 py-2 text-sm font-semibold text-white"><ExternalLink className="h-4 w-4" />{tr('افتح إنستاباي', 'Open InstaPay')}</a>
              </div>
              <div className="space-y-3">
                <ol className="t-body list-inside list-decimal space-y-2">
                  <li>{tr('حوّل على العنوان ده:', 'Send to:')} <b className="font-mono" dir="ltr">{pay.address}</b> <CopyBtn text={pay.address} /></li>
                  <li>{tr('المبلغ بالظبط:', 'Exact amount:')} <b className="text-xl">{payment.amount} ج</b> <CopyBtn text={String(payment.amount)} /></li>
                  <li>{tr('اكتب كود الدفع ده في ملاحظة التحويل:', 'Put this code in the transfer note:')} <b className="font-mono text-lg" dir="ltr">{payment.refCode}</b> <CopyBtn text={payment.refCode} /></li>
                  <li>{tr('ارفع صورة الإيصال واكتب الرقم المرجعي (Reference):', 'Upload the receipt and type the reference number:')}</li>
                </ol>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="press inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border px-4 py-2.5"><Upload className="h-4 w-4" />{file ? file.name : tr('صورة الإيصال', 'Receipt image')}<input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
                  <input value={txn} onChange={(e) => setTxn(e.target.value)} placeholder={tr('الرقم المرجعي', 'Reference no.')} className="h-11 rounded-xl border border-border bg-transparent px-3 font-mono" dir="ltr" />
                  <button type="button" onClick={submit} disabled={busy || !file || txn.trim().length < 6} className="press inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 font-bold text-primary-foreground disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{tr('ابعت للمراجعة', 'Submit')}</button>
                </div>
                <p className="t-meta">🔒 {tr('صورة الإيصال بتتصغّر في جهازك، ومحدش يشوفها غير صاحب الموقع، وبتتمسح تلقائي بعد 90 يوم.', 'The receipt is shrunk on your device, only the owner can see it, and it is deleted automatically after 90 days.')}</p>
              </div>
            </div>
          ) : null}
          {err ? <p className="mt-3 text-red-600">⚠️ {err}</p> : null}
        </Card>
      ) : null}

      {result ? (
        <Card className="tier-reveal">
          <p className="text-lg font-bold">{result.messageAr}</p>
          {result.checks?.checks ? <ul className="t-body mt-2 space-y-1">{result.checks.checks.map((c) => <li key={c.id}>{c.ok === true ? '✅' : c.ok === false ? '❌' : '❔'} {c.ar}</li>)}</ul> : null}
          <p className="t-meta mt-2">🤖 {tr('المراجعة الأولى بواسطة وكيل ذكاء اصطناعي، والتأكيد النهائي من صاحب الموقع.', 'First check by an AI agent; final confirmation by the owner.')}</p>
        </Card>
      ) : null}

      {mine.length ? (
        <Card>
          <p className="font-bold">{tr('مدفوعاتي', 'My payments')}</p>
          <div className="mt-3 space-y-2">
            {mine.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border p-3">
                <span>{p.tierInfo?.emoji} {p.tierInfo?.ar}</span><b>{p.amount} ج</b><span className="font-mono text-sm" dir="ltr">{p.refCode}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS[p.status][1]}`}>{STATUS[p.status][0]}</span>
                {p.note ? <span className="t-meta">{p.note}</span> : null}
                {p.status === 'awaiting' ? <button type="button" className="press text-sm text-primary underline" onClick={() => { setPayment(p); setTier(p.tier as EdgeTier['id']); }}>{tr('كمّل الدفع', 'Continue')}</button> : null}
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
