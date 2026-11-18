import { createHash } from 'node:crypto';
import { MemoryRateLimiter } from './rate-limit';
import { MemoryRobotsCache } from './robots';
import {
  BlockedBySite,
  RobotsDisallowed,
  SAFQA_USER_AGENT,
  type CrawlContext,
} from './types';

export function hashContent(html: string): string {
  return createHash('sha256').update(html).digest('hex');
}

const sharedLimiter = new MemoryRateLimiter();
const sharedRobots = new MemoryRobotsCache();

export function isBlockedResponse(status: number, html: string): boolean {
  if (status === 403 || status === 429) return true;
  const head = html.slice(0, 5000).toLowerCase();
  return /captcha|cf-challenge|are you a human|are you human|robot check|px-captcha|bot detection/.test(
    head,
  );
}

/**
 * One polite GET. Checks robots.txt, waits for the per-host gap, sends a
 * clear user agent, and refuses to continue when the site shows a bot check.
 * There is no second identity, no header rotation, and no captcha path.
 */
export async function fetchPage(url: string, ctx: CrawlContext, minIntervalMs: number): Promise<string> {
  const fetchImpl = ctx.fetchImpl ?? fetch;
  const userAgent = ctx.userAgent || SAFQA_USER_AGENT;
  const robots = ctx.robots ?? sharedRobots;
  const limiter = ctx.limiter ?? sharedLimiter;
  const allowed = await robots.isAllowed(url, userAgent, fetchImpl);
  if (!allowed) throw new RobotsDisallowed(url);
  await limiter.take(new URL(url).hostname, minIntervalMs);
  const response = await fetchImpl(url, {
    headers: {
      'User-Agent': userAgent,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'ar-EG,ar;q=0.9,en;q=0.8',
    },
    redirect: 'follow',
    signal: ctx.signal ?? AbortSignal.timeout(12_000),
  });
  const html = await response.text();
  if (isBlockedResponse(response.status, html)) {
    throw new BlockedBySite(url, response.status);
  }
  if (!response.ok) {
    throw new Error(`Fetch failed for ${url} with HTTP ${response.status}`);
  }
  return html;
}
