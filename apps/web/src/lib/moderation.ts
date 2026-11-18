// The "legal agents" engine. Offline checks (profanity incl. obfuscation,
// links, personal data, scams, spam heuristics, rate limits) -> violations ->
// penalties from the escalation table. Every penalty cites rule numbers, is
// logged, and can be appealed. State lives in this browser (static demo).
import { normalizeAr } from './arabic';
import { readLocal, writeLocal } from './local';
import { escalation, ruleById } from './rules';

export const MOD_KEY = 'safqa.moderation.v1';

export interface Violation { rule: string; reason: string; evidence?: string }
export interface Penalty {
  id: string;
  memberId: string;
  memberName: string;
  at: string;
  rules: string[];
  reasons: string[];
  points: number;
  totalPoints: number;
  action: 'warning' | 'mute' | 'ban' | 'blocked';
  until: string | null;
  where: string; // community, chat, review, qa
  excerpt: string;
  agentId: string;
  appeal?: { text: string; at: string; status: 'pending' | 'accepted' | 'rejected'; decidedAt?: string; decisionAr?: string };
}
export interface ModState {
  penalties: Penalty[];
  recent: Record<string, { text: string; at: number }[]>; // per member, for spam/rate checks
  accepted: Record<string, { version: string; at: string }>; // memberId -> rules acceptance
}

export const loadMod = (): ModState => readLocal<ModState>(MOD_KEY, { penalties: [], recent: {}, accepted: {} });
export const saveMod = (s: ModState) => writeLocal(MOD_KEY, s);

// Egyptian/Arabic + English profanity (normalised). Kept short and explicit
// on purpose; matched as whole words and as de-obfuscated runs.
const PROFANITY = [
  'كس', 'كسم', 'كسمك', 'كس امك', 'طيز', 'زب', 'زبي', 'متناك', 'منيك', 'نيك', 'شرموط', 'شرموطه', 'عرص', 'معرص', 'خول', 'قحبه', 'لبوه', 'وسخه', 'ابن الكلب', 'ابن المتناكه', 'يلعن ابوك', 'يلعن دينك', 'دين امك', 'منيوك',
  'fuck', 'fucking', 'shit', 'bitch', 'asshole', 'dick', 'pussy', 'cunt', 'motherfucker', 'whore', 'slut',
];
const INSULTS = ['يا حمار', 'يا غبي', 'يا اهبل', 'يا حيوان', 'يا كلب', 'يا جزمه', 'يا زفت', 'يا وسخ', 'يا متخلف', 'stupid', 'idiot', 'moron', 'loser'];
const HATE = ['يا كافر', 'الكفار', 'يا يهودي', 'يا نصراني', 'العبيد', 'السود دول'];
const SEXUAL = ['سكس', 'porn', 'xxx', 'nudes', 'عاريه', 'بورن'];
const ILLEGAL = ['حشيش', 'بانجو', 'استروكس', 'ترامادول', 'سلاح للبيع', 'مسدس للبيع', 'فيزا مسروقه', 'حسابات مسروقه', 'كوكايين', 'هيروين'];
const SCAM_PAY = ['فودافون كاش', 'فودافون كش', 'انستاباي', 'انستا باي', 'اورانج كاش', 'اتصالات كاش', 'vodafone cash', 'instapay', 'western union', 'ويسترن يونيون'];
const SCAM_ASK = ['مقدم', 'عربون', 'حول', 'حولي', 'تحويل', 'ابعت فلوس', 'ابعتلي', 'ادفع الاول', 'send money', 'deposit'];
const PHISH = ['حدث بياناتك', 'تحديث بيانات البنك', 'كلمه سر البنك', 'رقم الكارت والـ', 'cvv', 'كود التفعيل', 'otp', 'iphone مجانا', 'ايفون مجانا', 'اربح جايزه', 'free iphone', 'you won'];
const IMPERSONATE = ['انا موظف صفقه', 'انا من اداره صفقه', 'انا وكيل صفقه', 'safqa admin', 'admin safqa', 'انا من بي تك الرسمي', 'خدمه عملاء نون الرسميه'];
const MISLEADING = ['خصم 90', 'خصم ٩٠', 'خصم 95', 'اخر قطعه في مصر', 'ببلاش خالص', 'بنص التمن الحقيقي'];
const SHORTENERS = /\b(bit\.ly|tinyurl\.com|t\.co|goo\.gl|cutt\.ly|is\.gd|rb\.gy|shorturl\.at|tiny\.cc|ow\.ly)\b/i;
const AFFILIATE = /\b(amzn\.to|s\.click\.aliexpress|noon\.com\/[^\s]*\?.*(ref|aff)=|affiliate|ref=)/i;

function words(n: string) {
  return ` ${n} `;
}
function squash(n: string) {
  return n.replace(/[\s._\-*]+/g, '');
}
const contains = (hay: string, list: string[]) =>
  list.find((word) => {
    const x = normalizeAr(word);
    return hay.includes(` ${x} `) || (x.length >= 5 && hay.includes(x));
  });
/** Letters split by dots/spaces/dashes ("ش.ر.م.و.ط") squashed back into words. */
function deobfuscated(n: string): string[] {
  return [...n.matchAll(/(?:^|\s)((?:\p{L}[\s._\-*]+){2,}\p{L})(?=\s|$)/gu)].map((m) => squash(m[1] ?? ''));
}

/** Luhn check for card-like numbers. */
function luhn(d: string) {
  let s = 0;
  let alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = Number(d[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    s += n;
    alt = !alt;
  }
  return s % 10 === 0;
}

export function analyze(text: string, opts: { recent?: { text: string; at: number }[]; files?: { name: string }[] } = {}): Violation[] {
  const v: Violation[] = [];
  const n = normalizeAr(text);
  const w = words(n);
  const runs = deobfuscated(text.toLowerCase());
  const prof = contains(w, PROFANITY) ?? PROFANITY.find((p) => runs.some((r) => normalizeAr(r) === normalizeAr(p).replace(/\s/g, '')));
  if (prof) v.push({ rule: '1.1', reason: 'لفظ خارج', evidence: prof });
  const insult = contains(w, INSULTS);
  if (insult) v.push({ rule: '1.2', reason: 'إهانة شخصية', evidence: insult });
  const hate = contains(w, HATE);
  if (hate) v.push({ rule: '1.3', reason: 'خطاب كراهية', evidence: hate });
  const digits = text.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const phone = digits.match(/(?:\+?20|0)1[0125][\s-]?\d{3,4}[\s-]?\d{4}/);
  if (phone) v.push({ rule: '2.1', reason: 'رقم موبايل في مكان عام', evidence: phone[0].replace(/\d(?=\d{3})/g, '•') });
  const card = digits.match(/\b(?:\d[ -]?){13,19}\b/);
  if (card && luhn(card[0].replace(/\D/g, ''))) v.push({ rule: '2.1', reason: 'رقم كارت بنكي', evidence: '•••• (رقم كارت)' });
  if (/\b\d{14}\b/.test(digits) && /قومي|بطاق/.test(n)) v.push({ rule: '2.1', reason: 'رقم قومي', evidence: '••••' });
  const urls = text.match(/https?:\/\/\S+|www\.\S+/gi) ?? [];
  if (urls.some((u) => SHORTENERS.test(u) || /https?:\/\/\d+\.\d+\.\d+\.\d+/.test(u) || /\.(exe|apk|msi|bat|scr)(\?|$)/i.test(u)) || contains(w, PHISH)) v.push({ rule: '2.2', reason: 'رابط مشبوه أو تصيّد', evidence: urls[0] ?? contains(w, PHISH) });
  for (const f of opts.files ?? []) if (/\.(exe|msi|bat|cmd|com|scr|js|vbs|ps1|jar|apk|sh|dll)$/i.test(f.name)) v.push({ rule: '2.3', reason: 'ملف تنفيذي', evidence: f.name });
  const now = Date.now();
  const recent = (opts.recent ?? []).filter((r) => now - r.at < 10 * 60_000);
  if (n.length > 6 && recent.filter((r) => normalizeAr(r.text) === n).length >= 1) v.push({ rule: '3.1', reason: 'تكرار نفس الرسالة' });
  if (urls.length > 2 || urls.some((u) => AFFILIATE.test(u))) v.push({ rule: '3.2', reason: urls.length > 2 ? `${urls.length} روابط في رسالة واحدة` : 'رابط إعلاني/أفلييت', evidence: urls[0] });
  if (recent.filter((r) => now - r.at < 30_000).length >= 6) v.push({ rule: '3.3', reason: 'رسايل كتير ورا بعض (فلود)' });
  const letters = text.replace(/[^A-Za-z]/g, '');
  const emoji = text.match(/\p{Extended_Pictographic}/gu) ?? [];
  if ((letters.length > 15 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.75) || emoji.length > 15) v.push({ rule: '3.4', reason: emoji.length > 15 ? `${emoji.length} إيموجي` : 'كتابة كلها كابيتال' });
  const mis = contains(w, MISLEADING);
  if (mis) v.push({ rule: '4.1', reason: 'ادعاء سعر/خصم مضلل', evidence: mis });
  const imp = contains(w, IMPERSONATE);
  if (imp) v.push({ rule: '4.3', reason: 'انتحال صفة', evidence: imp });
  const sex = contains(w, SEXUAL);
  if (sex) v.push({ rule: '5.1', reason: 'محتوى جنسي', evidence: sex });
  const ill = contains(w, ILLEGAL);
  if (ill) v.push({ rule: '5.2', reason: 'ترويج لممنوعات', evidence: ill });
  if (contains(w, SCAM_PAY) && contains(w, SCAM_ASK)) v.push({ rule: '5.3', reason: 'طلب تحويل فلوس (نمط نصب)', evidence: `${contains(w, SCAM_ASK)} + ${contains(w, SCAM_PAY)}` });
  // De-duplicate by rule.
  return v.filter((x, i) => v.findIndex((y) => y.rule === x.rule) === i);
}

export function activePenalty(state: ModState, memberId: string): Penalty | null {
  const now = Date.now();
  return state.penalties.find((p) => p.memberId === memberId && (p.action === 'mute' || p.action === 'ban') && p.until && Date.parse(p.until) > now && p.appeal?.status !== 'accepted') ?? null;
}

export function pointsOf(state: ModState, memberId: string): number {
  const since = Date.now() - 30 * 86_400_000;
  return state.penalties.filter((p) => p.memberId === memberId && Date.parse(p.at) > since && p.appeal?.status !== 'accepted').reduce((s, p) => s + p.points, 0);
}

export type Verdict = { ok: true } | { ok: false; penalty: Penalty; blocked: boolean };

/**
 * Check a message before it is published. Returns ok, or the penalty issued
 * (and whether the content is blocked). Records the message for spam checks.
 */
export function review(memberId: string, memberName: string, text: string, where: string, files: { name: string }[] = []): Verdict {
  const state = loadMod();
  const active = activePenalty(state, memberId);
  if (active) return { ok: false, penalty: active, blocked: true };
  const recent = state.recent[memberId] ?? [];
  const violations = analyze(text, { recent, files });
  state.recent[memberId] = [...recent, { text, at: Date.now() }].slice(-20);
  if (violations.length === 0) {
    saveMod(state);
    return { ok: true };
  }
  const points = violations.reduce((s, v) => s + (ruleById(v.rule)?.severity ?? 1), 0);
  const total = pointsOf(state, memberId) + points;
  const severe = violations.some((v) => (ruleById(v.rule)?.severity ?? 0) >= 5);
  const step = severe ? (escalation.find((e) => e.min === 8) as (typeof escalation)[number]) : [...escalation].reverse().find((e) => total >= e.min) ?? escalation[0];
  const blocked = points >= 2 || severe || step?.action !== 'warning';
  const lead = ruleById(violations.sort((a, b) => (ruleById(b.rule)?.severity ?? 0) - (ruleById(a.rule)?.severity ?? 0))[0]?.rule ?? '');
  const penalty: Penalty = {
    id: crypto.randomUUID(),
    memberId,
    memberName,
    at: new Date().toISOString(),
    rules: violations.map((x) => x.rule),
    reasons: violations.map((x) => `${x.reason}${x.evidence ? ` («${String(x.evidence).slice(0, 40)}»)` : ''}`),
    points,
    totalPoints: total,
    action: step?.action ?? 'warning',
    until: step && step.minutes ? new Date(Date.now() + step.minutes * 60_000).toISOString() : null,
    where,
    excerpt: text.slice(0, 140),
    agentId: lead?.agent ?? 'nabil',
  };
  state.penalties = [penalty, ...state.penalties].slice(0, 500);
  saveMod(state);
  return { ok: false, penalty, blocked };
}

export function fileAppeal(penaltyId: string, text: string) {
  const state = loadMod();
  const p = state.penalties.find((x) => x.id === penaltyId);
  if (!p || p.appeal) return;
  p.appeal = { text, at: new Date().toISOString(), status: 'pending' };
  saveMod(state);
}

/**
 * Judge Salma's deterministic appeal policy (runs ~20 s after filing):
 * - accepted: first offence in 30 days AND only low-severity rules (spam/caps/links/repeat)
 * - rejected: anything involving profanity, hate, personal data, scams, illegal goods
 * - otherwise accepted when the appeal gives a reason (>= 15 chars) and total points < 5
 */
export function processAppeals(): number {
  const state = loadMod();
  let changed = 0;
  for (const p of state.penalties) {
    if (p.appeal?.status !== 'pending' || Date.now() - Date.parse(p.appeal.at) < 20_000) continue;
    const grave = p.rules.some((r) => ['1.1', '1.3', '2.1', '2.2', '2.3', '5.1', '5.2', '5.3', '4.3'].includes(r));
    const lowOnly = p.rules.every((r) => r.startsWith('3.'));
    const prior = state.penalties.filter((x) => x.memberId === p.memberId && x.id !== p.id && Date.parse(x.at) > Date.now() - 30 * 86_400_000 && Date.parse(x.at) < Date.parse(p.at)).length;
    let accept = false;
    let why = '';
    if (grave) why = `المخالفة على المادة ${p.rules.join('، ')} من المخالفات الجسيمة اللي مفيهاش تخفيف. العقوبة مستمرة.`;
    else if (lowOnly && prior === 0) { accept = true; why = 'أول مخالفة بسيطة (سبام/تنسيق). اتقبل التظلم واتشالت النقاط — خلي بالك المرة الجاية 🙏'; }
    else if (p.appeal.text.trim().length >= 15 && p.totalPoints < 5) { accept = true; why = 'التبرير مقنع والنقاط قليلة. اتقبل التظلم.'; }
    else why = 'التظلم من غير سبب كافي أو المخالفات متكررة. العقوبة مستمرة.';
    p.appeal = { ...p.appeal, status: accept ? 'accepted' : 'rejected', decidedAt: new Date().toISOString(), decisionAr: why };
    changed++;
  }
  if (changed) saveMod(state);
  return changed;
}

export function acceptRules(memberId: string, version: string) {
  const state = loadMod();
  state.accepted[memberId] = { version, at: new Date().toISOString() };
  saveMod(state);
}
export function hasAccepted(memberId: string, version: string) {
  return loadMod().accepted[memberId]?.version === version;
}
