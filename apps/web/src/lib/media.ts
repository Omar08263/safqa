import { useQuery } from '@tanstack/react-query';

/** Store-published product facts captured by the crawler (packages/db/src/crawl-media.ts). */
export interface ProductMedia {
  images: { full: string; thumb: string; store: string; src: string }[];
  description: { text: string; store: string; url: string } | null;
  specs: { key: string; value: string; store: string }[];
  ratings: { store: string; value: number; count: number | null; url: string }[];
  crawledAt: string;
}

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** id -> first gallery image (thumb + full). Empty when the API has no media route. */
export function useMediaMap() {
  return useQuery({
    queryKey: ['media-map'],
    queryFn: async () => (await getJson<{ items: Record<string, { thumb: string; full: string; count: number }> }>('/api/media'))?.items ?? {},
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useProductMedia(id: string) {
  return useQuery({
    queryKey: ['media', id],
    queryFn: () => getJson<ProductMedia>(`/api/products/${id}/media`),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export const storeNames: Record<string, [string, string]> = {
  btech: ['بي.تك', 'B.TECH'],
  '2b': ['2B', '2B'],
  'amazon-eg': ['أمازون مصر', 'Amazon.eg'],
  noon: ['نون', 'Noon'],
};
