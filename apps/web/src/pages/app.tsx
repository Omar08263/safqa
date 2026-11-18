import { useQuery } from '@tanstack/react-query';
import { Apple, BellRing, Download, Globe, MonitorSmartphone, ShieldCheck, Smartphone, Sparkles, WifiOff, Zap } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { useInstall } from '../components/chrome';
import { TelegramFollowButton } from '../components/telegram-follow';
import { Card, confetti, Reveal, useToast } from '../fx/fx';
import { APK_URL, isStandalone, platform, RELEASES_URL, SITE_URL } from '../lib/app-links';
import { useCatalog } from '../lib/catalog';
import { useMediaMap } from '../lib/media';
import { useTr } from '../lib/tr';

interface Release { tag_name: string; published_at: string; html_url: string; assets: { name: string; size: number; download_count: number; browser_download_url: string }[] }

function useRelease() {
  return useQuery({
    queryKey: ['gh-release'],
    queryFn: async () => {
      const r = await fetch('https://api.github.com/repos/Omar08263/safqa/releases/latest', { headers: { accept: 'application/vnd.github+json' } });
      return r.ok ? ((await r.json()) as Release) : null;
    },
    staleTime: 30 * 60_000,
    retry: false,
  });
}

function useQr(text: string) {
  const [src, setSrc] = useState('');
  useEffect(() => { void QRCode.toDataURL(text, { width: 520, margin: 1, color: { dark: '#1c1915', light: '#fffaf3' }, errorCorrectionLevel: 'M' }).then(setSrc); }, [text]);
  return src;
}

export function AppPage() {
  const tr = useTr();
  const toast = useToast();
  const pwa = useInstall();
  const rel = useRelease();
  const p = platform();
  const [qrTarget, setQrTarget] = useState<'apk' | 'site'>('apk');
  const qr = useQr(qrTarget === 'apk' ? APK_URL : SITE_URL);
  const apk = rel.data?.assets.find((a) => a.name.endsWith('.apk'));
  const media = useMediaMap();
  const catalog = useCatalog();
  const thumbs = (catalog.data?.items ?? []).map((x) => media.data?.[x.id]?.thumb).filter(Boolean).slice(0, 6) as string[];

  const features = [
    [BellRing, tr('تنبيهات فورية', 'Instant alerts'), tr('أول ما السعر ينزل فعلًا يوصلك إشعار — مش أي خصم مضروب.', 'A notification the moment a price really drops — never a fake discount.')],
    [WifiOff, tr('بيشتغل من غير نت', 'Works offline'), tr('آخر أسعار متزامنة + 400 أداة حسابات شغالة على الموبايل.', 'Last-synced prices + 400 calculators on-device.')],
    [Zap, tr('أسرع من الموقع', 'Faster than the site'), tr('بيفتح في ثانية من الشاشة الرئيسية، ملء الشاشة من غير شريط المتصفح.', 'Opens in a second from the home screen, full-screen.')],
    [ShieldCheck, tr('خفيف وآمن', 'Light & safe'), tr('مفتوح المصدر، من غير إعلانات ولا صلاحيات غريبة.', 'Open-source, no ads, no weird permissions.')],
  ] as const;

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-[2.5rem] border border-border p-6 sm:p-10">
        <div className="mesh" aria-hidden="true" />
        <div className="relative grid items-center gap-10 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-5">
            <p className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-3 py-1 text-sm font-semibold text-primary"><Sparkles className="h-4 w-4" />{tr('تطبيق صفقة', 'The Safqa app')}</p>
            <h1 className="text-4xl font-bold leading-tight sm:text-5xl">{tr('كل صفقة حقيقية في مصر… في جيبك.', 'Every real deal in Egypt… in your pocket.')}</h1>
            <p className="text-lg text-muted">{tr('نزّل التطبيق لأندرويد، أو ثبّته من المتصفح على أي موبايل أو كمبيوتر. نفس صفقة بالظبط — أسرع، وبإشعارات.', 'Get the Android app, or install from the browser on any phone or computer. Same Safqa — faster, with notifications.')}</p>
            <div className="flex flex-wrap gap-3">
              <a href={APK_URL} onClick={(e) => confetti({ x: e.clientX, y: e.clientY })} className="shine inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 font-bold text-primary-foreground shadow-lg"><Smartphone className="h-5 w-5" />{tr('نزّل لأندرويد (APK)', 'Download for Android (APK)')}</a>
              {isStandalone() || pwa.installed ? (
                <span className="inline-flex items-center gap-2 rounded-2xl bg-accent px-5 py-3 font-semibold">✅ {tr('متثبّت عندك', 'Installed')}</span>
              ) : (
                <button type="button" onClick={async () => { if (pwa.available) { if (await pwa.install()) toast(tr('اتثبّت 🎉', 'Installed 🎉')); } else toast(p === 'ios' ? tr('على آيفون: زرار المشاركة ⬆️ ← إضافة إلى الشاشة الرئيسية', 'On iPhone: Share ⬆️ → Add to Home Screen') : tr('من قايمة المتصفح اختار «تثبيت التطبيق»', 'Use the browser menu → “Install app”')); }} className="inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-5 py-3 font-semibold"><MonitorSmartphone className="h-5 w-5" />{tr('ثبّت من المتصفح (PWA)', 'Install from browser (PWA)')}</button>
              )}
              <TelegramFollowButton />
            </div>
            <p className="text-xs text-muted">
              {rel.isLoading ? tr('بنشيك على آخر إصدار…', 'Checking the latest release…') : apk && rel.data ? tr(`آخر إصدار ${rel.data.tag_name} · ${(apk.size / 1048576).toFixed(1)} ميجا · ${new Date(rel.data.published_at).toLocaleDateString('ar-EG')} · اتنزّل ${apk.download_count} مرة`, `Latest ${rel.data.tag_name} · ${(apk.size / 1048576).toFixed(1)} MB · ${new Date(rel.data.published_at).toLocaleDateString()} · ${apk.download_count} downloads`) : tr('ملف الـ APK على GitHub Releases الخاص بالمشروع المفتوح المصدر.', 'The APK lives on the open-source project’s GitHub Releases.')}{' '}
              <a href={RELEASES_URL} target="_blank" rel="noreferrer" className="text-primary underline">{tr('كل الإصدارات', 'All releases')}</a>
            </p>
          </div>
          <div className="relative mx-auto">
            <div className="float relative h-[30rem] w-60 rounded-[2.6rem] border-[10px] border-[#1c1915] bg-background shadow-2xl">
              <div className="absolute inset-x-16 top-1 h-4 rounded-full bg-[#1c1915]" />
              <div className="h-full overflow-hidden rounded-[2rem] p-3 pt-7">
                <div className="flex items-center gap-2"><img src="/brand/icon-64.png" alt="" className="h-7 w-7 rounded-lg" /><p className="font-bold">صفقة</p></div>
                <div className="mt-3 rounded-2xl bg-primary/15 p-2 text-[11px] font-semibold">🔥 {tr('صور حقيقية من المنتجات اللي بنتابعها', 'Real photos of tracked products')}</div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {(thumbs.length ? thumbs : Array.from({ length: 6 }, () => '')).map((t, i) => <div key={`${t}${i}`} className="aspect-square overflow-hidden rounded-xl bg-accent">{t ? <img src={t} alt="" className="h-full w-full object-contain p-1" loading="lazy" /> : null}</div>)}
                </div>
              </div>
            </div>
            <div className="glass absolute -bottom-4 -start-10 hidden rounded-2xl p-3 text-xs font-semibold sm:block">🔔 {tr('شكل الإشعار (مثال توضيحي)', 'What an alert looks like (illustration)')}</div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {features.map(([Icon, t, d], i) => <Reveal key={t} delay={i * 70}><Card className="lift h-full"><Icon className="h-7 w-7 text-primary" /><p className="mt-3 font-bold">{t}</p><p className="text-sm text-muted">{d}</p></Card></Reveal>)}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <Card className="text-center">
          <p className="font-bold">{tr('امسح الكود بالموبايل', 'Scan with your phone')}</p>
          <div className="mt-2 inline-flex rounded-full bg-accent p-1 text-xs">
            <button type="button" onClick={() => setQrTarget('apk')} className={`rounded-full px-3 py-1 ${qrTarget === 'apk' ? 'bg-primary text-primary-foreground' : ''}`}>APK</button>
            <button type="button" onClick={() => setQrTarget('site')} className={`rounded-full px-3 py-1 ${qrTarget === 'site' ? 'bg-primary text-primary-foreground' : ''}`}>{tr('الموقع', 'Website')}</button>
          </div>
          {qr ? <img src={qr} alt="QR" className="mx-auto mt-3 w-56 rounded-2xl border border-border" /> : <div className="skeleton mx-auto mt-3 h-56 w-56 rounded-2xl" />}
          <p className="mt-2 break-all text-[11px] text-muted" dir="ltr">{qrTarget === 'apk' ? APK_URL : SITE_URL}</p>
        </Card>
        <Card>
          <p className="font-bold">{tr('إزاي أثبّت؟', 'How to install')}</p>
          <ol className="mt-3 space-y-3 text-sm">
            <li className="flex gap-3"><Smartphone className="h-5 w-5 flex-none text-primary" /><span><b>{tr('أندرويد (APK):', 'Android (APK):')}</b> {tr('نزّل الملف ← افتحه ← لو طلب «السماح بالتثبيت من المصدر ده» وافق ← تثبيت. التطبيق بيفتح صفقة بملء الشاشة (Trusted Web Activity) فتسجيل الدخول بجوجل شغال عادي.', 'Download → open → allow “install from this source” → Install. It opens Safqa full-screen (Trusted Web Activity) so Google sign-in works.')}</span></li>
            <li className="flex gap-3"><Apple className="h-5 w-5 flex-none text-primary" /><span><b>{tr('آيفون:', 'iPhone:')}</b> {tr('افتح الموقع في Safari ← زرار المشاركة ⬆️ ← «إضافة إلى الشاشة الرئيسية». (أبل مش بتسمح بتطبيقات من بره الـ App Store.)', 'Open in Safari → Share ⬆️ → “Add to Home Screen”. (Apple does not allow apps outside the App Store.)')}</span></li>
            <li className="flex gap-3"><Globe className="h-5 w-5 flex-none text-primary" /><span><b>{tr('كمبيوتر:', 'Desktop:')}</b> {tr('Chrome أو Edge ← أيقونة التثبيت في شريط العنوان.', 'Chrome or Edge → the install icon in the address bar.')}</span></li>
          </ol>
          <p className="mt-4 rounded-xl border border-dashed border-border p-2 text-xs text-muted">{tr('الـ APK مبني من الكود المفتوح على GitHub ومش موجود على Google Play لسه، فأندرويد هيحذرك إنه «من مصدر غير معروف» — ده طبيعي لأي تطبيق بره المتجر.', 'The APK is built from the open-source repo and is not on Google Play yet, so Android warns about an “unknown source” — normal for any app outside the store.')}</p>
          <a href={APK_URL} className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2 font-bold text-primary-foreground"><Download className="h-4 w-4" />{tr('نزّل الـ APK', 'Download APK')}</a>
        </Card>
      </div>
    </div>
  );
}
