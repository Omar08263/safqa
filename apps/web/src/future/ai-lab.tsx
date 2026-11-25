import { Brain, Cpu, Download, Sparkles, Trash2, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { type Hit, forgetBrain, reviewInsight, semanticSearch, startBrain, useBrain } from '../ai/brain';
import { askOffline, hasWebGPU, LLM_MODEL, startLlm, useLlm } from '../ai/llm';
import { Feature } from '../components/feature-boundary';
import { sparkle } from '../fx/premium';
import { play } from '../lib/sound';
import { cloudSearch, FutureHero, HitCard } from './shared';

const mb = (b?: number) => (b ? `${(b / 1e6).toFixed(0)} MB` : '');

/** Download/status card for the in-browser brain. */
export function BrainCard({ compact = false }: { compact?: boolean }) {
  const s = useBrain();
  const pct = s.total ? Math.round(((s.loaded ?? 0) / s.total) * 100) : 0;
  if (s.status === 'ready') {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-500/20 text-lg">🧠</span>
        <span className="flex-1"><b>العقل الأوفلاين شغّال</b> · بيفهم {s.products?.toLocaleString('en-US')} منتج بالمعنى · {s.device === 'webgpu' ? 'كارت الشاشة ⚡' : 'المعالج'}</span>
        {!compact && <button type="button" className="press inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs" onClick={forgetBrain}><Trash2 className="h-3.5 w-3.5" /> امسحه من الجهاز</button>}
      </div>
    );
  }
  return (
    <div className="glass-tile rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-violet-500/15 text-2xl">🧠</span>
        <div className="flex-1">
          <p className="font-bold">شغّل عقل صفقة الأوفلاين</p>
          <p className="mt-0.5 text-xs leading-5 text-muted">نموذج multilingual-e5 مضغوط (≈118 MB مرة واحدة) بيشتغل جوه متصفحك: بحث بالمعنى بالعربي والإنجليزي، وتحليل المراجعات — من غير إنترنت ومن غير ما بياناتك تخرج من جهازك.</p>
          {s.status === 'loading' ? (
            <div className="mt-3">
              <div className="h-2 overflow-hidden rounded-full bg-border"><div className="h-full rounded-full bg-gradient-to-l from-violet-500 to-amber-400 transition-all" style={{ width: `${s.stage === 'index' ? 100 : pct}%` }} /></div>
              <p className="mt-1 text-[11px] text-muted">{s.stage === 'index' ? 'بنجهّز فهرس المنتجات…' : `بنزّل العقل… ${pct}% ${mb(s.loaded)} / ${mb(s.total)}`}</p>
            </div>
          ) : (
            <button type="button" data-sfx="magic" className="press mt-3 inline-flex items-center gap-2 rounded-full bg-gradient-to-l from-violet-600 to-fuchsia-500 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-violet-500/30" onClick={(e) => { sparkle(e.clientX, e.clientY); startBrain(); }}>
              <Download className="h-4 w-4" /> {s.status === 'error' ? 'جرّب تاني' : 'نزّله وشغّله'}
            </button>
          )}
          {s.status === 'error' && <p className="mt-2 text-xs text-red-500">حصلت مشكلة: {s.error}. البحث العادي شغّال عادي.</p>}
          {s.status === 'unsupported' && <p className="mt-2 text-xs text-muted">المتصفح ده مش بيدعم تشغيل النماذج — هنستخدم الذكاء السحابي.</p>}
        </div>
      </div>
    </div>
  );
}

/** Drop-in for the search page: «فهمت قصدك» semantic results (offline brain, cloud fallback). */
export function SemanticBoost({ query }: { query: string }) {
  const s = useBrain();
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [meta, setMeta] = useState('');
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) { setHits(null); return; }
    let live = true;
    const t = setTimeout(async () => {
      if (s.status === 'ready') {
        const r = await semanticSearch(q, 12).catch(() => null);
        if (live && r) { setHits(r.items); setMeta(`🧠 أوفلاين · ${r.ms}ms${r.intent.maxPrice ? ` · تحت ${r.intent.maxPrice.toLocaleString('en-US')} ج` : ''}`); }
      } else if (/[\u0600-\u06FF]/.test(q)) {
        const r = await cloudSearch(q, 12).catch(() => []);
        if (live) { setHits(r); setMeta('☁️ سحابي (فعّل العقل الأوفلاين لنتايج أذكى)'); }
      }
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [query, s.status]);
  if (!hits?.length) return null;
  return (
    <Feature flag="offline_ai" off={null}>
      <section className="my-6 rounded-3xl border border-violet-500/20 bg-gradient-to-b from-violet-500/10 to-transparent p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Sparkles className="h-5 w-5 text-violet-500" />
          <h2 className="font-extrabold">فهمت قصدك ✨</h2>
          <span className="text-xs text-muted">{meta}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">{hits.map((h, i) => <HitCard key={h.id} h={h} i={i} />)}</div>
      </section>
    </Feature>
  );
}

/** Product page: offline review insight (pros/cons/sentiment) from the visitor's own device. */
export function ReviewInsight({ texts }: { texts: string[] }) {
  const s = useBrain();
  const [r, setR] = useState<{ pros: string[]; cons: string[]; score: number; n: number } | null>(null);
  const sig = texts.join('\u0001');
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed by content
  useEffect(() => { if (s.status === 'ready' && texts.length) void reviewInsight(texts).then(setR).catch(() => setR(null)); }, [s.status, sig]);
  if (!texts.length) return null;
  if (s.status !== 'ready') return <div className="my-3"><BrainCard compact /></div>;
  if (!r) return <p className="my-3 text-sm text-muted">🧠 بنقرا المراجعات…</p>;
  const mood = r.score > 0.25 ? ['😍', 'الناس مبسوطة جدًا'] : r.score > 0.05 ? ['🙂', 'أغلب الآراء كويسة'] : r.score > -0.1 ? ['😐', 'الآراء متقسمة'] : ['😟', 'فيه شكاوى كتير'];
  return (
    <div className="glass-tile my-4 rounded-2xl p-4">
      <p className="flex items-center gap-2 font-bold"><span className="text-2xl">{mood[0]}</span> ملخص المراجعات بالعقل الأوفلاين: {mood[1]}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div><p className="text-xs font-bold text-emerald-600">👍 بيحبوا</p><ul className="mt-1 space-y-1 text-sm">{r.pros.length ? r.pros.map((p) => <li key={p}>• {p}</li>) : <li className="text-muted">—</li>}</ul></div>
        <div><p className="text-xs font-bold text-red-500">👎 بيشتكوا من</p><ul className="mt-1 space-y-1 text-sm">{r.cons.length ? r.cons.map((p) => <li key={p}>• {p}</li>) : <li className="text-muted">—</li>}</ul></div>
      </div>
      <p className="mt-2 text-[11px] text-muted">اتحلّل على جهازك من {r.n} جملة — مفيش حاجة اتبعتت لأي سيرفر.</p>
    </div>
  );
}

function OfflineChat() {
  const l = useLlm();
  const [msgs, setMsgs] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => { box.current?.scrollTo({ top: 1e6, behavior: 'smooth' }); }, [msgs]);
  async function send(text: string) {
    if (!text.trim() || busy) return;
    const hist = [...msgs, { role: 'user' as const, content: text }];
    setMsgs([...hist, { role: 'assistant', content: '' }]);
    setQ(''); setBusy(true); play('pop');
    try {
      let acc = '';
      for await (const t of askOffline(text, msgs)) { acc += t; setMsgs([...hist, { role: 'assistant', content: acc }]); }
      play('chime');
    } catch (e) { setMsgs([...hist, { role: 'assistant', content: `⚠️ ${(e as Error).message}` }]); }
    setBusy(false);
  }
  if (!hasWebGPU()) return <p className="text-sm text-muted">المساعد الأوفلاين محتاج متصفح بيدعم WebGPU (كروم أو إيدج حديث على كمبيوتر أو أندرويد قوي). المساعد السحابي شغّال عادي من صفحة <a className="text-primary underline" href="/assistant">المساعد الذكي</a>.</p>;
  if (l.status !== 'ready') {
    return (
      <div>
        <p className="text-sm text-muted">نموذج لغة صغير ({LLM_MODEL.split('-q')[0]}, ≈400 MB مرة واحدة) بيرد عليك بالمصري من غير إنترنت، ومربوط بالبحث الأوفلاين علشان يرشحلك منتجات حقيقية بأسعارها.</p>
        {l.status === 'loading' ? (
          <div className="mt-3"><div className="h-2 overflow-hidden rounded-full bg-border"><div className="h-full rounded-full bg-gradient-to-l from-amber-400 to-pink-500 transition-all" style={{ width: `${Math.round((l.progress ?? 0) * 100)}%` }} /></div><p className="mt-1 truncate text-[11px] text-muted" dir="ltr">{l.text}</p></div>
        ) : (
          <button type="button" data-sfx="magic" className="press mt-3 inline-flex items-center gap-2 rounded-full bg-gradient-to-l from-amber-500 to-pink-500 px-4 py-2 text-sm font-bold text-white" onClick={() => void startLlm()}><Cpu className="h-4 w-4" /> {l.status === 'error' ? 'جرّب تاني' : 'شغّل المساعد الأوفلاين'}</button>
        )}
        {l.status === 'error' && <p className="mt-2 text-xs text-red-500">{l.error}</p>}
      </div>
    );
  }
  return (
    <div>
      <div ref={box} className="max-h-80 space-y-2 overflow-auto rounded-2xl bg-accent p-3">
        {!msgs.length && <p className="text-sm text-muted">اسأل أي حاجة، مثلًا: «عايز سماعة للجيم تحت ٢٠٠٠» 👇</p>}
        {msgs.map((m, i) => <p key={i} className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${m.role === 'user' ? 'ms-auto bg-primary text-primary-foreground' : 'bg-[var(--elev)]'}`}>{m.content || '…'}</p>)}
      </div>
      <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); void send(q); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="اكتب سؤالك…" className="flex-1 rounded-full border border-border bg-transparent px-4 py-2 text-sm" />
        <button type="submit" disabled={busy} className="press rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">ابعت</button>
      </form>
    </div>
  );
}

export function AiLabPage() {
  const s = useBrain();
  const [q, setQ] = useState('سماعة للجيم مقاومة للعرق');
  const [hits, setHits] = useState<Hit[]>([]);
  const [info, setInfo] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => { const on = () => setOnline(navigator.onLine); window.addEventListener('online', on); window.addEventListener('offline', on); return () => { window.removeEventListener('online', on); window.removeEventListener('offline', on); }; }, []);
  async function run(text = q) {
    play('magic');
    if (s.status === 'ready') { const r = await semanticSearch(text, 18); setHits(r.items); setInfo(`🧠 أوفلاين على جهازك · ${r.ms}ms`); }
    else { setHits(await cloudSearch(text, 18)); setInfo('☁️ من السحابة (شغّل العقل الأوفلاين لفهم أعمق)'); }
  }
  return (
    <Feature flag="offline_ai">
      <div className="mx-auto max-w-6xl">
        <FutureHero emoji="🧠" kicker="SAFQA OFFLINE AI" title="عقل صفقة" lede="ذكاء اصطناعي مضغوط بيشتغل جوه متصفحك: بيفهم المعنى بالمصري، بيلخّص المراجعات، وبيكلّمك من غير إنترنت. ولو جهازك مش قده، الذكاء السحابي بيكمّل مكانه تلقائيًا." colors={['#8b5cf6', '#f5b544', '#ec4899']}>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${online ? 'bg-white/10' : 'bg-amber-400 text-black'}`}>{online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}{online ? 'متصل' : 'أوفلاين — والعقل شغّال!'}</span>
        </FutureHero>
        <BrainCard />
        <section className="glass mt-5 rounded-3xl p-5">
          <h2 className="flex items-center gap-2 text-lg font-extrabold"><Brain className="h-5 w-5 text-violet-500" /> بحث بالمعنى</h2>
          <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); void run(); }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} className="flex-1 rounded-full border border-border bg-transparent px-4 py-2.5" aria-label="اكتب اللي في بالك" />
            <button type="submit" data-sfx="none" className="press rounded-full bg-gradient-to-l from-violet-600 to-fuchsia-500 px-5 font-bold text-white">افهمني</button>
          </form>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {['حاجة أشحن بيها الموبايل في السفر', 'لابتوب للمذاكرة تحت 30 ألف', 'هدية لماما في المطبخ', 'سبيكر صغير للبحر'].map((x) => <button key={x} type="button" className="press rounded-full border border-border px-3 py-1" onClick={() => { setQ(x); void run(x); }}>{x}</button>)}
          </div>
          {info && <p className="mt-3 text-xs text-muted">{info}</p>}
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{hits.map((h, i) => <HitCard key={h.id} h={h} i={i} />)}</div>
        </section>
        <Feature flag="webllm" off={null}>
          <section className="glass mt-5 rounded-3xl p-5">
            <h2 className="flex items-center gap-2 text-lg font-extrabold"><Cpu className="h-5 w-5 text-amber-500" /> مساعد بيتكلم من غير إنترنت</h2>
            <div className="mt-3"><OfflineChat /></div>
          </section>
        </Feature>
        <p className="mt-4 text-center text-[11px] text-muted">النماذج: Xenova/multilingual-e5-small (MIT) عبر transformers.js، و Qwen2.5-0.5B-Instruct (Apache-2.0) عبر WebLLM. بتتخزّن في متصفحك بس.</p>
      </div>
    </Feature>
  );
}
