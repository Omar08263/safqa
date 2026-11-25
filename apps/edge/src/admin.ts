import { isSealed, open } from './security/crypto';
// Admin API (Google-allowlisted owner only) + the AI ops agent.
import { agents, aiBudgetLeft, extractJson, llm, logAgent } from './ai';
import { normalizeCode } from './codes';
import { decidePayment, paymentOut, setTier } from './payments';
import { TIERS, tierById } from './tiers';
import { type Env, cairoDay, fail, nowIso, parseJ, str, uid } from './util';

export async function audit(env: Env, admin: string, action: string, detail: unknown) {
  await env.DB.prepare('INSERT INTO admin_audit (admin,action,detail,at) VALUES (?,?,?,?)').bind(admin, action, JSON.stringify(detail).slice(0, 2000), nowIso()).run();
}

const one = async (env: Env, sql: string, ...b: unknown[]) => Number((await env.DB.prepare(sql).bind(...b).first<{ n: number }>())?.n ?? 0);

export async function stats(env: Env) {
  const dayAgo = new Date(Date.now() - 86400_000).toISOString();
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const tiers = (await env.DB.prepare("SELECT tier, COUNT(*) AS n FROM users WHERE tier='free' OR tier_until > ? GROUP BY tier").bind(nowIso()).all<{ tier: string; n: number }>()).results;
  const revenue = await one(env, "SELECT COALESCE(SUM(amount),0) AS n FROM payments WHERE status IN ('approved','provisional') AND note IS NOT 'TEST'");
  const revenue30 = await one(env, "SELECT COALESCE(SUM(amount),0) AS n FROM payments WHERE status IN ('approved','provisional') AND created_at > ? AND note IS NOT 'TEST'", new Date(Date.now() - 30 * 86400_000).toISOString());
  const usage = (await env.DB.prepare('SELECT kind, calls, fails FROM ai_usage WHERE day=?').bind(cairoDay()).all()).results;
  const meta = parseJ((await env.DB.prepare("SELECT value FROM settings WHERE key='snapshot_meta'").first<{ value: string }>())?.value, null);
  return {
    users: await one(env, 'SELECT COUNT(*) AS n FROM users'),
    newUsers24h: await one(env, 'SELECT COUNT(*) AS n FROM users WHERE created_at > ?', dayAgo),
    active7d: await one(env, 'SELECT COUNT(*) AS n FROM users WHERE last_seen > ?', weekAgo),
    tiers,
    paymentsPending: await one(env, "SELECT COUNT(*) AS n FROM payments WHERE status IN ('pending','provisional')"),
    revenue, revenue30,
    posts24h: await one(env, 'SELECT COUNT(*) AS n FROM posts WHERE created_at > ?', dayAgo),
    messages24h: await one(env, 'SELECT COUNT(*) AS n FROM messages WHERE created_at > ?', dayAgo),
    penalties24h: await one(env, 'SELECT COUNT(*) AS n FROM penalties WHERE created_at > ?', dayAgo),
    appealsPending: await one(env, "SELECT COUNT(*) AS n FROM penalties WHERE appeal_status='pending'"),
    telegramSubs: await one(env, 'SELECT COUNT(*) AS n FROM tg_links WHERE subscribed=1'),
    telegramLinked: await one(env, 'SELECT COUNT(*) AS n FROM tg_links WHERE user_id IS NOT NULL'),
    aiUsage: usage, aiBudgetLeft: await aiBudgetLeft(env), aiBudget: Number(env.AI_DAILY_CALL_BUDGET),
    snapshot: meta,
    products: await one(env, 'SELECT COUNT(*) AS n FROM products'),
  };
}

export async function listPayments(env: Env, status: string) {
  const rows = (await env.DB.prepare(`SELECT p.*, u.name AS user_name, u.email AS user_email FROM payments p LEFT JOIN users u ON u.id=p.user_id ${status && status !== 'all' ? 'WHERE p.status=?' : ''} ORDER BY p.created_at DESC LIMIT 100`).bind(...(status && status !== 'all' ? [status] : [])).all<Record<string, unknown>>()).results;
  for (const r of rows) if (isSealed(r.extraction)) r.extraction = await open(env.FIELD_KEYS, 'extraction', r.extraction).catch(() => null);
  return { items: rows.map((r) => ({ ...paymentOut(env, r, true), userName: r.user_name, userEmail: r.user_email })) };
}

export async function upsertCode(env: Env, admin: string, b: Record<string, unknown>) {
  const code = normalizeCode(str(b.code, 40));
  if (code.length < 3) fail(400, 'invalid_code', 'الكود لازم 3 حروف على الأقل');
  const kind = ['percent', 'fixed', 'upgrade'].includes(String(b.kind)) ? String(b.kind) : 'percent';
  const value = Number(b.value) || 0;
  if (kind === 'percent' && (value <= 0 || value > 100)) fail(400, 'invalid_value', 'النسبة بين 1 و 100');
  const upgradeTier = kind === 'upgrade' ? str(b.upgradeTier, 10) || 'silver' : null;
  if (upgradeTier && !tierById(upgradeTier)) fail(400, 'invalid_tier', 'باقة غلط');
  const tiers = Array.isArray(b.tiers) ? (b.tiers as string[]).filter((t) => tierById(t)) : [];
  await env.DB.prepare(`INSERT INTO codes (code,kind,value,tiers,expires_at,max_uses,per_user,upgrade_tier,upgrade_days,active,note,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(code) DO UPDATE SET kind=excluded.kind, value=excluded.value, tiers=excluded.tiers, expires_at=excluded.expires_at, max_uses=excluded.max_uses, per_user=excluded.per_user, upgrade_tier=excluded.upgrade_tier, upgrade_days=excluded.upgrade_days, active=excluded.active, note=excluded.note`)
    .bind(code, kind, value, JSON.stringify(tiers), str(b.expiresAt, 40) || null, b.maxUses ? Number(b.maxUses) : null, Math.max(1, Number(b.perUser) || 1), upgradeTier, kind === 'upgrade' ? Math.max(1, Number(b.upgradeDays) || 7) : null, b.active === false ? 0 : 1, str(b.note, 200) || null, nowIso()).run();
  await audit(env, admin, 'code.upsert', { code, kind, value });
  return env.DB.prepare('SELECT * FROM codes WHERE code=?').bind(code).first();
}

// ---------- AI ops agent ----------
const ACTIONS: Record<string, { destructive: boolean; ar: string }> = {
  create_code: { destructive: false, ar: 'إنشاء كود خصم' },
  set_agent: { destructive: false, ar: 'تعديل وكيل (تشغيل/إيقاف/مزاج)' },
  announce: { destructive: false, ar: 'نشر إعلان' },
  approve_payment: { destructive: true, ar: 'تأكيد دفع' },
  reject_payment: { destructive: true, ar: 'رفض دفع' },
  set_tier: { destructive: true, ar: 'تغيير باقة عضو' },
  hide_content: { destructive: true, ar: 'إخفاء محتوى' },
  disable_code: { destructive: true, ar: 'إيقاف كود' },
};

export async function runAction(env: Env, admin: string, name: string, args: Record<string, unknown>) {
  switch (name) {
    case 'create_code': return upsertCode(env, admin, args);
    case 'disable_code': await env.DB.prepare('UPDATE codes SET active=0 WHERE code=?').bind(normalizeCode(str(args.code, 40))).run(); break;
    case 'set_agent': {
      const id = str(args.id, 30);
      if (!agents.some((a) => a.id === id)) fail(400, 'unknown_agent', 'وكيل غير معروف');
      await env.DB.prepare('INSERT INTO agent_config (id,enabled,mood,persona,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET enabled=COALESCE(?,enabled), mood=COALESCE(?,mood), persona=COALESCE(?,persona), updated_at=excluded.updated_at')
        .bind(id, args.enabled === false ? 0 : 1, str(args.mood, 20) || null, str(args.persona, 400) || null, nowIso(), args.enabled === undefined ? null : args.enabled ? 1 : 0, str(args.mood, 20) || null, str(args.persona, 400) || null).run();
      break;
    }
    case 'announce': await env.DB.prepare('INSERT INTO announcements (id,title,body,level,active,created_at) VALUES (?,?,?,?,1,?)').bind(uid('an_'), str(args.title, 120), str(args.body, 1000), str(args.level, 10) || 'info', nowIso()).run(); break;
    case 'approve_payment': return decidePayment(env, admin, str(args.id, 60), 'approve', str(args.note, 200));
    case 'reject_payment': return decidePayment(env, admin, str(args.id, 60), 'reject', str(args.note, 200));
    case 'set_tier': {
      const t = str(args.tier, 10);
      if (!tierById(t)) fail(400, 'invalid_tier', 'باقة غلط');
      const u = await env.DB.prepare('SELECT id FROM users WHERE id=? OR email=?').bind(str(args.user, 200), str(args.user, 200).toLowerCase()).first<{ id: string }>();
      if (!u) fail(404, 'not_found', 'العضو مش موجود');
      if (t === 'free') await env.DB.prepare("UPDATE users SET tier='free', tier_until=NULL WHERE id=?").bind(u!.id).run();
      else await setTier(env, u!.id, t, Number(args.days) || 30, 'active');
      break;
    }
    case 'hide_content': {
      const table = { post: 'posts', comment: 'comments', message: 'messages', review: 'reviews' }[str(args.type, 10)];
      if (!table) fail(400, 'invalid_type', 'نوع غلط');
      await env.DB.prepare(`UPDATE ${table} SET status='hidden' WHERE id=?`).bind(str(args.id, 60)).run();
      break;
    }
    default: fail(400, 'unknown_action', 'أمر غير معروف');
  }
  await audit(env, admin, `ops.${name}`, args);
  return { ok: true };
}

export async function opsChat(env: Env, admin: string, b: Record<string, unknown>) {
  const s = await stats(env);
  const pending = (await listPayments(env, 'pending')).items.slice(0, 8).map((p) => `${p.id} | ${p.userName} | ${p.tierInfo?.ar} | ${p.amount}ج | ثقة ${p.confidence ?? '-'} | ${p.refCode}`);
  const prov = (await listPayments(env, 'provisional')).items.slice(0, 8).map((p) => `${p.id} | ${p.userName} | ${p.tierInfo?.ar} | ${p.amount}ج | ثقة ${p.confidence}`);
  const pens = (await env.DB.prepare('SELECT p.id, u.name, p.rules, p.action, p.appeal_status FROM penalties p LEFT JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC LIMIT 8').all()).results;
  const codes = (await env.DB.prepare('SELECT code, kind, value, uses, max_uses, active FROM codes ORDER BY created_at DESC LIMIT 10').all()).results;
  const sys = `انت "المهندس عادل" 🛠️ وكيل العمليات (ذكاء اصطناعي) في لوحة إدارة موقع صفقة. بتكلم صاحب الموقع عمر بالعامية المصرية، مختصر وواضح وبإيموجي.
حالة الموقع دلوقتي (بيانات حقيقية):
${JSON.stringify(s)}
مدفوعات مستنية مراجعة: ${pending.join('\n') || 'مفيش'}
مدفوعات متفعلة مبدئيًا: ${prov.join('\n') || 'مفيش'}
آخر عقوبات: ${JSON.stringify(pens)}
آخر أكواد: ${JSON.stringify(codes)}
الباقات: ${TIERS.map((t) => `${t.id}=${t.ar} ${t.price}ج`).join('، ')}
الوكلاء: ${agents.map((a) => `${a.id}(${a.name})`).join('، ')}

تقدر تقترح أمر واحد من دول: ${Object.entries(ACTIONS).map(([k, v]) => `${k} (${v.ar})`).join('، ')}.
بارامترات: create_code{code,kind:percent|fixed|upgrade,value,maxUses,expiresAt,upgradeTier,upgradeDays,tiers[]}, set_agent{id,enabled,mood,persona}, announce{title,body,level}, approve_payment{id,note}, reject_payment{id,note}, set_tier{user,tier,days}, hide_content{type,id}, disable_code{code}.
رد JSON بس بالشكل ده: {"reply":"ردك للمالك","action":null أو {"name":"...","args":{...}}}
متخترعش أرقام أو IDs مش موجودة في البيانات.`;
  const history = Array.isArray(b.history) ? (b.history as { role: string; content: string }[]).slice(-8).map((m) => ({ role: (m.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user', content: String(m.content).slice(0, 1500) })) : [];
  const out = await llm(env, 'ops', [{ role: 'system', content: sys }, ...history, { role: 'user', content: str(b.message, 2000) }], 500, 0.3);
  if (!out) return { reply: '⚠️ حصة الذكاء الاصطناعي النهارده خلصت أو الخدمة واقفة. الأرقام الأساسية: ' + `${s.users} عضو، ${s.paymentsPending} دفع مستني.`, action: null, ai: false };
  const j = extractJson<{ reply: string; action: { name: string; args: Record<string, unknown> } | null }>(out.text) ?? { reply: out.text, action: null };
  let executed: unknown = null;
  let needsConfirm = false;
  if (j.action?.name && ACTIONS[j.action.name]) {
    if (ACTIONS[j.action.name]!.destructive) needsConfirm = true;
    else executed = await runAction(env, admin, j.action.name, j.action.args ?? {}).catch((e) => ({ error: String((e as Error).message) }));
  } else j.action = null;
  await logAgent(env, 'adel', 'ops', str(b.message, 500), j.reply, out.model, 0, false);
  return { reply: j.reply, action: j.action, needsConfirm, executed, destructive: j.action ? ACTIONS[j.action.name]?.destructive : false, ai: true, model: out.model };
}
