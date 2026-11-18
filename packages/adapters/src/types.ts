export const SAFQA_USER_AGENT =
  'SafqaBot/0.1 (+https://github.com/Omar08263/safqa; polite daily price index)';

export type AdapterStatus = 'structured' | 'best-effort' | 'stub';

/** Normalized listing. `store` is the adapter slug, not a display name. */
export interface NormalizedOffer {
  store: string;
  url: string;
  title: string;
  brand?: string;
  model?: string;
  ean?: string;
  priceEGP: number;
  listPriceEGP?: number;
  inStock: boolean;
  image?: string;
  rating?: number;
  condition?: 'new' | 'used';
}

export interface CrawlContext {
  userAgent: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  signal?: AbortSignal;
  /** Minimum gap between requests to the same host. Defaults from the adapter. */
  limiter?: DomainRateLimiter;
  robots?: RobotsCache;
  /**
   * When true, always convert fetched HTML to compact markdown for the LLM path.
   * When false, skip conversion even if JSON-LD is missing.
   * When omitted, markdown is produced only as a fallback (no structured offer).
   */
  includeLlmMarkdown?: boolean;
  /** Timeout for the MarkItDown CLI. Defaults to 20s. */
  markitdownTimeoutMs?: number;
}

export interface SiteAdapter {
  slug: string;
  domains: string[];
  displayName: { ar: string; en: string };
  status: AdapterStatus;
  notes: string;
  /** Minimum milliseconds between requests to this adapter's domains. */
  minIntervalMs: number;
  /** Name of an official partner API that should replace HTML later. */
  officialApi?: string;
  parse(html: string, url: string): NormalizedOffer | null;
  fetchAndParse(url: string, ctx: CrawlContext): Promise<FetchResult>;
}

/** Result of a live fetch. `offer` comes from JSON-LD (or an official API). */
export interface FetchResult {
  offer: NormalizedOffer | null;
  contentHash: string;
  /** Compact page markdown for the LLM path, when conversion ran and succeeded. */
  llmMarkdown?: string;
}

export interface DomainRateLimiter {
  take(hostname: string, minIntervalMs: number): Promise<void>;
}

export interface RobotsCache {
  isAllowed(
    url: string,
    userAgent: string,
    fetchImpl: typeof fetch,
  ): Promise<boolean>;
}

export class RobotsDisallowed extends Error {
  constructor(readonly url: string) {
    super(`robots.txt disallows ${url}`);
    this.name = 'RobotsDisallowed';
  }
}

export class BlockedBySite extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
  ) {
    super(
      `Site returned a block or bot check for ${url} (HTTP ${status}). Not retrying.`,
    );
    this.name = 'BlockedBySite';
  }
}

export class OfficialApiPending extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OfficialApiPending';
  }
}
