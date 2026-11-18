import type Redis from 'ioredis';

export async function withCache<T>(
  redis: Redis | null,
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>,
): Promise<T> {
  if (redis && redis.status === 'ready') {
    try {
      const hit = await redis.get(key);
      if (hit) return JSON.parse(hit) as T;
    } catch {
      // A bad cache entry should not take the request down.
    }
  }
  const value = await load();
  if (redis && redis.status === 'ready') {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds).catch(() => undefined);
  }
  return value;
}
