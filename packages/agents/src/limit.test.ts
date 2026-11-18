import { describe, expect, it } from 'vitest';
import { createRequestLimiter, DailyQuotaError } from './limit';
import { createOpenAiCompatibleProvider } from './provider';

describe('createRequestLimiter', () => {
  it('queues the next call until a minute slot opens', async () => {
    let clock = 0;
    const waits: number[] = [];
    const limiter = createRequestLimiter({
      rpm: 1,
      rpd: 10,
      now: () => clock,
      sleep: async (ms) => {
        waits.push(ms);
        clock += ms;
      },
    });
    await limiter.acquire();
    await limiter.acquire();
    expect(waits[0]).toBeGreaterThanOrEqual(60_000);
  });

  it('stops for the day instead of waiting until midnight', async () => {
    const limiter = createRequestLimiter({
      rpm: 10,
      rpd: 1,
      now: () => Date.parse('2026-11-10T18:00:00Z'),
      sleep: async () => undefined,
    });
    await limiter.acquire();
    await expect(limiter.acquire()).rejects.toBeInstanceOf(DailyQuotaError);
  });
});

describe('Gemini retry', () => {
  it('backs off on HTTP 429 and then accepts the next response', async () => {
    const waits: number[] = [];
    let calls = 0;
    const provider = createOpenAiCompatibleProvider({
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      apiKey: 'gem-test',
      model: 'gemini-3.8-flash',
      maxRetries: 2,
      sleep: async (ms) => {
        waits.push(ms);
      },
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) {
          return new Response('slow down', {
            status: 429,
            headers: { 'retry-after': '2' },
          });
        }
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: 'ok', tool_calls: [] } }],
            usage: { total_tokens: 1 },
          }),
          { status: 200 },
        );
      },
    });
    const result = await provider.complete({
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(result.content).toBe('ok');
    expect(waits).toEqual([2000]);
    expect(calls).toBe(2);
  });
});
