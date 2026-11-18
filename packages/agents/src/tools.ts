import type { ToolSpec } from './types';

export const CATALOG_TOOLS: ToolSpec[] = [
  {
    name: 'get_price_history',
    description:
      'Price evidence for one product: current, 30-day median, 90-day low, fake-discount flag.',
    parameters: {
      type: 'object',
      properties: { productId: { type: 'string' } },
      required: ['productId'],
    },
  },
  {
    name: 'get_offers',
    description:
      'Current offers across stores, including stock, rating, and condition.',
    parameters: {
      type: 'object',
      properties: { productId: { type: 'string' } },
      required: ['productId'],
    },
  },
  {
    name: 'get_seasonality',
    description:
      'Next Egyptian retail event (White Friday, 11.11, Ramadan, and the rest).',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_ratings',
    description: 'Rating and condition signals for the best current offer.',
    parameters: {
      type: 'object',
      properties: { productId: { type: 'string' } },
      required: ['productId'],
    },
  },
  {
    name: 'search_products',
    description:
      'Search the catalog. Pass maxPrice only when the user explicitly stated a maximum price in EGP. Omit it otherwise. Never invent a budget.',
    parameters: {
      type: 'object',
      properties: {
        q: { type: 'string' },
        maxPrice: { type: 'number' },
      },
      required: ['q'],
    },
  },
];

export function toolsNamed(names: string[]): ToolSpec[] {
  return CATALOG_TOOLS.filter((tool) => names.includes(tool.name));
}
