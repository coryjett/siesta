import Redis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

let redis: Redis | null = null;
let redisAvailable = true;

function getRedis(): Redis | null {
  if (!redisAvailable) return null;

  if (!redis) {
    redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      retryStrategy(times) {
        if (times > 3) {
          redisAvailable = false;
          logger.warn('Redis unavailable after 3 retries, falling back to direct calls');
          return null;
        }
        return Math.min(times * 200, 2000);
      },
    });

    redis.on('error', (err) => {
      logger.warn({ err: err.message }, 'Redis connection error');
    });

    redis.on('connect', () => {
      redisAvailable = true;
      logger.info('Redis connected');
    });

    redis.connect().catch(() => {
      redisAvailable = false;
    });
  }

  return redis;
}

/**
 * Execute a function with Redis caching. If Redis is unavailable, calls fn() directly.
 */
export async function cachedCall<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
  const client = getRedis();

  if (client && redisAvailable) {
    try {
      const cached = await client.get(key);
      if (cached) {
        return JSON.parse(cached) as T;
      }
    } catch {
      // Redis read failed, fall through to fn()
    }
  }

  const result = await fn();

  if (client && redisAvailable) {
    try {
      await client.set(key, JSON.stringify(result), 'EX', ttlSeconds);
    } catch {
      // Redis write failed, result still returned
    }
  }

  return result;
}

/**
 * Invalidate cached entries matching a glob pattern.
 */
/**
 * Returns the raw ioredis client (or null if not initialized).
 */
export function getRedisClient(): Redis | null {
  return getRedis();
}

/**
 * Returns whether Redis is currently available.
 */
export function isRedisAvailable(): boolean {
  return redisAvailable;
}

export async function invalidateCache(pattern: string): Promise<void> {
  const client = getRedis();
  if (!client || !redisAvailable) return;

  try {
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(...keys);
    }
  } catch {
    // Ignore invalidation failures
  }
}
