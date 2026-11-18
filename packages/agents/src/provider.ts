import type { RequestLimiter } from './limit';
import type {
  ChatMessage,
  Completion,
  LlmProvider,
  ToolCall,
  ToolSpec,
} from './types';

interface OpenAiMessage {
  role: string;
  content: string | null;
  tool_call_id?: string;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}

function toOpenAi(message: ChatMessage): OpenAiMessage {
  if (
    message.role === 'assistant' &&
    message.toolCalls &&
    message.toolCalls.length > 0
  ) {
    return {
      role: 'assistant',
      content: message.content || null,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: 'function',
        function: {
          name: call.name,
          arguments: JSON.stringify(call.arguments),
        },
      })),
    };
  }
  if (message.role === 'tool') {
    return {
      role: 'tool',
      content: message.content,
      tool_call_id: message.toolCallId,
      name: message.name,
    };
  }
  return { role: message.role, content: message.content };
}

export function createOpenAiCompatibleProvider(input: {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  headers?: Record<string, string>;
  limiter?: RequestLimiter;
  maxRetries?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}): LlmProvider {
  const base = input.baseUrl.replace(/\/$/, '');
  const fetchImpl = input.fetchImpl ?? fetch;
  const sleep =
    input.sleep ??
    ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const maxRetries = input.maxRetries ?? 3;
  const timeoutMs = input.timeoutMs ?? 30_000;
  return {
    id: input.model,
    async complete({ messages, tools, signal }): Promise<Completion> {
      const body = JSON.stringify({
        model: input.model,
        temperature: 0.2,
        messages: messages.map(toOpenAi),
        tools: tools?.map((tool: ToolSpec) => ({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        })),
      });
      let response: Response | null = null;
      const requestSignal = combineSignals(signal, timeoutMs);
      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        throwIfStopped(signal, requestSignal, timeoutMs);
        await input.limiter?.acquire();
        try {
          response = await fetchImpl(`${base}/chat/completions`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${input.apiKey}`,
              'Content-Type': 'application/json',
              ...input.headers,
            },
            body,
            signal: requestSignal,
          });
        } catch (error) {
          throwIfStopped(signal, requestSignal, timeoutMs);
          throw error;
        }
        if (response.status !== 429 || attempt === maxRetries) break;
        await sleep(retryDelayMs(response, attempt));
      }
      if (!response?.ok) {
        throw new LlmHttpError(response?.status ?? 0);
      }
      const json = (await response.json()) as {
        usage?: { total_tokens?: number };
        choices?: Array<{
          message?: {
            content?: string | null;
            tool_calls?: Array<{
              id: string;
              function: { name: string; arguments: string };
            }>;
          };
        }>;
      };
      const message = json.choices?.[0]?.message;
      const toolCalls: ToolCall[] = (message?.tool_calls ?? []).map((call) => ({
        id: call.id,
        name: call.function.name,
        arguments: parseArgs(call.function.arguments),
      }));
      return {
        content: message?.content ?? '',
        toolCalls,
        tokens: json.usage?.total_tokens ?? 0,
      };
    },
  };
}

export class LlmTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`LLM request timed out after ${timeoutMs}ms`);
    this.name = 'LlmTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export class LlmAbortError extends Error {
  constructor() {
    super('LLM request aborted');
    this.name = 'LlmAbortError';
  }
}

function combineSignals(
  parent: AbortSignal | undefined,
  timeoutMs: number,
): AbortSignal | undefined {
  const parts: AbortSignal[] = [];
  if (parent) parts.push(parent);
  if (timeoutMs > 0) parts.push(AbortSignal.timeout(timeoutMs));
  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0];
  return AbortSignal.any(parts);
}

function throwIfStopped(
  parent: AbortSignal | undefined,
  request: AbortSignal | undefined,
  timeoutMs: number,
): void {
  if (parent?.aborted) throw new LlmAbortError();
  if (request?.aborted) throw new LlmTimeoutError(timeoutMs);
}

export class LlmHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`LLM request failed with HTTP ${status}`);
    this.name = 'LlmHttpError';
    this.status = status;
  }
}

function retryDelayMs(response: Response, attempt: number): number {
  const header = Number(response.headers.get('retry-after'));
  if (Number.isFinite(header) && header > 0) return header * 1000;
  return Math.min(8_000, 400 * 2 ** attempt);
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // The model returned arguments that are not JSON. The tool will see {}.
  }
  return {};
}

/** OpenAI-compatible base URL for the xAI API. */
export const XAI_BASE_URL = 'https://api.x.ai/v1';

/** Current flagship Grok model. Override with XAI_MODEL. */
export const DEFAULT_GROK_MODEL = 'grok-4.7';

/** Anthropic Messages API. Not OpenAI-compatible. */
export function createAnthropicProvider(input: {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): LlmProvider {
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? 30_000;
  return {
    id: input.model,
    async complete({ messages, tools, signal }): Promise<Completion> {
      const system = messages
        .filter((message) => message.role === 'system')
        .map((message) => message.content)
        .join('\n');
      const requestSignal = combineSignals(signal, timeoutMs);
      throwIfStopped(signal, requestSignal, timeoutMs);
      let response: Response;
      try {
        response = await fetchImpl('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': input.apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          signal: requestSignal,
          body: JSON.stringify({
            model: input.model,
            max_tokens: 1024,
            system: system || undefined,
            messages: toAnthropic(messages),
            tools: tools?.map((tool) => ({
              name: tool.name,
              description: tool.description,
              input_schema: tool.parameters,
            })),
          }),
        });
      } catch (error) {
        throwIfStopped(signal, requestSignal, timeoutMs);
        throw error;
      }
      if (!response.ok) {
        throw new Error(
          `Anthropic request failed with HTTP ${response.status}`,
        );
      }
      const json = (await response.json()) as {
        usage?: { input_tokens?: number; output_tokens?: number };
        content?: Array<{
          type: string;
          text?: string;
          id?: string;
          name?: string;
          input?: Record<string, unknown>;
        }>;
      };
      const blocks = json.content ?? [];
      const toolCalls: ToolCall[] = blocks
        .filter((block) => block.type === 'tool_use' && block.id && block.name)
        .map((block) => ({
          id: block.id as string,
          name: block.name as string,
          arguments: block.input ?? {},
        }));
      const text = blocks
        .filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join('\n');
      return {
        content: text,
        toolCalls,
        tokens:
          (json.usage?.input_tokens ?? 0) + (json.usage?.output_tokens ?? 0),
      };
    },
  };
}

function toAnthropic(messages: ChatMessage[]): unknown[] {
  const out: unknown[] = [];
  for (const message of messages) {
    if (message.role === 'system') continue;
    if (message.role === 'assistant' && message.toolCalls?.length) {
      out.push({
        role: 'assistant',
        content: [
          ...(message.content ? [{ type: 'text', text: message.content }] : []),
          ...message.toolCalls.map((call) => ({
            type: 'tool_use',
            id: call.id,
            name: call.name,
            input: call.arguments,
          })),
        ],
      });
      continue;
    }
    if (message.role === 'tool') {
      out.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: message.toolCallId,
            content: message.content,
          },
        ],
      });
      continue;
    }
    out.push({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content,
    });
  }
  return out;
}
