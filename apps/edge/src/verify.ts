// InstaPay receipt verification (pure, unit-tested). Combines what the vision
// model read from the receipt with what Safqa expects for this payment request.

export interface Extraction {
  amount: number | null;
  currency?: string | null;
  recipient: string | null; // IPA like name@instapay, or recipient name
  sender?: string | null;
  reference: string | null; // transaction reference number
  note: string | null; // transfer note / message
  date: string | null; // ISO or free text
  status?: string | null; // e.g. "Successful"
  is_instapay?: boolean | null;
  test_marker?: boolean | null;
}
export interface Expected { amount: number; address: string; refCode: string; requestedAt: string; userTxnRef: string; now?: Date }
export interface Check { id: 'recipient' | 'amount' | 'refcode' | 'date' | 'txnref' | 'status' | 'source'; ok: boolean | null; weight: number; ar: string }
export interface Verdict { confidence: number; checks: Check[]; decision: 'provisional' | 'pending'; reasons: string[] }

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
export const westernDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
export const normRef = (s: string | null | undefined) => westernDigits(String(s ?? '')).toUpperCase().replace(/[^A-Z0-9]/g, '');

export function parseAmount(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v !== 'string') return null;
  const m = westernDigits(v).replace(/[,٬]/g, '').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
export function parseDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const s = westernDigits(v).trim();
  const iso = Date.parse(s);
  if (!Number.isNaN(iso)) return new Date(iso);
  let m = s.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/); // dd/mm/yyyy (Egypt)
  if (m) return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12));
  m = s.match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/);
  if (m && MONTHS[m[2]!.toLowerCase()] != null) return new Date(Date.UTC(Number(m[3]), MONTHS[m[2]!.toLowerCase()]!, Number(m[1]), 12));
  return null;
}

export function verifyReceipt(x: Extraction, e: Expected): Verdict {
  const now = e.now ?? new Date();
  const checks: Check[] = [];
  const reasons: string[] = [];
  const addr = e.address.toLowerCase();
  const user = addr.split('@')[0]!;
  const rec = (x.recipient ?? '').toLowerCase().replace(/\s+/g, '');
  const recOk = rec ? rec.includes(addr) || rec === user || rec.startsWith(`${user}@`) : null;
  checks.push({ id: 'recipient', ok: recOk, weight: 0.3, ar: recOk ? `المستلم ${e.address} ✔` : rec ? `المستلم في الإيصال (${x.recipient}) مش ${e.address}` : 'مقدرناش نقرا المستلم' });

  const amt = parseAmount(x.amount);
  const amountOk = amt == null ? null : Math.abs(amt - e.amount) <= 1;
  checks.push({ id: 'amount', ok: amountOk, weight: 0.3, ar: amountOk ? `المبلغ ${e.amount} جنيه ✔` : amt == null ? 'مقدرناش نقرا المبلغ' : `المبلغ في الإيصال ${amt} والمطلوب ${e.amount}` });

  const refCode = normRef(e.refCode);
  const hay = normRef(`${x.note ?? ''} ${x.reference ?? ''}`);
  const refOk = hay ? hay.includes(refCode) : null;
  checks.push({ id: 'refcode', ok: refOk, weight: 0.15, ar: refOk ? `كود الدفع ${e.refCode} مكتوب في الملاحظة ✔` : `كود الدفع ${e.refCode} مش ظاهر في الإيصال` });

  const d = parseDate(x.date);
  const req = Date.parse(e.requestedAt);
  // Recent = from 1 day before the request (time zones / user paid first) up to now + 1 day.
  const dateOk = d == null ? null : d.getTime() >= req - 36 * 3600_000 && d.getTime() <= now.getTime() + 24 * 3600_000;
  checks.push({ id: 'date', ok: dateOk, weight: 0.1, ar: dateOk ? 'تاريخ التحويل حديث ✔' : d == null ? 'مقدرناش نقرا التاريخ' : `تاريخ الإيصال (${x.date}) قديم أو مش منطقي` });

  const ut = normRef(e.userTxnRef);
  const xr = normRef(x.reference);
  const txnOk = !ut || !xr ? null : xr === ut || xr.endsWith(ut) || ut.endsWith(xr);
  checks.push({ id: 'txnref', ok: txnOk, weight: 0.1, ar: txnOk ? 'الرقم المرجعي مطابق للإيصال ✔' : txnOk === false ? `الرقم المرجعي اللي كتبته (${e.userTxnRef}) مش زي اللي في الإيصال` : 'الرقم المرجعي مش واضح في الإيصال' });

  const st = (x.status ?? '').toLowerCase();
  const statusOk = !st ? null : /success|completed|done|ناجح|تم|نجاح/.test(st) && !/fail|declin|pending|reject|فشل|مرفوض|قيد/.test(st);
  checks.push({ id: 'status', ok: statusOk, weight: 0.05, ar: statusOk ? 'حالة التحويل ناجحة ✔' : statusOk === false ? `حالة التحويل: ${x.status}` : 'حالة التحويل مش ظاهرة' });

  const srcOk = x.is_instapay == null ? null : Boolean(x.is_instapay);
  if (x.test_marker) reasons.push('الإيصال عليه علامة اختبار/عينة');
  checks.push({ id: 'source', ok: srcOk, weight: 0, ar: srcOk ? 'إيصال إنستاباي' : 'مش واضح إنه إيصال إنستاباي' });

  let confidence = 0;
  for (const c of checks) if (c.ok) confidence += c.weight;
  // Hard contradictions pull confidence down.
  if (recOk === false) confidence -= 0.3;
  if (amountOk === false) confidence -= 0.3;
  if (txnOk === false) confidence -= 0.1;
  if (statusOk === false) confidence -= 0.3;
  if (x.test_marker) confidence = Math.min(confidence, 0.5);
  confidence = Math.max(0, Math.min(1, Math.round(confidence * 100) / 100));
  for (const c of checks) if (c.ok === false) reasons.push(c.ar);
  const decision = confidence >= 0.8 && recOk === true && amountOk === true && statusOk !== false ? 'provisional' : 'pending';
  return { confidence, checks, decision, reasons };
}

/** Reference code shown to the payer, e.g. SFQ-7K3P9Q. No ambiguous chars. */
export function makeRefCode(rand: Uint8Array = crypto.getRandomValues(new Uint8Array(6))): string {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return `SFQ-${Array.from(rand, (b) => abc[b % abc.length]).join('')}`;
}
