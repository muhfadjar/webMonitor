import { Worker, type Job } from 'bullmq'
import crypto from 'crypto'
import dns from 'dns/promises'
import { URL } from 'url'
import { QUEUES, JOB_PRIORITY } from '@webmonitor/shared'
import type { SiteDiscoveryJobData, PageCheckJobData, SeoCheckJobData } from '@webmonitor/shared'
import { connection, pageCheckQueue, seoCheckQueue } from '../queues'
import { db } from '../lib/db'
import { fetchSiteRoot } from '../lib/http'
import { checkSsl } from '../lib/ssl'
import { parseRobots } from '../lib/robots-parser'
import { crawlSitemaps } from '../lib/sitemap-parser'
import { checkAndTriggerAlerts } from '../lib/alerts'
import { publishEvent } from '../lib/pubsub'

const CONCURRENCY = Number(process.env.SITE_DISCOVERY_CONCURRENCY ?? 5)
const PAGE_BATCH_SIZE = 500
// Fallback sitemap paths tried if robots.txt has none
const SITEMAP_FALLBACKS = ['/sitemap.xml', '/sitemap_index.xml', '/sitemap/sitemap.xml']

export const siteDiscoveryWorker = new Worker<SiteDiscoveryJobData, void, string>(
  QUEUES.SITE_DISCOVERY,
  processJob,
  { connection, concurrency: CONCURRENCY }
)

siteDiscoveryWorker.on('failed', (job, err) => {
  console.error(`[site-discovery] Job ${job?.id} failed:`, err.message)
})

async function processJob(job: Job<SiteDiscoveryJobData>): Promise<void> {
  const { siteId, domain, reindex } = job.data
  const log = (msg: string, extra?: object) =>
    console.log(`[site-discovery] [${job.id}] [${domain}] ${msg}`, extra ?? '')

  log('Starting discovery')

  try {
    // ── Step 1: HTTP site info ───────────────────────────────────────────────
    const rootUrl = `https://${domain}`
    const httpResult = await fetchSiteRoot(rootUrl)

    await db.siteCheck.create({
      data: {
        siteId,
        httpStatus: httpResult.status ?? null,
        responseTimeMs: httpResult.responseTimeMs,
        isReachable: !httpResult.error && httpResult.status !== undefined && httpResult.status < 500,
        redirectUrl: httpResult.finalUrl !== rootUrl ? (httpResult.finalUrl ?? null) : null,
        serverHeader: httpResult.headers?.['server'] ?? null,
        contentType: httpResult.headers?.['content-type'] ?? null,
        xPoweredBy: httpResult.headers?.['x-powered-by'] ?? null,
        errorMessage: httpResult.error ?? null,
        rawHeaders: (httpResult.headers as object) ?? null,
      },
    })

    if (httpResult.error || (httpResult.status && httpResult.status >= 500)) {
      await markSiteError(siteId, httpResult.error ?? `HTTP ${httpResult.status ?? 'error'}`)
      await checkAndTriggerAlerts({ siteId, type: 'SITE_DOWN', details: { reason: httpResult.error } })
      await publishEvent({ type: 'error', siteId, payload: { reason: httpResult.error ?? `HTTP ${httpResult.status}` } })
      return
    }
    log('HTTP check done', { status: httpResult.status, responseTimeMs: httpResult.responseTimeMs })
    await publishEvent({ type: 'http_done', siteId, payload: { status: httpResult.status, responseTimeMs: httpResult.responseTimeMs } })

    // ── Step 1b: Detect server IP and upsert Server record ───────────────────
    try {
      const { address: ipAddress } = await dns.lookup(domain)
      const server = await db.server.upsert({
        where: { ipAddress },
        update: {},
        create: { ipAddress },
      })
      await db.site.update({ where: { id: siteId }, data: { serverId: server.id } })
      log('IP detected', { ipAddress, serverId: server.id })
    } catch (dnsErr) {
      log('DNS lookup failed (non-fatal)', { err: dnsErr instanceof Error ? dnsErr.message : String(dnsErr) })
    }

    // ── Step 2: SSL certificate ──────────────────────────────────────────────
    const sslResult = await checkSsl(domain)
    await db.sslCertificate.create({
      data: {
        siteId,
        isValid: sslResult.isValid,
        issuer: sslResult.issuer,
        subject: sslResult.subject,
        validFrom: sslResult.validFrom,
        validTo: sslResult.validTo,
        daysUntilExpiry: sslResult.daysUntilExpiry,
        serialNumber: sslResult.serialNumber,
        fingerprintSha256: sslResult.fingerprintSha256,
        protocol: sslResult.protocol,
        cipherSuite: sslResult.cipherSuite,
        subjectAltNames: sslResult.subjectAltNames,
        errorMessage: sslResult.errorMessage,
      },
    })
    log('SSL check done', { isValid: sslResult.isValid, daysUntilExpiry: sslResult.daysUntilExpiry })
    await publishEvent({ type: 'ssl_done', siteId, payload: { isValid: sslResult.isValid, daysUntilExpiry: sslResult.daysUntilExpiry } })

    // ── Step 3: robots.txt ───────────────────────────────────────────────────
    const robotsUrl = `https://${domain}/robots.txt`
    const robotsHttp = await fetchSiteRoot(robotsUrl)
    const isAccessible = !robotsHttp.error && robotsHttp.status === 200
    const parsed = isAccessible && robotsHttp.body
      ? parseRobots(robotsHttp.body)
      : { sitemapUrls: [], disallowRules: {}, allowRules: {}, crawlDelay: null, rawContent: null }

    await db.robotsEntry.create({
      data: {
        siteId,
        isAccessible,
        httpStatus: robotsHttp.status ?? null,
        rawContent: parsed.rawContent,
        sitemapUrls: parsed.sitemapUrls,
        disallowRules: parsed.disallowRules as object,
        allowRules: parsed.allowRules as object,
        crawlDelay: parsed.crawlDelay,
        errorMessage: robotsHttp.error ?? null,
      },
    })
    log('robots.txt done', { isAccessible, sitemapsFound: parsed.sitemapUrls.length })
    await publishEvent({ type: 'robots_done', siteId, payload: { isAccessible, sitemapsFound: parsed.sitemapUrls.length } })

    // ── Step 4 + 5: Sitemap crawl ────────────────────────────────────────────
    const seedUrls: string[] =
      parsed.sitemapUrls.length > 0
        ? parsed.sitemapUrls
        : SITEMAP_FALLBACKS.map((p) => `https://${domain}${p}`)

    const { pages, sitemapsFetched } = await crawlSitemaps(seedUrls, domain)
    log('Sitemap crawl done', { pagesFound: pages.length, sitemapsFetched })
    await publishEvent({ type: 'sitemap_fetched', siteId, payload: { pagesFound: pages.length, sitemapsFetched } })

    // ── Step 6: Bulk insert pages ────────────────────────────────────────────
    if (reindex) {
      await db.page.deleteMany({ where: { siteId } })
      log('Existing pages cleared for re-index')
    }

    const pageRecords = pages.map((p) => ({
      siteId,
      url: p.url,
      urlHash: sha256(normalizeUrl(p.url)),
      path: safePathname(p.url),
      sourceSitemap: p.sourceSitemap,
      sitemapChain: p.sitemapChain,
      priority: p.priority,
      changeFreq: p.changeFreq,
      lastModified: p.lastModified,
      status: 'PENDING' as const,
    }))

    let insertedCount = 0
    for (let i = 0; i < pageRecords.length; i += PAGE_BATCH_SIZE) {
      const batch = pageRecords.slice(i, i + PAGE_BATCH_SIZE)
      const result = await db.page.createMany({ data: batch, skipDuplicates: true })
      insertedCount += result.count
    }
    log('Pages inserted', { total: pageRecords.length, newlyInserted: insertedCount })
    await publishEvent({ type: 'pages_indexed', siteId, payload: { total: pageRecords.length, newlyInserted: insertedCount } })

    // ── Step 7: Enqueue page-check jobs for pending pages ────────────────────
    const pendingPages = await db.page.findMany({
      where: { siteId, status: 'PENDING' },
      select: { id: true, url: true },
    })

    if (pendingPages.length > 0) {
      const jobPayloads: Array<{ name: string; data: PageCheckJobData; opts: object }> = []
      for (let i = 0; i < pendingPages.length; i += PAGE_BATCH_SIZE) {
        const batch = pendingPages.slice(i, i + PAGE_BATCH_SIZE)
        for (const page of batch) {
          jobPayloads.push({
            name: `check:${page.id}`,
            data: { pageId: page.id, siteId, url: page.url },
            opts: { priority: JOB_PRIORITY.NORMAL },
          })
        }
      }
      await pageCheckQueue.addBulk(jobPayloads)
      log('Page-check jobs enqueued', { count: jobPayloads.length })
      await publishEvent({ type: 'page_checks_queued', siteId, payload: { count: jobPayloads.length } })

      // Enqueue SEO-check jobs for all discovered pages (low priority — runs after HTTP checks)
      const seoJobPayloads: Array<{ name: string; data: SeoCheckJobData; opts: object }> = []
      for (const page of pendingPages) {
        seoJobPayloads.push({
          name: `seo:${page.id}`,
          data: { pageId: page.id, siteId, url: page.url },
          opts: { priority: JOB_PRIORITY.LOW },
        })
      }
      await seoCheckQueue.addBulk(seoJobPayloads)
      log('SEO-check jobs enqueued', { count: seoJobPayloads.length })
    }

    // ── Step 8: Mark site active ─────────────────────────────────────────────
    await db.site.update({
      where: { id: siteId },
      data: { status: 'ACTIVE', lastCheckedAt: new Date() },
    })
    log('Discovery complete')
    await publishEvent({ type: 'complete', siteId })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[site-discovery] Unexpected error for ${domain}:`, message)
    await markSiteError(siteId, message)
  }
}

async function markSiteError(siteId: string, errorMessage: string): Promise<void> {
  await db.site.update({
    where: { id: siteId },
    data: { status: 'ERROR', lastCheckedAt: new Date() },
  })
  console.error(`[site-discovery] Site ${siteId} marked ERROR: ${errorMessage}`)
}

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex')
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url)
    return u.toString().toLowerCase()
  } catch {
    return url.toLowerCase()
  }
}

function safePathname(url: string): string | null {
  try {
    return new URL(url).pathname
  } catch {
    return null
  }
}
