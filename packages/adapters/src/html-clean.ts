/**
 * Prepare fetched storefront HTML for MarkItDown / the LLM path.
 *
 * JSON-LD is parsed from the original page in `parseJsonLdOffer`. This
 * cleanup is only for compact readable text: drop nav chrome, start at the
 * product H1 when one exists, and strip media that turns into bulky image
 * markdown. On a captured Noon product page this cut about 98% of the
 * characters sent to the model while keeping the title and price.
 */

const COMMENT = /<!--[\s\S]*?-->/g;
const SCRIPT = /<script\b[\s\S]*?<\/script>/gi;
const STYLE = /<style\b[\s\S]*?<\/style>/gi;
const NOSCRIPT = /<noscript\b[\s\S]*?<\/noscript>/gi;
const SVG = /<svg\b[\s\S]*?<\/svg>/gi;
const IFRAME = /<iframe\b[\s\S]*?<\/iframe>/gi;
const CHROME = /<(header|nav|footer|aside)\b[\s\S]*?<\/\1>/gi;
const PICTURE = /<picture\b[\s\S]*?<\/picture>/gi;
const MEDIA_OPEN = /<(img|source|video|audio|canvas)\b[^>]*>/gi;
const MEDIA_CLOSE = /<\/(?:img|source|video|audio|canvas|picture)>/gi;

/** Remove chrome and media that bloat an LLM prompt but do not carry the listing. */
export function stripHtmlNoise(html: string): string {
  return html
    .replace(COMMENT, '')
    .replace(SCRIPT, '')
    .replace(STYLE, '')
    .replace(NOSCRIPT, '')
    .replace(SVG, '')
    .replace(IFRAME, '')
    .replace(CHROME, '')
    .replace(PICTURE, '')
    .replace(MEDIA_OPEN, '')
    .replace(MEDIA_CLOSE, '');
}

/**
 * Drop everything before the first product heading. Noon and similar
 * storefronts put a large nav/search shell ahead of the H1, even when it
 * is not wrapped in <nav> or <header>.
 */
export function startFromProductHeading(html: string): string {
  const match = /<h1\b/i.exec(html);
  if (!match) return html;
  return `<!doctype html><html><body>${html.slice(match.index)}</body></html>`;
}

/** HTML that MarkItDown should see: heading-first, without nav/media noise. */
export function prepareHtmlForMarkdown(html: string): string {
  return stripHtmlNoise(startFromProductHeading(html));
}
