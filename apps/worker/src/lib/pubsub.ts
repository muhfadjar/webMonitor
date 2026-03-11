import Redis from 'ioredis'
import type { SiteDiscoveryEvent } from '@webmonitor/shared'

const publisher = new Redis({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD,
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
  lazyConnect: true,
})

publisher.on('error', (err: Error) => {
  console.error('[pubsub] Redis error:', err.message)
})

export function siteChannel(siteId: string): string {
  return `site:${siteId}:progress`
}

export async function publishEvent(event: SiteDiscoveryEvent): Promise<void> {
  try {
    await publisher.publish(siteChannel(event.siteId), JSON.stringify(event))
  } catch (err) {
    // Non-fatal: SSE is best-effort
    console.warn('[pubsub] Publish failed:', (err as Error).message)
  }
}
