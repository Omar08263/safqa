import type { RobotsCache } from './types';

export interface RobotGroup {
  agents: string[];
  rules: Array<{ allow: boolean; path: string }>;
}

export interface RobotsRules {
  groups: RobotGroup[];
}

export function parseRobots(text: string): RobotsRules {
  const groups: RobotGroup[] = [];
  let current: RobotGroup | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === 'user-agent') {
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      continue;
    }
    if (!current) continue;
    if (field === 'allow') current.rules.push({ allow: true, path: value });
    if (field === 'disallow') current.rules.push({ allow: false, path: value });
  }
  return { groups };
}

function pickGroup(rules: RobotsRules, userAgent: string): RobotGroup | null {
  const ua = userAgent.toLowerCase();
  const specific = rules.groups.find((group) =>
    group.agents.some((agent) => agent !== '*' && ua.includes(agent)),
  );
  if (specific?.agents.some((agent) => agent !== '*' && ua.includes(agent))) {
    return specific;
  }
  return rules.groups.find((group) => group.agents.includes('*')) ?? null;
}

/** Longest matching path wins. On a tie, Allow wins. Empty Disallow means allow all. */
export function robotsAllows(rules: RobotsRules, path: string, userAgent: string): boolean {
  const group = pickGroup(rules, userAgent);
  if (!group) return true;
  let winner: { allow: boolean; length: number } | null = null;
  for (const rule of group.rules) {
    if (!rule.path) continue;
    if (!path.startsWith(rule.path)) continue;
    const length = rule.path.length;
    if (!winner || length > winner.length || (length === winner.length && rule.allow && !winner.allow)) {
      winner = { allow: rule.allow, length };
    }
  }
  return winner ? winner.allow : true;
}

export class MemoryRobotsCache implements RobotsCache {
  private readonly cache = new Map<string, { expires: number; rules: RobotsRules | null }>();

  constructor(private readonly now: () => number = Date.now) {}

  async isAllowed(url: string, userAgent: string, fetchImpl: typeof fetch): Promise<boolean> {
    const parsed = new URL(url);
    const origin = parsed.origin;
    const cached = this.cache.get(origin);
    let rules: RobotsRules | null;
    if (cached && cached.expires > this.now()) {
      rules = cached.rules;
    } else {
      rules = await this.load(origin, userAgent, fetchImpl);
      this.cache.set(origin, { rules, expires: this.now() + 12 * 60 * 60 * 1000 });
    }
    if (!rules) return true;
    return robotsAllows(rules, parsed.pathname || '/', userAgent);
  }

  private async load(origin: string, userAgent: string, fetchImpl: typeof fetch): Promise<RobotsRules | null> {
    try {
      const response = await fetchImpl(`${origin}/robots.txt`, {
        headers: { 'User-Agent': userAgent, Accept: 'text/plain' },
        redirect: 'follow',
      });
      if (!response.ok) return null;
      return parseRobots(await response.text());
    } catch {
      return null;
    }
  }
}
