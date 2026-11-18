import {
  type AlertItem,
  type AlertSettings,
  type AuthResponse,
  adapterInfoSchema,
  alertSchema,
  alertSettingsSchema,
  authResponseSchema,
  categorySchema,
  chatResponseSchema,
  dealsResponseSchema,
  debateSchema,
  historySchema,
  type ProductCard,
  type ProductDetail,
  predictionSchema,
  productDetailSchema,
  searchResponseSchema,
  stackResponseSchema,
  storeSchema,
  userSchema,
  type WatchItem,
  watchItemSchema,
} from '@safqa/shared';
import { z } from 'zod';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface SafqaClientOptions {
  baseUrl: string;
  getAccessToken: () => string | null;
  /** Return a fresh access token, or null when refresh fails. */
  refresh?: () => Promise<string | null>;
}

export interface SearchParams {
  q?: string;
  store?: string;
  category?: string;
  minDiscount?: number;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  hideFake?: boolean;
  sort?: 'score' | 'price_asc' | 'discount';
}

export interface LiveEvent {
  type: string;
  alert?: AlertItem;
}

const list = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item) });

export function createSafqaClient(options: SafqaClientOptions) {
  const base = options.baseUrl.replace(/\/$/, '');

  async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    init?: RequestInit,
  ): Promise<T> {
    const run = async (token: string | null) => {
      const headers = new Headers(init?.headers);
      if (token) headers.set('Authorization', `Bearer ${token}`);
      if (init?.body && !headers.has('Content-Type'))
        headers.set('Content-Type', 'application/json');
      return fetch(`${base}${path}`, { ...init, headers });
    };

    let response = await run(options.getAccessToken());
    if (response.status === 401 && options.refresh) {
      const next = await options.refresh();
      if (next) response = await run(next);
    }
    const json: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const parsed = z
        .object({ error: z.object({ code: z.string(), message: z.string() }) })
        .safeParse(json);
      if (parsed.success) {
        throw new ApiError(
          response.status,
          parsed.data.error.code,
          parsed.data.error.message,
        );
      }
      throw new ApiError(
        response.status,
        'http_error',
        response.statusText || 'Request failed',
      );
    }
    return schema.parse(json);
  }

  return {
    health: () =>
      request(
        '/api/health',
        z.object({ ok: z.boolean(), db: z.string(), redis: z.string() }),
      ),
    meta: () =>
      request(
        '/api/meta',
        z.object({
          vapidPublicKey: z.string().nullable(),
          demoEmail: z.string(),
          oauth: z.object({ google: z.boolean(), apple: z.boolean() }),
        }),
      ),
    deals: () => request('/api/deals', dealsResponseSchema),
    stores: () => request('/api/stores', list(storeSchema)),
    categories: () => request('/api/categories', list(categorySchema)),
    adapters: () => request('/api/adapters', list(adapterInfoSchema)),
    search: (params: SearchParams) => {
      const query = new URLSearchParams();
      if (params.q) query.set('q', params.q);
      if (params.store) query.set('store', params.store);
      if (params.category) query.set('category', params.category);
      if (params.minDiscount)
        query.set('minDiscount', String(params.minDiscount));
      if (params.minPrice != null)
        query.set('minPrice', String(params.minPrice));
      if (params.maxPrice != null)
        query.set('maxPrice', String(params.maxPrice));
      if (params.inStock) query.set('inStock', '1');
      if (params.hideFake) query.set('hideFake', '1');
      if (params.sort) query.set('sort', params.sort);
      const suffix = query.size > 0 ? `?${query}` : '';
      return request(`/api/products/search${suffix}`, searchResponseSchema);
    },
    product: (id: string) =>
      request(`/api/products/${id}`, productDetailSchema),
    history: (id: string) =>
      request(`/api/products/${id}/history`, historySchema),
    debate: (id: string) => request(`/api/products/${id}/debate`, debateSchema),
    prediction: (id: string) =>
      request(`/api/products/${id}/prediction`, predictionSchema),
    stack: (id: string) =>
      request(`/api/products/${id}/stack`, stackResponseSchema),
    calendar: () =>
      request(
        '/api/calendar',
        z.object({
          items: z.array(
            z.object({
              id: z.string(),
              nameAr: z.string(),
              nameEn: z.string(),
              date: z.string(),
              daysUntil: z.number(),
            }),
          ),
        }),
      ),
    chat: (message: string) =>
      request('/api/chat', chatResponseSchema, {
        method: 'POST',
        body: JSON.stringify({ message }),
      }),
    admin: (token: string) =>
      request(
        '/api/admin/overview',
        z.object({
          stores: z.array(
            z.object({
              slug: z.string(),
              status: z.string(),
              nameEn: z.string(),
            }),
          ),
          crawl: z.record(z.string(), z.number()),
          debates: z.object({ count: z.number(), tokens: z.number() }),
          providers: z.array(
            z.object({
              id: z.string(),
              label: z.string(),
              configured: z.boolean(),
              model: z.string(),
              keyEnv: z.string(),
              keyHint: z.string().nullable(),
              freeTier: z.string(),
              freeNote: z.string(),
              baseUrl: z.string(),
            }),
          ),
          roles: z.array(
            z.object({ role: z.string(), chain: z.array(z.string()) }),
          ),
          router: z.array(
            z.object({
              id: z.string(),
              provider: z.string(),
              model: z.string(),
              rank: z.number(),
              health: z.string(),
              circuit: z.string(),
              ewmaMs: z.number(),
              dailyUsed: z.number(),
              dailyCap: z.number().nullable(),
              successes: z.number(),
              failures: z.number(),
              inFlight: z.number(),
              lastError: z.string().nullable(),
            }),
          ),
        }),
        { headers: { 'x-admin-token': token } },
      ),
    register: (input: { email: string; password: string; name: string }) =>
      request('/api/auth/register', authResponseSchema, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    login: (input: { email: string; password: string }) =>
      request('/api/auth/login', authResponseSchema, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    refresh: (refreshToken: string) =>
      request('/api/auth/refresh', authResponseSchema, {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      }),
    logout: (refreshToken: string) =>
      request('/api/auth/logout', z.object({ ok: z.boolean() }), {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      }),
    me: () => request('/api/auth/me', userSchema),
    watchlist: () => request('/api/watchlist', list(watchItemSchema)),
    addWatch: (productId: string, targetPriceEgp?: number | null) =>
      request('/api/watchlist', watchItemSchema, {
        method: 'POST',
        body: JSON.stringify({
          productId,
          targetPriceEgp: targetPriceEgp ?? null,
        }),
      }),
    updateWatch: (id: string, targetPriceEgp: number | null) =>
      request(`/api/watchlist/${id}`, watchItemSchema, {
        method: 'PATCH',
        body: JSON.stringify({ targetPriceEgp }),
      }),
    removeWatch: (id: string) =>
      request(`/api/watchlist/${id}`, z.object({ ok: z.boolean() }), {
        method: 'DELETE',
      }),
    alerts: () => request('/api/alerts', list(alertSchema)),
    markAlertRead: (id: string) =>
      request(`/api/alerts/${id}/read`, z.object({ ok: z.boolean() }), {
        method: 'POST',
      }),
    alertSettings: () => request('/api/alerts/settings', alertSettingsSchema),
    updateAlertSettings: (patch: Partial<AlertSettings>) =>
      request('/api/alerts/settings', alertSettingsSchema, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    sendTestAlert: () =>
      request('/api/alerts/test', alertSchema, { method: 'POST' }),
    saveWebPush: (subscription: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    }) =>
      request('/api/push/web', z.object({ ok: z.boolean() }), {
        method: 'POST',
        body: JSON.stringify(subscription),
      }),
    saveExpoPush: (token: string) =>
      request('/api/push/expo', z.object({ ok: z.boolean() }), {
        method: 'POST',
        body: JSON.stringify({ token }),
      }),
    /**
     * Server-sent events for the signed-in user. Works in browsers and in
     * Node. React Native falls back to polling when the body has no reader.
     */
    subscribe(
      onEvent: (event: LiveEvent) => void,
      signal?: AbortSignal,
    ): () => void {
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal?.addEventListener('abort', abort);
      void (async () => {
        const token = options.getAccessToken();
        const response = await fetch(`${base}/api/events`, {
          headers: {
            Accept: 'text/event-stream',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          signal: controller.signal,
        });
        const reader = response.body?.getReader();
        if (!reader) return;
        const decoder = new TextDecoder();
        let buffer = '';
        while (!controller.signal.aborted) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          const blocks = buffer.split('\n\n');
          buffer = blocks.pop() ?? '';
          for (const block of blocks) {
            const data = block
              .split('\n')
              .filter((line) => line.startsWith('data:'))
              .map((line) => line.slice(5).trim())
              .join('\n');
            if (!data || data === '{}') continue;
            try {
              onEvent(JSON.parse(data) as LiveEvent);
            } catch {
              // Ignore a malformed keepalive.
            }
          }
        }
      })().catch(() => {
        // The caller polls as well; a dropped stream is not fatal.
      });
      return () => {
        signal?.removeEventListener('abort', abort);
        controller.abort();
      };
    },
  };
}

export type SafqaClient = ReturnType<typeof createSafqaClient>;
export type { AlertItem, AuthResponse, ProductCard, ProductDetail, WatchItem };
