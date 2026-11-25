// 🟢 نبض صفقة — public status page (Upptime-style: GitHub Actions probes every 10 min,
// results committed to the status-data branch; this page only reads that JSON).
import { useQuery } from '@tanstack/react-query';
import { edge } from '../lib/edge';
import { PageHeader, Skeleton } from '../fx/fx';
import { useTr } from '../lib/tr';
import { usePrefs } from '../lib/prefs';

export const STATUS_URL = 'https://raw.githubusercontent.com/Omar08263/safqa/status-data/status/summary.json';
export interface StatusCheck { id: string; name: string; nameEn: string; url: string; ok: boolean; ms: number; code: number; uptime24: number | null; uptime7d: number | null; p50: number | null; last: [string, number, 0 | 1][] }
export interface StatusSummary { at: string; ok: boolean; checks: StatusCheck[]; incidents: { id: string; at: string; until: string | null; note: string }[] }
/** GitHub Actions data first (when the pulse workflow runs), else the Worker-cron monitor. */
export const fetchStatus = async (): Promise<StatusSummary> => {
  try { const r = await fetch(STATUS_URL); if (r.ok) return r.json(); } catch { /* not published yet */ }
  const s = await edge<StatusSummary>('/api/v6/status');
  if (!s.checks?.length) throw new Error('no data');
  return s;
};

function Bars({ last }: { last: StatusCheck['last'] }) {
  return (
    <div className="flex h-8 items-end gap-[2px]" aria-hidden>
      {last.slice(-48).map(([t, ms, ok]) => <span key={t} title={`${t} · ${ms}ms`} className={`w-1.5 rounded-sm ${ok ? 'bg-palm' : 'bg-destructive'}`} style={{ height: `${Math.max(18, Math.min(100, ms / 20))}%`, opacity: ok ? 0.85 : 1 }} />)}
    </div>
  );
}

export function StatusPage() {
  const tr = useTr();
  const { locale } = usePrefs();
  const q = useQuery({ queryKey: ['v6', 'status'], queryFn: fetchStatus, refetchInterval: 120_000, retry: 1 });
  const d = q.data;
  const fmt = (iso: string) => new Date(iso).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
  return (
    <div className="space-y-5">
      <PageHeader title={tr('🟢 نبض صفقة', '🟢 Safqa status')} lede={tr('حالة الموقع والتطبيق والـ API — بنقيسها أوتوماتيك كل 20 دقيقة، والنتايج علنية.', 'Site, app and API health — probed automatically every 20 minutes; results are public.')} />
      {q.isPending ? <Skeleton className="h-40 w-full rounded-3xl" /> : q.isError || !d ? (
        <p className="rounded-3xl border border-border bg-card p-4">{tr('لسه مفيش قياسات منشورة — أول قياس بيتنشر بعد أول تشغيل للمراقب.', 'No published probes yet — they appear after the first monitor run.')}</p>
      ) : (
        <>
          <div className={`rounded-3xl p-5 text-lg font-bold ${d.ok ? 'bg-palm/15 text-palm' : 'bg-destructive/15 text-destructive'}`}>
            {d.ok ? tr('✅ كل الأنظمة شغالة', '✅ All systems operational') : tr('⚠️ في نظام عنده مشكلة دلوقتي', '⚠️ Something is degraded')}
            <span className="t-meta ms-2 font-normal">{tr('آخر قياس', 'Last probe')}: {fmt(d.at)} {tr('(القاهرة)', '(Cairo)')}</span>
          </div>
          <ul className="space-y-3">
            {d.checks.map((c) => (
              <li key={c.id} className="rounded-3xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold">{c.ok ? '🟢' : '🔴'} {locale === 'ar' ? c.name : c.nameEn}</p>
                  <p className="t-meta num">{c.ms}ms · {tr('٢٤ ساعة', '24h')}: {c.uptime24 ?? '—'}% · {tr('٧ أيام', '7d')}: {c.uptime7d ?? '—'}%{c.p50 ? ` · p50 ${c.p50}ms` : ''}</p>
                </div>
                <Bars last={c.last} />
              </li>
            ))}
          </ul>
          {d.incidents?.length ? (
            <section className="rounded-3xl border border-border bg-card p-4">
              <h2 className="font-bold">{tr('آخر الأعطال', 'Recent incidents')}</h2>
              <ul className="t-meta mt-2 space-y-1">{d.incidents.slice(0, 10).map((i) => <li key={i.id + i.at}>• {i.note} — {fmt(i.at)}{i.until ? ` → ${fmt(i.until)}` : tr(' (لسه مستمر)', ' (ongoing)')}</li>)}</ul>
            </section>
          ) : null}
          <p className="t-meta">{tr('فكرة المراقب مأخوذة من مشروع Upptime المفتوح المصدر (MIT).', 'Monitor modeled on the open-source Upptime project (MIT).')}</p>
        </>
      )}
    </div>
  );
}
