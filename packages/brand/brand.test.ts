import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM script
import { outputs } from './build.mjs';

const root = join(__dirname, '../..');
const glossary = JSON.parse(readFileSync(join(__dirname, 'glossary.json'), 'utf8')) as { terms: { id: string; avoid: string[] }[] };
const tokens = JSON.parse(readFileSync(join(__dirname, 'tokens.json'), 'utf8'));

function lum(hex: string) {
  const c = hex.replace('#', '').match(/../g)!.map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };

describe('design tokens', () => {
  it('generated platform files are up to date (run node packages/brand/build.mjs)', () => {
    for (const [f, s] of Object.entries(outputs() as Record<string, string>)) expect(readFileSync(join(root, f), 'utf8'), f).toBe(s);
  });
  it('every section accent is readable: button ink ≥ 3:1 (bold UI text) on both gradient stops, accent text ≥ 4.5:1 on the page', () => {
    for (const [id, s] of Object.entries(tokens.sections) as [string, any][]) {
      for (const m of ['light', 'dark'] as const) {
        const c = s[m];
        expect(contrast(c.ink, c.from), `${id}/${m} ink on from`).toBeGreaterThanOrEqual(3);
        expect(contrast(c.ink, c.to), `${id}/${m} ink on to`).toBeGreaterThanOrEqual(3);
        expect(contrast(c.text, tokens.core[m].elev), `${id}/${m} text on card`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe('glossary (one voice)', () => {
  it('UI strings in the site, app and Hub use the canonical terms', () => {
    const hits: string[] = [];
    for (const t of glossary.terms) for (const bad of t.avoid) {
      let out = '';
      try { out = execFileSync('rg', ['-n', '--fixed-strings', bad, 'apps/web/src', 'apps/mobile/src', 'apps/admin/public', 'packages/shared/src'], { cwd: root, encoding: 'utf8' }); } catch { out = ''; }
      if (out.trim()) hits.push(`${t.id}: «${bad}»\n${out.trim().split('\n').slice(0, 3).join('\n')}`);
    }
    expect(hits).toEqual([]);
  });
});
