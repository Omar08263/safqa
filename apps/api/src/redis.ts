import Redis from 'ioredis';

export function createRedis(url = process.env.REDIS_URL): Redis | null {
  if (!url) return null;
  return new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: true });
}

export async function publishUserEvent(redis: Redis | null, userId: string, event: unknown): Promise<void> {
  if (!redis) return;
  try {
    await redis.publish(`safqa:user:${userId}`, JSON.stringify(event));
  } catch (error) {
    console.warn('redis publish failed', error instanceof Error ? error.message : error);
  }
}

export function userChannel(userId: string): string {
  return `safqa:user:${userId}`;
}
