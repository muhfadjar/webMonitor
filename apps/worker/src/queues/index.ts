import { Queue } from 'bullmq'
import { QUEUES } from '@webmonitor/shared'
import type {
  SiteDiscoveryJobData,
  PageCheckJobData,
  SslCheckJobData,
  SchedulerJobData,
} from '@webmonitor/shared'

export const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null as null,
  enableReadyCheck: false,
}

export const siteDiscoveryQueue = new Queue<SiteDiscoveryJobData, unknown, string>(
  QUEUES.SITE_DISCOVERY, { connection }
)

export const pageCheckQueue = new Queue<PageCheckJobData, unknown, string>(
  QUEUES.PAGE_CHECK, { connection }
)

export const sslCheckQueue = new Queue<SslCheckJobData, unknown, string>(
  QUEUES.SSL_CHECK, { connection }
)

export const schedulerQueue = new Queue<SchedulerJobData, unknown, string>(
  QUEUES.SCHEDULER, { connection }
)
