import { z } from 'zod';

export const localeSchema = z.enum(['ar', 'en']);
export const adapterStatusSchema = z.enum([
  'structured',
  'best-effort',
  'stub',
]);
export const dealLabelSchema = z.enum(['great', 'good', 'fair', 'weak']);
export const alertTypeSchema = z.enum([
  'price_drop',
  'back_in_stock',
  'target_hit',
]);
export const conditionSchema = z.enum(['new', 'used']);

export const errorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  locale: localeSchema,
});

export const authResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: userSchema,
});

export const categorySchema = z.object({
  slug: z.string(),
  nameAr: z.string(),
  nameEn: z.string(),
});

export const storeSchema = z.object({
  slug: z.string(),
  nameAr: z.string(),
  nameEn: z.string(),
  domain: z.string(),
  adapterStatus: adapterStatusSchema,
  notes: z.string().nullable(),
});

export const offerSchema = z.object({
  id: z.string(),
  url: z.string(),
  title: z.string(),
  priceEgp: z.number(),
  listPriceEgp: z.number().nullable(),
  inStock: z.boolean(),
  condition: conditionSchema,
  rating: z.number().nullable(),
  dealScore: z.number(),
  dealLabel: dealLabelSchema,
  fakeDiscount: z.boolean(),
  fakeDiscountReason: z.string().nullable(),
  discountPct: z.number().nullable(),
  lastSeenAt: z.string(),
  store: storeSchema,
});

export const productCardSchema = z.object({
  id: z.string(),
  titleAr: z.string(),
  titleEn: z.string(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  ean: z.string().nullable(),
  category: categorySchema.nullable(),
  offerCount: z.number(),
  lowestPriceEgp: z.number().nullable(),
  bestOffer: offerSchema.nullable(),
});

export const productDetailSchema = productCardSchema.extend({
  offers: z.array(offerSchema),
  median30: z.number().nullable(),
  min90: z.number().nullable(),
});

export const historySchema = z.object({
  productId: z.string(),
  median30: z.number().nullable(),
  min90: z.number().nullable(),
  series: z.array(
    z.object({
      storeSlug: z.string(),
      storeNameAr: z.string(),
      storeNameEn: z.string(),
      points: z.array(z.object({ t: z.string(), priceEgp: z.number() })),
    }),
  ),
});

export const watchItemSchema = z.object({
  id: z.string(),
  targetPriceEgp: z.number().nullable(),
  createdAt: z.string(),
  product: productCardSchema,
});

export const alertSchema = z.object({
  id: z.string(),
  type: alertTypeSchema,
  title: z.string(),
  body: z.string(),
  read: z.boolean(),
  createdAt: z.string(),
  productId: z.string().nullable(),
});

export const alertSettingsSchema = z.object({
  priceDrop: z.boolean(),
  backInStock: z.boolean(),
  targetHit: z.boolean(),
  webPush: z.boolean(),
  expoPush: z.boolean(),
  telegram: z.boolean(),
  minDropPct: z.number(),
  telegramChatId: z.string().nullable(),
  expoPushToken: z.string().nullable(),
  hasWebPush: z.boolean(),
});

export const adapterInfoSchema = z.object({
  slug: z.string(),
  domains: z.array(z.string()),
  nameAr: z.string(),
  nameEn: z.string(),
  status: adapterStatusSchema,
  notes: z.string(),
  officialApi: z.string().nullable(),
});

export const dealsResponseSchema = z.object({
  items: z.array(productCardSchema),
  suspicious: z.array(productCardSchema),
});

export const searchResponseSchema = z.object({
  items: z.array(productCardSchema),
});

export const listResponse = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item) });

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

export const registerSchema = loginSchema.extend({
  name: z.string().min(2).max(80),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20),
});

export const watchCreateSchema = z.object({
  productId: z.uuid(),
  targetPriceEgp: z.number().positive().nullable().optional(),
});

export const watchPatchSchema = z.object({
  targetPriceEgp: z.number().positive().nullable(),
});

export const alertSettingsPatchSchema = alertSettingsSchema
  .pick({
    priceDrop: true,
    backInStock: true,
    targetHit: true,
    webPush: true,
    expoPush: true,
    telegram: true,
    minDropPct: true,
    telegramChatId: true,
    expoPushToken: true,
  })
  .partial();

export const webPushSchema = z.object({
  endpoint: z.url(),
  keys: z.object({
    p256dh: z.string().min(8),
    auth: z.string().min(4),
  }),
});

export const expoPushSchema = z.object({
  token: z.string().min(8),
});

export const debateSchema = z.object({
  id: z.string(),
  productId: z.string(),
  score: z.number(),
  recommendation: z.enum(['buy_now', 'wait', 'skip']),
  explanationAr: z.string(),
  explanationEn: z.string(),
  provider: z.string(),
  tokens: z.number(),
  createdAt: z.string(),
  turns: z.array(
    z.object({
      role: z.string(),
      kind: z.string(),
      toolName: z.string().nullable(),
      content: z.string(),
      provider: z.string().nullable().optional(),
    }),
  ),
});

export const predictionSchema = z.object({
  recommendation: z.enum(['buy_now', 'wait']),
  confidence: z.number(),
  percentile: z.number(),
  expectedLowEgp: z.number(),
  reasonAr: z.string(),
  reasonEn: z.string(),
});

export const stackResponseSchema = z.object({
  finalEgp: z.number(),
  savedEgp: z.number(),
  applied: z.array(
    z.object({ id: z.string(), label: z.string(), savedEgp: z.number() }),
  ),
});

export const chatResponseSchema = z.object({
  reply: z.string(),
  provider: z.string(),
  products: z.array(productCardSchema),
});

export const searchQuerySchema = z.object({
  q: z.string().optional(),
  store: z.string().optional(),
  category: z.string().optional(),
  minDiscount: z.coerce.number().optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  inStock: z.enum(['0', '1']).optional(),
  hideFake: z.enum(['0', '1']).optional(),
  sort: z.enum(['score', 'price_asc', 'discount']).optional(),
  limit: z.coerce.number().optional(),
});

export type Debate = z.infer<typeof debateSchema>;
export type Prediction = z.infer<typeof predictionSchema>;

export type User = z.infer<typeof userSchema>;
export type ProductCard = z.infer<typeof productCardSchema>;
export type ProductDetail = z.infer<typeof productDetailSchema>;
export type Offer = z.infer<typeof offerSchema>;
export type Store = z.infer<typeof storeSchema>;
export type Category = z.infer<typeof categorySchema>;
export type PriceHistory = z.infer<typeof historySchema>;
export type WatchItem = z.infer<typeof watchItemSchema>;
export type AlertItem = z.infer<typeof alertSchema>;
export type AlertSettings = z.infer<typeof alertSettingsSchema>;
export type AdapterInfo = z.infer<typeof adapterInfoSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
