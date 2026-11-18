import { describe, expect, it } from 'vitest';
import { MemoryRateLimiter } from './rate-limit';
import { fetchPage, isBlockedResponse } from './fetch';
import { parseRobots, robotsAllows } from './robots';
import { BlockedBySite, RobotsDisallowed, SAFQA_USER_AGENT } from './types';

const ROBOTS = `
User-agent: *
Disallow: /account
Allow: /account/public

User-agent: SafqaBot
Disallow: /private
Allow: /private/help
Crawl-delay: 10
`;

describe('robots', () => {
  it('lets the longest rule win and prefers allow on a tie', () => {
    const rules = parseRobots(ROBOTS);
    expect(robotsAllows(rules, '/account/orders', 'Mozilla')).toBe(false);
    expect(robotsAllows(rules, '/account/public', 'Mozilla')).toBe(true);
    expect(robotsAllows(rules, '/product/1', 'Mozilla')).toBe(true);
  });

  it('uses the SafqaBot group when the user agent identifies itself', () => {
    const rules = parseRobots(ROBOTS);
    expect(robotsAllows(rules, '/private/listing', SAFQA_USER_AGENT)).toBe(false);
    expect(robotsAllows(rules, '/private/help', SAFQA_USER_AGENT)).toBe(true);
    expect(robotsAllows(rules, '/account/orders', SAFQA_USER_AGENT)).toBe(true);
  });
});

describe('polite fetch', () => {
  it('does not fetch a page robots.txt disallows, and does not retry a bot check', async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith('/robots.txt')) {
        return new Response('User-agent: *\nDisallow: /secret\n', { status: 200 });
      }
      return new Response('<html>captcha required</html>', { status: 200 });
    };
    await expect(
      fetchPage('https://shop.example/secret/item', { userAgent: SAFQA_USER_AGENT, fetchImpl }, 0),
    ).rejects.toBeInstanceOf(RobotsDisallowed);
    expect(calls).toEqual(['https://shop.example/robots.txt']);

    await expect(
      fetchPage('https://shop.example/p/1', { userAgent: SAFQA_USER_AGENT, fetchImpl }, 0),
    ).rejects.toBeInstanceOf(BlockedBySite);
    expect(isBlockedResponse(403, '<html></html>')).toBe(true);
    expect(isBlockedResponse(200, '<html>hello</html>')).toBe(false);
  });

  it('spaces requests to the same host', async () => {
    let clock = 1_000;
    const waits: number[] = [];
    const limiter = new MemoryRateLimiter(
      () => clock,
      async (ms) => {
        waits.push(ms);
        clock += ms;
      },
    );
    await limiter.take('amazon.eg', 8000);
    await limiter.take('amazon.eg', 8000);
    await limiter.take('noon.com', 5000);
    expect(waits).toEqual([8000]);
  });
});
