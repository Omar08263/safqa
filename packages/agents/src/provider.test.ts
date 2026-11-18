import { describe, expect, it } from 'vitest';
import { DEFAULT_LLM_CHAIN } from './catalog';
import { DEFAULT_GROK_MODEL, XAI_BASE_URL } from './provider';
import {
  createProvider,
  createProviderForRole,
  describeProviders,
  describeRoles,
} from './resolve';

function jsonResponse() {
  return new Response(
    JSON.stringify({
      choices: [
        { message: { content: '{"recommendation":"wait"}', tool_calls: [] } },
      ],
      usage: { total_tokens: 2 },
    }),
    { status: 200 },
  );
}

describe('createProvider', () => {
  it('starts the default chain at Gemini 3.8 Flash, ahead of Groq', () => {
    expect(DEFAULT_LLM_CHAIN[0]).toBe('gemini:gemini-3.8-flash');
    const provider = createProvider({
      GEMINI_API_KEY: 'gem-test',
      GROQ_API_KEY: 'groq-test',
      NVIDIA_API_KEY: 'nv-test',
      OPENROUTER_API_KEY: 'or-test',
      OLLAMA_DISABLED: '1',
    });
    expect(provider.chain?.[0]).toBe('gemini-3.8-flash');
    expect(
      provider.chain?.indexOf('openai/gpt-oss-120b') ?? -1,
    ).toBeGreaterThan(0);
  });

  it('defaults to the OpenRouter free router when that key is set', async () => {
    const seen: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = async (input) => {
      seen.push(String(input));
      return jsonResponse();
    };
    try {
      const provider = createProvider({
        OPENROUTER_API_KEY: 'or-test',
        OLLAMA_DISABLED: '1',
      });
      expect(provider.chain?.[0]).toBe(
        'nvidia/nemotron-3-ultra-550b-a55b:free',
      );
      await provider.complete({ messages: [{ role: 'user', content: 'hi' }] });
    } finally {
      globalThis.fetch = original;
    }
    expect(seen[0]).toBe('https://openrouter.ai/api/v1/chat/completions');
  });

  it('puts Gemini Flash ahead of OpenRouter for every role', () => {
    const env = {
      GEMINI_API_KEY: 'gem-test',
      OPENROUTER_API_KEY: 'or-test',
      OLLAMA_DISABLED: '1',
    };
    const provider = createProvider(env);
    expect(provider.chain?.slice(0, 5)).toEqual([
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'nvidia/nemotron-3-ultra-550b-a55b:free',
      'gemini-3-flash-preview',
      'nvidia/nemotron-3.5-super-vl:free',
    ]);
    expect(createProviderForRole('judge', env).chain?.[0]).toBe(
      'gemini-3.8-flash',
    );
    expect(createProviderForRole('assistant', env).chain?.[0]).toBe(
      'gemini-3.8-flash',
    );
  });

  it('uses Gemini Flash when that is the only free cloud key', () => {
    const provider = createProvider({
      GEMINI_API_KEY: 'gem-test',
      OLLAMA_DISABLED: '1',
    });
    expect(provider.chain?.slice(0, 4)).toEqual([
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-3-flash-preview',
      'gemini-2.5-flash',
    ]);
    expect(provider.chain?.at(-1)).toBe('mock');
  });

  it('follows LLM_CHAIN and switches model on HTTP 503', async () => {
    const models: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { model?: string };
      models.push(body.model ?? '');
      if (body.model === 'gemini-3.8-flash') {
        return new Response('high demand', { status: 503 });
      }
      return jsonResponse();
    };
    try {
      const provider = createProvider({
        GEMINI_API_KEY: 'gem-test',
        LLM_CHAIN: 'gemini:gemini-3.8-flash,gemini:gemini-3-flash-preview',
        OLLAMA_DISABLED: '1',
      });
      expect(provider.chain?.slice(0, 2)).toEqual([
        'gemini-3.8-flash',
        'gemini-3-flash-preview',
      ]);
      const result = await provider.complete({
        messages: [{ role: 'user', content: 'hi' }],
      });
      expect(result.content).toContain('wait');
    } finally {
      globalThis.fetch = original;
    }
    expect(models).toEqual(['gemini-3.8-flash', 'gemini-3-flash-preview']);
  });

  it('does not put Grok first just because XAI_API_KEY is set', () => {
    const provider = createProvider({
      XAI_API_KEY: 'xai-test',
      OPENROUTER_API_KEY: 'or-test',
      OLLAMA_DISABLED: '1',
    });
    expect(provider.chain?.[0]).toBe('nvidia/nemotron-3-ultra-550b-a55b:free');
    expect(provider.chain?.indexOf(DEFAULT_GROK_MODEL) ?? -1).toBeGreaterThan(
      0,
    );
  });

  it('uses Grok when a role or LLM_PROVIDER asks for xAI', async () => {
    const seen: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      seen.push(String(input));
      const body = JSON.parse(String(init?.body)) as { model?: string };
      seen.push(body.model ?? '');
      return jsonResponse();
    };
    try {
      const provider = createProviderForRole('skeptic', {
        LLM_ROLE_SKEPTIC: 'xai:grok-4.6',
        XAI_API_KEY: 'xai-test',
        OLLAMA_DISABLED: '1',
      });
      await provider.complete({ messages: [{ role: 'user', content: 'hi' }] });
    } finally {
      globalThis.fetch = original;
    }
    expect(seen[0]).toBe(`${XAI_BASE_URL}/chat/completions`);
    expect(seen[1]).toBe('grok-4.6');
  });

  it('falls through a failing free provider to the mock', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error('down');
    };
    try {
      const provider = createProvider({ OPENROUTER_API_KEY: 'or-test' });
      const result = await provider.complete({
        messages: [{ role: 'user', content: 'productId=abc' }],
      });
      expect(result.content).toContain('recommendation');
    } finally {
      globalThis.fetch = original;
    }
  });

  it('lists free-tier status without revealing the key', () => {
    const rows = describeProviders({
      OPENROUTER_API_KEY: 'sk-or-secret-1234',
      XAI_API_KEY: 'xai-secret-9876',
    });
    const openrouter = rows.find((row) => row.id === 'openrouter');
    const xai = rows.find((row) => row.id === 'xai');
    const gemini = rows.find((row) => row.id === 'gemini');
    const openai = rows.find((row) => row.id === 'openai');
    expect(openrouter).toMatchObject({
      configured: true,
      freeTier: 'free-models',
      keyHint: '••••1234',
    });
    expect(xai).toMatchObject({
      configured: true,
      freeTier: 'none',
      model: DEFAULT_GROK_MODEL,
    });
    expect(gemini).toMatchObject({ configured: false, freeTier: 'free-tier' });
    expect(openai?.freeTier).toBe('none');
    expect(JSON.stringify(rows)).not.toContain('sk-or-secret');
    expect(describeRoles({ OLLAMA_DISABLED: '1' })[0]?.chain.at(-1)).toBe(
      'mock',
    );
  });

  it('calls NVIDIA NIM for the verified Nemotron model and skips Mistral', async () => {
    const seen: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      seen.push(String(input));
      const body = JSON.parse(String(init?.body)) as { model?: string };
      seen.push(body.model ?? '');
      return jsonResponse();
    };
    try {
      const provider = createProviderForRole('historian', {
        NVIDIA_API_KEY: 'nv-test-key',
        MISTRAL_API_KEY: 'mistral-test',
        OLLAMA_DISABLED: '1',
      });
      expect(provider.chain).toContain('nvidia/nemotron-3-ultra-550b-a55b');
      expect(provider.chain).toContain('deepseek-ai/deepseek-v4.1-flash');
      expect(
        provider.chain?.indexOf('nvidia/nemotron-3-ultra-550b-a55b'),
      ).toBeLessThan(
        provider.chain?.indexOf('deepseek-ai/deepseek-v4.1-flash') ?? -1,
      );
      expect(provider.chain).not.toContain('mistral-small-latest');
      expect(provider.chain).not.toContain('moonshotai/kimi-k2.6');
      await provider.complete({ messages: [{ role: 'user', content: 'hi' }] });
    } finally {
      globalThis.fetch = original;
    }
    expect(seen[0]).toBe(
      'https://integrate.api.nvidia.com/v1/chat/completions',
    );
    expect(seen[1]).toBe('nvidia/nemotron-3-ultra-550b-a55b');
  });
});
