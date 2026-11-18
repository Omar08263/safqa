import { describe, expect, it } from 'vitest';
import { LlmHttpError } from './provider';
import { ModelRouter, type RouteEndpoint } from './router';

function endpoint(
  providerId: string,
  model: string,
  complete: RouteEndpoint['provider']['complete'],
  quotaKey = `${providerId}:${model}`,
  dailyCap: number | null = 100,
): RouteEndpoint {
  return {
    id: `${providerId}:${model}`,
    providerId,
    model,
    quotaKey,
    dailyCap,
    provider: { id: model, complete },
  };
}

function ok(model: string): RouteEndpoint['provider']['complete'] {
  return async () => ({ content: model, toolCalls: [], tokens: 1 });
}

describe('ModelRouter', () => {
  it('spreads fast roles across Groq models and keeps the judge on Gemini', async () => {
    const router = new ModelRouter([
      endpoint('groq', 'openai/gpt-oss-20b', ok('openai/gpt-oss-20b')),
      endpoint('groq', 'qwen/qwen3.8-27b', ok('qwen/qwen3.8-27b')),
      endpoint('groq', 'openai/gpt-oss-120b', ok('openai/gpt-oss-120b')),
      endpoint('gemini', 'gemini-3.8-flash', ok('gemini-3.8-flash'), 'gemini', 20),
      endpoint(
        'openrouter',
        'nvidia/nemotron-3-ultra-550b-a55b:free',
        ok('nemotron'),
        'openrouter-free',
        50,
      ),
    ]);
    const fast = await Promise.all(
      ['historian', 'market', 'trust'].map((role) =>
        router.complete(role, { messages: [{ role: 'user', content: 'hi' }] }),
      ),
    );
    expect(new Set(fast.map((result) => result.content)).size).toBe(3);
    const judge = await router.complete('judge', {
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(judge.content).toBe('gemini-3.8-flash');
  });

  it('opens a circuit on 503 and uses the next model', async () => {
    const router = new ModelRouter([
      endpoint('gemini', 'gemini-3.8-flash', async () => {
        throw new LlmHttpError(503);
      }, 'gemini', 20),
      endpoint('gemini', 'gemini-3-flash-preview', ok('gemini-3-flash-preview'), 'gemini', 20),
    ]);
    const result = await router.complete('judge', {
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(result.content).toBe('gemini-3-flash-preview');
    const broken = router.stats().find((row) => row.model === 'gemini-3.8-flash');
    expect(broken?.circuit).toBe('open');
  });

  it('stops using a provider once its shared daily cap is spent', async () => {
    const router = new ModelRouter([
      endpoint('openrouter', 'nvidia/nemotron-3-ultra-550b-a55b:free', ok('nemotron'), 'openrouter-free', 1),
      endpoint('mock', 'mock', ok('mock'), 'mock', null),
    ]);
    await router.complete('historian', { messages: [{ role: 'user', content: 'hi' }] });
    const second = await router.complete('market', {
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(second.content).toBe('mock');
    const row = router.stats().find((item) => item.provider === 'openrouter');
    expect(row?.dailyUsed).toBe(1);
    expect(row?.dailyCap).toBe(1);
  });

  it('hedges a slow fast-role call to a second provider', async () => {
    let hedgeCalls = 0;
    const router = new ModelRouter(
      [
        endpoint('groq', 'openai/gpt-oss-120b', () => new Promise(() => {})),
        endpoint(
          'nvidia',
          'nvidia/nemotron-3-ultra-550b-a55b',
          async () => {
            hedgeCalls += 1;
            return { content: 'nemotron', toolCalls: [], tokens: 1 };
          },
        ),
      ],
      {},
      { hedgeMs: 20, timeoutMs: 400 },
    );
    const result = await router.complete('historian', {
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(result.content).toBe('nemotron');
    expect(hedgeCalls).toBe(1);
    expect(
      router.stats().find((row) => row.provider === 'groq')?.circuit,
    ).toBe('closed');
  });

  it('opens the circuit when a call exceeds the timeout', async () => {
    const router = new ModelRouter(
      [
        endpoint('groq', 'qwen/qwen3.8-27b', () => new Promise(() => {})),
        endpoint('nvidia', 'nvidia/nemotron-3-ultra-550b-a55b', ok('nemotron')),
      ],
      {},
      { hedgeMs: 5_000, timeoutMs: 30 },
    );
    const result = await router.complete('assistant', {
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(result.content).toBe('nemotron');
    const stalled = router.stats().find((row) => row.model === 'qwen/qwen3.8-27b');
    expect(stalled?.circuit).toBe('open');
    expect(stalled?.lastError).toContain('timed out');
  });

  it('does not hedge the judge', async () => {
    let calls = 0;
    const router = new ModelRouter(
      [
        endpoint('gemini', 'gemini-3.8-flash', async () => {
          calls += 1;
          await new Promise((resolve) => setTimeout(resolve, 40));
          return { content: 'gemini-3.8-flash', toolCalls: [], tokens: 1 };
        }),
        endpoint('nvidia', 'nvidia/nemotron-3-ultra-550b-a55b', async () => {
          calls += 1;
          return { content: 'nemotron', toolCalls: [], tokens: 1 };
        }),
      ],
      {},
      { hedgeMs: 10, timeoutMs: 400 },
    );
    const result = await router.complete('judge', {
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(result.content).toBe('gemini-3.8-flash');
    expect(calls).toBe(1);
  });
});
