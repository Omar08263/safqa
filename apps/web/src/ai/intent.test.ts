import { describe, expect, it } from 'vitest';
import { parseIntent } from './intent';

describe('parseIntent', () => {
  it('reads Egyptian budgets', () => {
    expect(parseIntent('لابتوب للمذاكرة تحت 15 ألف').maxPrice).toBe(15000);
    expect(parseIntent('سماعة تحت ٨٠٠').maxPrice).toBe(800);
    expect(parseIntent('موبايل في حدود عشرين ألف').maxPrice).toBe(20000);
    expect(parseIntent('تلفزيون فوق 10 الف').minPrice).toBe(10000);
  });
  it('expands Arabic terms to English', () => {
    expect(parseIntent('حاجة أشحن بيها الموبايل').expanded).toMatch(/power bank/);
    expect(parseIntent('سماعة للجيم').expanded).toMatch(/headphones.*sport|sport.*headphones|earbuds/);
  });
  it('detects cheap / premium', () => {
    expect(parseIntent('عايز حاجة رخيصة').cheap).toBe(true);
    expect(parseIntent('أقوى لابتوب جيمنج').premium).toBe(true);
  });
});
