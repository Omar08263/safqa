import {
  DEFAULT_GROQ_MODELS,
  DEFAULT_LLM_CHAIN,
  DEFAULT_NVIDIA_MODELS,
  DEFAULT_OPENROUTER_MODELS,
  type FreeTier,
  PROVIDERS,
  type ProviderSpec,
  specById,
} from './catalog';
import { sharedLimiter } from './limit';
import { createMockProvider } from './mock';
import {
  createAnthropicProvider,
  createOpenAiCompatibleProvider,
  DEFAULT_GROK_MODEL,
  XAI_BASE_URL,
} from './provider';
import {
  type ChainHealth,
  type RouteEndpoint,
  type RouterEndpointStat,
  routerFor,
} from './router';
import type { AgentRole, LlmProvider } from './types';

export type { FreeTier };

export interface ProviderStatus {
  id: string;
  label: string;
  configured: boolean;
  model: string;
  keyEnv: string;
  keyHint: string | null;
  freeTier: FreeTier;
  freeNote: string;
  baseUrl: string;
}

/** Free-tier Flash first, then older Flash ids when 3.8 is overloaded. */
export const DEFAULT_GEMINI_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3-flash-preview',
  'gemini-2.5-flash',
] as const;

export function geminiModelChain(
  env: Record<string, string | undefined>,
): string[] {
  const listed = env.GEMINI_MODELS?.split(',')
    .map((model) => model.trim())
    .filter((model) => model.length > 0);
  if (listed && listed.length > 0) return listed;
  const primary = env.GEMINI_MODEL?.trim();
  if (
    primary &&
    !DEFAULT_GEMINI_MODELS.includes(
      primary as (typeof DEFAULT_GEMINI_MODELS)[number],
    )
  ) {
    return [primary, ...DEFAULT_GEMINI_MODELS];
  }
  return [...DEFAULT_GEMINI_MODELS];
}

const ROLES = [
  'historian',
  'market',
  'trust',
  'skeptic',
  'judge',
  'assistant',
] as const;

export function describeProviders(
  env: Record<string, string | undefined> = process.env,
): ProviderStatus[] {
  return PROVIDERS.map((spec) => {
    const key = readKey(spec, env);
    return {
      id: spec.id,
      label: spec.label,
      configured:
        spec.kind === 'mock' || spec.kind === 'ollama' || Boolean(key),
      model:
        spec.id === 'gemini'
          ? geminiModelChain(env).join(', ')
          : spec.id === 'groq'
            ? listEnv(env.GROQ_MODELS, DEFAULT_GROQ_MODELS).join(', ')
            : spec.id === 'openrouter'
              ? listEnv(env.OPENROUTER_MODELS, DEFAULT_OPENROUTER_MODELS).join(
                  ', ',
                )
              : spec.id === 'nvidia'
                ? listEnv(env.NVIDIA_MODELS, DEFAULT_NVIDIA_MODELS).join(', ')
                : modelFor(spec, env),
      keyEnv: spec.altKeyEnv
        ? `${spec.keyEnv} or ${spec.altKeyEnv}`
        : spec.keyEnv,
      keyHint: hint(key),
      freeTier: spec.freeTier,
      freeNote: spec.freeNote,
      baseUrl: baseUrlFor(spec, env),
    };
  });
}

export function describeRoles(
  env: Record<string, string | undefined> = process.env,
): Array<{ role: string; chain: string[] }> {
  return ROLES.map((role) => ({
    role,
    chain: createProviderForRole(role, env).chain ?? [
      createProviderForRole(role, env).id,
    ],
  }));
}

/** Default chain, or the chain for one role when that role has an override. */
export function createProvider(
  env: Record<string, string | undefined> = process.env,
): LlmProvider {
  return chainFor(env, null);
}

export function createProviderForRole(
  role: AgentRole | 'assistant',
  env: Record<string, string | undefined> = process.env,
): LlmProvider {
  return chainFor(env, role);
}

function chainFor(
  env: Record<string, string | undefined>,
  role: string | null,
): LlmProvider {
  const choice = (env.LLM_PROVIDER || 'free').trim().toLowerCase();
  if (choice === 'mock') return createMockProvider();
  const router = routerFor(
    signature(env),
    endpointsFor(env),
    rolePins(env),
    routerOptions(env),
  );
  const ids = router.endpointIds();
  const routeRole = role ?? 'assistant';
  return {
    id: ids.join(' → ') || 'mock',
    chain: ids,
    complete: (input) => router.complete(routeRole, input),
  };
}

function endpointsFor(
  env: Record<string, string | undefined>,
): RouteEndpoint[] {
  const endpoints: RouteEndpoint[] = [];
  const seen = new Set<string>();
  const push = (providerId: string, model: string) => {
    const provider = build(providerId, env, model, { maxRetries: 0 });
    const id = `${providerId}:${model}`;
    if (!provider || seen.has(id)) return;
    seen.add(id);
    const quota = quotaFor(providerId, model, env);
    endpoints.push({
      id,
      providerId,
      model,
      provider,
      quotaKey: quota.key,
      dailyCap: quota.cap,
    });
  };
  for (const entry of parseChain(env)) {
    if (entry.id === 'mock') continue;
    if (entry.id === 'ollama' && env.OLLAMA_DISABLED === '1') continue;
    push(entry.id, entry.model);
  }
  for (const role of ROLES) {
    const parsed = parseChoice(env[`LLM_ROLE_${role.toUpperCase()}`]);
    if (!parsed || parsed.id === 'mock') continue;
    const spec = specById(parsed.id);
    const model = parsed.model || (spec ? modelFor(spec, env) : '');
    if (model) push(parsed.id, model);
  }
  for (const extra of extraProviders(env)) push(extra.id, extra.model);
  const mock = createMockProvider();
  endpoints.push({
    id: 'mock:mock',
    providerId: 'mock',
    model: 'mock',
    provider: mock,
    quotaKey: 'mock',
    dailyCap: null,
  });
  return endpoints;
}

function extraProviders(
  env: Record<string, string | undefined>,
): Array<{ id: string; model: string }> {
  const extras: Array<{ id: string; model: string }> = [];
  if (env.XAI_API_KEY)
    extras.push({ id: 'xai', model: env.XAI_MODEL || DEFAULT_GROK_MODEL });
  if (env.OPENAI_API_KEY)
    extras.push({ id: 'openai', model: env.OPENAI_MODEL || 'gpt-4.1-mini' });
  if (env.ANTHROPIC_API_KEY) {
    extras.push({
      id: 'anthropic',
      model: env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
    });
  }
  if (env.DEEPSEEK_API_KEY) {
    extras.push({
      id: 'deepseek',
      model: env.DEEPSEEK_MODEL || 'deepseek-chat',
    });
  }
  if (env.TOGETHER_API_KEY) {
    extras.push({
      id: 'together',
      model: env.TOGETHER_MODEL || 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    });
  }
  if (env.COHERE_API_KEY)
    extras.push({ id: 'cohere', model: env.COHERE_MODEL || 'command-r' });
  return extras;
}

function parseChain(
  env: Record<string, string | undefined>,
): Array<{ id: string; model: string }> {
  const listed = env.LLM_CHAIN?.split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  const source = listed && listed.length > 0 ? listed : DEFAULT_LLM_CHAIN;
  return source.map((item) => {
    const colon = item.indexOf(':');
    if (colon === -1) {
      if (item.toLowerCase() === 'mock') return { id: 'mock', model: 'mock' };
      if (item.toLowerCase() === 'ollama') {
        return { id: 'ollama', model: env.OLLAMA_MODEL || 'llama3.1' };
      }
      const id = item.toLowerCase();
      const spec = specById(id);
      return { id, model: spec ? modelFor(spec, env) : item };
    }
    return {
      id: item.slice(0, colon).trim().toLowerCase(),
      model: item.slice(colon + 1).trim(),
    };
  });
}

function quotaFor(
  providerId: string,
  model: string,
  env: Record<string, string | undefined>,
): { key: string; cap: number | null } {
  if (providerId === 'gemini') {
    return { key: 'gemini', cap: numberEnv(env.GEMINI_RPD, 20) };
  }
  if (providerId === 'openrouter') {
    return { key: 'openrouter-free', cap: numberEnv(env.OPENROUTER_RPD, 50) };
  }
  if (providerId === 'groq') {
    return { key: `groq:${model}`, cap: numberEnv(env.GROQ_RPD, 1000) };
  }
  if (providerId === 'nvidia') {
    return {
      key: 'nvidia',
      cap: env.NVIDIA_RPD ? numberEnv(env.NVIDIA_RPD, 0) : null,
    };
  }
  return { key: providerId, cap: null };
}

function routerOptions(env: Record<string, string | undefined>) {
  return {
    timeoutMs: numberEnv(env.LLM_TIMEOUT_MS, 30_000),
    cooldownMs: numberEnv(env.LLM_CIRCUIT_COOLDOWN_MS, 60_000),
    probeMs: numberEnv(env.LLM_PROBE_MS, 20_000),
  };
}

function listEnv(raw: string | undefined, fallback: string[]): string[] {
  const listed = raw
    ?.split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return listed && listed.length > 0 ? listed : fallback;
}

function rolePins(
  env: Record<string, string | undefined>,
): Record<string, string> {
  const pins: Record<string, string> = {};
  for (const role of ROLES) {
    const parsed = parseChoice(env[`LLM_ROLE_${role.toUpperCase()}`]);
    if (!parsed) continue;
    pins[role] = parsed.model ? `${parsed.id}:${parsed.model}` : parsed.id;
  }
  return pins;
}

export function describeRouter(
  env: Record<string, string | undefined> = process.env,
): RouterEndpointStat[] {
  const router = routerFor(
    signature(env),
    endpointsFor(env),
    rolePins(env),
    routerOptions(env),
  );
  const live = new Map(router.stats().map((row) => [row.id, row]));
  const rows: RouterEndpointStat[] = parseChain(env)
    .filter((entry) => entry.id !== 'ollama' || env.OLLAMA_DISABLED !== '1')
    .map((entry) => {
      const id = `${entry.id}:${entry.model}`;
      return live.get(id) ?? unconfigured(id, entry.id, entry.model);
    });
  const mockAt = rows.findIndex((row) => row.id === 'mock:mock');
  const extras = router
    .stats()
    .filter((row) => !rows.some((item) => item.id === row.id));
  if (mockAt >= 0) rows.splice(mockAt, 0, ...extras);
  else rows.push(...extras);
  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

function unconfigured(
  id: string,
  provider: string,
  model: string,
): RouterEndpointStat {
  const health: ChainHealth = 'unconfigured';
  return {
    id,
    provider,
    model,
    rank: 0,
    health,
    circuit: 'closed',
    ewmaMs: 0,
    dailyUsed: 0,
    dailyCap: null,
    successes: 0,
    failures: 0,
    inFlight: 0,
    lastError: null,
  };
}

function signature(env: Record<string, string | undefined>): string {
  const keys = [
    'GROQ_API_KEY',
    'GROQ_MODELS',
    'GEMINI_API_KEY',
    'GOOGLE_API_KEY',
    'GEMINI_MODELS',
    'GEMINI_MODEL',
    'OPENROUTER_API_KEY',
    'OPENROUTER_MODELS',
    'NVIDIA_API_KEY',
    'NVIDIA_MODELS',
    'NVIDIA_MODEL',
    'NVIDIA_RPD',
    'LLM_CHAIN',
    'LLM_TIMEOUT_MS',
    'LLM_CIRCUIT_COOLDOWN_MS',
    'LLM_PROBE_MS',
    'XAI_API_KEY',
    'XAI_MODEL',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'DEEPSEEK_API_KEY',
    'TOGETHER_API_KEY',
    'COHERE_API_KEY',
    'OLLAMA_DISABLED',
    'OLLAMA_MODEL',
    'GEMINI_RPD',
    'OPENROUTER_RPD',
    'GROQ_RPD',
    'LLM_ROLE_HISTORIAN',
    'LLM_ROLE_MARKET',
    'LLM_ROLE_TRUST',
    'LLM_ROLE_SKEPTIC',
    'LLM_ROLE_JUDGE',
    'LLM_ROLE_ASSISTANT',
  ];
  return keys.map((key) => `${key}=${env[key] ?? ''}`).join('|');
}

function parseChoice(
  raw: string | undefined,
): { id: string; model?: string } | null {
  if (!raw) return null;
  const text = raw.trim().toLowerCase();
  if (!text || text === 'free' || text === 'mock')
    return text === 'mock' ? { id: 'mock' } : null;
  const split = raw.trim().split(':');
  const id = split[0]?.trim().toLowerCase() ?? '';
  if (id === 'http' || id === 'https') return null;
  const model = raw.includes(':')
    ? raw.slice(raw.indexOf(':') + 1).trim()
    : undefined;
  return { id, model: model || undefined };
}

function build(
  id: string,
  env: Record<string, string | undefined>,
  modelOverride?: string,
  options?: { maxRetries?: number },
): LlmProvider | null {
  if (id === 'mock') return createMockProvider();
  const spec = specById(id);
  if (!spec) return null;
  const model = modelOverride || modelFor(spec, env);
  if (spec.kind === 'ollama') {
    return createOpenAiCompatibleProvider({
      baseUrl: baseUrlFor(spec, env),
      apiKey: env.OLLAMA_API_KEY || 'ollama',
      model,
      timeoutMs: numberEnv(env.LLM_TIMEOUT_MS, 30_000),
    });
  }
  const key = readKey(spec, env);
  if (!key) return null;
  if (spec.kind === 'anthropic') {
    return createAnthropicProvider({
      apiKey: key,
      model,
      timeoutMs: numberEnv(env.LLM_TIMEOUT_MS, 30_000),
    });
  }
  return createOpenAiCompatibleProvider({
    baseUrl: baseUrlFor(spec, env),
    apiKey: key,
    model,
    headers:
      spec.id === 'openrouter'
        ? { 'HTTP-Referer': 'https://safqa.example', 'X-Title': 'Safqa' }
        : undefined,
    limiter: limiterFor(spec.id, model, env),
    maxRetries: options?.maxRetries,
    timeoutMs: numberEnv(env.LLM_TIMEOUT_MS, 30_000),
  });
}

function limiterFor(
  id: string,
  model: string,
  env: Record<string, string | undefined>,
) {
  if (id === 'gemini') {
    return sharedLimiter(
      'gemini',
      numberEnv(env.GEMINI_RPM, 5),
      numberEnv(env.GEMINI_RPD, 20),
    );
  }
  if (
    id === 'openrouter' &&
    (model === 'openrouter/free' || model.endsWith(':free'))
  ) {
    return sharedLimiter(
      'openrouter-free',
      numberEnv(env.OPENROUTER_RPM, 20),
      numberEnv(env.OPENROUTER_RPD, 50),
    );
  }
  return undefined;
}

function numberEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function modelFor(
  spec: ProviderSpec,
  env: Record<string, string | undefined>,
): string {
  if (spec.id === 'xai') return env.XAI_MODEL || DEFAULT_GROK_MODEL;
  const specific = env[`${spec.id.toUpperCase()}_MODEL`];
  if (specific) return specific;
  if (spec.id === 'gemini') return env.GEMINI_MODEL || spec.defaultModel;
  if (spec.id === 'openrouter')
    return env.OPENROUTER_MODEL || spec.defaultModel;
  if (spec.id === 'ollama') return env.OLLAMA_MODEL || spec.defaultModel;
  return spec.defaultModel;
}

function baseUrlFor(
  spec: ProviderSpec,
  env: Record<string, string | undefined>,
): string {
  if (spec.id === 'xai') return env.XAI_BASE_URL || XAI_BASE_URL;
  if (spec.id === 'ollama') return env.OLLAMA_BASE_URL || spec.baseUrl;
  const override = env[`${spec.id.toUpperCase()}_BASE_URL`];
  return override || spec.baseUrl;
}

function readKey(
  spec: ProviderSpec,
  env: Record<string, string | undefined>,
): string | undefined {
  if (spec.kind === 'mock' || spec.kind === 'ollama') return undefined;
  const primary = env[spec.keyEnv];
  if (primary) return primary;
  if (spec.altKeyEnv && env[spec.altKeyEnv]) return env[spec.altKeyEnv];
  return undefined;
}

function hint(key: string | undefined): string | null {
  if (!key) return null;
  if (key.length < 8) return 'set';
  return `••••${key.slice(-4)}`;
}
