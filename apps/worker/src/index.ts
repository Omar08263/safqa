import { resolve } from 'node:path';
import {
  adapterBySlug,
  BlockedBySite,
  RobotsDisallowed,
  SAFQA_USER_AGENT,
} from '@safqa/adapters';
import {
  createProvider,
  createProviderForRole,
  debateLimits,
  runDebate,
} from '@safqa/agents';
import {
  catalogTools,
  createDatabase,
  dueProducts,
  getAlertSettings,
  getProduct,
  latestDebate,
  listWebPushes,
  offersForProduct,
  pageContextsForProduct,
  postponeCrawl,
  priceFingerprint,
  recordObservation,
  saveDebate,
  setOfferCrawlMeta,
} from '@safqa/db';
import { deliverAlert } from '@safqa/notify';
import { Queue, Worker } from 'bullmq';
import { config } from 'dotenv';
import Redis from 'ioredis';

config({ path: resolve(process.cwd(), '.env') });
config({ path: resolve(process.cwd(), '../../.env') });

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) throw new Error('REDIS_URL is required');
const connection = { url: redisUrl, maxRetriesPerRequest: null };
const database = createDatabase();

async function waitForDatabase() {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      await database.sql`select 1`;
      return;
    } catch (error) {
      console.warn(
        `waiting for database (${attempt})`,
        error instanceof Error ? error.message : error,
      );
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 1000));
    }
  }
  throw new Error('database unavailable');
}

await waitForDatabase();

const publisher = new Redis(redisUrl);
const crawlQueue = new Queue('safqa-crawl', { connection });
const debateQueue = new Queue('safqa-debate', { connection });

async function publish(userId: string, event: unknown) {
  await publisher.publish(`safqa:user:${userId}`, JSON.stringify(event));
}

async function crawlProduct(productId: string) {
  if (process.env.CRAWL_MODE === 'off') {
    await postponeCrawl(database, productId, 24 * 60);
    return;
  }
  const rows = await offersForProduct(database, productId);
  for (const row of rows) {
    const adapter = adapterBySlug(row.store.slug);
    if (!adapter) continue;
    try {
      const fetched = await adapter.fetchAndParse(row.offer.url, {
        userAgent: SAFQA_USER_AGENT,
        includeLlmMarkdown: true,
      });
      if (
        fetched.contentHash &&
        fetched.contentHash === row.offer.contentHash
      ) {
        console.info(`unchanged ${row.offer.url}`);
        continue;
      }
      const parsed = fetched.offer;
      if (!parsed) {
        // Keep contentHash unset so we retry the parse next tick. Mark that
        // this fetch had no JSON-LD so a later debate will not treat the
        // last catalog price as a fresh structured offer.
        await setOfferCrawlMeta(database, row.offer.id, {
          lastFetchHadOffer: false,
          ...(fetched.llmMarkdown ? { llmMarkdown: fetched.llmMarkdown } : {}),
        });
        const markdownChars = fetched.llmMarkdown?.length ?? 0;
        console.info(
          `no structured offer from ${adapter.slug} (${adapter.status}) ${row.offer.url}` +
            (markdownChars > 0
              ? `; llm markdown ready (${markdownChars} chars)`
              : ''),
        );
        continue;
      }
      const raised = await recordObservation(database, {
        offerId: row.offer.id,
        priceEGP: parsed.priceEGP,
        listPriceEGP: parsed.listPriceEGP ?? null,
        inStock: parsed.inStock,
      });
      await setOfferCrawlMeta(database, row.offer.id, {
        contentHash: fetched.contentHash,
        llmMarkdown: fetched.llmMarkdown ?? null,
        lastFetchHadOffer: true,
      });
      await debateQueue.add(
        'debate',
        { productId },
        { priority: 2, removeOnComplete: 100 },
      );
      for (const item of raised) {
        await publish(item.userId, {
          type: 'alert.created',
          alert: item.alert,
        });
        const settings = await getAlertSettings(database, item.userId);
        const subscriptions = await listWebPushes(database, item.userId);
        const delivery = await deliverAlert({
          title: item.alert.title,
          body: item.alert.body,
          webPush: subscriptions.map((sub) => ({
            endpoint: sub.endpoint,
            p256dh: sub.p256dh,
            auth: sub.auth,
          })),
          expoPushToken: settings.expoPushToken,
          telegramChatId: settings.telegramChatId,
          enableWebPush: settings.webPush,
          enableExpo: settings.expoPush,
          enableTelegram: settings.telegram,
        });
        console.info('alert delivery', item.userId, delivery);
      }
    } catch (error) {
      if (error instanceof RobotsDisallowed || error instanceof BlockedBySite) {
        console.info(error.message);
        continue;
      }
      console.warn(
        `crawl ${row.offer.url} failed`,
        error instanceof Error ? error.message : error,
      );
    }
  }
  await postponeCrawl(database, productId, 360);
}

const worker = new Worker(
  'safqa-crawl',
  async (job) => {
    if (job.name === 'tick') {
      const due = await dueProducts(database);
      for (const row of due) {
        const priority = row.heat === 'hot' ? 1 : row.heat === 'warm' ? 5 : 10;
        await crawlQueue.add(
          'product',
          { productId: row.productId },
          {
            priority,
            jobId: `product:${row.productId}:${row.nextCrawlAt.toISOString()}`,
            removeOnComplete: 200,
          },
        );
      }
      console.info(`scheduler tick, due=${due.length}`);
      return;
    }
    const productId = (job.data as { productId?: string }).productId;
    if (productId) await crawlProduct(productId);
  },
  { connection, concurrency: Number(process.env.WORKER_CONCURRENCY || 2) },
);

const debateWorker = new Worker(
  'safqa-debate',
  async (job) => {
    const productId = (job.data as { productId?: string }).productId;
    if (!productId) return;
    const product = await getProduct(database, productId);
    if (!product) return;
    const fingerprint = priceFingerprint(product.offers);
    const existing = await latestDebate(database, productId);
    if (existing?.priceFingerprint === fingerprint) return;
    const result = await runDebate({
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
    });
    await saveDebate(database, productId, fingerprint, result);
    console.info(
      `debate ${productId} ${result.verdict.recommendation} via ${result.provider}`,
    );
  },
  { connection, concurrency: 1 },
);

await crawlQueue.upsertJobScheduler(
  'safqa-tick',
  { every: 60_000 },
  { name: 'tick', data: {} },
);
console.log('Safqa worker listening (polite crawl, no captcha bypass)');

const shutdown = async () => {
  await worker.close();
  await debateWorker.close();
  await crawlQueue.close();
  await debateQueue.close();
  await publisher.quit();
  await database.sql.end();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
