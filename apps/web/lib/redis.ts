import Redis from 'ioredis'

/** Shared read-only Redis client for pub/sub subscriptions. */
export function createSubscriber(): Redis {
  return new Redis({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
    lazyConnect: true,
  })
}

export function siteChannel(siteId: string): string {
  return `site:${siteId}:progress`
}
