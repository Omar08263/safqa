import { toolsNamed } from './tools';
import type {
  ChatMessage,
  Completion,
  LlmProvider,
  ToolHandler,
} from './types';

export interface ChatReply {
  reply: string;
  productIds: string[];
  tokens: number;
  provider: string;
}

const SYSTEM = `ROLE=assistant
You are Safqa's shopping assistant. Speak Egyptian Arabic, short and direct.
Call search_products once before you recommend anything. Quote only prices the tool returned.
Pass maxPrice only when the user explicitly stated a budget or a maximum price. Never invent a budget.
After the tool result, answer in sentences. Do not call the tool again unless the search returned no items.`;

export async function runAssistant(input: {
  provider: LlmProvider;
  message: string;
  tools: Record<string, ToolHandler>;
  maxToolRounds?: number;
}): Promise<ChatReply> {
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: input.message },
  ];
  let tokens = 0;
  let productIds: string[] = [];
  let servedBy = '';
  let lastSearch: unknown;
  const rounds = input.maxToolRounds ?? 2;
  for (let i = 0; i < rounds; i += 1) {
    const completion = await input.provider.complete({
      messages,
      tools: toolsNamed(['search_products']),
    });
    tokens += completion.tokens;
    servedBy = completion.servedBy || servedBy;
    if (completion.toolCalls.length === 0) {
      const reply = completion.content.trim();
      if (reply) {
        return { reply, productIds, tokens, provider: servedBy || 'unknown' };
      }
      break;
    }
    const executed = await runTools(
      completion,
      input.message,
      input.tools,
      messages,
    );
    productIds = executed.productIds || productIds;
    if (executed.search) lastSearch = executed.search;
  }
  messages.push({
    role: 'user',
    content:
      'Answer now in Egyptian Arabic using only the tool JSON. Do not call tools. Do not mention a budget the user did not state.',
  });
  const final = await input.provider.complete({ messages });
  tokens += final.tokens;
  servedBy = final.servedBy || servedBy;
  const text = final.toolCalls.length === 0 ? final.content.trim() : '';
  return {
    reply: text || replyFromSearch(lastSearch),
    productIds,
    tokens,
    provider: servedBy || 'unknown',
  };
}

async function runTools(
  completion: Completion,
  message: string,
  tools: Record<string, ToolHandler>,
  messages: ChatMessage[],
): Promise<{ productIds: string[]; search: unknown }> {
  messages.push({
    role: 'assistant',
    content: completion.content,
    toolCalls: completion.toolCalls,
  });
  let productIds: string[] = [];
  let search: unknown;
  for (const call of completion.toolCalls) {
    const args =
      call.name === 'search_products'
        ? applyBudget({ ...call.arguments }, message)
        : call.arguments;
    const handler = tools[call.name];
    const result = handler ? await handler(args) : { items: [] };
    if (call.name === 'search_products') {
      productIds = idsFrom(result);
      search = result;
    }
    messages.push({
      role: 'tool',
      name: call.name,
      toolCallId: call.id,
      content: JSON.stringify(result),
    });
  }
  return { productIds, search };
}

/** A number the user actually wrote. The model is not allowed to supply one. */
export function statedBudget(message: string): number | undefined {
  const patterns = [
    /(?:تحت|أقل\s*من|اقل\s*من|ميزانية|بحد\s*أقصى|حد\s*أقصى|مش\s*أكتر\s*من|under|below|budget|at most|max(?:imum)?)\s*[:-]?\s*(\d{3,7})/i,
    /(\d{3,7})\s*(?:جنيه|جنيهًا|ج\.م|egp|le)\b/i,
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) return Number(match[1]);
  }
  return undefined;
}

export function applyBudget(
  args: Record<string, unknown>,
  message: string,
): Record<string, unknown> {
  const stated = statedBudget(message);
  if (stated == null) {
    delete args.maxPrice;
    return args;
  }
  return { ...args, maxPrice: stated };
}

function replyFromSearch(result: unknown): string {
  if (!result || typeof result !== 'object') {
    return 'ملقيتش نتيجة في الكتالوج. جرّب اسم المنتج.';
  }
  const items =
    (result as { items?: Array<Record<string, unknown>> }).items ?? [];
  const first = items[0];
  if (!first) return 'ملقيتش حاجة بالوصف ده في الكتالوج.';
  const title = String(first.titleAr ?? first.titleEn ?? 'منتج');
  const price = Number(first.priceEgp);
  const priceText = Number.isFinite(price) ? ` بـ ${price} جنيه` : '';
  return `لقيت ${items.length}. أقربهم ${title}${priceText}.`;
}

function idsFrom(result: unknown): string[] {
  if (!result || typeof result !== 'object') return [];
  const items = (result as { items?: Array<{ id?: string }> }).items ?? [];
  return items.flatMap((item) => (item.id ? [item.id] : []));
}

/** Mock path: the provider above does not special-case ROLE=assistant. */
export function assistantAsksSearch(message: string): {
  q: string;
  maxPrice?: number;
} {
  const maxPrice = statedBudget(message);
  return { q: message, ...(maxPrice != null ? { maxPrice } : {}) };
}
