import { useTr } from '../lib/tr';
import { Camera, ImageUp, Keyboard, ScanLine, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type Hit, semanticSearch, brainState } from '../ai/brain';
import { Feature } from '../components/feature-boundary';
import { confetti } from '../fx/fx';
import { sparkle } from '../fx/premium';
import { EDGE_URL } from '../lib/edge';
import { haptic, play } from '../lib/sound';
import { cloudSearch, egp, FutureHero, HitCard } from './shared';

type Box = { x: number; y: number; w: number; h: number };
type Found = { code: string; name: string | null; brand: string | null; image: string | null; source: string | null; hits: Hit[] };
type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string; boundingBox: DOMRectReadOnly }[]> };

async function makeDetector(): Promise<Detector> {
  const formats = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code'];
  const Native = (window as unknown as { BarcodeDetector?: new (o: unknown) => Detector }).BarcodeDetector;
  if (Native) { try { return new Native({ formats }); } catch { /* fall through */ } }
  const { BarcodeDetector } = await import('barcode-detector/ponyfill');
  return new BarcodeDetector({ formats: formats as never }) as unknown as Detector;
}

async function lookup(code: string): Promise<Found> {
  const [byCode, meta] = await Promise.all([
    fetch(`${EDGE_URL}/api/v5/search?q=${code}&limit=6`).then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
    fetch(`${EDGE_URL}/api/v2/barcode/${code}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  let hits: Hit[] = (byCode.items ?? []).filter((p: { ean?: string | null }) => p.ean === code).map((p: any) => ({ id: p.id, t: p.titleAr || p.titleEn, p: p.lowestPriceEgp, s: p.bestOffer?.store?.nameAr ?? null, i: p.image, k: p.category?.slug, u: `/p/${p.id}`, score: 1 }));
  if (!hits.length && meta?.name) {
    const q = `${meta.brand ?? ''} ${meta.name}`.trim();
    hits = brainState().status === 'ready' ? (await semanticSearch(q, 8).catch(() => ({ items: [] as Hit[] }))).items.filter((h) => h.score > 0.78) : await cloudSearch(q, 8);
  }
  return { code, name: meta?.name ?? null, brand: meta?.brand ?? null, image: meta?.image ?? null, source: meta?.source ?? null, hits };
}

export function LensPage() {
  const tr = useTr();
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const det = useRef<Detector | null>(null);
  const [on, setOn] = useState(false);
  const [err, setErr] = useState('');
  const [box, setBox] = useState<Box | null>(null);
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<Found | null>(null);
  const [shelf, setShelf] = useState('');
  const [manual, setManual] = useState('');
  const last = useRef('');

  const stop = useCallback(() => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; setOn(false); setBox(null); }, []);
  useEffect(() => stop, [stop]);

  const handle = useCallback(async (code: string) => {
    if (busy || code === last.current) return;
    last.current = code;
    setBusy(true); play('shutter'); haptic('success');
    const f = await lookup(code);
    setFound(f); setBusy(false);
    play(f.hits.length ? 'deal' : 'soft');
  }, [busy]);

  async function start() {
    setErr(''); setFound(null); last.current = '';
    try {
      det.current ??= await makeDetector();
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
      const v = video.current!;
      v.srcObject = stream.current;
      await v.play();
      setOn(true); play('whoosh');
      const loop = async () => {
        if (!stream.current) return;
        try {
          const codes = await det.current!.detect(v);
          const c = codes[0];
          if (c) {
            const r = v.getBoundingClientRect(), sx = r.width / v.videoWidth, sy = r.height / v.videoHeight;
            setBox({ x: c.boundingBox.x * sx, y: c.boundingBox.y * sy, w: c.boundingBox.width * sx, h: c.boundingBox.height * sy });
            void handle(c.rawValue);
          } else setBox(null);
        } catch { /* frame not ready */ }
        setTimeout(() => requestAnimationFrame(() => void loop()), 180);
      };
      void loop();
    } catch (e) {
      setErr((e as Error).name === 'NotAllowedError' ? tr('محتاجين إذن الكاميرا — اسمح بيه من المتصفح، أو ارفع صورة، أو اكتب الرقم.', 'We need camera permission. Allow it in the browser, upload a photo, or type the number.') : tr(`الكاميرا مش متاحة هنا (${(e as Error).message}). ارفع صورة للباركود أو اكتب رقمه.`, `Camera isn’t available here (${(e as Error).message}). Upload a barcode photo or type its number.`));
    }
  }
  async function fromFile(file: File) {
    try {
      det.current ??= await makeDetector();
      const bmp = await createImageBitmap(file);
      const codes = await det.current.detect(bmp);
      if (codes[0]) void handle(codes[0].rawValue); else { setErr(tr('ملقيناش باركود في الصورة — قرّب أكتر ونوّر.', 'No barcode found in the photo. Get closer and add light.')); play('error'); }
    } catch (e) { setErr(String((e as Error).message)); }
  }
  const best = found?.hits.slice().sort((a, b) => a.p - b.p)[0];
  const shelfN = Number(shelf.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[^\d.]/g, ''));
  const save = best && shelfN ? shelfN - best.p : null;
  useEffect(() => { if (save && save > 0) { confetti({ count: 120 }); play('coin'); } }, [save]);

  return (
    <Feature flag="price_lens">
      <div className="mx-auto max-w-5xl">
        <FutureHero emoji="📸" kicker="AR PRICE LENS" title={tr('عدسة الأسعار', 'Price lens')} lede={tr('وإنت في المحل: وجّه الكاميرا على الباركود، وصفقة تطلّعلك فوقه سعر نفس المنتج أونلاين في المتاجر المصرية، وتقولك هتوفّر كام.', 'In a shop? Point the camera at the barcode and Safqa shows the same product’s online price in Egyptian stores, and how much you’d save.')} colors={['#0ea5e9', '#f5b544', '#22d3ee']} />
        <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
          <div className="relative aspect-[3/4] overflow-hidden rounded-[2rem] bg-black sm:aspect-video lg:aspect-[3/4]">
            <video ref={video} playsInline muted className="h-full w-full object-cover" />
            {!on && (
              <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-[#071626] to-black p-6 text-center text-white">
                <div>
                  <ScanLine className="mx-auto h-14 w-14 text-cyan-300" />
                  <p className="mt-3 font-bold">{tr('جاهز تصطاد السعر؟', 'Ready to catch a price?')}</p>
                  <button type="button" data-sfx="none" className="press mt-4 inline-flex items-center gap-2 rounded-full bg-cyan-400 px-5 py-2.5 font-extrabold text-black shadow-lg shadow-cyan-500/40" onClick={() => void start()}><Camera className="h-5 w-5" /> {tr('افتح الكاميرا', 'Open camera')}</button>
                  <div className="mt-3 flex justify-center gap-2 text-xs">
                    <label className="press inline-flex cursor-pointer items-center gap-1 rounded-full bg-white/10 px-3 py-1.5"><ImageUp className="h-4 w-4" /> {tr('صورة', 'Photo')}<input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && void fromFile(e.target.files[0])} /></label>
                  </div>
                </div>
              </div>
            )}
            {on && (
              <>
                <div className="pointer-events-none absolute inset-[12%] rounded-3xl border-2 border-cyan-300/70 shadow-[0_0_0_9999px_rgba(0,0,0,.35)]"><div className="lens-laser" /></div>
                {box && <div className="pointer-events-none absolute rounded-lg border-2 border-amber-300 shadow-[0_0_30px_rgba(245,181,68,.8)] transition-all duration-150" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />}
                {box && best && (
                  <div className="pointer-events-none absolute spring-in rounded-2xl bg-black/70 px-3 py-2 text-white backdrop-blur" style={{ left: Math.max(8, box.x), top: Math.max(8, box.y - 64) }}>
                    <p className="text-[11px] text-white/70">{tr('أونلاين من', 'Online at')} {best.s}</p><p className="text-lg font-extrabold text-amber-300">{egp(best.p)}</p>
                  </div>
                )}
                <button type="button" className="absolute end-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-black/60 text-white" aria-label={tr('اقفل الكاميرا', 'Close camera')} onClick={stop}><X className="h-5 w-5" /></button>
                {busy && <p className="absolute inset-x-0 bottom-4 text-center text-sm font-bold text-white">🔎 {tr('بندوّر في المتاجر…', 'Searching stores…')}</p>}
              </>
            )}
          </div>
          <div className="space-y-4">
            <form className="glass flex gap-2 rounded-2xl p-3" onSubmit={(e) => { e.preventDefault(); last.current = ''; void handle(manual.replace(/\D/g, '')); }}>
              <Keyboard className="mt-2 h-5 w-5 flex-none text-muted" />
              <input value={manual} onChange={(e) => setManual(e.target.value)} inputMode="numeric" placeholder={tr('أو اكتب رقم الباركود (مثلًا 6223001360452)', 'Or type the barcode (e.g. 6223001360452)')} className="flex-1 bg-transparent text-sm outline-none" dir="ltr" />
              <button type="submit" className="press rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground">{tr('دوّر', 'Search')}</button>
            </form>
            {err && <p className="rounded-2xl bg-amber-500/10 p-3 text-sm">{err}</p>}
            {found && (
              <div className="glass spring-in rounded-3xl p-4">
                <div className="flex items-center gap-3">
                  {found.image ? <img src={found.image} alt="" className="h-14 w-14 rounded-xl bg-white object-contain" referrerPolicy="no-referrer" /> : <span className="grid h-14 w-14 place-items-center rounded-xl bg-accent text-2xl">📦</span>}
                  <div className="min-w-0">
                    <p className="truncate font-bold">{found.name ?? tr('منتج مش معروف', 'Unknown product')}</p>
                    <p className="text-xs text-muted" dir="ltr">{found.code}{found.source ? ` · ${found.source}` : ''}</p>
                  </div>
                </div>
                {best ? (
                  <>
                    <label className="mt-4 block text-sm font-semibold">{tr('سعره في المحل اللي إنت فيه كام؟', 'What’s the price in this shop?')}
                      <input value={shelf} onChange={(e) => setShelf(e.target.value)} inputMode="decimal" placeholder={tr('مثلًا 1500', 'e.g. 1500')} className="mt-1 w-full rounded-xl border border-border bg-transparent px-3 py-2" />
                    </label>
                    {save != null && (
                      <p className={`mt-3 rounded-2xl p-3 text-center font-extrabold ${save > 0 ? 'bg-emerald-500/15 text-emerald-600' : 'bg-accent'}`} onPointerDown={(e) => sparkle(e.clientX, e.clientY)}>
                        {save > 0 ? tr(`🎉 هتوفّر ${egp(save)} لو اشتريته أونلاين من ${best.s}`, `🎉 You’d save ${egp(save)} buying online at ${best.s}`) : tr('👌 سعر المحل كويس — مش هتوفّر أونلاين', '👌 The shop price is good; no savings online')}
                      </p>
                    )}
                    <div className="mt-4 grid grid-cols-2 gap-3">{found.hits.slice(0, 4).map((h, i) => <HitCard key={h.id} h={h} i={i} />)}</div>
                  </>
                ) : <p className="mt-3 text-sm text-muted">{tr('لسه معندناش المنتج ده في المتاجر اللي بنتابعها. جرّب تدوّر باسمه من البحث، أو استخدم «الصق رابط منتج».', 'We don’t track this product in our stores yet. Search for it by name, or use “Paste a product link”.')}</p>}
              </div>
            )}
            <p className="text-[11px] text-muted">{tr('الباركود بيتقري على جهازك (BarcodeDetector أو zxing-wasm). اسم المنتج من Open Food Facts و UPCitemdb، والأسعار من كتالوج صفقة.', 'Barcodes are read on your device (BarcodeDetector or zxing-wasm). Product names come from Open Food Facts and UPCitemdb; prices from Safqa’s catalog.')}</p>
          </div>
        </div>
      </div>
    </Feature>
  );
}
