// العقل الرئيسي — pure core (no I/O): diagnose signals → findings → a guarded plan of fixes.
// The loop is the classic plan → act → observe → verify cycle of open-source agent frameworks (ReAct / LangGraph
// style), but deterministic first: the rules decide what is safe, the LLM only writes the plan narrative.

export type Sev = 'info' | 'warn' | 'crit';
export type Spec = 'tabib' | 'katalog' | 'asaar' | 'amn' | 'muhtawa' | 'numuw';
/** Whitelisted fixes. `safe` ones may run alone under Autopilot; the rest always wait for the owner. */
export type Fix =
  | { t: 'cache_purge'; target: string }
  | { t: 'source_pause'; target: string; hours: number }
  | { t: 'source_resume'; target: string }
  | { t: 'extractor_relearn'; target: string }
  | { t: 'flag_off'; target: string }
  | { t: 'run_agent'; target: string }
  | { t: 'issue'; target: string; title: string; body: string };
export const SAFE: Record<Fix['t'], boolean> = { cache_purge: true, source_pause: true, extractor_relearn: true, flag_off: true, run_agent: true, source_resume: false, issue: false };
/** Per-day caps for autonomous fixes. */
export const CAPS: Record<Fix['t'], number> = { cache_purge: 12, source_pause: 6, extractor_relearn: 6, flag_off: 4, run_agent: 24, source_resume: 0, issue: 3 };
export const COOLDOWN_H = 6;
/** Never automated, never even proposed by the brain: the owner does these by hand. */
export const FORBIDDEN = /refund|payout|payment|money|ban|delete|drop table|truncate|فلوس|استرداد|حظر|امسح|احذف/i;

export interface Finding { id: string; spec: Spec; sev: Sev; title: string; detail?: string; fixes: Fix[] }

export interface Signals {
  now: number;
  site?: { ok: boolean; status: number; ms: number };
  admin?: { ok: boolean; status: number };
  snapshotAgeH?: number | null;
  d1Ok: boolean; kvOk: boolean;
  budget?: { state: string; used: number; pct: number; exhausted: boolean };
  aiLeft?: number;
  clientErrors15?: number;
  topErrors?: { msg: string; n: number }[];
  guardedFlagErrors?: { flag: string; n: number; users: number }[];
  stores?: { store: string; products: number; newestCheck: string | null; checked24h: number; feed: boolean; pausedUntil: string | null }[];
  wildDrops?: { store: string; n: number; wild: number }[];
  healIndex?: Record<string, string>;
  storeHosts?: Record<string, string>;
  hunterLast?: { at?: string; errors?: number } | null;
  rateHot?: { key: string; count: number }[];
  secrets?: { jwtLen: number; corsWildcard: boolean; adminEmails: number };
  content?: { products: number; noImage: number; noArabic: number };
  growth?: { new7: number; newPrev7: number; checkouts30: number; paid30: number };
  paused?: Record<string, number>;
}

const h = (ms: number) => ms / 3600_000;

export function diagnose(s: Signals): Finding[] {
  const f: Finding[] = [];
  // 🩺 الطبيب — site & platform health
  if (s.site && !s.site.ok) f.push({ id: 'site_down', spec: 'tabib', sev: 'crit', title: `الموقع مش بيرد (${s.site.status || 'timeout'})`, detail: 'safqaeg.pages.dev', fixes: [{ t: 'cache_purge', target: 'config' }, { t: 'issue', target: 'site_down', title: 'Site health check failing', body: `GET site returned ${s.site.status || 'timeout'} after ${s.site.ms} ms.` }] });
  else if (s.site && s.site.ms > 4000) f.push({ id: 'site_slow', spec: 'tabib', sev: 'warn', title: `الموقع بطيء (${(s.site.ms / 1000).toFixed(1)} ث)`, fixes: [] });
  if (s.admin && !s.admin.ok) f.push({ id: 'admin_down', spec: 'tabib', sev: 'warn', title: `لوحة Hub مش بترد (${s.admin.status})`, fixes: [] });
  if (s.snapshotAgeH != null && s.snapshotAgeH > 36) f.push({ id: 'snapshot_stale', spec: 'tabib', sev: 'warn', title: `نسخة الأسعار الأوفلاين قديمة (${Math.round(s.snapshotAgeH)} ساعة)`, fixes: [{ t: 'issue', target: 'snapshot_stale', title: 'Offline price snapshot is stale', body: `demo/snapshot.json is ${Math.round(s.snapshotAgeH)} h old. Re-run deploy/pages/deploy.sh (it records a fresh snapshot).` }] });
  if (!s.d1Ok) f.push({ id: 'd1_down', spec: 'tabib', sev: 'crit', title: 'قاعدة البيانات D1 مش بترد', fixes: [] });
  if (!s.kvOk) f.push({ id: 'kv_down', spec: 'tabib', sev: 'warn', title: 'KV مش بيرد', fixes: [] });
  if (s.budget?.exhausted) f.push({ id: 'budget_out', spec: 'tabib', sev: 'crit', title: 'حد الكتابة اليومي المجاني لـ D1 خلص — الكتابة واقفة لحد 02:00 بتوقيت القاهرة', detail: `${s.budget.used} صف`, fixes: [] });
  else if (s.budget && s.budget.state !== 'green') f.push({ id: 'budget_high', spec: 'tabib', sev: 'warn', title: `استهلاك الكتابة ${s.budget.pct}% من الحد اليومي`, fixes: [] });
  if (s.aiLeft != null && s.aiLeft < 20) f.push({ id: 'ai_low', spec: 'tabib', sev: 'info', title: `حصة الذكاء الاصطناعي قربت تخلص (${s.aiLeft})`, fixes: [] });
  for (const g of s.guardedFlagErrors ?? []) if (g.n >= 8 && g.users >= 3) f.push({ id: `flag_err:${g.flag}`, spec: 'tabib', sev: 'crit', title: `الميزة «${g.flag}» بتعمل أخطاء (${g.n} من ${g.users} مستخدم)`, fixes: [{ t: 'flag_off', target: g.flag }, { t: 'cache_purge', target: 'config' }] });
  if ((s.clientErrors15 ?? 0) > 60) {
    const top = (s.topErrors ?? []).slice(0, 3);
    f.push({ id: 'client_spike', spec: 'tabib', sev: (s.clientErrors15 ?? 0) > 150 ? 'crit' : 'warn', title: `${s.clientErrors15} خطأ عند المستخدمين في ربع ساعة`, detail: top.map((t) => `${t.n}× ${t.msg}`).join(' · '),
      fixes: [{ t: 'issue', target: `client:${top[0]?.msg.slice(0, 60) ?? 'spike'}`, title: `Client error spike: ${top[0]?.msg.slice(0, 80) ?? 'unknown'}`, body: `${s.clientErrors15} client errors in 15 min.\n\nTop messages:\n${top.map((t) => `- ${t.n}× \`${t.msg.slice(0, 200)}\``).join('\n')}` }] });
  }
  // 🛒 الكتالوج — sources & extractors
  for (const st of s.stores ?? []) {
    const age = st.newestCheck ? h(s.now - Date.parse(st.newestCheck)) : 1e9;
    const paused = st.pausedUntil && Date.parse(st.pausedUntil) > s.now;
    if (paused || (s.paused?.[st.store] ?? 0) > s.now) continue;
    if (st.feed && age > 6) f.push({ id: `feed_stale:${st.store}`, spec: 'katalog', sev: 'warn', title: `مصدر «${st.store}» ماتحدّثش من ${Math.round(age)} ساعة`, fixes: [{ t: 'run_agent', target: 'kashaf' }, { t: 'issue', target: `feed_stale:${st.store}`, title: `Feed ${st.store} stopped updating`, body: `Newest check ${st.newestCheck}. Feed poller may be failing (robots, layout or API change).` }] });
    else if (!st.feed && st.products >= 20 && age > 60) f.push({ id: `src_stale:${st.store}`, spec: 'katalog', sev: 'info', title: `مصدر «${st.store}» ماجاش منه جديد من ${Math.round(age / 24)} يوم`, detail: 'بيتحدّث من safqa-hunter على GitHub Actions', fixes: [{ t: 'issue', target: `src_stale:${st.store}`, title: `Source ${st.store} has not reported for ${Math.round(age / 24)} days`, body: `Check the safqa-hunter workflow for ${st.store} (robots.txt, sitemap or JSON-LD changes). Never bypass blocks.` }] });
  }
  if (s.hunterLast?.at && h(s.now - Date.parse(s.hunterLast.at)) > 50) f.push({ id: 'hunter_silent', spec: 'katalog', sev: 'warn', title: 'الصيّاد (safqa-hunter) مابعتش تقرير من أكتر من يومين', fixes: [{ t: 'issue', target: 'hunter_silent', title: 'safqa-hunter has not reported for 2+ days', body: `Last report ${s.hunterLast.at}. Check the GitHub Actions schedule and HUNTER_TOKEN.` }] });
  if ((s.hunterLast?.errors ?? 0) > 20) f.push({ id: 'hunter_errors', spec: 'katalog', sev: 'warn', title: `آخر تشغيلة للصيّاد فيها ${s.hunterLast?.errors} خطأ`, fixes: [] });
  // 💹 الأسعار — broken extractor = many implausible drops from one store
  for (const d of s.wildDrops ?? []) {
    if (d.wild < 5 || d.wild / Math.max(1, d.n) < 0.4) continue;
    const host = s.storeHosts?.[d.store];
    const fixes: Fix[] = [{ t: 'source_pause', target: d.store, hours: 6 }];
    if (host && s.healIndex?.[host]) fixes.unshift({ t: 'extractor_relearn', target: host });
    fixes.push({ t: 'issue', target: `extractor:${d.store}`, title: `Extractor for ${d.store} likely misreading prices`, body: `${d.wild} of ${d.n} drops in 24 h were ≥80%. The store paused for 6 h; check the price selector / JSON-LD.` });
    f.push({ id: `extractor:${d.store}`, spec: 'asaar', sev: 'crit', title: `قارئ أسعار «${d.store}» شكله بايظ — ${d.wild} من ${d.n} نزلات ≥80%`, fixes });
  }
  // 🔐 الأمن
  if (s.secrets && s.secrets.jwtLen < 32) f.push({ id: 'jwt_weak', spec: 'amn', sev: 'crit', title: 'مفتاح JWT قصير', fixes: [{ t: 'issue', target: 'jwt_weak', title: 'JWT secret is too short', body: 'Rotate JWT_SECRET to ≥32 random bytes (wrangler secret put JWT_SECRET).' }] });
  if (s.secrets?.corsWildcard) f.push({ id: 'cors_wild', spec: 'amn', sev: 'warn', title: 'CORS مفتوح لأي موقع (*)', fixes: [] });
  if (s.secrets && s.secrets.adminEmails === 0) f.push({ id: 'no_admins', spec: 'amn', sev: 'warn', title: 'مفيش إيميلات أدمن متسجلة', fixes: [] });
  const hot = (s.rateHot ?? []).filter((r) => r.count >= 200);
  if (hot.length) f.push({ id: 'rate_abuse', spec: 'amn', sev: 'warn', title: `${hot.length} مصدر بيضرب الـ API جامد (أعلى ${hot[0]!.count} طلب)`, detail: hot.slice(0, 3).map((r) => r.key.replace(/:[^:]*$/, ':…')).join(' · '), fixes: [] });
  // 📝 المحتوى
  if (s.content && s.content.products > 100) {
    const noImg = s.content.noImage / s.content.products;
    if (noImg > 0.25) f.push({ id: 'content_images', spec: 'muhtawa', sev: 'info', title: `${Math.round(noImg * 100)}% من المنتجات من غير صورة`, fixes: [] });
    const noAr = s.content.noArabic / s.content.products;
    if (noAr > 0.5) f.push({ id: 'content_arabic', spec: 'muhtawa', sev: 'info', title: `${Math.round(noAr * 100)}% من المنتجات من غير اسم عربي`, fixes: [] });
  }
  // 📈 النمو
  if (s.growth && s.growth.newPrev7 >= 10 && s.growth.new7 < s.growth.newPrev7 * 0.6) f.push({ id: 'growth_drop', spec: 'numuw', sev: 'warn', title: `التسجيلات الجديدة نزلت ${Math.round((1 - s.growth.new7 / s.growth.newPrev7) * 100)}% عن الأسبوع اللي فات`, fixes: [{ t: 'run_agent', target: 'numuw' }] });
  if (s.growth && s.growth.checkouts30 >= 10 && s.growth.paid30 / s.growth.checkouts30 < 0.3) f.push({ id: 'checkout_leak', spec: 'numuw', sev: 'info', title: `${Math.round((1 - s.growth.paid30 / s.growth.checkouts30) * 100)}% من محاولات الدفع ماكملتش`, fixes: [] });
  return f;
}

export const SEV_RANK: Record<Sev, number> = { crit: 3, warn: 2, info: 1 };
export const fixKey = (x: Fix) => `${x.t}:${x.target}`;

export interface Done { id: string; at: string; key: string; fix: Fix; finding: string; by: 'auto' | string; status: 'applied' | 'verified' | 'ineffective' | 'undone' | 'failed'; undo?: unknown; verifyAt?: number; note?: string }

/**
 * Pick what to do now. Safe fixes run alone when Autopilot is on, within daily caps and a per-target cooldown;
 * everything else (and everything when Autopilot is off) becomes an owner proposal. Issues become drafts.
 */
/** Fixes that need D1 writes; deferred to the owner while the free daily write cap is exhausted. */
export const NEEDS_D1: Fix['t'][] = ['flag_off', 'run_agent'];
export function planFixes(findings: Finding[], done: Done[], now: number, autopilot: boolean, maxActions = 3, canWrite = true) {
  const today = new Date(now).toISOString().slice(0, 10);
  const used: Partial<Record<Fix['t'], number>> = {};
  for (const d of done) if (d.at.slice(0, 10) === today && d.by === 'auto') used[d.fix.t] = (used[d.fix.t] ?? 0) + 1;
  const recent = new Set(done.filter((d) => now - Date.parse(d.at) < COOLDOWN_H * 3600_000).map((d) => d.key));
  const act: { fix: Fix; finding: Finding }[] = [];
  const propose: { fix: Fix; finding: Finding }[] = [];
  const drafts: { fix: Extract<Fix, { t: 'issue' }>; finding: Finding }[] = [];
  for (const fd of [...findings].sort((a, b) => SEV_RANK[b.sev] - SEV_RANK[a.sev])) {
    for (const fix of fd.fixes) {
      if (FORBIDDEN.test(`${fix.t} ${fix.target}`)) continue;
      if (fix.t === 'issue') { drafts.push({ fix, finding: fd }); continue; }
      if (recent.has(fixKey(fix))) continue;
      if (autopilot && SAFE[fix.t] && (canWrite || !NEEDS_D1.includes(fix.t)) && (used[fix.t] ?? 0) < CAPS[fix.t] && act.length < maxActions) { act.push({ fix, finding: fd }); used[fix.t] = (used[fix.t] ?? 0) + 1; recent.add(fixKey(fix)); }
      else propose.push({ fix, finding: fd });
    }
  }
  return { act, propose, drafts };
}

export const signature = (fs: Finding[]) => fs.map((f) => `${f.id}:${f.sev}`).sort().join('|');

export const FIX_AR: Record<Fix['t'], string> = { cache_purge: '🧹 مسح الكاش', source_pause: '⏸️ إيقاف مصدر مؤقتًا', source_resume: '▶️ تشغيل مصدر', extractor_relearn: '🧠 إعادة تعليم قارئ الأسعار', flag_off: '🎛️ قفل ميزة', run_agent: '🤖 تشغيل وكيل', issue: '🐙 مسودة GitHub issue' };
