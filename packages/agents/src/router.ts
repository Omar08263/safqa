import { DailyQuotaError } from './limit';
import { LlmAbortError, LlmHttpError, LlmTimeoutError } from './provider';
import type { ChatMessage, Completion, LlmProvider, ToolSpec } from './types';

export interface RouteEndpoint {
  id: string;
  providerId: string;
  model: string;
  provider: LlmProvider;
  /** Shared bucket id. Gemini models share one cap; OpenRouter free models share one cap. */
  quotaKey: string;
  dailyCap: number | null;
}

interface EndpointState {
  endpoint: RouteEndpoint;
  /** 0 is the strongest entry in the chain. */
  rank: number;
  ewmaMs: number;
  samples: number;
  circuit: 'closed' | 'open';
  openUntil: number;
  nextProbeAt: number;
  successes: number;
  failures: number;
  inFlight: number;
  lastError: string | null;
}

interface QuotaBucket {
  used: number;
  cap: number | null;
  day: string;
}

export type ChainHealth =
  | 'healthy'
  | 'open'
  | 'probing'
  | 'quota'
  | 'unconfigured';

export interface RouterEndpointStat {
  id: string;
  provider: string;
  model: string;
  rank: number;
  health: ChainHealth;
  circuit: 'closed' | 'open';
  ewmaMs: number;
  dailyUsed: number;
  dailyCap: number | null;
  successes: number;
  failures: number;
  inFlight: number;
  lastError: string | null;
}

export interface RouterOptions {
  now?: () => number;
  timeoutMs?: number;
  cooldownMs?: number;
  probeMs?: number;
}

/**
 * One ranked chain. The highest healthy idle model wins. Parallel roles take
 * the next idle entry so they do not pile onto the same model. Any error,
 * 429, 503, or timeout opens that model's circuit. After the probe interval
 * one call tries it again, and a success moves traffic back up the chain.
 */
export class ModelRouter {
  private readonly states: EndpointState[];
  private readonly quotas = new Map<string, QuotaBucket>();
  private now: () => number;

  readonly timeoutMs: number;
  readonly cooldownMs: number;
  readonly probeMs: number;

  constructor(
    endpoints: RouteEndpoint[],
    private readonly pins: Record<string, string> = {},
    options: RouterOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.cooldownMs = options.cooldownMs ?? 60_000;
    this.probeMs = options.probeMs ?? 20_000;
    this.states = endpoints.map((endpoint, rank) => ({
      endpoint,
      rank,
      ewmaMs: 0,
      samples: 0,
      circuit: 'closed',
      openUntil: 0,
      nextProbeAt: 0,
      successes: 0,
      failures: 0,
      inFlight: 0,
      lastError: null,
    }));
  }

  endpointIds(): string[] {
    return this.states.map((state) => state.endpoint.model);
  }

  stats(): RouterEndpointStat[] {
    const at = this.now();
    return this.states.map((state) => {
      const quota = this.bucket(state.endpoint, at);
      return {
        id: state.endpoint.id,
        provider: state.endpoint.providerId,
        model: state.endpoint.model,
        rank: state.rank + 1,
        health: this.health(state, at),
        circuit: this.health(state, at) === 'healthy' ? 'closed' : 'open',
        ewmaMs: Math.round(state.ewmaMs),
        dailyUsed: quota.used,
        dailyCap: quota.cap,
        successes: state.successes,
        failures: state.failures,
        inFlight: state.inFlight,
        lastError: state.lastError,
      };
    });
  }

  /** Highest healthy idle model. A due probe outranks every lower entry. */
  pick(role: string, exclude: Set<string> = new Set()): EndpointState | null {
    const at = this.now();
    const pin = this.pins[role];
    if (pin) {
      const pinned = this.states.find(
        (state) =>
          !exclude.has(state.endpoint.id) &&
          (state.endpoint.id === pin || state.endpoint.model === pin) &&
          (this.healthy(state, at) || this.probing(state, at)),
      );
      if (pinned) return this.claimProbe(pinned, at);
    }
    const idle = this.states.filter(
      (state) => !exclude.has(state.endpoint.id) && state.inFlight === 0,
    );
    const probe = idle.find((state) => this.probing(state, at));
    if (probe) return this.claimProbe(probe, at);
    const best = idle.find((state) => this.healthy(state, at));
    if (best) return best;
    return (
      this.states.find(
        (state) => !exclude.has(state.endpoint.id) && this.healthy(state, at),
      ) ?? null
    );
  }

  async complete(
    role: string,
    input: { messages: ChatMessage[]; tools?: ToolSpec[] },
  ): Promise<Completion> {
    const tried = new Set<string>();
    let last: unknown;
    for (let attempt = 0; attempt < this.states.length; attempt += 1) {
      const state = this.pick(role, tried);
      if (!state) break;
      tried.add(state.endpoint.id);
      const ctrl = new AbortController();
      try {
        return await this.invoke(state, input, ctrl.signal);
      } catch (error) {
        if (error instanceof LlmAbortError) continue;
        last = error;
      }
    }
    throw last instanceof Error ? last : new Error('No model is available');
  }

  private claimProbe(state: EndpointState, at: number): EndpointState {
    if (this.probing(state, at)) state.nextProbeAt = state.openUntil;
    return state;
  }

  private async invoke(
    state: EndpointState,
    input: { messages: ChatMessage[]; tools?: ToolSpec[] },
    signal: AbortSignal,
  ): Promise<Completion> {
    state.inFlight += 1;
    const started = this.now();
    try {
      const result = await raceCall(
        state.endpoint.provider.complete({ ...input, signal }),
        signal,
        this.timeoutMs,
      );
      if (signal.aborted) throw new LlmAbortError();
      this.succeed(state, Math.max(0, this.now() - started));
      return {
        ...result,
        servedBy: `${state.endpoint.providerId}:${state.endpoint.model}`,
      };
    } catch (error) {
      if (signal.aborted || error instanceof LlmAbortError) {
        this.consume(state.endpoint);
        throw new LlmAbortError();
      }
      this.fail(state, error);
      throw error;
    } finally {
      state.inFlight = Math.max(0, state.inFlight - 1);
    }
  }

  private healthy(state: EndpointState, at: number): boolean {
    return this.health(state, at) === 'healthy';
  }

  private probing(state: EndpointState, at: number): boolean {
    return this.health(state, at) === 'probing' && state.inFlight === 0;
  }

  private health(state: EndpointState, at: number): ChainHealth {
    const quota = this.bucket(state.endpoint, at);
    if (quota.cap != null && quota.used >= quota.cap) return 'quota';
    if (state.circuit === 'open' && at < state.openUntil) {
      return at >= state.nextProbeAt ? 'probing' : 'open';
    }
    return 'healthy';
  }

  private succeed(state: EndpointState, elapsed: number): void {
    state.successes += 1;
    state.samples += 1;
    state.ewmaMs =
      state.samples === 1 ? elapsed : state.ewmaMs * 0.7 + elapsed * 0.3;
    state.circuit = 'closed';
    state.openUntil = 0;
    state.nextProbeAt = 0;
    state.lastError = null;
    this.consume(state.endpoint);
  }

  private fail(state: EndpointState, error: unknown): void {
    state.failures += 1;
    state.lastError = error instanceof Error ? error.message : 'error';
    if (error instanceof DailyQuotaError) {
      const quota = this.bucket(state.endpoint, this.now());
      if (quota.cap != null) quota.used = quota.cap;
      return;
    }
    const at = this.now();
    state.circuit = 'open';
    state.openUntil = at + this.cooldownMs;
    state.nextProbeAt = at + this.probeMs;
    const status = statusOf(error);
    if (status === 429 || status === 503 || error instanceof LlmTimeoutError) {
      this.consume(state.endpoint);
    }
  }

  private bucket(endpoint: RouteEndpoint, at: number): QuotaBucket {
    const day = pacificDay(at);
    const existing = this.quotas.get(endpoint.quotaKey);
    if (!existing || existing.day !== day) {
      const created = { used: 0, cap: endpoint.dailyCap, day };
      this.quotas.set(endpoint.quotaKey, created);
      return created;
    }
    return existing;
  }

  private consume(endpoint: RouteEndpoint): void {
    const quota = this.bucket(endpoint, this.now());
    quota.used += 1;
  }
}

export function statusOf(error: unknown): number | null {
  if (error instanceof LlmHttpError) return error.status;
  return null;
}

function pacificDay(at: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(at));
}

const routers = new Map<string, ModelRouter>();

export function routerFor(
  signature: string,
  endpoints: RouteEndpoint[],
  pins: Record<string, string> = {},
  options: RouterOptions = {},
): ModelRouter {
  const existing = routers.get(signature);
  if (existing) return existing;
  const created = new ModelRouter(endpoints, pins, options);
  routers.set(signature, created);
  return created;
}

function raceCall<T>(
  work: Promise<T>,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new LlmTimeoutError(timeoutMs)),
      timeoutMs,
    );
    const onAbort = () => {
      clearTimeout(timer);
      reject(new LlmAbortError());
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(
      (value) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}
