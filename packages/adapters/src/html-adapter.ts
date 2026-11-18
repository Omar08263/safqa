import { fetchPage, hashContent } from './fetch';
import { parseJsonLdOffer } from './jsonld';
import { htmlToLlmMarkdown, MarkitdownUnavailable } from './markitdown';
import {
  type CrawlContext,
  type FetchResult,
  type NormalizedOffer,
  OfficialApiPending,
  SAFQA_USER_AGENT,
  type SiteAdapter,
} from './types';

export interface AdapterDraft {
  slug: string;
  domains: string[];
  displayName: { ar: string; en: string };
  status: SiteAdapter['status'];
  notes: string;
  minIntervalMs?: number;
  officialApi?: string;
  provider?: CatalogAwait;
}

export interface CatalogAwait {
  isConfigured(): boolean;
  fetchOffer(url: string): Promise<NormalizedOffer | null>;
}

export function createHtmlAdapter(draft: AdapterDraft): SiteAdapter {
  const minIntervalMs = draft.minIntervalMs ?? 5000;
  return {
    slug: draft.slug,
    domains: draft.domains,
    displayName: draft.displayName,
    status: draft.status,
    notes: draft.notes,
    minIntervalMs,
    officialApi: draft.officialApi,
    parse(html, url) {
      const parsed = parseJsonLdOffer(html, url);
      if (!parsed) return null;
      return { ...parsed, store: draft.slug };
    },
    async fetchAndParse(url, ctx) {
      if (draft.provider?.isConfigured()) {
        try {
          const official = await draft.provider.fetchOffer(url);
          if (official) {
            return {
              offer: { ...official, store: draft.slug },
              contentHash: 'official',
            };
          }
        } catch (error) {
          if (!(error instanceof OfficialApiPending)) throw error;
        }
      }
      const html = await fetchPage(url, withDefaults(ctx), minIntervalMs);
      const offer = this.parse(html, url);
      return {
        offer,
        contentHash: hashContent(html),
        llmMarkdown: await maybeLlmMarkdown(html, offer, ctx),
      };
    },
  };
}

function withDefaults(ctx: CrawlContext): CrawlContext {
  return { ...ctx, userAgent: ctx.userAgent || SAFQA_USER_AGENT };
}

/**
 * JSON-LD remains the price/title extractor. MarkItDown runs when the
 * caller asks for page text, or as a fallback when the structured parse
 * is empty. A missing CLI must not fail a crawl that already has an offer.
 */
async function maybeLlmMarkdown(
  html: string,
  offer: FetchResult['offer'],
  ctx: CrawlContext,
): Promise<string | undefined> {
  const wanted =
    ctx.includeLlmMarkdown === true ||
    (ctx.includeLlmMarkdown !== false && !offer);
  if (!wanted) return undefined;
  try {
    const markdown = await htmlToLlmMarkdown(html, {
      timeoutMs: ctx.markitdownTimeoutMs,
    });
    return markdown.length > 0 ? markdown : undefined;
  } catch (error) {
    if (error instanceof MarkitdownUnavailable) return undefined;
    console.warn(
      'MarkItDown failed; continuing without page markdown',
      error instanceof Error ? error.message : error,
    );
    return undefined;
  }
}
