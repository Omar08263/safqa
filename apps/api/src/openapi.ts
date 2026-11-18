import { OpenAPIRegistry, OpenApiGeneratorV3, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import {
  alertSchema,
  alertSettingsSchema,
  authResponseSchema,
  dealsResponseSchema,
  errorSchema,
  historySchema,
  productDetailSchema,
  searchResponseSchema,
  userSchema,
  watchItemSchema,
} from '@safqa/shared';
import { z } from 'zod';

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();
const json = (schema: z.ZodType) => ({
  description: 'OK',
  content: { 'application/json': { schema } },
});

registry.registerPath({
  method: 'get',
  path: '/api/health',
  summary: 'Process health',
  responses: { 200: json(z.object({ ok: z.boolean(), db: z.string(), redis: z.string() })) },
});
registry.registerPath({
  method: 'get',
  path: '/api/deals',
  summary: 'Top deals and inflated discounts',
  responses: { 200: json(dealsResponseSchema) },
});
registry.registerPath({
  method: 'get',
  path: '/api/products/search',
  summary: 'Search products',
  request: {
    query: z.object({
      q: z.string().optional(),
      store: z.string().optional(),
      category: z.string().optional(),
      minDiscount: z.string().optional(),
      minPrice: z.string().optional(),
      maxPrice: z.string().optional(),
      inStock: z.string().optional(),
      hideFake: z.string().optional(),
      sort: z.enum(['score', 'price_asc', 'discount']).optional(),
    }),
  },
  responses: { 200: json(searchResponseSchema) },
});
registry.registerPath({
  method: 'get',
  path: '/api/products/{id}',
  summary: 'Product, offers, and summary stats',
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: json(productDetailSchema), 404: json(errorSchema) },
});
registry.registerPath({
  method: 'get',
  path: '/api/products/{id}/history',
  summary: 'Per-store price history',
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: json(historySchema) },
});
registry.registerPath({
  method: 'post',
  path: '/api/auth/login',
  summary: 'Email login. OAuth redirects live under /api/auth/oauth/{provider}.',
  responses: { 200: json(authResponseSchema), 401: json(errorSchema) },
});
registry.registerPath({
  method: 'get',
  path: '/api/auth/me',
  summary: 'Current user',
  responses: { 200: json(userSchema), 401: json(errorSchema) },
});
registry.registerPath({
  method: 'get',
  path: '/api/watchlist',
  summary: 'Watchlist for the access token',
  responses: { 200: json(z.object({ items: z.array(watchItemSchema) })), 401: json(errorSchema) },
});
registry.registerPath({
  method: 'get',
  path: '/api/alerts',
  summary: 'Recent alerts',
  responses: { 200: json(z.object({ items: z.array(alertSchema) })) },
});
registry.registerPath({
  method: 'get',
  path: '/api/alerts/settings',
  summary: 'Alert channels',
  responses: { 200: json(alertSettingsSchema) },
});
registry.registerPath({
  method: 'get',
  path: '/api/events',
  summary: 'Server-sent events for watchlist and alert changes (Authorization: Bearer)',
  responses: { 200: { description: 'text/event-stream' } },
});

export function openApiDocument() {
  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'Safqa API',
      version: '0.1.0',
      description:
        'Price tracking for Egypt. Watchlist changes are pushed on GET /api/events as JSON SSE messages of the form {"type":"watchlist.updated"} or {"type":"alert.created","alert":{...}}.',
    },
  });
}
