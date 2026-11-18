import { describe, expect, it } from 'vitest';
import { makeRefCode, normRef, parseAmount, parseDate, verifyReceipt, type Extraction } from './verify';

const now = new Date('2026-11-18T14:00:00Z');
const expected = { amount: 99, address: 'om3r0@instapay', refCode: 'SFQ-7K3P9Q', requestedAt: '2026-11-18T13:30:00Z', userTxnRef: '448812345678', now };
const good: Extraction = { amount: 99, currency: 'EGP', recipient: 'om3r0@instapay', reference: '448812345678', note: 'SFQ-7K3P9Q', date: '18/11/2026 15:40', status: 'Transaction Successful', is_instapay: true, test_marker: false };

describe('verifyReceipt', () => {
  it('auto-activates a fully matching receipt', () => {
    const v = verifyReceipt(good, expected);
    expect(v.decision).toBe('provisional');
    expect(v.confidence).toBeGreaterThanOrEqual(0.95);
  });
  it('sends a wrong recipient to review even when everything else matches', () => {
    const v = verifyReceipt({ ...good, recipient: 'someone.else@instapay' }, expected);
    expect(v.decision).toBe('pending');
    expect(v.reasons.join(' ')).toContain('someone.else@instapay');
  });
  it('sends a wrong amount to review', () => {
    const v = verifyReceipt({ ...good, amount: 49 }, expected);
    expect(v.decision).toBe('pending');
    expect(v.confidence).toBeLessThan(0.8);
  });
  it('accepts a 1 EGP rounding difference and Arabic digits', () => {
    expect(verifyReceipt({ ...good, amount: '٩٩٫٠٠ ج.م' as unknown as number }, expected).checks.find((c) => c.id === 'amount')?.ok).toBe(true);
    expect(verifyReceipt({ ...good, amount: 98.5 }, expected).checks.find((c) => c.id === 'amount')?.ok).toBe(true);
  });
  it('still auto-activates without the reference code in the note if the rest is strong', () => {
    const v = verifyReceipt({ ...good, note: null }, expected);
    expect(v.confidence).toBeCloseTo(0.85, 2);
    expect(v.decision).toBe('provisional');
  });
  it('flags old receipts', () => {
    const v = verifyReceipt({ ...good, date: '01/10/2026' }, expected);
    expect(v.checks.find((c) => c.id === 'date')?.ok).toBe(false);
  });
  it('flags a mismatched user-entered transaction reference', () => {
    const v = verifyReceipt(good, { ...expected, userTxnRef: '999999999' });
    expect(v.checks.find((c) => c.id === 'txnref')?.ok).toBe(false);
    expect(v.confidence).toBeLessThan(0.9);
  });
  it('rejects failed transfers into review', () => {
    expect(verifyReceipt({ ...good, status: 'Failed' }, expected).decision).toBe('pending');
  });
  it('caps confidence for receipts marked as test/sample', () => {
    const v = verifyReceipt({ ...good, test_marker: true }, expected);
    expect(v.confidence).toBeLessThanOrEqual(0.5);
    expect(v.decision).toBe('pending');
  });
  it('handles an unreadable receipt', () => {
    const v = verifyReceipt({ amount: null, recipient: null, reference: null, note: null, date: null }, expected);
    expect(v.confidence).toBe(0);
    expect(v.decision).toBe('pending');
  });
  it('accepts the bare username as recipient', () => {
    expect(verifyReceipt({ ...good, recipient: 'OM3R0' }, expected).checks[0]?.ok).toBe(true);
  });
});

describe('helpers', () => {
  it('parses amounts and dates', () => {
    expect(parseAmount('EGP 1,299.50')).toBe(1299.5);
    expect(parseDate('18/11/2026 15:40')?.toISOString().slice(0, 10)).toBe('2026-11-18');
    expect(parseDate('18 Nov 2026')?.getUTCMonth()).toBe(10);
    expect(normRef('sfq-7k3p 9q')).toBe('SFQ7K3P9Q');
  });
  it('makes unambiguous reference codes', () => {
    const c = makeRefCode(new Uint8Array([0, 1, 2, 3, 4, 5]));
    expect(c).toMatch(/^SFQ-[A-Z2-9]{6}$/);
    expect(c).not.toMatch(/[01IO]/);
  });
});
