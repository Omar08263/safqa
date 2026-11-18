import { describe, expect, it } from 'vitest';
import { parseMarkdown } from './markdown';

describe('parseMarkdown', () => {
  it('turns bold, lists, and fences into blocks', () => {
    const blocks = parseMarkdown(
      '```markdown\n**سعر** 14999\n- نون\n1. جوميا\n```',
    );
    expect(blocks[0]).toEqual({
      type: 'p',
      spans: [{ text: 'سعر', bold: true }, { text: ' 14999' }],
    });
    expect(blocks[1]).toMatchObject({ type: 'li', spans: [{ text: 'نون' }] });
    expect(blocks[2]).toMatchObject({ type: 'li', ordered: true });
  });
});
