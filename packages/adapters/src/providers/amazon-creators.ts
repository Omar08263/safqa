import { OfficialApiPending, type NormalizedOffer } from '../types';
import type { CatalogAwait } from '../html-adapter';

/**
 * Plug-in point for the Amazon Creators API (affiliate) on amazon.eg.
 *
 * The HTML adapter stays best-effort and will not try to look like a browser
 * or solve a bot check. When credentials exist, call this provider from the
 * adapter instead of fetching the storefront. Request signing is intentionally
 * not invented here: drop in the official client and return a NormalizedOffer.
 */
export function createAmazonCreatorsProvider(
  env: Record<string, string | undefined> = process.env,
): CatalogAwait {
  return {
    isConfigured() {
      return Boolean(
        env.AMAZON_CREATORS_CREDENTIAL_ID &&
          env.AMAZON_CREATORS_CREDENTIAL_SECRET &&
          env.AMAZON_CREATORS_PARTNER_TAG,
      );
    },
    async fetchOffer(url: string): Promise<NormalizedOffer | null> {
      void url;
      throw new OfficialApiPending(
        'Amazon Creators API credentials are present. Implement signing in packages/adapters/src/providers/amazon-creators.ts and return a NormalizedOffer. The HTML path is not a fallback for a failed signed call.',
      );
    },
  };
}
