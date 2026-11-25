import { Brain, Cpu, Download, Sparkles, Trash2, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { type Hit, forgetBrain, reviewInsight, semanticSearch, startBrain, useBrain } from '../ai/brain';
import { askOffline, hasWebGPU, LLM_MODEL, startLlm, useLlm } from '../ai/llm';
import { Feature } from '../components/feature-boundary';
import { sparkle } from '../fx/premium';
import { play } from '../lib/sound';
import { useTr } from '../lib/tr';
import { cloudSearch, FutureHero, HitCard } from './shared';

const mb = (b?: number) => (b ? `${(b / 1e6).toFixed(0)} MB` : '');

/** Download/status card for the in-browser brain. */
export function BrainCard({ compact = false }: { compact?: boolean }) {
  const tr = useTr();
  const s = useBrain();
  const pct = s.total ? Math.round(((s.loaded ?? 0) / s.total) * 100) : 0;
  if (s.status === 'ready') {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-500/20 text-lg">🧠</span>
        <span className="flex-1"><b>{tr('العقل الأوفلاين شغّال', 'Offline brain is on')}</b> · {tr(`بيفهم ${s.products?.toLocaleString('en-US')} منتج بالمعنى`, `understands ${s.products?.toLocaleString('en-US')} products by meaning`)} · {s.device === 'webgpu' ? tr('كارت الشاشة ⚡', 'GPU ⚡') : tr('المعالج', 'CPU')}</span>
        {!compact && <button type="button" className="press inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs" onClick={forgetBrain}><Trash2 className="h-3.5 w-3.5" /> {tr('امسحه من الجهاز', 'Remove from device')}</button>}
      </div>
    );
  }
  return (
    <div className="glass-tile rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-violet-500/15 text-2xl">🧠</span>
        <div className="flex-1">
          <p className="font-bold">{tr('شغّل عقل صفقة الأوفلاين', 'Turn on Safqa’s offline brain')}</p>
          <p className="mt-0.5 text-xs leading-5 text-muted">{tr('نموذج multilingual-e5 مضغوط (≈118 MB مرة واحدة) بيشتغل جوه متصفحك: بحث بالمعنى بالعربي والإنجليزي، وتحليل المراجعات — من غير إنترنت ومن غير ما بياناتك تخرج من جهازك.', 'A compressed multilingual-e5 model (≈118 MB, once) runs inside your browser: meaning-based search in Arabic and English plus review analysis, offline, and your data never leaves your device.')}</p>
          {s.status === 'loading' ? (
            <div className="mt-3">
              <div className="h-2 overflow-hidden rounded-full bg-border"><div className="h-full rounded-full bg-gradient-to-l from-violet-500 to-amber-400 transition-all" style={{ width: `${s.stage === 'index' ? 100 : pct}%` }} /></div>
              <p className="mt-1 text-[11px] text-muted">{s.stage === 'index' ? tr('بنجهّز فهرس المنتجات…', 'Preparing the product index…') : tr(`بنزّل العقل… ${pct}% ${mb(s.loaded)} / ${mb(s.total)}`, `Downloading… ${pct}% ${mb(s.loaded)} / ${mb(s.total)}`)}</p>
            </div>
          ) : (
            <button type="button" data-sfx="magic" className="press mt-3 inline-flex items-center gap-2 rounded-full bg-gradient-to-l from-violet-600 to-fuchsia-500 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-violet-500/30" onClick={(e) => { sparkle(e.clientX, e.clientY); startBrain(); }}>
              <Download className="h-4 w-4" /> {s.status === 'error' ? tr('جرّب تاني', 'Try again') : tr('نزّله وشغّله', 'Download and run')}
            </button>
          )}
          {s.status === 'error' && <p className="mt-2 text-xs text-red-500">{tr('حصلت مشكلة', 'Something went wrong')}: {s.error}. {tr('البحث العادي شغّال عادي.', 'Normal search still works.')}</p>}
          {s.status === 'unsupported' && <p className="mt-2 text-xs text-muted">{tr('المتصفح ده مش بيدعم تشغيل النماذج — هنستخدم الذكاء السحابي.', 'This browser can’t run models, so we use cloud AI instead.')}</p>}
        </div>
      </div>
    </div>
  );
}

/** Drop-in for the search page: «فهمت قصدك» semantic results (offline brain, cloud fallback). */
export function SemanticBoost({ query }: { query: string }) {
  const tr = useTr();
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
        if (live && r) { setHits(r.items); setMeta(`🧠 ${tr('أوفلاين', 'offline')} · ${r.ms}ms${r.intent.maxPrice ? ` · ${tr('تحت', 'under')} ${r.intent.maxPrice.toLocaleString('en-US')} ${tr('ج', 'EGP')}` : ''}`); }
      } else if (/[\u0600-\u06FF]/.test(q)) {
        const r = await cloudSearch(q, 12).catch(() => []);
        if (live) { setHits(r); setMeta(tr('☁️ سحابي (فعّل العقل الأوفلاين لنتايج أذكى)', '☁️ Cloud (turn on the offline brain for smarter results)')); }
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
          <h2 className="font-extrabold">{tr('فهمت قصدك ✨', 'Got what you mean ✨')}</h2>
          <span className="text-xs text-muted">{meta}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">{hits.map((h, i) => <HitCard key={h.id} h={h} i={i} />)}</div>
      </section>
    </Feature>
  );
}

/** Product page: offline review insight (pros/cons/sentiment) from the visitor's own device. */
export function ReviewInsight({ texts }: { texts: string[] }) {
  const tr = useTr();
  const s = useBrain();
  const [r, setR] = useState<{ pros: string[]; cons: string[]; score: number; n: number } | null>(null);
  const sig = texts.join('\u0001');
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed by content
  useEffect(() => { if (s.status === 'ready' && texts.length) void reviewInsight(texts).then(setR).catch(() => setR(null)); }, [s.status, sig]);
  if (!texts.length) return null;
  if (s.status !== 'ready') return <div className="my-3"><BrainCard compact /></div>;
  if (!r) return <p className="my-3 text-sm text-muted">🧠 {tr('بنقرا المراجعات…', 'Reading reviews…')}</p>;
  const mood = r.score > 0.25 ? ['😍', tr('الناس مبسوطة جدًا', 'People love it')] : r.score > 0.05 ? ['🙂', tr('أغلب الآراء كويسة', 'Mostly positive')] : r.score > -0.1 ? ['😐', tr('الآراء متقسمة', 'Mixed opinions')] : ['😟', tr('فيه شكاوى كتير', 'Many complaints')];
  return (
    <div className="glass-tile my-4 rounded-2xl p-4">
      <p className="flex items-center gap-2 font-bold"><span className="text-2xl">{mood[0]}</span> {tr('ملخص المراجعات بالعقل الأوفلاين', 'Offline review summary')}: {mood[1]}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div><p className="text-xs font-bold text-emerald-600">👍 {tr('بيحبوا', 'Likes')}</p><ul className="mt-1 space-y-1 text-sm">{r.pros.length ? r.pros.map((p) => <li key={p}>• {p}</li>) : <li className="text-muted">—</li>}</ul></div>
        <div><p className="text-xs font-bold text-red-500">👎 {tr('بيشتكوا من', 'Complaints')}</p><ul className="mt-1 space-y-1 text-sm">{r.cons.length ? r.cons.map((p) => <li key={p}>• {p}</li>) : <li className="text-muted">—</li>}</ul></div>
      </div>
      <p className="mt-2 text-[11px] text-muted">{tr(`اتحلّل على جهازك من ${r.n} جملة — مفيش حاجة اتبعتت لأي سيرفر.`, `Analysed on your device from ${r.n} sentences; nothing was sent to any server.`)}</p>
    </div>
  );
}

function OfflineChat() {
  const tr = useTr();
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
  if (!hasWebGPU()) return <p className="text-sm text-muted">{tr('المساعد الأوفلاين محتاج متصفح بيدعم WebGPU (كروم أو إيدج حديث على كمبيوتر أو أندرويد قوي). المساعد السحابي شغّال عادي من صفحة', 'The offline assistant needs a WebGPU browser (recent Chrome or Edge on a computer or a strong Android). The cloud assistant works as usual on the')} <a className="text-primary underline" href="/assistant">{tr('المساعد الذكي', 'Smart assistant')}</a>.</p>;
  if (l.status !== 'ready') {
    return (
      <div>
        <p className="text-sm text-muted">{tr(`نموذج لغة صغير (${LLM_MODEL.split('-q')[0]}, ≈400 MB مرة واحدة) بيرد عليك بالمصري من غير إنترنت، ومربوط بالبحث الأوفلاين علشان يرشحلك منتجات حقيقية بأسعارها.`, `A small language model (${LLM_MODEL.split('-q')[0]}, ≈400 MB once) answers offline and is wired to offline search to suggest real products with prices.`)}</p>
        {l.status === 'loading' ? (
          <div className="mt-3"><div className="h-2 overflow-hidden rounded-full bg-border"><div className="h-full rounded-full bg-gradient-to-l from-amber-400 to-pink-500 transition-all" style={{ width: `${Math.round((l.progress ?? 0) * 100)}%` }} /></div><p className="mt-1 truncate text-[11px] text-muted" dir="ltr">{l.text}</p></div>
        ) : (
          <button type="button" data-sfx="magic" className="press mt-3 inline-flex items-center gap-2 rounded-full bg-gradient-to-l from-amber-500 to-pink-500 px-4 py-2 text-sm font-bold text-white" onClick={() => void startLlm()}><Cpu className="h-4 w-4" /> {l.status === 'error' ? tr('جرّب تاني', 'Try again') : tr('شغّل المساعد الأوفلاين', 'Start the offline assistant')}</button>
        )}
        {l.status === 'error' && <p className="mt-2 text-xs text-red-500">{l.error}</p>}
      </div>
    );
  }
  return (
    <div>
      <div ref={box} className="max-h-80 space-y-2 overflow-auto rounded-2xl bg-accent p-3">
        {!msgs.length && <p className="text-sm text-muted">{tr('اسأل أي حاجة، مثلًا: «عايز سماعة للجيم تحت ٢٠٠٠» 👇', 'Ask anything, e.g. “gym earbuds under 2,000” 👇')}</p>}
        {msgs.map((m, i) => <p key={i} className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${m.role === 'user' ? 'ms-auto bg-primary text-primary-foreground' : 'bg-[var(--elev)]'}`}>{m.content || '…'}</p>)}
      </div>
      <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); void send(q); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('اكتب سؤالك…', 'Type your question…')} className="flex-1 rounded-full border border-border bg-transparent px-4 py-2 text-sm" />
        <button type="submit" disabled={busy} className="press rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">{tr('ابعت', 'Send')}</button>
      </form>
    </div>
  );
}

export function AiLabPage() {
  const tr = useTr();
  const s = useBrain();
  const [q, setQ] = useState('سماعة للجيم مقاومة للعرق');
  const [hits, setHits] = useState<Hit[]>([]);
  const [info, setInfo] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => { const on = () => setOnline(navigator.onLine); window.addEventListener('online', on); window.addEventListener('offline', on); return () => { window.removeEventListener('online', on); window.removeEventListener('offline', on); }; }, []);
  async function run(text = q) {
    play('magic');
    if (s.status === 'ready') { const r = await semanticSearch(text, 18); setHits(r.items); setInfo(`🧠 ${tr('أوفلاين على جهازك', 'offline on your device')} · ${r.ms}ms`); }
    else { setHits(await cloudSearch(text, 18)); setInfo(tr('☁️ من السحابة (شغّل العقل الأوفلاين لفهم أعمق)', '☁️ From the cloud (turn on the offline brain for deeper understanding)')); }
  }
  return (
    <Feature flag="offline_ai">
      <div className="mx-auto max-w-6xl">
        <FutureHero emoji="🧠" kicker="SAFQA OFFLINE AI" title={tr('عقل صفقة', 'Safqa brain')} lede={tr('ذكاء اصطناعي مضغوط بيشتغل جوه متصفحك: بيفهم المعنى بالمصري، بيلخّص المراجعات، وبيكلّمك من غير إنترنت. ولو جهازك مش قده، الذكاء السحابي بيكمّل مكانه تلقائيًا.', 'Compressed AI inside your browser: understands meaning, summarises reviews and chats offline. If your device can’t handle it, cloud AI takes over automatically.')} colors={['#8b5cf6', '#f5b544', '#ec4899']}>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${online ? 'bg-white/10' : 'bg-amber-400 text-black'}`}>{online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}{online ? tr('متصل', 'Online') : tr('أوفلاين — والعقل شغّال!', 'Offline, and the brain still works!')}</span>
        </FutureHero>
        <BrainCard />
        <section className="glass mt-5 rounded-3xl p-5">
          <h2 className="flex items-center gap-2 text-lg font-extrabold"><Brain className="h-5 w-5 text-violet-500" /> {tr('بحث بالمعنى', 'Search by meaning')}</h2>
          <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); void run(); }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} className="min-w-0 flex-1 rounded-full border border-border bg-transparent px-4 py-2.5" aria-label={tr('اكتب اللي في بالك', 'Type what you have in mind')} />
            <button type="submit" data-sfx="none" className="press shrink-0 rounded-full bg-gradient-to-l from-violet-600 to-fuchsia-500 px-5 font-bold text-white">{tr('افهمني', 'Understand me')}</button>
          </form>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {['حاجة أشحن بيها الموبايل في السفر', 'لابتوب للمذاكرة تحت 30 ألف', 'هدية لماما في المطبخ', 'سبيكر صغير للبحر'].map((x) => <button key={x} type="button" className="press rounded-full border border-border px-3 py-1" onClick={() => { setQ(x); void run(x); }}>{x}</button>)}
          </div>
          {info && <p className="mt-3 text-xs text-muted">{info}</p>}
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{hits.map((h, i) => <HitCard key={h.id} h={h} i={i} />)}</div>
        </section>
        <Feature flag="webllm" off={null}>
          <section className="glass mt-5 rounded-3xl p-5">
            <h2 className="flex items-center gap-2 text-lg font-extrabold"><Cpu className="h-5 w-5 text-amber-500" /> {tr('مساعد بيتكلم من غير إنترنت', 'An assistant that talks offline')}</h2>
            <div className="mt-3"><OfflineChat /></div>
          </section>
        </Feature>
        <p className="mt-4 text-center text-[11px] text-muted">{tr('النماذج: Xenova/multilingual-e5-small (MIT) عبر transformers.js، و Qwen2.5-0.5B-Instruct (Apache-2.0) عبر WebLLM. بتتخزّن في متصفحك بس.', 'Models: Xenova/multilingual-e5-small (MIT) via transformers.js and Qwen2.5-0.5B-Instruct (Apache-2.0) via WebLLM. Stored only in your browser.')}</p>
      </div>
    </Feature>
  );
}
