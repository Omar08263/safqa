/** Rewrite a remote image through a CDN prefix when one is configured. */
export function cdnImage(
  url: string | null | undefined,
  base?: string | null,
): string | null {
  if (!url) return null;
  if (!base) return url;
  const root = base.replace(/\/$/, '');
  return `${root}/${encodeURIComponent(url)}`;
}

/**
 * Tag spec format: `amazon-eg:tag=safqa-21,noon:utm_source=safqa`.
 * The original URL is unchanged when the store has no tag.
 */
export function affiliateUrl(
  url: string,
  storeSlug: string,
  spec = '',
): string {
  const entry = spec
    .split(',')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${storeSlug}:`));
  if (!entry) return url;
  const assignment = entry.slice(storeSlug.length + 1);
  const eq = assignment.indexOf('=');
  if (eq <= 0) return url;
  const parsed = new URL(url);
  parsed.searchParams.set(assignment.slice(0, eq), assignment.slice(eq + 1));
  return parsed.toString();
}
