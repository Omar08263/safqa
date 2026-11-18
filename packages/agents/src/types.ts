export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface ToolSpec {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface Completion {
  content: string;
  toolCalls: ToolCall[];
  tokens: number;
  /** provider:model that produced this completion, not the fallback chain. */
  servedBy?: string;
}

export interface LlmProvider {
  /** Model id, or a fallback chain joined with " → ". */
  id: string;
  /** Providers tried, in order, when this is a fallback chain. */
  chain?: string[];
  complete(input: {
    messages: ChatMessage[];
    tools?: ToolSpec[];
    signal?: AbortSignal;
  }): Promise<Completion>;
}

export type AgentRole = 'historian' | 'market' | 'trust' | 'skeptic' | 'judge';

export type Recommendation = 'buy_now' | 'wait' | 'skip';

export interface DebateTurn {
  role: AgentRole;
  kind: 'message' | 'tool_call' | 'tool_result';
  content: string;
  toolName?: string;
  /** provider:model that wrote this turn. */
  provider?: string;
}

export interface Verdict {
  score: number;
  recommendation: Recommendation;
  explanationAr: string;
  explanationEn: string;
}

export interface DebateResult {
  turns: DebateTurn[];
  verdict: Verdict;
  tokens: number;
  provider: string;
}

export type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;
