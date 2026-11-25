// Safqa v6 systems registry — every open-source-inspired system added in v6
// registers here, so the master orchestrator (Hub) can list, read status of,
// and switch each one through the normal remote-config flags table.
// A flag that has no row yet uses `defaultOn` (no D1 write needed to ship).
import type { Env } from '../util';
import { parseJ } from '../util';

export interface SystemDef {
  id: string;
  flag: string;
  emoji: string;
  nameAr: string;
  nameEn: string;
  forUsers: string; // what it does for people, Egyptian Arabic
  oss: { name: string; url: string; license: string; what: string };
  surfaces: ('web' | 'app' | 'hub' | 'edge' | 'actions')[];
  defaultOn: boolean;
  /** Where the orchestrator reads health from (relative to the API or absolute). */
  statusUrl?: string;
}

export const SYSTEMS: SystemDef[] = [
  {
    id: 'ntfy', flag: 'sys_ntfy', emoji: '🔔', nameAr: 'جرس الموبايل', nameEn: 'Phone push (ntfy)',
    forUsers: 'تنبيهات نزول الأسعار توصل على موبايلك فورًا من غير ما تسيب رقمك أو إيميلك — بقناة سرّية خاصة بيك',
    oss: { name: 'ntfy', url: 'https://github.com/binwiederhier/ntfy', license: 'Apache-2.0 / GPL-2.0', what: 'pub-sub push over HTTP; we publish smart alerts + owner escalations to a per-user HMAC topic' },
    surfaces: ['web', 'app', 'hub', 'edge'], defaultOn: true, statusUrl: '/api/v6/systems/ntfy',
  },
  {
    id: 'twins', flag: 'sys_twins', emoji: '🧬', nameAr: 'توأم المنتج', nameEn: 'Cross-store twins',
    forUsers: 'بيلاقي نفس المنتج بالظبط في محلات تانية حتى لو الاسم مكتوب بشكل مختلف — وبيقولك مين أرخص',
    oss: { name: 'multilingual-e5 + Dedupe ideas (dedupeio/dedupe)', url: 'https://github.com/dedupeio/dedupe', license: 'MIT', what: 'embedding blocking + model-number/brand/price guards (our own matcher, no copied code)' },
    surfaces: ['web', 'hub', 'actions'], defaultOn: true, statusUrl: 'https://safqaeg.pages.dev/ai/twins/meta.json',
  },
  {
    id: 'seo', flag: 'sys_seo', emoji: '🪧', nameAr: 'كارت المشاركة', nameEn: 'Share cards + rich results',
    forUsers: 'لما تبعت لينك منتج على واتساب أو فيسبوك يظهر بصورته وسعره الحقيقي، وجوجل يقدر يعرض السعر في النتايج',
    oss: { name: 'schema.org Product + Open Graph (prerender idea)', url: 'https://github.com/prerender/prerender', license: 'MIT', what: 'Pages Function rewrites <head> per product with HTMLRewriter (no headless browser)' },
    surfaces: ['web', 'edge'], defaultOn: true,
  },
  {
    id: 'uptime', flag: 'sys_uptime', emoji: '🟢', nameAr: 'نبض صفقة', nameEn: 'Status & uptime',
    forUsers: 'صفحة حالة علنية بتقول الموقع والتطبيق والـ API شغالين ولا لأ، وسرعتهم، كل 20 دقيقة',
    oss: { name: 'Upptime', url: 'https://github.com/upptime/upptime', license: 'MIT', what: 'same probes from the Worker cron every 20 min (KV, 7-day history); GitHub Actions version staged in deploy/status/pulse.yml' },
    surfaces: ['web', 'hub', 'edge'], defaultOn: true, statusUrl: '/api/v6/status',
  },
  {
    id: 'quality', flag: 'sys_quality', emoji: '♿', nameAr: 'مفتّش الجودة', nameEn: 'Quality & accessibility audit',
    forUsers: 'كل يوم بيتأكد إن الموقع سريع وسهل للكل (مكفوفين، شاشات صغيرة، نت بطيء) وبيبلّغ لو حاجة باظت',
    oss: { name: 'Lighthouse + axe-core', url: 'https://github.com/GoogleChrome/lighthouse', license: 'Apache-2.0 / MPL-2.0', what: 'Lighthouse on key pages (box run now; daily Actions run staged) → scores + top issues on the status-data branch' },
    surfaces: ['hub', 'actions'], defaultOn: true, statusUrl: 'https://raw.githubusercontent.com/Omar08263/safqa/status-data/quality/latest.json',
  },
];

export const systemById = (id: string) => SYSTEMS.find((s) => s.id === id);

/** Flag state for every system (missing row → defaultOn). Read-only. */
export async function systemFlags(env: Env): Promise<Record<string, { on: boolean; value: unknown; source: 'flag' | 'default' }>> {
  const keys = SYSTEMS.map((s) => s.flag);
  let rows: { key: string; enabled: number; value: string | null }[] = [];
  try { rows = (await env.DB.prepare(`SELECT key, enabled, value FROM flags WHERE key IN (${keys.map(() => '?').join(',')})`).bind(...keys).all<{ key: string; enabled: number; value: string | null }>()).results; } catch { /* D1 down → defaults */ }
  const by = new Map(rows.map((r) => [r.key, r]));
  return Object.fromEntries(SYSTEMS.map((s) => { const r = by.get(s.flag); return [s.id, r ? { on: Boolean(r.enabled), value: parseJ(r.value, r.value), source: 'flag' as const } : { on: s.defaultOn, value: null, source: 'default' as const }]; }));
}
export async function systemOn(env: Env, id: string) { return (await systemFlags(env))[id]?.on ?? false; }
