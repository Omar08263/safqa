import { assistantAsksSearch } from './chat';
import type { ChatMessage, Completion, LlmProvider, ToolCall } from './types';

/** Human-facing money in explanations (raw numbers stay in EVIDENCE lines for parsing). */
const egp = (n: number) => `${Math.round(n).toLocaleString('en-US')} ج.م`;
const egpEn = (n: number) => `EGP ${Math.round(n).toLocaleString('en-US')}`;

let sequence = 0;

function call(name: string, args: Record<string, unknown>): ToolCall {
  sequence += 1;
  return { id: `mock-${sequence}`, name, arguments: args };
}

function productIdFrom(messages: ChatMessage[]): string {
  const blob = messages.map((message) => message.content).join('\n');
  const match = blob.match(/productId=([0-9a-f-]{8,})/i);
  return match?.[1] ?? '';
}

function roleFrom(messages: ChatMessage[]): string {
  const system =
    messages.find((message) => message.role === 'system')?.content ?? '';
  const match = system.match(/ROLE=([a-z]+)/);
  return match?.[1] ?? 'judge';
}

function toolResult(
  messages: ChatMessage[],
  name: string,
): Record<string, unknown> | null {
  const message = [...messages]
    .reverse()
    .find((item) => item.role === 'tool' && item.name === name);
  if (!message) return null;
  try {
    return JSON.parse(message.content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function bool(value: unknown): boolean {
  return value === true;
}

/**
 * Deterministic stand-in for an OpenAI-compatible model.
 * It still runs the tool loop: a role with missing evidence requests the
 * tool, then writes from the JSON that came back. It does not know prices
 * ahead of time.
 */
export function createMockProvider(): LlmProvider {
  return {
    id: 'mock',
    async complete({ messages }): Promise<Completion> {
      const role = roleFrom(messages);
      const productId = productIdFrom(messages);
      const spoken = speak(role, messages, productId);
      const tokens = Math.max(1, Math.ceil(spoken.content.length / 4));
      return { ...spoken, tokens, servedBy: 'mock:mock' };
    },
  };
}

function speak(
  role: string,
  messages: ChatMessage[],
  productId: string,
): Omit<Completion, 'tokens'> {
  if (role === 'historian') return historian(messages, productId);
  if (role === 'market') return market(messages);
  if (role === 'trust') return trust(messages, productId);
  if (role === 'skeptic') return skeptic(messages, productId);
  if (role === 'assistant') return assistant(messages);
  return judge(messages);
}

function historian(
  messages: ChatMessage[],
  productId: string,
): Omit<Completion, 'tokens'> {
  const evidence = toolResult(messages, 'get_price_history');
  if (!evidence) {
    return {
      content: '',
      toolCalls: [call('get_price_history', { productId })],
    };
  }
  const current = num(evidence.current);
  const median30 = num(evidence.median30);
  const min90 = num(evidence.min90);
  const fake = bool(evidence.fake);
  const dropPct =
    median30 > 0
      ? Math.round(((median30 - current) / median30) * 1000) / 10
      : 0;
  const content = [
    `EVIDENCE current=${current} median30=${median30} min90=${min90} fake=${fake} dropPct=${dropPct} inStock=${bool(evidence.inStock)} rating=${num(evidence.rating)}`,
    fake
      ? `السعر الحالي ${egp(current)} قريب من وسيط 30 يوم (${egp(median30)}). السعر المشطوب مش مدعوم من التاريخ، فالخصم مضخّم.`
      : `السعر الحالي ${egp(current)} مقابل وسيط 30 يوم ${egp(median30)} وقاع 90 يوم ${egp(min90)}. الانخفاض حوالي ${dropPct}% وده انخفاض حقيقي.`,
  ].join('\n');
  return { content, toolCalls: [] };
}

function market(messages: ChatMessage[]): Omit<Completion, 'tokens'> {
  const season = toolResult(messages, 'get_seasonality');
  if (!season) return { content: '', toolCalls: [call('get_seasonality', {})] };
  const days = season.daysUntil == null ? null : num(season.daysUntil);
  const nameAr = typeof season.nameAr === 'string' ? season.nameAr : '';
  const content =
    days == null
      ? 'EVENT none\nمفيش موسم تخفيضات قريب يغيّر القرار.'
      : `EVENT id=${String(season.id)} days=${days}\n${nameAr} بعد ${days} يوم. لو السعر لسه مش على القاع، الموسم ده ممكن ينزّله أكتر.`;
  return { content, toolCalls: [] };
}

function trust(
  messages: ChatMessage[],
  productId: string,
): Omit<Completion, 'tokens'> {
  const ratings = toolResult(messages, 'get_ratings');
  if (!ratings) {
    return { content: '', toolCalls: [call('get_ratings', { productId })] };
  }
  const rating = num(ratings.rating);
  const used = bool(ratings.usedCheaper);
  const content = `RATING ${rating} usedCheaper=${used}\nالتقييم ${rating || 'مش متسجل'}. ${used ? 'في عرض مستعمل أرخص، متعملوش أحسن سعر جديد.' : 'العرض الأساسي جديد.'}`;
  return { content, toolCalls: [] };
}

function skeptic(
  messages: ChatMessage[],
  productId: string,
): Omit<Completion, 'tokens'> {
  const evidence = toolResult(messages, 'get_price_history');
  if (!evidence) {
    return {
      content: '',
      toolCalls: [call('get_price_history', { productId })],
    };
  }
  const season = toolResult(messages, 'get_seasonality');
  if (!season) return { content: '', toolCalls: [call('get_seasonality', {})] };

  const current = num(evidence.current);
  const median30 = num(evidence.median30);
  const min90 = num(evidence.min90);
  const fake = bool(evidence.fake);
  const dropPct = median30 > 0 ? ((median30 - current) / median30) * 100 : 0;
  const days = season.daysUntil == null ? null : num(season.daysUntil);
  const nearLow = min90 > 0 && current <= min90 * 1.02;
  const eventSoon = days != null && days <= 14;

  if (fake) {
    return {
      content:
        'STANCE=challenge ACTION=skip\nأنا راجعت التاريخ بنفسي. الخصم المشطوب مضخّم، والسعر الحالي مش صفقة. متشتريش عشان الـ«كان».',
      toolCalls: [],
    };
  }
  if (eventSoon && !nearLow && dropPct < 15) {
    return {
      content: `STANCE=challenge ACTION=wait\nالانخفاض ${dropPct.toFixed(1)}% بس، وفيه موسم بعد ${days} يوم. المؤرخ متفائل زيادة. استنى.`,
      toolCalls: [],
    };
  }
  if (nearLow || dropPct >= 12) {
    return {
      content:
        'STANCE=concede ACTION=buy_now\nراجعت الأرقام: الانخفاض حقيقي والسعر على القاع أو قريب منه. اعتراضي الوحيد إنك تتأكد إن القطعة جديدة ومتوفرة قبل ما تدفع.',
      toolCalls: [],
    };
  }
  return {
    content:
      'STANCE=challenge ACTION=wait\nالسعر مش بعيد عن الوسيط. مفيش استعجال.',
    toolCalls: [],
  };
}

function assistant(messages: ChatMessage[]): Omit<Completion, 'tokens'> {
  const found = toolResult(messages, 'search_products');
  if (!found) {
    const user = [...messages]
      .reverse()
      .find((message) => message.role === 'user');
    return {
      content: '',
      toolCalls: [
        call('search_products', assistantAsksSearch(user?.content ?? '')),
      ],
    };
  }
  const items = Array.isArray(found.items)
    ? (found.items as Array<Record<string, unknown>>)
    : [];
  const first = items[0];
  if (!first) {
    return { content: 'مدورتش على حاجة بالوصف ده في الكتالوج.', toolCalls: [] };
  }
  const title = String(first.titleAr ?? first.titleEn ?? 'منتج');
  const price = num(first.priceEgp);
  if (found.note === 'above_budget') {
    return {
      content: `مفيش حاجة تحت ${num(found.maxPrice)}. أقرب حاجة ${title} بـ ${price} جنيه.`,
      toolCalls: [],
    };
  }
  return {
    content: `لقيت ${items.length}. أرخصهم ${title} بـ ${price} جنيه.`,
    toolCalls: [],
  };
}

function judge(messages: ChatMessage[]): Omit<Completion, 'tokens'> {
  const transcript = messages.map((message) => message.content).join('\n');
  const evidence =
    /EVIDENCE current=(\d+(?:\.\d+)?) median30=(\d+(?:\.\d+)?) min90=(\d+(?:\.\d+)?) fake=(true|false)/.exec(
      transcript,
    );
  const stance = /STANCE=(challenge|concede) ACTION=(buy_now|wait|skip)/.exec(
    transcript,
  );
  const current = Number(evidence?.[1] ?? 0);
  const median30 = Number(evidence?.[2] ?? 0);
  const fake = evidence?.[4] === 'true';
  const action = stance?.[2] ?? 'wait';
  let score = 55;
  if (action === 'buy_now') score = fake ? 40 : 82;
  if (action === 'wait') score = 48;
  if (action === 'skip') score = 28;
  const recommendation = action;
  const explanationAr = fake
    ? `الحكم: الخصم مضخّم. السعر ${egp(current)} قريب من وسيط 30 يوم (${egp(median30)}) والمعارض رفض الصفقة.`
    : recommendation === 'buy_now'
      ? `الحكم: اشترِ دلوقتي. المؤرخ والمعارض اتفقا إن ${egp(current)} انخفاض حقيقي عن وسيط ${egp(median30)}.`
      : `الحكم: استنى. المعارض شاف إن ${egp(current)} لسه مش صفقة كافية مقارنة بوسيط ${egp(median30)}.`;
  const explanationEn = fake
    ? `Verdict: the discount is inflated. ${egpEn(current)} sits near the 30-day median (${egpEn(median30)}) and the skeptic rejected the deal.`
    : recommendation === 'buy_now'
      ? `Verdict: buy now. The historian and the skeptic agree that ${egpEn(current)} is a real drop versus the median ${egpEn(median30)}.`
      : `Verdict: wait. The skeptic found ${egpEn(current)} is not a strong enough gap versus the median ${egpEn(median30)}.`;
  const content = JSON.stringify({
    score,
    recommendation,
    explanationAr,
    explanationEn,
  });
  return { content, toolCalls: [] };
}
