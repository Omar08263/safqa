import { describe, expect, it } from 'vitest';
import { runAssistant, statedBudget } from './chat';
import { runDebate } from './debate';
import { createMockProvider } from './mock';
import type { LlmProvider, ToolHandler } from './types';

function catalog(
  evidence: Record<string, unknown>,
  season: Record<string, unknown>,
): Record<string, ToolHandler> {
  return {
    get_price_history: async () => evidence,
    get_offers: async () => evidence,
    get_ratings: async () => ({
      rating: evidence.rating,
      usedCheaper: false,
    }),
    get_seasonality: async () => season,
    search_products: async (args) => ({
      items: [
        {
          id: 'p1',
          titleAr: 'سماعات',
          priceEgp: 2500,
          q: args.q,
          maxPrice: args.maxPrice,
        },
      ],
    }),
  };
}

const realDrop = {
  current: 14999,
  median30: 18500,
  min90: 14999,
  fake: false,
  inStock: true,
  rating: 4.7,
};

const inflated = {
  current: 18999,
  median30: 19000,
  min90: 17699,
  fake: true,
  inStock: true,
  rating: 4.1,
};

const quietSeason = { id: null, nameAr: null, daysUntil: null };

describe('runDebate', () => {
  it('makes the historian and the skeptic call tools before they speak', async () => {
    const result = await runDebate({
      provider: createMockProvider(),
      productId: '00000000-0000-4000-8000-0000000000c9',
      tools: catalog(realDrop, quietSeason),
    });
    const calls = result.turns.filter((turn) => turn.kind === 'tool_call');
    expect(calls.map((turn) => `${turn.role}:${turn.toolName}`)).toEqual([
      'historian:get_price_history',
      'market:get_seasonality',
      'trust:get_ratings',
      'skeptic:get_price_history',
      'skeptic:get_seasonality',
    ]);
    expect(
      result.turns
        .filter((turn) => turn.kind === 'message')
        .map((turn) => turn.role),
    ).toEqual(['historian', 'market', 'trust', 'skeptic', 'judge']);
  });

  it('rejects an inflated discount after the skeptic checks the history', async () => {
    const result = await runDebate({
      provider: createMockProvider(),
      productId: '00000000-0000-4000-8000-0000000000cb',
      tools: catalog(inflated, quietSeason),
    });
    const skeptic = result.turns.find(
      (turn) => turn.role === 'skeptic' && turn.kind === 'message',
    );
    expect(skeptic?.content).toContain('STANCE=challenge');
    expect(result.verdict.recommendation).toBe('skip');
    expect(result.verdict.score).toBeLessThan(40);
    expect(result.verdict.explanationAr).toContain('مضخّم');
  });

  it('buys a real drop when no sale is close, and waits when one is', async () => {
    const buy = await runDebate({
      provider: createMockProvider(),
      productId: '00000000-0000-4000-8000-0000000000c9',
      tools: catalog(realDrop, quietSeason),
    });
    expect(buy.verdict.recommendation).toBe('buy_now');

    const wait = await runDebate({
      provider: createMockProvider(),
      productId: '00000000-0000-4000-8000-0000000000c9',
      tools: catalog(
        { ...realDrop, current: 17000, min90: 14000 },
        { id: '11.11', nameAr: '11/11', daysUntil: 1 },
      ),
    });
    expect(wait.verdict.recommendation).toBe('wait');
    expect(wait.verdict.explanationAr).not.toEqual(buy.verdict.explanationAr);
  });

  it('still runs the judge when earlier roles exhaust the budget', async () => {
    const provider: LlmProvider = {
      id: 'gemini:gemini-3.8-flash → groq:openai/gpt-oss-120b',
      async complete({ messages }) {
        const role =
          messages
            .find((message) => message.role === 'system')
            ?.content.match(/ROLE=([a-z]+)/)?.[1] ?? '';
        if (role === 'judge') {
          return {
            content: JSON.stringify({
              score: 40,
              recommendation: 'wait',
              explanationAr: 'استنى',
              explanationEn: 'wait',
            }),
            toolCalls: [],
            tokens: 80,
            servedBy: 'gemini:gemini-3.8-flash',
          };
        }
        return {
          content: `${role} spoke`,
          toolCalls: [],
          tokens: 5_000,
          servedBy: 'groq:openai/gpt-oss-120b',
        };
      },
    };
    const result = await runDebate({
      provider,
      productId: 'p',
      tools: {},
      maxTokens: 4_000,
      roleTokenCap: 2_500,
      judgeReserve: 2_500,
    });
    expect(result.verdict.explanationAr).toBe('استنى');
    expect(result.provider).toBe(
      'groq:openai/gpt-oss-120b, gemini:gemini-3.8-flash',
    );
    expect(result.provider).not.toContain('→');
    const judge = result.turns.find(
      (turn) => turn.role === 'judge' && turn.kind === 'message',
    );
    expect(judge?.provider).toBe('gemini:gemini-3.8-flash');
  });

  it('sends page context to every role and keeps the JSON-LD price', async () => {
    const seen: string[] = [];
    const provider: LlmProvider = {
      id: 'test:page-context',
      async complete({ messages }) {
        const user =
          messages.find((message) => message.role === 'user')?.content ?? '';
        seen.push(user);
        const role =
          messages
            .find((message) => message.role === 'system')
            ?.content.match(/ROLE=([a-z]+)/)?.[1] ?? '';
        if (role === 'judge') {
          return {
            content: JSON.stringify({
              score: 50,
              recommendation: 'wait',
              explanationAr: 'استنى',
              explanationEn: 'wait',
            }),
            toolCalls: [],
            tokens: 10,
            servedBy: 'test:page-context',
          };
        }
        return {
          content: `${role} spoke`,
          toolCalls: [],
          tokens: 10,
          servedBy: 'test:page-context',
        };
      },
    };
    const pageContext = [
      'Listing context. Structured offer (JSON-LD) prices are authoritative. Do not invent or override a price from the page text.',
      '',
      'Source: https://www.noon.com/egypt-en/p',
      'Structured offer (JSON-LD, authoritative):',
      '- title: Galaxy Buds3 FE',
      '- priceEGP: 5998.95',
      '- inStock: true',
      '',
      'Page text:',
      'Flash sale EGP 1.00 today only',
    ].join('\n');
    await runDebate({
      provider,
      productId: 'p-page',
      tools: {},
      pageContext,
      maxTokens: 1_000,
      roleTokenCap: 200,
      judgeReserve: 200,
    });
    expect(seen.length).toBeGreaterThan(0);
    for (const message of seen) {
      expect(message).toContain('PAGE_CONTEXT:');
      expect(message).toContain('priceEGP: 5998.95');
      expect(message).toContain('Structured offer (JSON-LD, authoritative)');
      expect(message.indexOf('priceEGP: 5998.95')).toBeLessThan(
        message.indexOf('EGP 1.00'),
      );
    }
  });
});

describe('runAssistant', () => {
  it('searches before it names a price', async () => {
    const seen: unknown[] = [];
    const reply = await runAssistant({
      provider: createMockProvider(),
      message: 'لاقيلي أرخص سماعة تحت 3000',
      tools: {
        search_products: async (args) => {
          seen.push(args);
          return {
            items: [
              { id: 'headphones', titleAr: 'سوني سماعات', priceEgp: 2500 },
            ],
          };
        },
      },
    });
    expect(seen).toEqual([{ q: 'لاقيلي أرخص سماعة تحت 3000', maxPrice: 3000 }]);
    expect(reply.reply).toContain('2500');
    expect(reply.productIds).toEqual(['headphones']);
    expect(reply.provider).toBe('mock:mock');
  });

  it('drops a budget the user did not state and still answers after a tool loop', async () => {
    const seen: unknown[] = [];
    let calls = 0;
    const provider: LlmProvider = {
      id: 'gemini:gemini-3.8-flash → groq:openai/gpt-oss-120b',
      async complete() {
        calls += 1;
        if (calls < 4) {
          return {
            content: '',
            toolCalls: [
              {
                id: `c${calls}`,
                name: 'search_products',
                arguments: { q: 'سماعة', maxPrice: 9999 },
              },
            ],
            tokens: 5,
            servedBy: 'gemini:gemini-3.8-flash',
          };
        }
        return {
          content: '',
          toolCalls: [
            {
              id: 'again',
              name: 'search_products',
              arguments: { q: 'سماعة', maxPrice: 9999 },
            },
          ],
          tokens: 5,
          servedBy: 'gemini:gemini-3.8-flash',
        };
      },
    };
    const reply = await runAssistant({
      provider,
      message: 'لاقيلي سماعة',
      tools: {
        search_products: async (args) => {
          seen.push(args);
          return {
            items: [{ id: 'a', titleAr: 'سماعة', priceEgp: 2500 }],
          };
        },
      },
      maxToolRounds: 2,
    });
    expect(statedBudget('لاقيلي سماعة')).toBeUndefined();
    expect(seen[0]).toEqual({ q: 'سماعة' });
    expect(reply.reply).toContain('2500');
    expect(reply.reply).not.toContain('خلصت');
    expect(reply.provider).toBe('gemini:gemini-3.8-flash');
  });
});
