import { Queue } from 'bullmq'
import { QUEUES, JOB_PRIORITY } from '@webmonitor/shared'
import type {
  SiteDiscoveryJobData,
  PageCheckJobData,
  SslCheckJobData,
  SeoCheckJobData,
} from '@webmonitor/shared'

// BullMQ accepts a connection URL string directly — avoids ioredis version conflicts
const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null as null,
  enableReadyCheck: false,
}

const defaultJobOptions = {
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 100 },
}

// Type queues with explicit string name type to satisfy BullMQ v5 generics
export const siteDiscoveryQueue = new Queue<SiteDiscoveryJobData, unknown, string>(
  QUEUES.SITE_DISCOVERY,
  { connection, defaultJobOptions }
)

export const pageCheckQueue = new Queue<PageCheckJobData, unknown, string>(
  QUEUES.PAGE_CHECK,
  {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 2000 },
      removeOnFail: { count: 200 },
    },
  }
)

export const sslCheckQueue = new Queue<SslCheckJobData, unknown, string>(
  QUEUES.SSL_CHECK,
  { connection, defaultJobOptions }
)

export const seoCheckQueue = new Queue<SeoCheckJobData, unknown, string>(
  QUEUES.SEO_CHECK,
  { connection, defaultJobOptions }
)

// Re-export priority levels for convenience in route handlers
export { JOB_PRIORITY }
