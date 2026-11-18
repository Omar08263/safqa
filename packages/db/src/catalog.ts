export interface CategorySeed {
  id: number;
  slug: string;
  nameAr: string;
  nameEn: string;
}

export interface ProductSeed {
  id: number;
  category: string;
  brand: string;
  model: string;
  ean?: string;
  titleAr: string;
  titleEn: string;
}

export interface OfferSeed {
  id: number;
  productId: number;
  store: string;
  price: number;
  list?: number;
  inStock: boolean;
  condition?: 'new' | 'used';
  rating?: number;
  /** Historical typical price before the latest move. */
  anchor: number;
  trend: 'flat' | 'drop' | 'rise';
  title?: string;
}

export const categorySeeds: CategorySeed[] = [
  { id: 101, slug: 'phones', nameAr: 'هواتف', nameEn: 'Phones' },
  { id: 102, slug: 'appliances', nameAr: 'أجهزة منزلية', nameEn: 'Appliances' },
  { id: 103, slug: 'gaming', nameAr: 'ألعاب', nameEn: 'Gaming' },
  { id: 104, slug: 'computing', nameAr: 'كمبيوتر', nameEn: 'Computing' },
  { id: 105, slug: 'audio', nameAr: 'صوتيات', nameEn: 'Audio' },
  { id: 106, slug: 'lifestyle', nameAr: 'أسلوب حياة', nameEn: 'Lifestyle' },
];

export const productSeeds: ProductSeed[] = [
  {
    id: 201,
    category: 'phones',
    brand: 'Apple',
    model: 'iPhone 16',
    ean: '6221000000018',
    titleAr: 'أبل آيفون 16 ذاكرة 128 جيجا أسود',
    titleEn: 'Apple iPhone 16 128GB Black',
  },
  {
    id: 202,
    category: 'phones',
    brand: 'Samsung',
    model: 'Galaxy A56',
    ean: '6221000000025',
    titleAr: 'سامسونج جالاكسي A56 ذاكرة 256 جيجا',
    titleEn: 'Samsung Galaxy A56 8/256GB',
  },
  {
    id: 203,
    category: 'appliances',
    brand: 'Tornado',
    model: 'TW-10',
    ean: '6221000000032',
    titleAr: 'تورنيدو غسالة أوتوماتيك 10 كجم',
    titleEn: 'Tornado automatic washer 10kg',
  },
  {
    id: 204,
    category: 'appliances',
    brand: 'Fresh',
    model: 'F-450',
    ean: '6221000000049',
    titleAr: 'فريش ثلاجة نوفروست 450 لتر',
    titleEn: 'Fresh no-frost refrigerator 450L',
  },
  {
    id: 205,
    category: 'gaming',
    brand: 'Sony',
    model: 'PS5 Slim',
    ean: '6221000000056',
    titleAr: 'سوني بلايستيشن 5 سليم',
    titleEn: 'Sony PlayStation 5 Slim',
  },
  {
    id: 206,
    category: 'phones',
    brand: 'Xiaomi',
    model: 'Redmi Note 14',
    ean: '6221000000063',
    titleAr: 'شاومي ريدمي نوت 14 ذاكرة 256 جيجا',
    titleEn: 'Xiaomi Redmi Note 14 8/256GB',
  },
  {
    id: 207,
    category: 'appliances',
    brand: 'Black+Decker',
    model: 'AF550',
    titleAr: 'بلاك أند ديكر قلاية هوائية 5.5 لتر',
    titleEn: 'Black+Decker air fryer 5.5L',
  },
  {
    id: 208,
    category: 'computing',
    brand: 'Lenovo',
    model: 'IdeaPad Slim 3',
    ean: '6221000000087',
    titleAr: 'لينوفو آيديا باد سليم 3 معالج i5',
    titleEn: 'Lenovo IdeaPad Slim 3 i5',
  },
  {
    id: 209,
    category: 'audio',
    brand: 'Sony',
    model: 'WH-1000XM5',
    ean: '6221000000094',
    titleAr: 'سوني سماعات WH-1000XM5 أسود',
    titleEn: 'Sony WH-1000XM5 headphones black',
  },
  {
    id: 210,
    category: 'computing',
    brand: 'Anker',
    model: '737',
    titleAr: 'انكر باور بانك 737',
    titleEn: 'Anker 737 Power Bank',
  },
  {
    id: 211,
    category: 'appliances',
    brand: 'Bosch',
    model: 'SMS46',
    titleAr: 'بوش غسالة أطباق SMS46',
    titleEn: 'Bosch dishwasher SMS46',
  },
  {
    id: 212,
    category: 'lifestyle',
    brand: 'Adidas',
    model: 'Ultraboost 5',
    titleAr: 'أديداس ألترابوست 5',
    titleEn: 'Adidas Ultraboost 5',
  },
];

const hosts: Record<string, string> = {
  'amazon-eg': 'www.amazon.eg',
  noon: 'www.noon.com',
  jumia: 'www.jumia.com.eg',
  btech: 'btech.com',
  '2b': '2b.com.eg',
  raya: 'raya.com',
  carrefour: 'www.carrefour.com.eg',
  elaraby: 'shop.elarabygroup.com',
  hyperone: 'www.hyperone.com.eg',
  dubizzle: 'www.dubizzle.com.eg',
};

export function offerUrl(store: string, productId: number): string {
  const host = hosts[store] ?? 'example.invalid';
  return `https://${host}/safqa-seed/${productId}`;
}

export const offerSeeds: OfferSeed[] = [
  { id: 301, productId: 201, store: 'noon', price: 54999, list: 61999, inStock: true, rating: 4.7, anchor: 62000, trend: 'drop' },
  { id: 302, productId: 201, store: 'amazon-eg', price: 58999, list: 62999, inStock: true, rating: 4.6, anchor: 60000, trend: 'flat' },
  { id: 303, productId: 201, store: 'jumia', price: 56499, list: 61999, inStock: true, rating: 4.5, anchor: 59000, trend: 'drop' },
  { id: 304, productId: 201, store: '2b', price: 59999, list: 64999, inStock: true, rating: 4.4, anchor: 61000, trend: 'flat' },

  { id: 311, productId: 202, store: 'noon', price: 17999, list: 19999, inStock: true, rating: 4.4, anchor: 19800, trend: 'drop' },
  { id: 312, productId: 202, store: 'jumia', price: 18499, list: 20999, inStock: true, rating: 4.3, anchor: 19000, trend: 'flat', title: 'سامسونج جالاكسي A56 256 جيجا' },
  { id: 313, productId: 202, store: 'amazon-eg', price: 19299, list: 21499, inStock: true, rating: 4.4, anchor: 19500, trend: 'flat' },
  { id: 314, productId: 202, store: 'btech', price: 19999, list: 21999, inStock: false, rating: 4.2, anchor: 19999, trend: 'flat' },

  { id: 321, productId: 203, store: 'btech', price: 18999, list: 27999, inStock: true, rating: 4.1, anchor: 19100, trend: 'flat', title: 'غسالة تورنيدو 10 كجم — خصم خاص' },
  { id: 322, productId: 203, store: 'elaraby', price: 17699, list: 19999, inStock: true, rating: 4.6, anchor: 19800, trend: 'drop' },
  { id: 323, productId: 203, store: 'raya', price: 18450, list: 20999, inStock: true, rating: 4.2, anchor: 19000, trend: 'flat' },
  { id: 324, productId: 203, store: '2b', price: 19199, list: 21999, inStock: true, rating: 4.0, anchor: 19800, trend: 'flat' },

  { id: 331, productId: 204, store: 'elaraby', price: 26999, list: 30999, inStock: true, rating: 4.5, anchor: 30500, trend: 'drop' },
  { id: 332, productId: 204, store: 'btech', price: 28499, list: 32999, inStock: true, rating: 4.3, anchor: 29000, trend: 'flat' },
  { id: 333, productId: 204, store: 'carrefour', price: 27499, list: 29999, inStock: true, rating: 4.2, anchor: 28000, trend: 'flat' },
  { id: 334, productId: 204, store: 'hyperone', price: 27999, list: 34999, inStock: true, rating: 4.0, anchor: 28200, trend: 'flat' },

  { id: 341, productId: 205, store: 'noon', price: 28999, list: 32999, inStock: true, rating: 4.8, anchor: 33000, trend: 'drop' },
  { id: 342, productId: 205, store: 'amazon-eg', price: 30499, list: 33999, inStock: true, rating: 4.7, anchor: 32000, trend: 'flat' },
  { id: 343, productId: 205, store: 'jumia', price: 27999, list: 32999, inStock: false, rating: 4.6, anchor: 34000, trend: 'drop' },
  { id: 344, productId: 205, store: 'dubizzle', price: 24500, inStock: true, condition: 'used', rating: 4.0, anchor: 25000, trend: 'flat', title: 'بلايستيشن 5 سليم مستعمل' },

  { id: 351, productId: 206, store: 'jumia', price: 11499, list: 13999, inStock: true, rating: 4.4, anchor: 13600, trend: 'drop' },
  { id: 352, productId: 206, store: 'noon', price: 12499, list: 13999, inStock: true, rating: 4.5, anchor: 13200, trend: 'drop' },
  { id: 353, productId: 206, store: 'amazon-eg', price: 12999, list: 14499, inStock: true, rating: 4.3, anchor: 13100, trend: 'flat' },

  { id: 361, productId: 207, store: 'carrefour', price: 3999, list: 5499, inStock: true, rating: 4.3, anchor: 4700, trend: 'drop' },
  { id: 362, productId: 207, store: 'hyperone', price: 4299, list: 6999, inStock: true, rating: 4.1, anchor: 4400, trend: 'flat' },
  { id: 363, productId: 207, store: 'noon', price: 4199, list: 4699, inStock: true, rating: 4.4, anchor: 4500, trend: 'drop' },
  { id: 364, productId: 207, store: 'amazon-eg', price: 4499, list: 4999, inStock: true, rating: 4.2, anchor: 4500, trend: 'flat' },

  { id: 371, productId: 208, store: 'jumia', price: 30999, list: 35999, inStock: true, rating: 4.2, anchor: 35500, trend: 'drop' },
  { id: 372, productId: 208, store: 'noon', price: 31499, list: 35999, inStock: true, rating: 4.3, anchor: 34000, trend: 'drop' },
  { id: 373, productId: 208, store: 'amazon-eg', price: 32999, list: 36999, inStock: true, rating: 4.4, anchor: 33500, trend: 'flat' },
  { id: 374, productId: 208, store: '2b', price: 33499, list: 37999, inStock: true, rating: 4.1, anchor: 34000, trend: 'flat' },

  { id: 381, productId: 209, store: 'noon', price: 14999, list: 18999, inStock: true, rating: 4.7, anchor: 18500, trend: 'drop' },
  { id: 382, productId: 209, store: 'amazon-eg', price: 16499, list: 18999, inStock: true, rating: 4.8, anchor: 17500, trend: 'drop' },
  { id: 383, productId: 209, store: 'dubizzle', price: 11999, inStock: true, condition: 'used', rating: 4.2, anchor: 12500, trend: 'flat' },

  { id: 391, productId: 210, store: 'jumia', price: 4999, list: 5999, inStock: true, rating: 4.6, anchor: 5800, trend: 'drop' },
  { id: 392, productId: 210, store: 'noon', price: 5299, list: 5999, inStock: true, rating: 4.7, anchor: 5600, trend: 'drop' },
  { id: 393, productId: 210, store: 'amazon-eg', price: 5599, list: 6299, inStock: true, rating: 4.6, anchor: 5600, trend: 'flat' },

  { id: 401, productId: 211, store: 'btech', price: 25999, list: 30999, inStock: true, rating: 4.4, anchor: 30000, trend: 'drop' },
  { id: 402, productId: 211, store: 'raya', price: 27499, list: 32999, inStock: true, rating: 4.2, anchor: 28000, trend: 'flat' },
  { id: 403, productId: 211, store: 'elaraby', price: 26799, list: 29999, inStock: false, rating: 4.3, anchor: 27500, trend: 'flat' },

  { id: 411, productId: 212, store: 'jumia', price: 7299, list: 8999, inStock: true, rating: 4.5, anchor: 8800, trend: 'drop' },
  { id: 412, productId: 212, store: 'noon', price: 7499, list: 8999, inStock: true, rating: 4.6, anchor: 8600, trend: 'drop' },
  { id: 413, productId: 212, store: 'amazon-eg', price: 7999, list: 9499, inStock: true, rating: 4.4, anchor: 8200, trend: 'flat' },
];

export function historyFor(seed: OfferSeed, now = new Date()): Array<{ capturedAt: Date; price: number }> {
  const rand = mulberry32(seed.id * 997);
  const points: Array<{ capturedAt: Date; price: number }> = [];
  for (let daysAgo = 90; daysAgo >= 0; daysAgo -= 3) {
    const progress = (90 - daysAgo) / 90;
    let base = seed.anchor;
    if (seed.trend === 'drop') {
      const fall = Math.max(0, (progress - 0.75) / 0.25);
      base = seed.anchor - (seed.anchor - seed.price) * fall;
    } else if (seed.trend === 'rise') {
      const climb = Math.max(0, (progress - 0.75) / 0.25);
      base = seed.anchor + (seed.price - seed.anchor) * climb;
    }
    const noise = (rand() - 0.5) * seed.anchor * 0.02;
    let price = Math.max(1, Math.round((base + noise) / 10) * 10);
    if (daysAgo === 0) price = seed.price;
    points.push({
      capturedAt: new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000),
      price,
    });
  }
  return points;
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
