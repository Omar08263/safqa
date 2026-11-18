import { describe, expect, it } from 'vitest';
import {
  prepareHtmlForMarkdown,
  startFromProductHeading,
  stripHtmlNoise,
} from './html-clean';

const noisy = `<!doctype html>
<html>
  <head>
    <title>Keep me out of the body cut</title>
    <script>window.__HUGE = true;</script>
    <style>.nav { display:block }</style>
  </head>
  <body>
    <header><a href="/">Noon</a><input placeholder="Search" /></header>
    <nav><a href="/eg">Egypt</a></nav>
    <div class="chrome">categories electronics fashion grocery</div>
    <h1>Galaxy Buds3 FE, Active Noise Cancellation Grey Grey</h1>
    <img src="https://cdn.example/hero.jpg" alt="product" />
    <p><span>EGP</span><span>5998.95</span></p>
    <footer>careers privacy cookies</footer>
  </body>
</html>`;

describe('html cleanup for the LLM path', () => {
  it('strips header, nav, footer, scripts, styles, and images', () => {
    const cleaned = stripHtmlNoise(noisy);
    expect(cleaned).not.toMatch(/<header/i);
    expect(cleaned).not.toMatch(/<nav/i);
    expect(cleaned).not.toMatch(/<footer/i);
    expect(cleaned).not.toMatch(/<script/i);
    expect(cleaned).not.toMatch(/<style/i);
    expect(cleaned).not.toMatch(/<img/i);
    expect(cleaned).toContain(
      'Galaxy Buds3 FE, Active Noise Cancellation Grey Grey',
    );
    expect(cleaned).toContain('5998.95');
  });

  it('starts at the product H1 and drops the preceding chrome', () => {
    const sliced = startFromProductHeading(noisy);
    expect(sliced.startsWith('<!doctype html>')).toBe(true);
    expect(sliced).toContain(
      '<h1>Galaxy Buds3 FE, Active Noise Cancellation Grey Grey</h1>',
    );
    expect(sliced).not.toContain('categories electronics fashion grocery');
    expect(sliced).toContain('5998.95');
  });

  it('keeps the full document when there is no H1', () => {
    const html = '<html><body><p>EGP 10</p></body></html>';
    expect(startFromProductHeading(html)).toBe(html);
  });

  it('combines the cut and the strip for MarkItDown', () => {
    const prepared = prepareHtmlForMarkdown(noisy);
    expect(prepared).toContain('Galaxy Buds3 FE');
    expect(prepared).toContain('5998.95');
    expect(prepared).not.toContain('categories electronics');
    expect(prepared).not.toMatch(/<img/i);
    expect(prepared.length).toBeLessThan(noisy.length);
  });
});
