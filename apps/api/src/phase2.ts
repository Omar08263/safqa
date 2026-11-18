import {
  createProvider,
  createProviderForRole,
  debateLimits,
  describeProviders,
  describeRoles,
  describeRouter,
  runAssistant,
  runDebate,
} from '@safqa/agents';
import {
  adminOverview,
  catalogTools,
  type Database,
  getHistory,
  getProduct,
  latestDebate,
  listWatchlist,
  pageContextsForProduct,
  priceFingerprint,
  saveDebate,
  stackForProduct,
} from '@safqa/db';
import { span } from '@safqa/obs';
import {
  nextRetailEvent,
  type PriceSample,
  predictBuyTiming,
  stackPrice,
  upcomingEvents,
} from '@safqa/shared';
import type { Hono } from 'hono';
import type Redis from 'ioredis';
import { withCache } from './cache';

type App = Hono<{ Variables: { userId: string | null } }>;

const chatHits = new Map<string, { count: number; reset: number }>();

function limited(key: string, max: number): boolean {
  const now = Date.now();
  const bucket = chatHits.get(key);
  if (!bucket || bucket.reset < now) {
    chatHits.set(key, { count: 1, reset: now + 10 * 60 * 1000 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > max;
}

export function registerPhase2(
  app: App,
  database: Database,
  redis: Redis | null,
) {
  app.get('/api/products/:id/debate', async (c) => {
    const productId = c.req.param('id');
    const product = await getProduct(database, productId);
    if (!product)
      return c.json(
        { error: { code: 'not_found', message: 'Product not found' } },
        404,
      );
    const fingerprint = priceFingerprint(product.offers);
    const cached = await latestDebate(database, productId);
    const fresh =
      cached &&
      cached.priceFingerprint === fingerprint &&
      Date.now() - new Date(cached.createdAt).getTime() < 6 * 60 * 60 * 1000;
    if (fresh && cached) {
      c.header('Cache-Control', 'private, max-age=60');
      return c.json(cached);
    }
    if (c.req.query('enqueue') === '1') {
      await redis
        ?.lpush('safqa:debate:pending', productId)
        .catch(() => undefined);
      return c.json({ status: 'queued', debate: cached }, 202);
    }
    const started = Date.now();
    const debate = await saveDebate(
      database,
      productId,
      fingerprint,
      await runDebate({
        provider: createProvider(),
        providers: {
          historian: createProviderForRole('historian'),
          market: createProviderForRole('market'),
          trust: createProviderForRole('trust'),
          skeptic: createProviderForRole('skeptic'),
          judge: createProviderForRole('judge'),
        },
        productId,
        tools: await catalogTools(database),
        pageContext: await pageContextsForProduct(database, productId),
        ...debateLimits(),
      }),
    );
    await span(
      'debate',
      Date.now() - started,
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    );
    return c.json(debate);
  });

  app.get('/api/products/:id/prediction', async (c) => {
    const productId = c.req.param('id');
    const [product, history] = await Promise.all([
      getProduct(database, productId),
      getHistory(database, productId),
    ]);
    if (!product?.bestOffer) {
      return c.json(
        { error: { code: 'not_found', message: 'Product not found' } },
        404,
      );
    }
    const samples: PriceSample[] = history.series.flatMap((series) =>
      series.points.map((point) => ({
        priceEGP: point.priceEgp,
        capturedAt: new Date(point.t),
      })),
    );
    const event = nextRetailEvent();
    return c.json(
      predictBuyTiming({
        history: samples,
        current: product.bestOffer.priceEgp,
        daysUntilEvent: event?.daysUntil ?? null,
      }),
    );
  });

  app.get('/api/products/:id/stack', async (c) => {
    const product = await getProduct(database, c.req.param('id'));
    const best = product?.bestOffer;
    if (!product || !best) {
      return c.json(
        { error: { code: 'not_found', message: 'Product not found' } },
        404,
      );
    }
    const layers = await stackForProduct(
      database,
      best.priceEgp,
      best.store.slug,
      product.category?.slug ?? null,
    );
    const stacked = stackPrice(best.priceEgp, layers);
    const labels = new Map(layers.map((layer) => [layer.id, layer.label]));
    return c.json({
      finalEgp: stacked.finalEgp,
      savedEgp: stacked.savedEgp,
      applied: stacked.applied.map((line) => ({
        id: line.id,
        label: labels.get(line.id) ?? line.id,
        savedEgp: line.savedEgp,
      })),
    });
  });

  app.get('/api/calendar', (c) => {
    c.header('Cache-Control', 'public, max-age=3600');
    return c.json({ items: upcomingEvents() });
  });

  app.get('/api/lookup', async (c) => {
    const url = c.req.query('url') ?? '';
    const rows = await database.sql<{ product_id: string }[]>`
      SELECT product_id FROM offers WHERE url = ${url} LIMIT 1
    `;
    const productId = rows[0]?.product_id;
    if (!productId) return c.json({ product: null });
    return c.json({ product: await getProduct(database, productId) });
  });

  app.post('/api/chat', async (c) => {
    const ip = c.req.header('x-forwarded-for') || 'local';
    if (limited(`chat:${ip}`, 30)) {
      return c.json(
        { error: { code: 'rate_limited', message: 'Too many questions' } },
        429,
      );
    }
    const body = (await c.req.json().catch(() => null)) as {
      message?: string;
    } | null;
    const message = body?.message?.trim() ?? '';
    if (message.length < 2) {
      return c.json(
        { error: { code: 'invalid_body', message: 'Say what you want' } },
        400,
      );
    }
    const reply = await runAssistant({
      provider: createProviderForRole('assistant'),
      message,
      tools: await catalogTools(database),
    });
    const products = [];
    for (const id of reply.productIds) {
      const product = await getProduct(database, id);
      if (product) products.push(product);
    }
    return c.json({ reply: reply.reply, provider: reply.provider, products });
  });

  app.get('/api/admin/overview', async (c) => {
    const token = process.env.ADMIN_TOKEN;
    if (!token || c.req.header('x-admin-token') !== token) {
      return c.json(
        { error: { code: 'unauthorized', message: 'Admin token required' } },
        401,
      );
    }
    return c.json({
      ...(await adminOverview(database)),
      providers: describeProviders(),
      roles: describeRoles(),
      router: describeRouter(),
    });
  });

  app.get('/api/digests/preview', async (c) => {
    const userId = c.get('userId');
    if (!userId)
      return c.json(
        { error: { code: 'unauthorized', message: 'Login required' } },
        401,
      );
    const items = await listWatchlist(database, userId);
    const lines = items.map((item) => {
      const price =
        item.product.bestOffer?.priceEgp ?? item.product.lowestPriceEgp;
      return `${item.product.titleAr}: ${price ?? '—'} ج.م`;
    });
    return c.json({
      text: lines.length
        ? `ملخص صفقة\n${lines.join('\n')}`
        : 'قائمة المراقبة فاضية.',
    });
  });

  app.post('/api/telegram/webhook', async (c) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!token) {
      return c.json(
        {
          error: {
            code: 'not_configured',
            message: 'TELEGRAM_BOT_TOKEN is not set',
          },
        },
        501,
      );
    }
    if (secret && c.req.header('x-telegram-bot-api-secret-token') !== secret) {
      return c.json(
        { error: { code: 'unauthorized', message: 'Bad webhook secret' } },
        401,
      );
    }
    const update = (await c.req.json().catch(() => null)) as {
      message?: { chat?: { id?: number }; text?: string };
    } | null;
    const chatId = update?.message?.chat?.id;
    const text = update?.message?.text ?? '';
    if (!chatId) return c.json({ ok: true });
    const deals = await withCache(redis, 'safqa:deals:v1', 30, async () => {
      const { listDeals } = await import('@safqa/db');
      return listDeals(database);
    });
    const top = deals.items
      .slice(0, 3)
      .map((item) => `${item.titleAr} — ${item.bestOffer?.priceEgp ?? ''}`);
    const reply =
      text.startsWith('/deals') || text.includes('صفقات')
        ? top.join('\n') || 'مفيش صفقات'
        : 'ابعت /deals عشان أحدث الصفقات.';
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: reply }),
    });
    return c.json({ ok: true });
  });
}
