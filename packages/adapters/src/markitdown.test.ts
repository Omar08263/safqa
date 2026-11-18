import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseJsonLdOffer } from './jsonld';
import {
  formatLlmPageContext,
  formatProductLlmContexts,
  htmlToLlmMarkdown,
  MarkitdownUnavailable,
  markitdownBin,
} from './markitdown';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fullCapturePath =
  process.env.SAFQA_NOON_CAPTURE ?? '/tmp/safqa-tool-test/noon-buds3fe.html';

function fixture(name: string): string {
  return readFileSync(join(fixtures, name), 'utf8');
}

function estimatedTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

async function writeFakeCli(body: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'safqa-markitdown-bin-'));
  const path = join(dir, 'fake-markitdown');
  await writeFile(
    path,
    `#!/usr/bin/env node
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => { ${body} });
`,
    'utf8',
  );
  await chmod(path, 0o755);
  return path;
}

const cliAvailable =
  spawnSync(markitdownBin(), ['--version'], { encoding: 'utf8' }).status === 0;

describe('MarkItDown CLI wrapper', () => {
  it('pipes prepared HTML to a sidecar CLI and compacts the markdown', async () => {
    const bin = await writeFakeCli(
      "process.stdout.write('# Title\\n\\n\\nEGP 99.00\\n');",
    );
    const markdown = await htmlToLlmMarkdown(
      '<html><body><h1>Title</h1><p>EGP 99.00</p></body></html>',
      { bin },
    );
    expect(markdown).toBe('# Title\n\nEGP 99.00');
  });

  it('throws MarkitdownUnavailable when the binary is missing', async () => {
    await expect(
      htmlToLlmMarkdown('<h1>X</h1>', {
        bin: '/no/such/safqa-markitdown-binary',
      }),
    ).rejects.toBeInstanceOf(MarkitdownUnavailable);
  });

  it('times out a hung CLI', async () => {
    const bin = await writeFakeCli(
      'setTimeout(() => process.stdout.write("late"), 5_000);',
    );
    await expect(
      htmlToLlmMarkdown('<h1>X</h1>', { bin, timeoutMs: 200 }),
    ).rejects.toThrow(/timed out/i);
  });

  it('puts authoritative JSON-LD facts ahead of page text', () => {
    const context = formatLlmPageContext({
      url: 'https://www.noon.com/egypt-en/p',
      offer: { title: 'Galaxy Buds3 FE', priceEGP: 5998.95, inStock: true },
      markdown: 'EGP5998.95',
    });
    expect(context.indexOf('priceEGP: 5998.95')).toBeLessThan(
      context.indexOf('Page text:'),
    );
    expect(context).toContain('Structured offer (JSON-LD, authoritative)');
  });

  it('keeps the JSON-LD price when the markdown shows a different one', () => {
    const context = formatLlmPageContext({
      url: 'https://www.noon.com/egypt-en/p',
      offer: { title: 'Galaxy Buds3 FE', priceEGP: 5998.95, inStock: true },
      markdown: 'Flash sale EGP 1.00 today only',
    });
    expect(context).toContain('priceEGP: 5998.95');
    expect(context).not.toMatch(/priceEGP:\s*1(?:\.00)?/);
    expect(context.indexOf('priceEGP: 5998.95')).toBeLessThan(
      context.indexOf('EGP 1.00'),
    );
  });

  it('tells the model not to invent a price when JSON-LD is missing', () => {
    const context = formatLlmPageContext({
      url: 'https://www.noon.com/egypt-en/p',
      offer: null,
      markdown: 'Maybe EGP 10 or EGP 99',
    });
    expect(context).toContain('Structured offer: none');
    expect(context).toContain('do not invent a price');
    expect(context).not.toContain('priceEGP:');
  });

  it('joins listings with a preamble that JSON-LD stays authoritative', () => {
    const context = formatProductLlmContexts([
      {
        url: 'https://www.noon.com/egypt-en/p',
        offer: { title: 'Galaxy Buds3 FE', priceEGP: 5998.95, inStock: true },
        markdown: 'Ignore the EGP 1.00 sticker',
      },
      {
        url: 'https://www.amazon.eg/dp/B0EXAMPLE',
        offer: null,
        markdown: 'Captcha page, no price',
      },
    ]);
    if (!context) throw new Error('expected combined page context');
    expect(context).toContain('JSON-LD) prices are authoritative');
    expect(context).toContain('do not invent a price');
    expect(context.indexOf('priceEGP: 5998.95')).toBeLessThan(
      context.indexOf('EGP 1.00'),
    );
  });

  it('returns undefined when there is no offer and no markdown', () => {
    expect(
      formatProductLlmContexts([
        { url: 'https://www.noon.com/egypt-en/p', offer: null, markdown: null },
      ]),
    ).toBeUndefined();
  });
});

describe.skipIf(!cliAvailable)('MarkItDown on captured Noon HTML', () => {
  it('preserves title and price on a real Noon product excerpt', async () => {
    const html = fixture('noon-buds3fe.excerpt.html');
    const markdown = await htmlToLlmMarkdown(html);
    expect(markdown).toMatch(/Galaxy Buds3 FE/i);
    expect(markdown).toMatch(/5998\.95/);
    expect(estimatedTokens(markdown)).toBeLessThan(estimatedTokens(html));
  });

  it('leaves JSON-LD parsing on the original HTML, not the cleaned markdown', () => {
    const html = fixture('noon-iphone.html');
    const offer = parseJsonLdOffer(
      html,
      'https://www.noon.com/egypt-ar/iphone-16',
    );
    expect(offer?.title).toBe('Apple iPhone 16 128GB Black');
    expect(offer?.priceEGP).toBe(54999);
  });
});

describe.skipIf(!cliAvailable || !existsSync(fullCapturePath))(
  'MarkItDown on the full Noon capture',
  () => {
    it('cuts tokens ~80–98% and still keeps title and price', async () => {
      const html = readFileSync(fullCapturePath, 'utf8');
      const markdown = await htmlToLlmMarkdown(html);
      const before = estimatedTokens(html);
      const after = estimatedTokens(markdown);
      const reduction = (1 - markdown.length / html.length) * 100;
      // Visible in the test output so a local run can report the same numbers.
      console.info(
        `noon full page: ${html.length} chars (~${before} tok) -> ${markdown.length} chars (~${after} tok), ${reduction.toFixed(1)}% smaller`,
      );
      expect(markdown).toMatch(/Galaxy Buds3 FE/i);
      expect(markdown).toMatch(/5998\.95/);
      expect(reduction).toBeGreaterThanOrEqual(80);
    });
  },
);
