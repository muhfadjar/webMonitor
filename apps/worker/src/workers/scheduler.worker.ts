import { Worker, type Job } from 'bullmq'
import { QUEUES, JOB_PRIORITY } from '@webmonitor/shared'
import type { SchedulerJobData, SiteDiscoveryJobData, SslCheckJobData } from '@webmonitor/shared'
import { connection, siteDiscoveryQueue, sslCheckQueue } from '../queues'
import { db } from '../lib/db'

const CONCURRENCY = 1
const SITE_CHECK_INTERVAL_MINUTES = Number(process.env.SITE_CHECK_INTERVAL_MINUTES ?? 60)
const SSL_EXPIRY_WARN_DAYS = 30
const RETENTION_DAYS = Number(process.env.RETENTION_DAYS ?? 90)

export const schedulerWorker = new Worker<SchedulerJobData, void, string>(
  QUEUES.SCHEDULER,
  processJob,
  { connection, concurrency: CONCURRENCY }
)

schedulerWorker.on('failed', (job, err) => {
  console.error(`[scheduler] Job ${job?.id} failed:`, err.message)
})

async function processJob(job: Job<SchedulerJobData>): Promise<void> {
  const { type } = job.data

  switch (type) {
    case 'check-due-sites':
      await runSiteTick()
      break
    case 'check-expiring-ssl':
      await runSslScan()
      break
    case 'cleanup-old-checks':
      await runCleanup()
      break
    default:
      console.warn(`[scheduler] Unknown type: ${type}`)
  }
}

/**
 * Enqueue site-discovery jobs for sites that are overdue for a check.
 */
async function runSiteTick(): Promise<void> {
  const overdueThreshold = new Date(
    Date.now() - SITE_CHECK_INTERVAL_MINUTES * 60 * 1000
  )

  const sites = await db.site.findMany({
    where: {
      status: 'ACTIVE',
      OR: [
        { lastCheckedAt: null },
        { lastCheckedAt: { lte: overdueThreshold } },
      ],
    },
    select: { id: true, domain: true },
  })

  if (sites.length === 0) return

  const jobs = sites.map((site) => ({
    name: `discover:${site.id}`,
    data: { siteId: site.id, domain: site.domain } satisfies SiteDiscoveryJobData,
    opts: { priority: JOB_PRIORITY.NORMAL },
  }))

  await siteDiscoveryQueue.addBulk(jobs)
  console.log(`[scheduler] tick: enqueued ${jobs.length} site-discovery jobs`)
}

/**
 * Enqueue ssl-check jobs for certs expiring within SSL_EXPIRY_WARN_DAYS.
 */
async function runSslScan(): Promise<void> {
  // Find sites whose latest SSL cert is expiring soon (or has never been checked)
  const sites = await db.site.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      domain: true,
      sslCertificates: {
        orderBy: { checkedAt: 'desc' },
        take: 1,
        select: { daysUntilExpiry: true, checkedAt: true },
      },
    },
  })

  const sslJobs: Array<{ name: string; data: SslCheckJobData; opts: { priority: number } }> = []

  for (const site of sites) {
    const latest = site.sslCertificates[0]
    const neverChecked = !latest
    const expiringSoon =
      latest?.daysUntilExpiry !== null &&
      latest?.daysUntilExpiry !== undefined &&
      latest.daysUntilExpiry <= SSL_EXPIRY_WARN_DAYS

    if (neverChecked || expiringSoon) {
      sslJobs.push({
        name: `ssl:${site.id}`,
        data: { siteId: site.id, domain: site.domain },
        opts: { priority: JOB_PRIORITY.LOW },
      })
    }
  }

  if (sslJobs.length === 0) return

  await sslCheckQueue.addBulk(sslJobs)
  console.log(`[scheduler] ssl-scan: enqueued ${sslJobs.length} ssl-check jobs`)
}

/**
 * Delete site_checks and page_checks older than RETENTION_DAYS.
 */
async function runCleanup(): Promise<void> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)

  const [deletedSiteChecks, deletedPageChecks] = await Promise.all([
    db.siteCheck.deleteMany({ where: { checkedAt: { lt: cutoff } } }),
    db.pageCheck.deleteMany({ where: { checkedAt: { lt: cutoff } } }),
  ])

  console.log(
    `[scheduler] cleanup: deleted ${deletedSiteChecks.count} site_checks, ` +
      `${deletedPageChecks.count} page_checks older than ${RETENTION_DAYS}d`
  )
}
