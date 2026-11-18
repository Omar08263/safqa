import { swaggerUI } from '@hono/swagger-ui';
import { adapters } from '@safqa/adapters';
import {
  addWatch,
  createManualAlert,
  createSession,
  type Database,
  DEMO_EMAIL,
  deleteSession,
  findOrCreateOAuthUser,
  findSession,
  findUserByEmail,
  findUserById,
  getAlertSettings,
  getHistory,
  getProduct,
  insertUser,
  listAlerts,
  listCategories,
  listDeals,
  listStores,
  listWatchlist,
  listWebPushes,
  markAlertRead,
  removeWatch,
  replaceSession,
  saveWebPush,
  searchProducts,
  updateAlertSettings,
  updateWatch,
} from '@safqa/db';
import { deliverAlert } from '@safqa/notify';
import {
  alertSettingsPatchSchema,
  expoPushSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  searchQuerySchema,
  watchCreateSchema,
  watchPatchSchema,
  webPushSchema,
} from '@safqa/shared';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import Redis from 'ioredis';
import { ZodError } from 'zod';
import {
  hashPassword,
  hashRefresh,
  newRefreshToken,
  readAccess,
  readState,
  refreshExpiry,
  signAccess,
  signState,
  verifyPassword,
} from './auth';
import { withCache } from './cache';
import { openApiDocument } from './openapi';
import { registerPhase2 } from './phase2';
import { publishUserEvent, userChannel } from './redis';

type AppVariables = { userId: string | null };
type RedisClient = Redis;

class HttpError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function bad(
  status: ContentfulStatusCode,
  code: string,
  message: string,
): never {
  throw new HttpError(status, code, message);
}

export interface AppDeps {
  database: Database;
  redis: RedisClient | null;
}

export function createApp({ database, redis }: AppDeps) {
  const app = new Hono<{ Variables: AppVariables }>();
  const attempts = new Map<string, { count: number; reset: number }>();

  app.use(
    '*',
    cors({
      origin: (origin) => origin || '*',
      allowHeaders: ['Authorization', 'Content-Type'],
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    }),
  );

  app.use('*', async (c, next) => {
    const header = c.req.header('Authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    const session = token ? await readAccess(token) : null;
    c.set('userId', session?.userId ?? null);
    await next();
  });

  app.onError((error, c) => {
    if (error instanceof HttpError) {
      return c.json(
        { error: { code: error.code, message: error.message } },
        error.status,
      );
    }
    if (error instanceof ZodError) {
      return c.json(
        {
          error: {
            code: 'invalid_body',
            message: error.issues[0]?.message ?? 'Invalid request',
          },
        },
        400,
      );
    }
    console.error(error);
    return c.json(
      { error: { code: 'internal', message: 'Something went wrong' } },
      500,
    );
  });

  function requireUser(c: { get: (key: 'userId') => string | null }): string {
    const userId = c.get('userId');
    if (!userId) bad(401, 'unauthorized', 'Login required');
    return userId;
  }

  async function tokensFor(user: {
    id: string;
    email: string;
    name: string;
    locale: 'ar' | 'en';
  }) {
    const refresh = newRefreshToken();
    await createSession(database, user.id, refresh.hash, refreshExpiry());
    return {
      accessToken: await signAccess(user.id, user.email),
      refreshToken: refresh.token,
      user,
    };
  }

  async function notifyUser(userId: string, title: string, body: string) {
    const settings = await getAlertSettings(database, userId);
    const subscriptions = await listWebPushes(database, userId);
    return deliverAlert({
      title,
      body,
      webPush: subscriptions.map((item) => ({
        endpoint: item.endpoint,
        p256dh: item.p256dh,
        auth: item.auth,
      })),
      expoPushToken: settings.expoPushToken,
      telegramChatId: settings.telegramChatId,
      enableWebPush: settings.webPush,
      enableExpo: settings.expoPush,
      enableTelegram: settings.telegram,
    });
  }

  app.get('/api/health', async (c) => {
    let db: 'up' | 'down' = 'down';
    let cache: 'up' | 'down' = redis ? 'down' : 'down';
    try {
      await database.sql`select 1 as ok`;
      db = 'up';
    } catch {
      db = 'down';
    }
    if (redis) {
      try {
        if (redis.status === 'wait') await redis.connect();
        const pong = await redis.ping();
        cache = pong === 'PONG' ? 'up' : 'down';
      } catch {
        cache = 'down';
      }
    }
    return c.json({ ok: db === 'up', db, redis: cache });
  });

  app.get('/api/meta', (c) =>
    c.json({
      vapidPublicKey: process.env.VAPID_PUBLIC_KEY || null,
      demoEmail: DEMO_EMAIL,
      oauth: {
        google: Boolean(
          process.env.GOOGLE_CLIENT_ID &&
            process.env.GOOGLE_CLIENT_SECRET &&
            process.env.GOOGLE_REDIRECT_URL,
        ),
        apple: Boolean(
          process.env.APPLE_CLIENT_ID &&
            process.env.APPLE_TEAM_ID &&
            process.env.APPLE_KEY_ID &&
            process.env.APPLE_PRIVATE_KEY,
        ),
      },
    }),
  );

  app.get('/openapi.json', (c) => c.json(openApiDocument()));
  app.get('/docs', swaggerUI({ url: '/openapi.json' }));

  app.get('/api/deals', async (c) => {
    c.header('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
    return c.json(
      await withCache(redis, 'safqa:deals:v1', 30, () => listDeals(database)),
    );
  });
  app.get('/api/stores', async (c) =>
    c.json({ items: await listStores(database) }),
  );
  app.get('/api/categories', async (c) =>
    c.json({ items: await listCategories(database) }),
  );
  app.get('/api/adapters', (c) =>
    c.json({
      items: adapters.map((adapter) => ({
        slug: adapter.slug,
        domains: adapter.domains,
        nameAr: adapter.displayName.ar,
        nameEn: adapter.displayName.en,
        status: adapter.status,
        notes: adapter.notes,
        officialApi: adapter.officialApi ?? null,
      })),
    }),
  );

  app.get('/api/products/search', async (c) => {
    const query = searchQuerySchema.parse(c.req.query());
    const limit =
      query.limit && query.limit > 0 ? Math.min(query.limit, 500) : 24;
    const items = (
      await searchProducts(database, {
        q: query.q,
        store: query.store,
        category: query.category,
        minDiscount: query.minDiscount,
        minPrice: query.minPrice,
        maxPrice: query.maxPrice,
        inStock: query.inStock === '1',
        hideFake: query.hideFake === '1',
        sort: query.sort,
      })
    ).slice(0, limit);
    c.header('Cache-Control', 'public, max-age=15');
    return c.json({ items });
  });

  app.get('/api/products/:id/history', async (c) => {
    const product = await getProduct(database, c.req.param('id'));
    if (!product) bad(404, 'not_found', 'Product not found');
    return c.json(await getHistory(database, c.req.param('id')));
  });

  app.get('/api/products/:id', async (c) => {
    const product = await getProduct(database, c.req.param('id'));
    if (!product) bad(404, 'not_found', 'Product not found');
    return c.json(product);
  });

  app.post('/api/auth/register', async (c) => {
    const body = registerSchema.parse(await c.req.json());
    const existing = await findUserByEmail(database, body.email);
    if (existing)
      bad(409, 'email_taken', 'An account with that email already exists');
    const user = await insertUser(database, {
      email: body.email,
      name: body.name,
      passwordHash: await hashPassword(body.password),
    });
    if (!user) bad(500, 'internal', 'Could not create the account');
    return c.json(await tokensFor(user), 201);
  });

  app.post('/api/auth/login', async (c) => {
    const key = c.req.header('x-forwarded-for') || 'local';
    const now = Date.now();
    const bucket = attempts.get(key);
    if (!bucket || bucket.reset < now)
      attempts.set(key, { count: 1, reset: now + 10 * 60 * 1000 });
    else if (bucket.count > 30)
      bad(429, 'rate_limited', 'Too many login attempts');
    else bucket.count += 1;

    const body = loginSchema.parse(await c.req.json());
    const row = await findUserByEmail(database, body.email);
    if (
      !row?.passwordHash ||
      !(await verifyPassword(body.password, row.passwordHash))
    ) {
      bad(401, 'invalid_login', 'That email or password is not right');
    }
    const user = await findUserById(database, row.id);
    if (!user) bad(401, 'invalid_login', 'That email or password is not right');
    return c.json(await tokensFor(user));
  });

  app.post('/api/auth/refresh', async (c) => {
    const body = refreshSchema.parse(await c.req.json());
    const session = await findSession(database, hashRefresh(body.refreshToken));
    if (!session || session.expiresAt.getTime() < Date.now()) {
      bad(401, 'invalid_refresh', 'Refresh token is not valid');
    }
    const user = await findUserById(database, session.userId);
    if (!user) bad(401, 'invalid_refresh', 'Refresh token is not valid');
    const refresh = newRefreshToken();
    await replaceSession(database, session.id, refresh.hash, refreshExpiry());
    return c.json({
      accessToken: await signAccess(user.id, user.email),
      refreshToken: refresh.token,
      user,
    });
  });

  app.post('/api/auth/logout', async (c) => {
    const body = refreshSchema.parse(await c.req.json());
    await deleteSession(database, hashRefresh(body.refreshToken));
    return c.json({ ok: true });
  });

  app.get('/api/auth/me', async (c) => {
    const user = await findUserById(database, requireUser(c));
    if (!user) bad(401, 'unauthorized', 'Login required');
    return c.json(user);
  });

  app.get('/api/auth/oauth/:provider', async (c) => {
    const provider = c.req.param('provider');
    if (provider === 'google') {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const redirect = process.env.GOOGLE_REDIRECT_URL;
      if (!clientId || !process.env.GOOGLE_CLIENT_SECRET || !redirect) {
        bad(
          501,
          'oauth_not_configured',
          'Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URL',
        );
      }
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('redirect_uri', redirect);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', 'openid email profile');
      url.searchParams.set('state', await signState('google'));
      return c.redirect(url.toString());
    }
    if (provider === 'apple') {
      bad(
        501,
        'oauth_not_configured',
        'Sign in with Apple is wired as a route. Set APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY, and APPLE_REDIRECT_URL, then implement the p8 client-secret JWT in this handler.',
      );
    }
    bad(404, 'not_found', 'Unknown provider');
  });

  app.get('/api/auth/oauth/google/callback', async (c) => {
    const code = c.req.query('code');
    const state = c.req.query('state');
    if (!code || (await readState(state ?? '')) !== 'google')
      bad(400, 'invalid_oauth', 'OAuth state was rejected');
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirect = process.env.GOOGLE_REDIRECT_URL;
    if (!clientId || !clientSecret || !redirect)
      bad(501, 'oauth_not_configured', 'Google OAuth is not configured');
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirect,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenResponse.ok)
      bad(401, 'invalid_oauth', 'Google did not accept the code');
    const tokenJson = (await tokenResponse.json()) as { access_token?: string };
    if (!tokenJson.access_token)
      bad(401, 'invalid_oauth', 'Google did not return a token');
    const profileResponse = await fetch(
      'https://openidconnect.googleapis.com/v1/userinfo',
      {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      },
    );
    const profile = (await profileResponse.json()) as {
      sub?: string;
      email?: string;
      name?: string;
    };
    if (!profile.sub || !profile.email)
      bad(401, 'invalid_oauth', 'Google profile has no email');
    const user = await findOrCreateOAuthUser(database, {
      provider: 'google',
      providerAccountId: profile.sub,
      email: profile.email,
      name: profile.name || profile.email,
    });
    if (!user) bad(500, 'internal', 'Could not open the account');
    const session = await tokensFor(user);
    const web = process.env.WEB_ORIGIN || 'http://localhost:47321';
    const hash = new URLSearchParams({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    });
    return c.redirect(`${web}/login#${hash.toString()}`);
  });

  app.get('/api/watchlist', async (c) => {
    return c.json({ items: await listWatchlist(database, requireUser(c)) });
  });

  app.post('/api/watchlist', async (c) => {
    const userId = requireUser(c);
    const body = watchCreateSchema.parse(await c.req.json());
    const item = await addWatch(
      database,
      userId,
      body.productId,
      body.targetPriceEgp,
    );
    if (!item) bad(404, 'not_found', 'Product not found');
    await publishUserEvent(redis, userId, { type: 'watchlist.updated' });
    return c.json(item, 201);
  });

  app.patch('/api/watchlist/:id', async (c) => {
    const userId = requireUser(c);
    const body = watchPatchSchema.parse(await c.req.json());
    const updated = await updateWatch(
      database,
      userId,
      c.req.param('id'),
      body.targetPriceEgp,
    );
    if (!updated) bad(404, 'not_found', 'Watchlist item not found');
    await publishUserEvent(redis, userId, { type: 'watchlist.updated' });
    const items = await listWatchlist(database, userId);
    const item = items.find((entry) => entry.id === updated.id);
    if (!item) bad(404, 'not_found', 'Watchlist item not found');
    return c.json(item);
  });

  app.delete('/api/watchlist/:id', async (c) => {
    const userId = requireUser(c);
    const removed = await removeWatch(database, userId, c.req.param('id'));
    if (!removed) bad(404, 'not_found', 'Watchlist item not found');
    await publishUserEvent(redis, userId, { type: 'watchlist.updated' });
    return c.json({ ok: true });
  });

  app.get('/api/alerts', async (c) =>
    c.json({ items: await listAlerts(database, requireUser(c)) }),
  );

  app.post('/api/alerts/:id/read', async (c) => {
    const userId = requireUser(c);
    await markAlertRead(database, userId, c.req.param('id'));
    await publishUserEvent(redis, userId, { type: 'alerts.updated' });
    return c.json({ ok: true });
  });

  app.get('/api/alerts/settings', async (c) =>
    c.json(await getAlertSettings(database, requireUser(c))),
  );

  app.patch('/api/alerts/settings', async (c) => {
    const userId = requireUser(c);
    const patch = alertSettingsPatchSchema.parse(await c.req.json());
    const settings = await updateAlertSettings(database, userId, patch);
    await publishUserEvent(redis, userId, { type: 'alerts.updated' });
    return c.json(settings);
  });

  app.post('/api/alerts/test', async (c) => {
    const userId = requireUser(c);
    const alert = await createManualAlert(database, userId, {
      type: 'price_drop',
      title: 'تنبيه تجريبي · Test alert',
      body: 'القناة شغالة. لو مفاتيح Web Push أو Expo أو تيليجرام موجودة هيتبعت كمان.',
    });
    await publishUserEvent(redis, userId, { type: 'alert.created', alert });
    await notifyUser(userId, alert.title, alert.body);
    return c.json(alert, 201);
  });

  app.post('/api/push/web', async (c) => {
    const userId = requireUser(c);
    const body = webPushSchema.parse(await c.req.json());
    await saveWebPush(database, userId, {
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
    });
    return c.json({ ok: true });
  });

  app.post('/api/push/expo', async (c) => {
    const userId = requireUser(c);
    const body = expoPushSchema.parse(await c.req.json());
    await updateAlertSettings(database, userId, {
      expoPushToken: body.token,
      expoPush: true,
    });
    return c.json({ ok: true });
  });

  app.get('/api/events', (c) => {
    const userId = requireUser(c);
    const url = process.env.REDIS_URL;
    if (!url) bad(503, 'redis_unavailable', 'REDIS_URL is not set');
    return streamSSE(c, async (stream) => {
      const subscriber = new Redis(url, { maxRetriesPerRequest: null });
      const onMessage = (_channel: string, message: string) => {
        void stream.writeSSE({ data: message });
      };
      subscriber.on('message', onMessage);
      await subscriber.subscribe(userChannel(userId));
      await stream.writeSSE({ data: JSON.stringify({ type: 'ready' }) });
      stream.onAbort(() => {
        subscriber.disconnect();
      });
      while (!stream.aborted) {
        await stream.writeSSE({ event: 'ping', data: '{}' });
        await stream.sleep(15000);
      }
      subscriber.disconnect();
    });
  });

  registerPhase2(app, database, redis);
  return app;
}
