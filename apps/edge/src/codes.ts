// Discount-code rules (pure, unit-tested). Codes are always validated server-side.
import type { TierId } from './tiers';

export interface CodeRow {
  code: string;
  kind: 'percent' | 'fixed' | 'upgrade';
  value: number;
  tiers: TierId[]; // empty = any paid tier
  expires_at: string | null;
  max_uses: number | null;
  per_user: number;
  uses: number;
  upgrade_tier: TierId | null;
  upgrade_days: number | null;
  active: boolean;
}
export type CodeResult =
  | { ok: true; kind: 'discount'; listAmount: number; discount: number; amount: number; label: string }
  | { ok: true; kind: 'upgrade'; tier: TierId; days: number; label: string }
  | { ok: false; reason: 'not_found' | 'inactive' | 'expired' | 'exhausted' | 'used' | 'tier' | 'invalid'; message: string };

export const normalizeCode = (c: string) => c.trim().toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9_-]/g, '').slice(0, 32);

export function evaluateCode(row: CodeRow | null, opts: { tier: TierId; listAmount: number; userUses: number; now?: Date }): CodeResult {
  const now = opts.now ?? new Date();
  if (!row) return { ok: false, reason: 'not_found', message: 'الكود ده مش موجود' };
  if (!row.active) return { ok: false, reason: 'inactive', message: 'الكود ده متوقف' };
  if (row.expires_at && Date.parse(row.expires_at) < now.getTime()) return { ok: false, reason: 'expired', message: 'الكود ده انتهت صلاحيته' };
  if (row.max_uses != null && row.uses >= row.max_uses) return { ok: false, reason: 'exhausted', message: 'الكود ده خلص عدد مرات استخدامه' };
  if (opts.userUses >= Math.max(1, row.per_user)) return { ok: false, reason: 'used', message: 'انت استخدمت الكود ده قبل كده' };
  if (row.kind === 'upgrade') {
    if (!row.upgrade_tier || !row.upgrade_days || row.upgrade_days <= 0) return { ok: false, reason: 'invalid', message: 'الكود ده مش مظبوط' };
    return { ok: true, kind: 'upgrade', tier: row.upgrade_tier, days: row.upgrade_days, label: `ترقية مجانية ${row.upgrade_days} يوم` };
  }
  if (opts.tier === 'free') return { ok: false, reason: 'tier', message: 'الباقة المجانية مش محتاجة كود 😄' };
  if (row.tiers.length && !row.tiers.includes(opts.tier)) return { ok: false, reason: 'tier', message: 'الكود ده مش للباقة دي' };
  const list = opts.listAmount;
  let discount = row.kind === 'percent' ? Math.round((list * Math.min(100, Math.max(0, row.value))) / 100) : Math.min(list, Math.max(0, row.value));
  discount = Math.min(discount, list);
  const amount = Math.max(0, Math.round(list - discount));
  return { ok: true, kind: 'discount', listAmount: list, discount, amount, label: row.kind === 'percent' ? `خصم ${row.value}%` : `خصم ${row.value} جنيه` };
}
