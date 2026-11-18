export type FreeTier =
  | 'free-models'
  | 'free-tier'
  | 'trial'
  | 'signup-credit'
  | 'none'
  | 'local'
  | 'builtin';

export interface ProviderSpec {
  id: string;
  label: string;
  keyEnv: string;
  altKeyEnv?: string;
  baseUrl: string;
  defaultModel: string;
  freeTier: FreeTier;
  /** Checked against vendor docs in November 2026. Not a guess. */
  freeNote: string;
  kind: 'openai' | 'anthropic' | 'ollama' | 'mock';
}

/**
 * Free-tier notes were checked on 10 Nov 2026 against vendor pages and a
 * same-week survey of those pages (OpenRouter free router, Google AI pricing
 * updated 30 Oct 2026, and the 2 Nov 2026 provider survey).
 */
export const DEFAULT_GROQ_MODELS = [
  'openai/gpt-oss-120b',
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-20b',
];

export const DEFAULT_OPENROUTER_MODELS = [
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'nvidia/nemotron-3.5-super-vl:free',
  'openrouter/free',
];

/** Verified on this NVIDIA key. deepseek-v4.1-flash is lower in the ranked chain. */
export const DEFAULT_NVIDIA_MODELS = ['nvidia/nemotron-3-ultra-550b-a55b'];

/**
 * One global chain, strongest first. LLM_CHAIN replaces this list.
 * Entries whose provider has no key are skipped. mock is always last.
 */
export const DEFAULT_LLM_CHAIN = [
  'gemini:gemini-3.8-flash',
  'nvidia:nvidia/nemotron-3-ultra-550b-a55b',
  'gemini:gemini-3.7-flash',
  'openrouter:nvidia/nemotron-3-ultra-550b-a55b:free',
  'groq:openai/gpt-oss-120b',
  'gemini:gemini-3-flash-preview',
  'nvidia:deepseek-ai/deepseek-v4.1-flash',
  'groq:qwen/qwen3.8-27b',
  'openrouter:nvidia/nemotron-3.5-super-vl:free',
  'gemini:gemini-2.5-flash',
  'groq:openai/gpt-oss-20b',
  'openrouter:openrouter/free',
  'ollama',
  'mock',
];

export const PROVIDERS: ProviderSpec[] = [
  {
    id: 'openrouter',
    label: 'OpenRouter',
    keyEnv: 'OPENROUTER_API_KEY',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    freeTier: 'free-models',
    freeNote:
      'Free tier is 50 requests/day on this account. Verified models: nvidia/nemotron-3-ultra-550b-a55b:free and nvidia/nemotron-3.5-super-vl:free. openrouter/free often 429s because it lands on gemma-4 :free. The router deprioritizes that id.',
    kind: 'openai',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    keyEnv: 'GEMINI_API_KEY',
    altKeyEnv: 'GOOGLE_API_KEY',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-3.8-flash',
    freeTier: 'free-tier',
    freeNote:
      "Google's pricing page (30 Oct 2026) lists gemini-3.8-flash input and output as free of charge on the free tier, with project quotas in AI Studio. Free-tier prompts may be used to improve Google products.",
    kind: 'openai',
  },
  {
    id: 'ollama',
    label: 'Ollama',
    keyEnv: 'OLLAMA_BASE_URL',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.1',
    freeTier: 'local',
    freeNote:
      'Local runtime. No API key and no vendor charge. It has to be running on this machine.',
    kind: 'ollama',
  },
  {
    id: 'groq',
    label: 'Groq',
    keyEnv: 'GROQ_API_KEY',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'openai/gpt-oss-120b',
    freeTier: 'free-tier',
    freeNote:
      'Free plan, about 30 requests/minute and 1,000 requests a day per model (2 Nov 2026). Verified on this project: openai/gpt-oss-120b, qwen/qwen3.8-27b, openai/gpt-oss-20b. Qwen is this Groq model. Rank is LLM_CHAIN.',
    kind: 'openai',
  },
  {
    id: 'nvidia',
    label: 'NVIDIA NIM',
    keyEnv: 'NVIDIA_API_KEY',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    defaultModel: 'nvidia/nemotron-3-ultra-550b-a55b',
    freeTier: 'trial',
    freeNote:
      'NVIDIA Developer Program members get trial access to hosted NIM endpoints for prototyping, not production (API Trial Terms, 19 Sep 2025). Account limits are not one published number, so Safqa enforces a daily cap only when NVIDIA_RPD is set. Verified on this key: nvidia/nemotron-3-ultra-550b-a55b. deepseek-ai/deepseek-v4.1-flash is lower in LLM_CHAIN and is dropped after the 30s timeout. moonshotai/kimi-k2.6 returned HTTP 404 on this account and is not in the chain.',
    kind: 'openai',
  },
  {
    id: 'cohere',
    label: 'Cohere',
    keyEnv: 'COHERE_API_KEY',
    baseUrl: 'https://api.cohere.com/compatibility/v1',
    defaultModel: 'command-r',
    freeTier: 'trial',
    freeNote:
      'Trial keys are about 1,000 calls a month and 20 chat requests/minute. Cohere does not allow trial keys for production.',
    kind: 'openai',
  },
  {
    id: 'xai',
    label: 'xAI Grok',
    keyEnv: 'XAI_API_KEY',
    baseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-4.7',
    freeTier: 'none',
    freeNote:
      'No free tier. Prepaid credits are required before the first call. grok-4.7 is the current flagship. It joins the chain after the ranked list when XAI_API_KEY is set, or a role pin such as LLM_ROLE_SKEPTIC=xai:grok-4.7 uses it directly.',
    kind: 'openai',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    keyEnv: 'OPENAI_API_KEY',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4.1-mini',
    freeTier: 'none',
    freeNote:
      'No general free chat tier. Prepaid credits are required. The Moderation endpoint is free; chat models are not.',
    kind: 'openai',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    keyEnv: 'ANTHROPIC_API_KEY',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-5',
    freeTier: 'signup-credit',
    freeNote:
      'New accounts get a small unpublished credit. After that, Claude is paid. There is no ongoing free tier.',
    kind: 'anthropic',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    keyEnv: 'DEEPSEEK_API_KEY',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    freeTier: 'none',
    freeNote:
      'Official DeepSeek API only. Prepaid, no standing free allowance. Optional paid slot via DEEPSEEK_API_KEY. The NIM id deepseek-ai/deepseek-v4.1-flash is a different host and is not routed.',
    kind: 'openai',
  },
  {
    id: 'together',
    label: 'Together',
    keyEnv: 'TOGETHER_API_KEY',
    baseUrl: 'https://api.together.ai/v1',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    freeTier: 'none',
    freeNote:
      'No free trial as of 2 Nov 2026. Access starts with a credit purchase.',
    kind: 'openai',
  },
  {
    id: 'mock',
    label: 'Mock',
    keyEnv: '',
    baseUrl: '',
    defaultModel: 'mock',
    freeTier: 'builtin',
    freeNote:
      'Deterministic local model. Always available. It still calls tools and writes from the JSON they return.',
    kind: 'mock',
  },
];

export function specById(id: string): ProviderSpec | undefined {
  return PROVIDERS.find((spec) => spec.id === id);
}
