import { Worker, type Job } from 'bullmq'
import crypto from 'crypto'
import { QUEUES } from '@webmonitor/shared'
import type { PageCheckJobData } from '@webmonitor/shared'
import { connection } from '../queues'
import { db } from '../lib/db'
import { fetchPage } from '../lib/http'
import { checkAndTriggerAlerts } from '../lib/alerts'

const CONCURRENCY = Number(process.env.PAGE_CHECK_CONCURRENCY ?? 20)

export const pageCheckWorker = new Worker<PageCheckJobData, void, string>(
  QUEUES.PAGE_CHECK,
  processJob,
  { connection, concurrency: CONCURRENCY }
)

pageCheckWorker.on('failed', (job, err) => {
  console.error(`[page-check] Job ${job?.id} failed:`, err.message)
})

async function processJob(job: Job<PageCheckJobData>): Promise<void> {
  const { pageId, siteId, url } = job.data

  const result = await fetchPage(url)

  const isReachable = !result.error && result.status !== undefined && result.status < 500
  const newStatus = deriveStatus(result)
  const contentHash = result.body ? sha256(result.body) : null
  const title = result.body ? extractTitle(result.body) : null

  // Insert check record
  await db.pageCheck.create({
    data: {
      pageId,
      siteId,
      httpStatus: result.status ?? null,
      responseTimeMs: result.responseTimeMs,
      isReachable,
      redirectUrl: result.finalUrl !== url ? (result.finalUrl ?? null) : null,
      contentHash,
      contentLength: result.body?.length ?? null,
      title,
      errorMessage: result.error ?? null,
    },
  })

  // Get previous status for change detection
  const page = await db.page.findUnique({
    where: { id: pageId },
    select: { status: true },
  })
  const previousStatus = page?.status

  // Update page status
  await db.page.update({
    where: { id: pageId },
    data: { status: newStatus, lastCheckedAt: new Date() },
  })

  // Trigger alerts on status changes
  if (previousStatus && previousStatus !== 'PENDING' && previousStatus !== newStatus) {
    if (newStatus === 'DOWN' || newStatus === 'ERROR') {
      await checkAndTriggerAlerts({
        siteId,
        pageId,
        type: 'PAGE_DOWN',
        details: { url, previousStatus, newStatus, httpStatus: result.status },
      })
    } else {
      await checkAndTriggerAlerts({
        siteId,
        pageId,
        type: 'STATUS_CHANGE',
        details: { url, previousStatus, newStatus },
      })
    }
  }
}

function deriveStatus(
  result: { status?: number; error?: string; finalUrl?: string }
): 'UP' | 'DOWN' | 'REDIRECT' | 'ERROR' {
  if (result.error) return 'ERROR'
  const s = result.status
  if (!s) return 'ERROR'
  if (s >= 200 && s < 300) return 'UP'
  if (s >= 300 && s < 400) return 'REDIRECT'
  if (s >= 400) return 'DOWN'
  return 'ERROR'
}

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex')
}

/** Extract <title> tag from HTML using a simple regex. */
function extractTitle(html: string): string | null {
  const match = /<title[^>]*>([^<]{0,512})<\/title>/i.exec(html)
  if (!match) return null
  return match[1]?.replace(/\s+/g, ' ').trim() ?? null
}
