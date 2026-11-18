// InstaPay payments for the 4 tiers + discount codes.
import { readReceipt } from './ai';
import type { Authed } from './auth';
import { type CodeRow, evaluateCode, normalizeCode } from './codes';
import { type TierId, TIERS, tierById } from './tiers';
import { type Env, fail, nowIso, parseJ, rateLimit, str, uid } from './util';
import { makeRefCode, normRef, verifyReceipt, type Extraction } from './verify';

export async function loadCode(env: Env, code: string): Promise<CodeRow | null> {
  const r = await env.DB.prepare('SELECT * FROM codes WHERE code=?').bind(normalizeCode(code)).first<Record<string, unknown>>();
  if (!r) return null;
  return { ...(r as unknown as CodeRow), tiers: parseJ(r.tiers as string, []), active: Boolean(r.active) };
}
async function userUses(env: Env, code: string, userId: string) {
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM code_redemptions WHERE code=? AND user_id=?').bind(normalizeCode(code), userId).first<{ n: number }>();
  return Number(r?.n ?? 0);
}

export function payInfo(env: Env) {
  return { address: env.INSTAPAY_ADDRESS, link: env.INSTAPAY_LINK, qr: `${env.SITE_URL}/pay/instapay-qr.jpg`, currency: 'EGP' };
}

export async function checkCode(env: Env, a: Authed, body: Record<string, unknown>) {
  if (!(await rateLimit(env, `code:${a.user.id}`, 20, 3600))) fail(429, 'rate_limited', 'جرّبت أكواد كتير — استنى شوية');
  const tier = (str(body.tier, 10) || 'plus') as TierId;
  const t = tierById(tier);
  if (!t) fail(400, 'invalid_tier', 'باقة غير معروفة');
  const months = Math.min(12, Math.max(1, Number(body.months) || 1));
  return evaluateCode(await loadCode(env, str(body.code, 40)), { tier, listAmount: t!.price * months, userUses: await userUses(env, str(body.code, 40), a.user.id) });
}

async function setTier(env: Env, userId: string, tier: string, days: number, status: string) {
  const u = await env.DB.prepare('SELECT tier, tier_until FROM users WHERE id=?').bind(userId).first<{ tier: string; tier_until: string | null }>();
  const base = u && u.tier === tier && u.tier_until && Date.parse(u.tier_until) > Date.now() ? Date.parse(u.tier_until) : Date.now();
  const until = new Date(base + days * 86400_000).toISOString();
  await env.DB.prepare('UPDATE users SET tier=?, tier_until=?, tier_status=? WHERE id=?').bind(tier, until, status, userId).run();
  return until;
}
export { setTier };

export async function redeemUpgrade(env: Env, a: Authed, body: Record<string, unknown>) {
  const code = str(body.code, 40);
  const row = await loadCode(env, code);
  const r = evaluateCode(row, { tier: 'free', listAmount: 0, userUses: await userUses(env, code, a.user.id) });
  if (!r.ok) fail(400, r.reason, r.message);
  if (r.ok && r.kind !== 'upgrade') fail(400, 'not_upgrade', 'الكود ده خصم — استخدمه وانت بتدفع');
  if (!r.ok || r.kind !== 'upgrade') return;
  const { effectiveTier } = await import('./auth');
  const cur = tierById(effectiveTier(a.user));
  if (cur && cur.rank > (tierById(r.tier)?.rank ?? 0)) fail(400, 'higher_tier', `باقتك الحالية (${cur.ar}) أعلى من الكود ده — احتفظ بيه لحد تاني 😉`);
  const used = await env.DB.prepare('UPDATE codes SET uses=uses+1 WHERE code=? AND (max_uses IS NULL OR uses < max_uses)').bind(row!.code).run();
  if (!used.meta.changes) fail(400, 'exhausted', 'الكود خلص');
  await env.DB.prepare('INSERT INTO code_redemptions (id,code,user_id,at) VALUES (?,?,?,?)').bind(uid('cr_'), row!.code, a.user.id, nowIso()).run();
  const until = await setTier(env, a.user.id, r.tier, r.days, 'active');
  return { ok: true, tier: r.tier, until, label: r.label };
}

export async function createPayment(env: Env, a: Authed, body: Record<string, unknown>) {
  const tier = str(body.tier, 10) as TierId;
  const t = tierById(tier);
  if (!t || t.price <= 0) fail(400, 'invalid_tier', 'اختار باقة مدفوعة');
  if (!(await rateLimit(env, `paycreate:${a.user.id}`, 10, 86400))) fail(429, 'rate_limited', 'طلبات دفع كتير النهارده');
  const months = Math.min(12, Math.max(1, Number(body.months) || 1));
  const list = t!.price * months;
  let amount = list;
  let code: string | null = null;
  if (str(body.code, 40)) {
    const r = evaluateCode(await loadCode(env, str(body.code, 40)), { tier, listAmount: list, userUses: await userUses(env, str(body.code, 40), a.user.id) });
    if (!r.ok) fail(400, r.reason, r.message);
    if (r.ok && r.kind === 'discount') { amount = r.amount; code = normalizeCode(str(body.code, 40)); }
  }
  // Reuse an open request for the same tier+amount so refreshing the page doesn't spam codes.
  const open = await env.DB.prepare("SELECT * FROM payments WHERE user_id=? AND tier=? AND amount=? AND status='awaiting' AND created_at > ? ORDER BY created_at DESC LIMIT 1").bind(a.user.id, tier, amount, new Date(Date.now() - 86400_000).toISOString()).first<Record<string, unknown>>();
  if (open) return paymentOut(env, open);
  const id = uid('pay_');
  let ref = makeRefCode();
  for (let i = 0; i < 3 && (await env.DB.prepare('SELECT 1 FROM payments WHERE ref_code=?').bind(ref).first()); i++) ref = makeRefCode();
  const test = a.admin && body.test === true;
  await env.DB.prepare('INSERT INTO payments (id,user_id,tier,months,list_amount,amount,code,ref_code,status,note,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id, a.user.id, tier, months, list, amount, code, ref, amount === 0 ? 'approved' : 'awaiting', test ? 'TEST' : null, nowIso()).run();
  if (amount === 0) {
    await consumeCode(env, code, a.user.id, id);
    await setTier(env, a.user.id, tier, 30 * months, 'active');
  }
  return paymentOut(env, (await env.DB.prepare('SELECT * FROM payments WHERE id=?').bind(id).first())!);
}

async function consumeCode(env: Env, code: string | null, userId: string, paymentId: string) {
  if (!code) return;
  await env.DB.batch([
    env.DB.prepare('UPDATE codes SET uses=uses+1 WHERE code=?').bind(code),
    env.DB.prepare('INSERT INTO code_redemptions (id,code,user_id,payment_id,at) VALUES (?,?,?,?,?)').bind(uid('cr_'), code, userId, paymentId, nowIso()),
  ]);
}

export function paymentOut(env: Env, p: Record<string, unknown>, admin = false) {
  const t = tierById(String(p.tier));
  return {
    id: p.id, tier: p.tier, tierInfo: t, months: p.months, listAmount: p.list_amount, amount: p.amount, code: p.code, refCode: p.ref_code,
    status: p.status, confidence: p.confidence, checks: parseJ(p.checks as string, null), createdAt: p.created_at, submittedAt: p.submitted_at, decidedAt: p.decided_at,
    txnRef: p.txn_ref, note: admin ? p.note : p.status === 'rejected' || p.status === 'revoked' ? p.note : undefined, hasReceipt: Boolean(p.receipt_key),
    pay: payInfo(env),
    ...(admin ? { userId: p.user_id, extraction: parseJ(p.extraction as string, null), decidedBy: p.decided_by } : {}),
  };
}

const MAX_RECEIPT = 1_500_000; // bytes after client compression
export async function submitReceipt(env: Env, a: Authed, id: string, body: Record<string, unknown>) {
  const p = await env.DB.prepare('SELECT * FROM payments WHERE id=? AND user_id=?').bind(id, a.user.id).first<Record<string, unknown>>();
  if (!p) return fail(404, 'not_found', 'طلب الدفع مش موجود');
  if (p.status !== 'awaiting' && p.status !== 'needs_info') fail(409, 'already_submitted', 'الإيصال اترفع قبل كده');
  if (!(await rateLimit(env, `receipt:${a.user.id}`, 8, 86400))) fail(429, 'rate_limited', 'محاولات كتير النهارده');
  const txnRef = normRef(str(body.txnRef, 60));
  if (txnRef.length < 6) fail(400, 'invalid_ref', 'اكتب الرقم المرجعي للتحويل (Reference) زي ما هو في الإيصال');
  const dupe = await env.DB.prepare('SELECT id FROM payments WHERE txn_ref=? AND id<>?').bind(txnRef, id).first();
  if (dupe) fail(409, 'duplicate_txn', 'الرقم المرجعي ده اتستخدم قبل كده في طلب تاني ❌');
  const image = str(body.image, 2_200_000).replace(/^data:[^,]+,/, '');
  const mime = /^image\/(jpeg|png|webp)$/.test(str(body.mime, 40)) ? str(body.mime, 40) : 'image/jpeg';
  if (!image || image.length * 0.75 > MAX_RECEIPT) fail(400, 'invalid_image', 'ارفع صورة الإيصال (أقل من 1.5 ميجا)');
  // Privacy: receipts live in KV, readable only by admins, and auto-delete after 90 days.
  const key = `receipt:${id}`;
  await env.KV.put(key, image, { expirationTtl: 90 * 86400, metadata: { mime, userId: a.user.id } });
  const vision = await readReceipt(env, image, mime);
  const x = (vision.data ?? {}) as unknown as Extraction;
  const verdict = vision.data
    ? verifyReceipt(x, { amount: Number(p.amount), address: env.INSTAPAY_ADDRESS, refCode: String(p.ref_code), requestedAt: String(p.created_at), userTxnRef: txnRef })
    : { confidence: 0, checks: [], decision: 'pending' as const, reasons: ['الذكاء الاصطناعي مقدرش يقرا الإيصال — هيتراجع يدويًا'] };
  // Admin test payments may carry a TEST watermark and still exercise the auto path.
  let decision = verdict.decision;
  if (p.note === 'TEST' && x.test_marker && verdict.confidence >= 0.5) {
    const strong = verdict.checks.filter((c) => c.ok).reduce((s, c) => s + c.weight, 0);
    if (strong >= 0.8) decision = 'provisional';
  }
  // The receipt's own reference must also be unique.
  const xr = normRef(x.reference);
  if (xr && xr !== txnRef && (await env.DB.prepare('SELECT id FROM payments WHERE txn_ref=? AND id<>?').bind(xr, id).first())) {
    await env.DB.prepare("UPDATE payments SET status='rejected', note=?, receipt_key=?, decided_at=? WHERE id=?").bind('إيصال مكرر', key, nowIso(), id).run();
    return fail(409, 'duplicate_txn', 'الإيصال ده اتستخدم قبل كده ❌');
  }
  const status = decision === 'provisional' ? 'provisional' : 'pending';
  await env.DB.prepare('UPDATE payments SET txn_ref=?, receipt_key=?, extraction=?, checks=?, confidence=?, status=?, submitted_at=? WHERE id=?')
    .bind(txnRef, key, JSON.stringify({ ...x, model: vision.model }), JSON.stringify({ checks: verdict.checks, reasons: verdict.reasons }), verdict.confidence, status, nowIso(), id).run();
  if (status === 'provisional') {
    await consumeCode(env, (p.code as string) ?? null, a.user.id, id);
    await setTier(env, a.user.id, String(p.tier), 30 * Number(p.months || 1), 'provisional');
  }
  const out = paymentOut(env, (await env.DB.prepare('SELECT * FROM payments WHERE id=?').bind(id).first())!);
  return { ...out, messageAr: status === 'provisional' ? '🎉 الإيصال اتراجع بالذكاء الاصطناعي وباقتك اتفعّلت مبدئيًا! صاحب الموقع هيأكد خلال وقت قصير.' : '⏳ الإيصال وصل وهيتراجع يدويًا قريب. هنبعتلك تنبيه أول ما يتأكد.' };
}

export async function decidePayment(env: Env, adminEmail: string, id: string, action: 'approve' | 'reject' | 'revoke', note: string) {
  const p = await env.DB.prepare('SELECT * FROM payments WHERE id=?').bind(id).first<Record<string, unknown>>();
  if (!p) return fail(404, 'not_found', 'مش موجود');
  const uidd = String(p.user_id);
  if (action === 'approve') {
    if (p.status !== 'provisional') {
      await consumeCode(env, (p.code as string) ?? null, uidd, id);
      await setTier(env, uidd, String(p.tier), 30 * Number(p.months || 1), 'active');
    } else await env.DB.prepare("UPDATE users SET tier_status='active' WHERE id=?").bind(uidd).run();
  } else if (p.status === 'provisional' || p.status === 'approved') {
    await env.DB.prepare("UPDATE users SET tier='free', tier_until=NULL, tier_status='active' WHERE id=? AND tier=?").bind(uidd, p.tier).run();
  }
  const status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'revoked';
  await env.DB.prepare('UPDATE payments SET status=?, note=?, decided_at=?, decided_by=? WHERE id=?').bind(status, note || null, nowIso(), adminEmail, id).run();
  const t = tierById(String(p.tier));
  await env.DB.prepare('INSERT INTO alerts (id,user_id,type,title,body,read,created_at) VALUES (?,?,?,?,?,0,?)')
    .bind(uid('al_'), uidd, 'system', action === 'approve' ? `🎉 باقة ${t?.ar} اتفعّلت` : action === 'revoke' ? `⚠️ التفعيل المبدئي لباقة ${t?.ar} اتلغى` : `❌ طلب الدفع اترفض`, action === 'approve' ? `اتأكدنا من تحويلك وباقة ${t?.ar} شغالة. استمتع ${t?.emoji}` : `طلب الدفع ${p.ref_code} ${action === 'revoke' ? 'اتلغى بعد المراجعة' : 'اترفض'}${note ? `: ${note}` : ''}. لو في غلط كلّم الدعم.`, nowIso()).run();
  return { ok: true, status };
}

export const tiersPublic = (env: Env) => ({ tiers: TIERS, pay: payInfo(env) });

export async function reverify(env: Env, id: string) {
  const p = await env.DB.prepare('SELECT * FROM payments WHERE id=?').bind(id).first<Record<string, unknown>>();
  if (!p?.receipt_key) return fail(404, 'not_found', 'مفيش إيصال');
  const r = await env.KV.getWithMetadata<{ mime: string }>(String(p.receipt_key));
  if (!r.value) return fail(404, 'not_found', 'الإيصال اتمسح');
  const vision = await readReceipt(env, r.value, r.metadata?.mime ?? 'image/jpeg');
  if (!vision.data) return { ok: false, error: vision.raw };
  const v = verifyReceipt(vision.data as unknown as Extraction, { amount: Number(p.amount), address: env.INSTAPAY_ADDRESS, refCode: String(p.ref_code), requestedAt: String(p.created_at), userTxnRef: String(p.txn_ref ?? '') });
  await env.DB.prepare('UPDATE payments SET extraction=?, checks=?, confidence=? WHERE id=?').bind(JSON.stringify({ ...vision.data, model: vision.model }), JSON.stringify({ checks: v.checks, reasons: v.reasons }), v.confidence, id).run();
  return { ok: true, confidence: v.confidence, suggestion: v.decision };
}
