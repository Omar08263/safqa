import { DEBATE_ROLES } from './roles';
import type {
  ChatMessage,
  DebateResult,
  DebateTurn,
  LlmProvider,
  ToolHandler,
  Verdict,
} from './types';

export interface DebateInput {
  provider: LlmProvider;
  /** Per-role override. Missing roles use `provider`. */
  providers?: Partial<Record<string, LlmProvider>>;
  productId: string;
  tools: Record<string, ToolHandler>;
  /** Hard stop so a chatty model cannot run away. */
  maxToolRounds?: number;
  /** Total debate budget. The judge's reserve is kept out of this spend. */
  maxTokens?: number;
  /** Cap for each non-judge role. */
  roleTokenCap?: number;
  /** Tokens kept for the judge. The judge runs even when the rest is spent. */
  judgeReserve?: number;
  /**
   * Compact listing text from formatProductLlmContexts. JSON-LD prices in
   * this block and in the catalog tools are authoritative; page text is not.
   */
  pageContext?: string;
}

export function debateLimits(
  env: Record<string, string | undefined> = process.env,
): Pick<DebateInput, 'maxTokens' | 'roleTokenCap' | 'judgeReserve'> {
  return {
    maxTokens: positive(env.LLM_DEBATE_TOKEN_BUDGET, 16_000),
    roleTokenCap: positive(env.LLM_DEBATE_ROLE_TOKEN_CAP, 2_500),
    judgeReserve: positive(env.LLM_DEBATE_JUDGE_RESERVE, 2_500),
  };
}

function positive(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function runDebate(input: DebateInput): Promise<DebateResult> {
  const maxToolRounds = input.maxToolRounds ?? 4;
  const maxTokens = input.maxTokens ?? 16_000;
  const roleCap = input.roleTokenCap ?? 2_500;
  const judgeReserve = input.judgeReserve ?? 2_500;
  const earlyPool = Math.max(0, maxTokens - judgeReserve);
  const parallelCap =
    earlyPool === 0 ? 0 : Math.min(roleCap, Math.floor(earlyPool / 3));
  const turns: DebateTurn[] = [];
  const publics: string[] = [];
  let tokens = 0;

  const parallel = DEBATE_ROLES.filter((agent) =>
    ['historian', 'market', 'trust'].includes(agent.role),
  );
  const parallelDone =
    parallelCap > 0
      ? await Promise.all(
          parallel.map((agent) =>
            runAgent(agent, input, '', maxToolRounds, parallelCap),
          ),
        )
      : [];
  for (const done of parallelDone) {
    tokens += done.tokens;
    turns.push(...done.turns);
    if (done.publicLine) publics.push(done.publicLine);
  }

  const skeptic = DEBATE_ROLES.find((agent) => agent.role === 'skeptic');
  const skepticBudget = Math.min(roleCap, Math.max(0, earlyPool - tokens));
  if (skeptic && skepticBudget > 0) {
    const done = await runAgent(
      skeptic,
      input,
      publics.join('\n'),
      maxToolRounds,
      skepticBudget,
    );
    tokens += done.tokens;
    turns.push(...done.turns);
    if (done.publicLine) publics.push(done.publicLine);
  }

  const judge = DEBATE_ROLES.find((agent) => agent.role === 'judge');
  if (judge) {
    const done = await runAgent(
      judge,
      input,
      publics.join('\n'),
      maxToolRounds,
      judgeReserve,
    );
    tokens += done.tokens;
    turns.push(...done.turns);
  }

  const verdict = readVerdict(turns);
  const served: string[] = [];
  for (const turn of turns) {
    if (turn.provider && !served.includes(turn.provider))
      served.push(turn.provider);
  }
  return {
    turns,
    verdict,
    tokens,
    provider: served.join(', ') || 'mock:mock',
  };
}

async function runAgent(
  agent: (typeof DEBATE_ROLES)[number],
  input: DebateInput,
  transcript: string,
  maxToolRounds: number,
  maxTokens: number,
): Promise<{
  turns: DebateTurn[];
  publicLine: string;
  tokens: number;
  providerId: string;
}> {
  const turns: DebateTurn[] = [];
  const page = input.pageContext?.trim();
  const messages: ChatMessage[] = [
    { role: 'system', content: agent.system },
    {
      role: 'user',
      content: page
        ? `productId=${input.productId}\nPAGE_CONTEXT:\n${page}\nTRANSCRIPT:\n${transcript || '(empty)'}`
        : `productId=${input.productId}\nTRANSCRIPT:\n${transcript || '(empty)'}`,
    },
  ];
  const provider = input.providers?.[agent.role] ?? input.provider;
  let tokens = 0;
  let rounds = 0;
  let servedBy = provider.id.includes(' → ') ? 'unknown' : provider.id;
  while (rounds < maxToolRounds && tokens < maxTokens) {
    rounds += 1;
    const completion = await provider.complete({
      messages,
      tools: agent.tools,
    });
    tokens += completion.tokens;
    servedBy = completion.servedBy ?? servedBy;
    if (completion.toolCalls.length === 0) {
      turns.push({
        role: agent.role,
        kind: 'message',
        content: completion.content,
        provider: servedBy,
      });
      return {
        turns,
        publicLine: `${agent.role}: ${completion.content}`,
        tokens,
        providerId: servedBy,
      };
    }
    messages.push({
      role: 'assistant',
      content: completion.content,
      toolCalls: completion.toolCalls,
    });
    for (const call of completion.toolCalls) {
      turns.push({
        role: agent.role,
        kind: 'tool_call',
        content: JSON.stringify(call.arguments),
        toolName: call.name,
        provider: servedBy,
      });
      const handler = input.tools[call.name];
      const result = handler
        ? await handler(call.arguments)
        : { error: 'unknown_tool' };
      const text = JSON.stringify(result);
      messages.push({
        role: 'tool',
        name: call.name,
        toolCallId: call.id,
        content: text,
      });
      turns.push({
        role: agent.role,
        kind: 'tool_result',
        content: text,
        toolName: call.name,
        provider: servedBy,
      });
    }
  }
  return { turns, publicLine: '', tokens, providerId: servedBy };
}

function readVerdict(turns: DebateTurn[]): Verdict {
  const message = [...turns]
    .reverse()
    .find((turn) => turn.role === 'judge' && turn.kind === 'message');
  if (!message) {
    return {
      score: 0,
      recommendation: 'wait',
      explanationAr: 'الحكم ما خلّصش.',
      explanationEn: 'The judge did not finish.',
    };
  }
  try {
    const parsed = JSON.parse(message.content) as Partial<Verdict>;
    const recommendation =
      parsed.recommendation === 'buy_now' || parsed.recommendation === 'skip'
        ? parsed.recommendation
        : 'wait';
    const score = Math.max(
      0,
      Math.min(100, Math.round(Number(parsed.score ?? 0))),
    );
    return {
      score,
      recommendation,
      explanationAr: String(parsed.explanationAr ?? ''),
      explanationEn: String(parsed.explanationEn ?? ''),
    };
  } catch {
    return {
      score: 50,
      recommendation: 'wait',
      explanationAr: message.content,
      explanationEn: message.content,
    };
  }
}
