/** Thrown when today's free-tier request cap is already used. Callers should fall through. */
export class DailyQuotaError extends Error {
  constructor(readonly limit: number) {
    super(`Daily request cap of ${limit} is already used`);
    this.name = 'DailyQuotaError';
  }
}

export interface RequestLimiter {
  acquire(): Promise<void>;
}

/**
 * Serial queue plus a one-minute window and a Pacific-midnight daily cap.
 * Requests wait for a free RPM slot. They do not wait until tomorrow: a full
 * day throws so the next provider can take the call.
 */
export function createRequestLimiter(options: {
  rpm: number;
  rpd: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): RequestLimiter {
  const rpm = Math.max(1, options.rpm);
  const rpd = Math.max(1, options.rpd);
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const stamps: number[] = [];
  let dayKey = '';
  let dayCount = 0;
  let tail: Promise<void> = Promise.resolve();

  async function once(): Promise<void> {
    for (;;) {
      const at = now();
      const key = pacificDay(at);
      if (key !== dayKey) {
        dayKey = key;
        dayCount = 0;
      }
      const recent = stamps.filter((stamp) => at - stamp < 60_000);
      stamps.length = 0;
      stamps.push(...recent);
      if (dayCount >= rpd) throw new DailyQuotaError(rpd);
      if (stamps.length < rpm) {
        stamps.push(at);
        dayCount += 1;
        return;
      }
      const oldest = stamps[0] ?? at;
      await sleep(Math.max(1, 60_000 - (at - oldest) + 20));
    }
  }

  return {
    acquire() {
      const run = tail.then(once, once);
      tail = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };
}

const shared = new Map<string, RequestLimiter>();

export function sharedLimiter(
  name: string,
  rpm: number,
  rpd: number,
): RequestLimiter {
  const key = `${name}:${rpm}:${rpd}`;
  const existing = shared.get(key);
  if (existing) return existing;
  const created = createRequestLimiter({ rpm, rpd });
  shared.set(key, created);
  return created;
}

function pacificDay(at: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(at));
}
