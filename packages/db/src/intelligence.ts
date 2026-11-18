import { createHash, randomUUID } from 'node:crypto';
import { formatProductLlmContexts } from '@safqa/adapters';
import type { DebateResult } from '@safqa/agents';
import { nextRetailEvent, type StackLayer } from '@safqa/shared';
import { desc, eq } from 'drizzle-orm';
import type { Database } from './client';
import { getHistory, getProduct, searchProducts } from './queries';
import {
  bankOffers,
  coupons,
  crawlState,
  dealDebates,
  debateMessages,
  offers,
  stores,
} from './schema';

function keywordQuery(q: string): string {
  const hints: Array<[RegExp, string]> = [
    [/سماع|headphone|noise/i, 'headphones'],
    [/ايفون|iphone/i, 'iPhone'],
    [/غسال|washer/i, 'washer'],
    [/ثلاج|fridge/i, 'refrigerator'],
    [/لابتوب|laptop/i, 'Lenovo'],
    [/باور|anker/i, 'Anker'],
    [/بلايستيشن|playstation/i, 'PlayStation'],
  ];
  for (const [pattern, word] of hints) {
    if (pattern.test(q)) return word;
  }
  return q;
}

export function priceFingerprint(
  offers: Array<{
    priceEgp: number;
    inStock: boolean;
    store: { slug: string };
  }>,
): string {
  const body = offers
    .map((offer) => `${offer.store.slug}:${offer.priceEgp}:${offer.inStock}`)
    .sort()
    .join('|');
  return createHash('sha256').update(body).digest('hex').slice(0, 16);
}

export async function catalogTools(database: Database, now = new Date()) {
  return {
    get_price_history: async (args: Record<string, unknown>) => {
      const productId = String(args.productId ?? '');
      const [product, history] = await Promise.all([
        getProduct(database, productId),
        getHistory(database, productId),
      ]);
      const best = product?.bestOffer;
      return {
        current: best?.priceEgp ?? null,
        median30: history.median30,
        min90: history.min90,
        fake: best?.fakeDiscount ?? false,
        inStock: best?.inStock ?? false,
        rating: best?.rating ?? null,
      };
    },
    get_offers: async (args: Record<string, unknown>) => {
      const product = await getProduct(database, String(args.productId ?? ''));
      return {
        offers: (product?.offers ?? []).map((offer) => ({
          store: offer.store.slug,
          priceEgp: offer.priceEgp,
          inStock: offer.inStock,
          condition: offer.condition,
          rating: offer.rating,
          fake: offer.fakeDiscount,
        })),
      };
    },
    get_seasonality: async () => {
      const next = nextRetailEvent(now);
      if (!next) return { id: null, nameAr: null, daysUntil: null };
      return {
        id: next.id,
        nameAr: next.nameAr,
        nameEn: next.nameEn,
        daysUntil: next.daysUntil,
      };
    },
    get_ratings: async (args: Record<string, unknown>) => {
      const product = await getProduct(database, String(args.productId ?? ''));
      const used = (product?.offers ?? []).some(
        (offer) =>
          offer.condition === 'used' &&
          offer.priceEgp < (product?.bestOffer?.priceEgp ?? Infinity),
      );
      return {
        rating: product?.bestOffer?.rating ?? null,
        usedCheaper: used,
        condition: product?.bestOffer?.condition ?? 'new',
      };
    },
    search_products: async (args: Record<string, unknown>) => {
      const maxPrice =
        typeof args.maxPrice === 'number' ? args.maxPrice : undefined;
      const q = keywordQuery(typeof args.q === 'string' ? args.q : '');
      const mapItem = (
        item: Awaited<ReturnType<typeof searchProducts>>[number],
      ) => ({
        id: item.id,
        titleAr: item.titleAr,
        titleEn: item.titleEn,
        priceEgp: item.bestOffer?.priceEgp ?? item.lowestPriceEgp,
      });
      let items = await searchProducts(database, {
        q,
        maxPrice,
        inStock: true,
      });
      if (items.length === 0 && maxPrice != null) {
        items = await searchProducts(database, { q, inStock: true });
        return {
          items: items.slice(0, 6).map(mapItem),
          note: 'above_budget',
          maxPrice,
        };
      }
      return {
        items: items.slice(0, 6).map(mapItem),
        note: null,
        maxPrice: maxPrice ?? null,
      };
    },
  };
}

export interface StoredDebate {
  id: string;
  productId: string;
  score: number;
  recommendation: 'buy_now' | 'wait' | 'skip';
  explanationAr: string;
  explanationEn: string;
  provider: string;
  tokens: number;
  priceFingerprint: string;
  createdAt: string;
  turns: Array<{
    role: string;
    kind: string;
    toolName: string | null;
    content: string;
    provider: string | null;
  }>;
}

function asRecommendation(value: string): StoredDebate['recommendation'] {
  if (value === 'buy_now' || value === 'skip') return value;
  return 'wait';
}

export async function latestDebate(
  database: Database,
  productId: string,
): Promise<StoredDebate | null> {
  const [debate] = await database.db
    .select()
    .from(dealDebates)
    .where(eq(dealDebates.productId, productId))
    .orderBy(desc(dealDebates.createdAt))
    .limit(1);
  if (!debate) return null;
  const turns = await database.db
    .select()
    .from(debateMessages)
    .where(eq(debateMessages.debateId, debate.id))
    .orderBy(debateMessages.seq);
  return {
    id: debate.id,
    productId: debate.productId,
    score: debate.score,
    recommendation: asRecommendation(debate.recommendation),
    explanationAr: debate.explanationAr,
    explanationEn: debate.explanationEn,
    provider: debate.provider,
    tokens: debate.tokens,
    priceFingerprint: debate.priceFingerprint,
    createdAt: debate.createdAt.toISOString(),
    turns: turns.map((turn) => ({
      role: turn.role,
      kind: turn.kind,
      toolName: turn.toolName,
      content: turn.content,
      provider: turn.provider,
    })),
  };
}

export async function saveDebate(
  database: Database,
  productId: string,
  fingerprint: string,
  result: DebateResult,
): Promise<StoredDebate> {
  const existing = await latestDebate(database, productId);
  const fresh =
    existing &&
    existing.priceFingerprint === fingerprint &&
    Date.now() - new Date(existing.createdAt).getTime() < 6 * 60 * 60 * 1000;
  if (fresh && existing) return existing;
  const id = randomUUID();
  await database.db.insert(dealDebates).values({
    id,
    productId,
    score: result.verdict.score,
    recommendation: result.verdict.recommendation,
    explanationAr: result.verdict.explanationAr,
    explanationEn: result.verdict.explanationEn,
    provider: result.provider,
    tokens: result.tokens,
    priceFingerprint: fingerprint,
  });
  if (result.turns.length > 0) {
    await database.db.insert(debateMessages).values(
      result.turns.map((turn, seq) => ({
        debateId: id,
        seq,
        role: turn.role,
        kind: turn.kind,
        toolName: turn.toolName ?? null,
        content: turn.content,
        provider: turn.provider ?? null,
      })),
    );
  }
  const stored = await latestDebate(database, productId);
  if (!stored) throw new Error('debate was not stored');
  return stored;
}

export async function setContentHash(
  database: Database,
  offerId: string,
  contentHash: string,
) {
  await setOfferCrawlMeta(database, offerId, { contentHash });
}

export async function setOfferCrawlMeta(
  database: Database,
  offerId: string,
  input: {
    contentHash?: string;
    llmMarkdown?: string | null;
    lastFetchHadOffer?: boolean;
  },
) {
  const patch: {
    contentHash?: string;
    llmMarkdown?: string | null;
    lastFetchHadOffer?: boolean;
  } = {};
  if (input.contentHash != null) patch.contentHash = input.contentHash;
  if ('llmMarkdown' in input) patch.llmMarkdown = input.llmMarkdown ?? null;
  if (input.lastFetchHadOffer != null) {
    patch.lastFetchHadOffer = input.lastFetchHadOffer;
  }
  if (Object.keys(patch).length === 0) return;
  await database.db.update(offers).set(patch).where(eq(offers.id, offerId));
}

/**
 * Load stored listing markdown and format it for the debate/assistant.
 * JSON-LD facts are included only when the last fetch actually parsed an offer.
 */
export async function pageContextsForProduct(
  database: Database,
  productId: string,
): Promise<string | undefined> {
  const rows = await database.db
    .select({
      url: offers.url,
      title: offers.title,
      priceEgp: offers.priceEgp,
      listPriceEgp: offers.listPriceEgp,
      inStock: offers.inStock,
      llmMarkdown: offers.llmMarkdown,
      lastFetchHadOffer: offers.lastFetchHadOffer,
    })
    .from(offers)
    .where(eq(offers.productId, productId));

  return formatProductLlmContexts(
    rows
      .filter((row) => row.llmMarkdown || row.lastFetchHadOffer)
      .map((row) => ({
        url: row.url,
        offer:
          row.lastFetchHadOffer === false
            ? null
            : {
                title: row.title,
                priceEGP: row.priceEgp,
                listPriceEGP: row.listPriceEgp ?? undefined,
                inStock: row.inStock,
              },
        markdown: row.llmMarkdown,
      })),
  );
}

export async function stackForProduct(
  database: Database,
  priceEgp: number,
  storeSlug: string,
  categorySlug: string | null,
): Promise<StackLayer[]> {
  if (priceEgp <= 0) return [];
  const banks = await database.db.select().from(bankOffers);
  const codes = await database.db.select().from(coupons);
  const layers: StackLayer[] = [];
  for (const bank of banks) {
    const stores = bank.stores?.split(',').filter(Boolean) ?? [];
    const categories = bank.categories?.split(',').filter(Boolean) ?? [];
    if (stores.length > 0 && !stores.includes(storeSlug)) continue;
    if (
      categories.length > 0 &&
      categorySlug &&
      !categories.includes(categorySlug)
    )
      continue;
    layers.push({
      id: bank.code,
      label: `${bank.bank} ${bank.code}`,
      kind: 'bank',
      percent: bank.percent,
      capEgp: bank.capEgp ?? undefined,
    });
  }
  for (const coupon of codes) {
    if (coupon.storeSlug && coupon.storeSlug !== storeSlug) continue;
    layers.push({
      id: coupon.code,
      label: coupon.code,
      kind: 'coupon',
      percent: coupon.percent ?? undefined,
      amountEgp: coupon.amountEgp ?? undefined,
      capEgp: coupon.capEgp ?? undefined,
      minSpendEgp: coupon.minSpendEgp ?? undefined,
    });
  }
  return layers;
}

export async function adminOverview(database: Database) {
  const heats = await database.db
    .select({ heat: crawlState.heat, productId: crawlState.productId })
    .from(crawlState);
  const debates = await database.db
    .select({ tokens: dealDebates.tokens, provider: dealDebates.provider })
    .from(dealDebates);
  const storeRows = await database.db.select().from(stores);
  const byHeat: Record<string, number> = {};
  for (const row of heats) byHeat[row.heat] = (byHeat[row.heat] ?? 0) + 1;
  const tokens = debates.reduce((sum, row) => sum + row.tokens, 0);
  return {
    stores: storeRows.map((store) => ({
      slug: store.slug,
      status: store.adapterStatus,
      nameEn: store.nameEn,
    })),
    crawl: byHeat,
    debates: { count: debates.length, tokens },
  };
}

export async function seedCommercial(database: Database) {
  const { sid } = await import('./ids');
  await database.db
    .insert(bankOffers)
    .values([
      {
        id: sid(0xb01),
        bank: 'CIB',
        code: 'CIB10',
        percent: 10,
        capEgp: 500,
        stores: 'noon,amazon-eg,jumia',
        categories: 'phones,audio',
      },
      {
        id: sid(0xb02),
        bank: 'NBE',
        code: 'AHLY5',
        percent: 5,
        capEgp: 300,
        stores: null,
        categories: 'appliances',
      },
      {
        id: sid(0xb03),
        bank: 'Banque Misr',
        code: 'MISR15',
        percent: 15,
        capEgp: 200,
        stores: 'carrefour,hyperone',
        categories: null,
      },
    ])
    .onConflictDoNothing();
  await database.db
    .insert(coupons)
    .values([
      {
        id: sid(0xc01),
        code: 'SAFQA50',
        storeSlug: null,
        percent: null,
        amountEgp: 50,
        capEgp: null,
        minSpendEgp: 500,
      },
      {
        id: sid(0xc02),
        code: 'NOON5',
        storeSlug: 'noon',
        percent: 5,
        amountEgp: null,
        capEgp: 150,
        minSpendEgp: null,
      },
    ])
    .onConflictDoNothing();
}
