// Community, chat, reviews, XP/ranks and the automatic rules enforcement.
import { agentReply, escalation, moderate, ruleById, agentById, logAgent, llm, extractJson } from './ai';
import { type Authed, memberCard, type UserRow } from './auth';
import { defaultGroups, defaultRooms, XP, ranks, rankOf } from '../../web/src/lib/community';
import { RULES_VERSION } from '../../web/src/lib/rules';
import { tierById } from './tiers';
import { type Env, fail, nowIso, parseJ, rateLimit, str, uid } from './util';

export { RULES_VERSION, XP, ranks, rankOf };

let seeded = false;
export async function ensureSeed(env: Env) {
  if (seeded) return;
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM rooms').first<{ n: number }>();
  if (!n?.n) {
    const at = nowIso();
    await env.DB.batch([
      ...defaultGroups.map((g) => env.DB.prepare('INSERT OR IGNORE INTO groups_ (id,name,name_en,descr,emoji,color,host,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(g.id, g.name, g.nameEn, g.desc, g.emoji, g.color, g.host ?? null, at)),
      ...defaultRooms.map((r) => env.DB.prepare('INSERT OR IGNORE INTO rooms (id,name,name_en,topic,emoji,host,created_at) VALUES (?,?,?,?,?,?,?)').bind(r.id, r.name, r.nameEn, r.topic, r.emoji, r.host, at)),
    ]);
  }
  seeded = true;
}

export async function grantXp(env: Env, userId: string, amount: number, reason: string) {
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET xp=MAX(0,xp+?) WHERE id=?').bind(amount, userId),
    env.DB.prepare('INSERT INTO xp_log (user_id,amount,reason,at) VALUES (?,?,?,?)').bind(userId, amount, reason, nowIso()),
  ]);
}
export async function grantBadge(env: Env, u: UserRow, badge: string) {
  const b = parseJ<string[]>(u.badges, []);
  if (b.includes(badge)) return;
  b.push(badge);
  u.badges = JSON.stringify(b);
  await env.DB.prepare('UPDATE users SET badges=? WHERE id=?').bind(u.badges, u.id).run();
}

// ---------- Rules enforcement ----------
export interface PenaltyOut { id: string; action: string; until: string | null; rules: string[]; reasons: string[]; points: number; totalPoints: number; agentId: string; source: string; messageAr: string }
export async function activePenalty(env: Env, userId: string) {
  return env.DB.prepare("SELECT * FROM penalties WHERE user_id=? AND action IN ('mute','ban') AND until > ? AND COALESCE(appeal_status,'') <> 'accepted' ORDER BY until DESC LIMIT 1").bind(userId, nowIso()).first<Record<string, string>>();
}
async function points30(env: Env, userId: string) {
  const r = await env.DB.prepare("SELECT COALESCE(SUM(points),0) AS p FROM penalties WHERE user_id=? AND created_at > ? AND COALESCE(appeal_status,'') <> 'accepted'").bind(userId, new Date(Date.now() - 30 * 86400_000).toISOString()).first<{ p: number }>();
  return Number(r?.p ?? 0);
}

/**
 * Checks content before publishing: offline heuristics + the AI classifier,
 * then the escalation table. Returns null when clean.
 */
export async function enforce(env: Env, a: Authed, text: string, where: string, files: { name: string }[], contentId: string): Promise<{ blocked: boolean; penalty: PenaltyOut } | null> {
  const active = await activePenalty(env, a.user.id);
  if (active) {
    return { blocked: true, penalty: { id: active.id!, action: active.action!, until: active.until ?? null, rules: parseJ(active.rules, []), reasons: [active.reason!], points: 0, totalPoints: 0, agentId: active.agent_id ?? 'nabil', source: active.source!, messageAr: `انت عليك ${active.action === 'ban' ? 'حظر' : 'كتم'} لحد ${active.until}. تقدر تقدّم تظلم من صفحة القوانين.` } };
  }
  const recentRows = (await env.DB.prepare("SELECT text, created_at FROM messages WHERE author_id=? AND created_at > ? UNION ALL SELECT text, created_at FROM posts WHERE author_id=? AND created_at > ? UNION ALL SELECT text, created_at FROM comments WHERE author_id=? AND created_at > ?")
    .bind(a.user.id, new Date(Date.now() - 600_000).toISOString(), a.user.id, new Date(Date.now() - 600_000).toISOString(), a.user.id, new Date(Date.now() - 600_000).toISOString()).all<{ text: string; created_at: string }>()).results;
  const recent = recentRows.map((r) => ({ text: r.text, at: Date.parse(r.created_at) }));
  const useAi = where !== 'chat' || text.length >= 20 || /https?:|www\./.test(text);
  const findings = await moderate(env, text, { recent, files, useAi });
  if (!findings.length) return null;
  const points = findings.reduce((s, v) => s + (ruleById(v.rule)?.severity ?? 1), 0);
  const total = (await points30(env, a.user.id)) + points;
  const severe = findings.some((v) => (ruleById(v.rule)?.severity ?? 0) >= 5);
  const step = severe ? escalation.find((e) => e.min === 8)! : ([...escalation].reverse().find((e) => total >= e.min) ?? escalation[0]!);
  const blocked = points >= 2 || severe || step.action !== 'warning';
  findings.sort((x, y) => (ruleById(y.rule)?.severity ?? 0) - (ruleById(x.rule)?.severity ?? 0));
  const lead = ruleById(findings[0]!.rule);
  const agentId = lead?.agent ?? 'nabil';
  const until = step.minutes ? new Date(Date.now() + step.minutes * 60_000).toISOString() : null;
  const id = uid('pen_');
  const rules = findings.map((f) => f.rule);
  const reasons = findings.map((f) => `${f.reason}${f.evidence ? ` («${String(f.evidence).slice(0, 40)}»)` : ''}${f.source === 'ai' ? ' [AI]' : ''}`);
  const source = [...new Set(findings.map((f) => f.source))].join('+');
  await env.DB.prepare('INSERT INTO penalties (id,user_id,rules,action,until,points,reason,evidence,agent_id,where_,content_id,source,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id, a.user.id, JSON.stringify(rules), step.action, until, points, reasons.join(' | '), text.slice(0, 200), agentId, where, contentId, source, nowIso()).run();
  await grantXp(env, a.user.id, step.action === 'ban' ? XP.ban : step.action === 'mute' ? XP.mute : XP.warning, `penalty:${rules.join(',')}`);
  const ag = agentById(agentId);
  const messageAr = `${ag?.emoji[0] ?? '⚖️'} ${ag?.name ?? 'الوكيل'} (🤖 وكيل ذكي): ${step.ar} — مخالفة ${rules.map((r) => `المادة ${r} «${ruleById(r)?.ar}»`).join('، ')}.${blocked ? ' المحتوى اتمنع من النشر.' : ''} لو شايف إن ده غلط قدّم تظلم.`;
  await logAgent(env, agentId, 'moderation', text, messageAr, source, 0, false);
  return { blocked, penalty: { id, action: step.action, until, rules, reasons, points, totalPoints: total, agentId, source, messageAr } };
}

/** Judge Salma decides pending appeals: AI reasoning + the published policy as guard rails. */
export async function judgeAppeals(env: Env) {
  const rows = (await env.DB.prepare("SELECT * FROM penalties WHERE appeal_status='pending' AND appeal_at < ? LIMIT 10").bind(new Date(Date.now() - 20_000).toISOString()).all<Record<string, string>>()).results;
  for (const p of rows) {
    const rules = parseJ<string[]>(p.rules, []);
    const grave = rules.some((r) => ['1.1', '1.3', '2.1', '2.2', '2.3', '5.1', '5.2', '5.3', '4.3'].includes(r));
    const prior = await env.DB.prepare('SELECT COUNT(*) AS n FROM penalties WHERE user_id=? AND id<>? AND created_at > ? AND created_at < ?').bind(p.user_id, p.id, new Date(Date.now() - 30 * 86400_000).toISOString(), p.created_at).first<{ n: number }>();
    let accept: boolean;
    let why: string;
    if (grave) { accept = false; why = `المخالفة على المادة ${rules.join('، ')} من المخالفات الجسيمة اللي مفيهاش تخفيف. العقوبة مستمرة.`; }
    else {
      const out = await llm(env, 'appeal', [
        { role: 'system', content: 'انتي "القاضية سلمى" ⚖️ وكيلة ذكاء اصطناعي بتراجع تظلمات مجتمع صفقة. عادلة وبتدّي فرصة تانية للغلطة البسيطة. رد JSON بس: {"accept":true|false,"reason":"جملة أو اتنين بالعامية المصرية مع إيموجي"}' },
        { role: 'user', content: `المخالفة: ${rules.map((r) => `${r} ${ruleById(r)?.ar}`).join('، ')}\nالسبب: ${p.reason}\nالمحتوى: ${p.evidence}\nمخالفات سابقة في 30 يوم: ${prior?.n ?? 0}\nنص التظلم: ${p.appeal_text}` },
      ], 200, 0.2);
      const j = out ? extractJson<{ accept: boolean; reason: string }>(out.text) : null;
      if (j) { accept = Boolean(j.accept) && (prior?.n ?? 0) < 3; why = j.reason; }
      else {
        const lowOnly = rules.every((r) => r.startsWith('3.'));
        accept = (lowOnly && !prior?.n) || ((p.appeal_text ?? '').length >= 15 && Number(p.points) < 5);
        why = accept ? 'التبرير مقنع والمخالفة بسيطة. اتقبل التظلم 🙏' : 'التظلم من غير سبب كافي. العقوبة مستمرة.';
      }
    }
    await env.DB.prepare("UPDATE penalties SET appeal_status=?, appeal_reply=? WHERE id=?").bind(accept ? 'accepted' : 'rejected', why, p.id).run();
    if (accept) await grantXp(env, p.user_id!, Math.abs(p.action === 'ban' ? XP.ban : p.action === 'mute' ? XP.mute : XP.warning), 'appeal_accepted');
    await logAgent(env, 'salma', 'appeal', p.appeal_text ?? '', why, 'policy+ai', 0, false);
  }
  return rows.length;
}

// ---------- Content helpers ----------
export async function authorsFor(env: Env, ids: string[]) {
  const uniq = [...new Set(ids.filter((x) => x && !x.startsWith('agent:')))];
  const map: Record<string, unknown> = {};
  for (let i = 0; i < uniq.length; i += 50) {
    const chunk = uniq.slice(i, i + 50);
    const rows = (await env.DB.prepare(`SELECT id,name,picture,handle,tier,tier_until,xp,badges,created_at FROM users WHERE id IN (${chunk.map(() => '?').join(',')})`).bind(...chunk).all<UserRow>()).results;
    for (const r of rows) map[r.id] = { ...memberCard(r), rank: rankOf(r.xp) };
  }
  for (const id of ids.filter((x) => x?.startsWith('agent:'))) {
    const a = agentById(id.slice(6));
    if (a) map[id] = { id, name: a.name, title: a.title, agent: a.id, team: a.team, emoji: a.emoji[0], ai: true };
  }
  return map;
}

export function cleanAttachments(v: unknown): { id: string; name: string; type: string; size: number; url: string }[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 8).map((x) => ({ id: str(x?.id, 60), name: str(x?.name, 120), type: str(x?.type, 60), size: Number(x?.size) || 0, url: str(x?.url, 300) })).filter((x) => /^\/api\/v2\/media\/|^https:\/\//.test(x.url));
}

export function toggle(reactions: Record<string, string[]>, emoji: string, who: string) {
  const list = (reactions[emoji] ??= []);
  const i = list.indexOf(who);
  if (i >= 0) list.splice(i, 1);
  else list.push(who);
  if (!list.length) delete reactions[emoji];
  return reactions;
}

export async function askLimit(env: Env, who: string, tier: string) {
  if (!(await rateLimit(env, `ask:${who}`, tierById(tier)?.limits.agentQuestionsPerDay ?? 20, 86400))) fail(429, 'rate_limited', 'خلصت أسئلتك للوكلاء النهارده — جرّب بكرة أو رقّي باقتك 🥈');
}

/** Agent host joins the chat: replies when mentioned, asked a question, or the room is quiet. */
export async function maybeAgentChat(env: Env, roomId: string, text: string, userName: string) {
  const room = await env.DB.prepare('SELECT host FROM rooms WHERE id=?').bind(roomId).first<{ host: string }>();
  if (!room) return;
  const mention = text.match(/@([a-z]+)/i)?.[1]?.toLowerCase();
  const target = mention && agentById(mention) ? mention : room.host;
  const asked = /[?؟]|بكام|ارخص|أرخص|سعر|انصح|رأيك|ايه احسن|إيه أحسن/.test(text) || Boolean(mention);
  if (!asked) return;
  const history = (await env.DB.prepare('SELECT author_id, text FROM messages WHERE room_id=? ORDER BY seq DESC LIMIT 6').bind(roomId).all<{ author_id: string; text: string }>()).results.reverse()
    .map((m) => ({ role: (m.author_id.startsWith('agent:') ? 'assistant' : 'user') as 'assistant' | 'user', content: m.text }));
  const ans = await agentReply(env, target, text, { where: 'غرفة دردشة عامة في مجتمع صفقة', userName, history: history.slice(0, -1) });
  await insertMessage(env, roomId, `agent:${ans.agentId}`, ans.text, [], ans.productIds[0] ?? null, ans.agentId);
}

export async function insertMessage(env: Env, roomId: string, authorId: string, text: string, attachments: unknown[], productId: string | null, agentId: string | null) {
  const id = uid('m_');
  const seqRow = await env.DB.prepare('SELECT COALESCE(MAX(seq),0)+1 AS s FROM messages WHERE room_id=?').bind(roomId).first<{ s: number }>();
  await env.DB.prepare('INSERT INTO messages (id,room_id,author_id,text,attachments,product_id,agent_id,seq,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(id, roomId, authorId, text, JSON.stringify(attachments), productId, agentId, seqRow?.s ?? 1, nowIso()).run();
  return { id, seq: seqRow?.s ?? 1 };
}
