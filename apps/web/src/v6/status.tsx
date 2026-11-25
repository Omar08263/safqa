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
/** Newest of the GitHub Actions data (status-data branch) and the Worker-cron monitor. */
// The APK monitor hit api.github.com (403 for shared CI/Worker IPs) until 07:16 Cairo; the real download worked.
const APK_FALSE_UNTIL = Date.parse('2026-11-25T05:16:00Z');
const NAME_FIX: Record<string, string> = { 'الـ API وقاعدة البيانات': 'واجهة البرمجة (API) وقاعدة البيانات', 'الـ API': 'واجهة البرمجة (API)' };
function cleanFalseApk(s: StatusSummary): StatusSummary {
  const checks = s.checks.map((c) => {
    const name = NAME_FIX[c.name] ?? c.name;
    if (c.id !== 'app') return { ...c, name };
    const last = c.last.map((p) => (!p[2] && Date.parse(p[0]) < APK_FALSE_UNTIL ? ([p[0], p[1], 1] as typeof p) : p));
    const lastPt = last[last.length - 1];
    const fix = (u: number | null) => (u == null ? u : Math.max(u, Math.round((1000 * last.filter((p) => p[2]).length) / Math.max(1, last.length)) / 10));
    return { ...c, name, last, ok: lastPt ? Boolean(lastPt[2]) : c.ok, uptime24: fix(c.uptime24), uptime7d: fix(c.uptime7d) };
  });
  const incidents = (s.incidents ?? []).map((i) => (i.id === 'app' && Date.parse(i.at) < APK_FALSE_UNTIL ? { ...i, note: 'تحميل التطبيق (APK): إنذار خاطئ — اتحل', until: i.until ?? new Date(APK_FALSE_UNTIL).toISOString() } : { ...i, note: Object.entries(NAME_FIX).reduce((n, [a, b]) => n.replace(a, b), i.note) }));
  return { ...s, checks, incidents, ok: checks.every((c) => c.ok) };
}

export const fetchStatus = async (): Promise<StatusSummary> => {
  const [gh, wk] = await Promise.all([
    fetch(STATUS_URL).then((r) => (r.ok ? (r.json() as Promise<StatusSummary>) : null)).catch(() => null),
    edge<StatusSummary>('/api/v6/status').catch(() => null),
  ]);
  const ok = [gh, wk].filter((x): x is StatusSummary => Boolean(x?.at && x.checks?.length)).map(cleanFalseApk);
  if (!ok.length) throw new Error('no data');
  return ok.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0]!;
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
      <PageHeader title={tr('🟢 نبض صفقة', '🟢 Safqa status')} lede={tr('حالة الموقع والتطبيق وواجهة البرمجة (API) — بنقيسها أوتوماتيك كل 20 دقيقة، والنتايج علنية.', 'Site, app and API health — probed automatically every 20 minutes; results are public.')} />
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
                  <p className="t-meta flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-accent px-2 py-0.5">{tr('آخر 24 ساعة', 'Last 24h')} <bdi className="num font-bold">{c.uptime24 == null ? '—' : `${c.uptime24}%`}</bdi></span>
                    <span className="rounded-full bg-accent px-2 py-0.5">{tr('آخر 7 أيام', 'Last 7 days')} <bdi className="num font-bold">{c.uptime7d == null ? '—' : `${c.uptime7d}%`}</bdi></span>
                    <span className="rounded-full bg-accent px-2 py-0.5">{tr('السرعة', 'Speed')} <bdi className="num font-bold">{c.ms.toLocaleString('en-US')}</bdi> {tr('مللي ثانية', 'ms')}</span>
                  </p>
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
