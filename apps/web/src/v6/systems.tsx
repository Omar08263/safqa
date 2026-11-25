// 🧩 Open-source systems inside Safqa (v6): what each does for you + credits.
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { PageHeader, Skeleton } from '../fx/fx';
import { edge } from '../lib/edge';
import { usePrefs } from '../lib/prefs';
import { useTr } from '../lib/tr';

interface Sys { id: string; emoji: string; nameAr: string; nameEn: string; forUsers: string; oss: { name: string; url: string; license: string }; surfaces: string[]; on: boolean }
const LINKS: Record<string, { to: string; ar: string; en: string }> = {
  ntfy: { to: '/smart', ar: 'فعّل الجرس من «التنبيهات الذكية»', en: 'Turn on in Smart alerts' },
  uptime: { to: '/status', ar: 'شوف صفحة الحالة', en: 'Open status page' },
  twins: { to: '/hot', ar: 'افتح أي منتج وانزل تحت', en: 'Open any product' },
};

export function SystemsPage() {
  const tr = useTr();
  const { locale } = usePrefs();
  const q = useQuery({ queryKey: ['v6', 'systems'], queryFn: () => edge<{ items: Sys[] }>('/api/v6/systems'), staleTime: 300_000 });
  return (
    <div className="space-y-5">
      <PageHeader title={tr('🧩 أنظمة صفقة المفتوحة المصدر', '🧩 Open-source systems in Safqa')} lede={tr('أدوات عالمية مفتوحة المصدر خدنا فكرتها وطوّرناها لصفقة — كلها مربوطة بالعقل الرئيسي في لوحة التحكم، ويقدر يشغّلها أو يوقفها.', 'World-class open-source ideas we adapted for Safqa — all wired to the master AI in the Hub, which can switch each one.')} />
      {q.isPending ? <Skeleton className="h-60 w-full rounded-3xl" /> : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {(q.data?.items ?? []).map((s) => (
            <li key={s.id} className="rounded-3xl border border-border bg-card p-4">
              <p className="flex items-center justify-between gap-2 text-lg font-bold"><span>{s.emoji} {locale === 'ar' ? s.nameAr : s.nameEn}</span><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${s.on ? 'bg-palm/15 text-palm' : 'bg-accent text-muted'}`}>{s.on ? tr('شغّال', 'On') : tr('متوقف', 'Off')}</span></p>
              <p className="mt-1 text-sm">{s.forUsers}</p>
              <p className="t-meta mt-2">{tr('مبني على فكرة', 'Built on')}: <a href={s.oss.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary">{s.oss.name}</a> · {s.oss.license}</p>
              {LINKS[s.id] ? <Link to={LINKS[s.id]!.to} className="mt-2 inline-block text-sm font-bold text-primary">{locale === 'ar' ? LINKS[s.id]!.ar : LINKS[s.id]!.en} ←</Link> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
