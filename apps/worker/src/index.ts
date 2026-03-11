import type { SchedulerJobData } from '@webmonitor/shared'
import { schedulerQueue } from './queues'

// Import workers (side-effect: registers BullMQ workers)
import { siteDiscoveryWorker } from './workers/site-discovery.worker'
import { pageCheckWorker } from './workers/page-check.worker'
import { sslCheckWorker } from './workers/ssl-check.worker'
import { schedulerWorker } from './workers/scheduler.worker'

const TICK_CRON = process.env.SCHEDULER_TICK_CRON ?? '* * * * *'         // every 1 min
const PAGE_TICK_CRON = process.env.SCHEDULER_PAGE_CRON ?? '*/5 * * * *'  // every 5 min
const SSL_SCAN_CRON = process.env.SCHEDULER_SSL_CRON ?? '0 2 * * *'      // 02:00 daily
const CLEANUP_CRON = process.env.SCHEDULER_CLEANUP_CRON ?? '30 3 * * *'  // 03:30 daily

async function registerRepeatableJobs(): Promise<void> {
  await schedulerQueue.add(
    'check-due-sites',
    { type: 'check-due-sites' } satisfies SchedulerJobData,
    { repeat: { pattern: TICK_CRON }, jobId: 'scheduler:tick' }
  )

  await schedulerQueue.add(
    'check-due-pages',
    { type: 'check-due-pages' } satisfies SchedulerJobData,
    { repeat: { pattern: PAGE_TICK_CRON }, jobId: 'scheduler:page-tick' }
  )

  await schedulerQueue.add(
    'check-expiring-ssl',
    { type: 'check-expiring-ssl' } satisfies SchedulerJobData,
    { repeat: { pattern: SSL_SCAN_CRON }, jobId: 'scheduler:ssl-scan' }
  )

  await schedulerQueue.add(
    'cleanup-old-checks',
    { type: 'cleanup-old-checks' } satisfies SchedulerJobData,
    { repeat: { pattern: CLEANUP_CRON }, jobId: 'scheduler:cleanup' }
  )

  console.log('[bootstrap] Repeatable scheduler jobs registered')
}

async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`[bootstrap] ${signal} received — shutting down workers…`)

  await Promise.all([
    siteDiscoveryWorker.close(),
    pageCheckWorker.close(),
    sslCheckWorker.close(),
    schedulerWorker.close(),
  ])

  console.log('[bootstrap] All workers closed. Exiting.')
  process.exit(0)
}

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => void gracefulShutdown('SIGINT'))

async function main(): Promise<void> {
  console.log('[bootstrap] Starting WebMonitor worker…')
  console.log(`[bootstrap] Redis: ${process.env.REDIS_HOST ?? 'localhost'}:${process.env.REDIS_PORT ?? 6379}`)

  await registerRepeatableJobs()

  console.log('[bootstrap] Workers active:')
  console.log('  • site-discovery')
  console.log('  • page-check')
  console.log('  • ssl-check')
  console.log('  • scheduler')
}

main().catch((err) => {
  console.error('[bootstrap] Fatal error:', err)
  process.exit(1)
})
