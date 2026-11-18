import { describe, expect, it } from 'vitest';
import { analyze } from './moderation';

const rules = (t: string, o?: Parameters<typeof analyze>[1]) => analyze(t, o).map((v) => v.rule);

describe('moderation.analyze', () => {
  it('passes normal deal talk', () => {
    expect(rules('السعر ده كويس جدا والتلاجة دي ممتازة، حد جربها؟')).toEqual([]);
    expect(rules('iPhone 16 dropped to 39,999 EGP at B.TECH')).toEqual([]);
  });
  it('flags Egyptian phone numbers (Arabic and Latin digits)', () => {
    expect(rules('كلمني 01012345678')).toContain('2.1');
    expect(rules('رقمي ٠١١٢٣٤٥٦٧٨٩')).toContain('2.1');
  });
  it('flags a Luhn-valid card number only', () => {
    expect(rules('4111 1111 1111 1111')).toContain('2.1');
    expect(rules('order 1234 5678 9012 3456')).not.toContain('2.1');
  });
  it('flags shortened or executable links', () => {
    expect(rules('خصم هنا bit.ly/x https://bit.ly/abc')).toContain('2.2');
    expect(rules('download http://1.2.3.4/app.apk')).toContain('2.2');
  });
  it('blocks executable attachments', () => {
    expect(rules('صورة', { files: [{ name: 'free.exe' }] })).toContain('2.3');
    expect(rules('صورة', { files: [{ name: 'tv.jpg' }] })).toEqual([]);
  });
  it('detects repeated messages', () => {
    expect(rules('اشتروا من هنا بسرعة', { recent: [{ text: 'اشتروا من هنا بسرعة', at: Date.now() - 1000 }] })).toContain('3.1');
  });
});
