import { Worker, type Job } from 'bullmq'
import { QUEUES, JOB_PRIORITY } from '@webmonitor/shared'
import type { SchedulerJobData, SiteDiscoveryJobData, SslCheckJobData, PageCheckJobData, SeoCheckJobData } from '@webmonitor/shared'
import { connection, siteDiscoveryQueue, pageCheckQueue, sslCheckQueue, seoCheckQueue } from '../queues'
import { db } from '../lib/db'

const CONCURRENCY = 1
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
    case 'check-due-pages':
      await runPageTick()
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
 * Enqueue site-discovery jobs for sites overdue for a health check.
 * Uses each site's individual checkIntervalMinutes.
 */
async function runSiteTick(): Promise<void> {
  const now = Date.now()

  const sites = await db.site.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, domain: true, checkIntervalMinutes: true, lastCheckedAt: true },
  })

  const due = sites.filter(
    (s) =>
      !s.lastCheckedAt ||
      now - s.lastCheckedAt.getTime() >= s.checkIntervalMinutes * 60 * 1000
  )

  if (due.length === 0) return

  const jobs = due.map((site) => ({
    name: `discover:${site.id}`,
    data: { siteId: site.id, domain: site.domain } satisfies SiteDiscoveryJobData,
    opts: { priority: JOB_PRIORITY.NORMAL },
  }))

  await siteDiscoveryQueue.addBulk(jobs)
  console.log(`[scheduler] site-tick: enqueued ${jobs.length} site-discovery jobs`)
}

/**
 * Enqueue page-check jobs for pages overdue for a check.
 * Uses each site's individual pageCheckIntervalMinutes.
 */
async function runPageTick(): Promise<void> {
  const now = Date.now()

  const sites = await db.site.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      pageCheckIntervalMinutes: true,
      pages: {
        where: { status: { not: 'PENDING' } },
        select: { id: true, url: true, siteId: true, lastCheckedAt: true, lastSeoCheckedAt: true },
      },
    },
  })

  const pageJobs: Array<{ name: string; data: PageCheckJobData; opts: { priority: number } }> = []
  const seoJobs: Array<{ name: string; data: SeoCheckJobData; opts: { priority: number } }> = []
  const SEO_INTERVAL_MS = 24 * 60 * 60 * 1000 // re-analyze SEO at most once per 24h per page

  for (const site of sites) {
    const intervalMs = site.pageCheckIntervalMinutes * 60 * 1000
    for (const page of site.pages) {
      const isDue =
        !page.lastCheckedAt ||
        now - page.lastCheckedAt.getTime() >= intervalMs

      if (isDue) {
        pageJobs.push({
          name: `page-check:${page.id}`,
          data: { pageId: page.id, siteId: page.siteId, url: page.url },
          opts: { priority: JOB_PRIORITY.LOW },
        })

        const seoIsDue =
          !page.lastSeoCheckedAt ||
          now - page.lastSeoCheckedAt.getTime() >= SEO_INTERVAL_MS

        if (seoIsDue) {
          seoJobs.push({
            name: `seo-tick:${page.id}`,
            data: { pageId: page.id, siteId: page.siteId, url: page.url },
            opts: { priority: JOB_PRIORITY.LOW },
          })
        }
      }
    }
  }

  if (pageJobs.length === 0) return

  await pageCheckQueue.addBulk(pageJobs)
  if (seoJobs.length > 0) await seoCheckQueue.addBulk(seoJobs)
  console.log(`[scheduler] page-tick: enqueued ${pageJobs.length} page-check, ${seoJobs.length} seo-check jobs`)
}

/**
 * Enqueue ssl-check jobs for certs expiring within SSL_EXPIRY_WARN_DAYS.
 */
async function runSslScan(): Promise<void> {
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
