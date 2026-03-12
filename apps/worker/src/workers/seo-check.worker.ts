import { Worker, type Job } from 'bullmq'
import { QUEUES } from '@webmonitor/shared'
import type { SeoCheckJobData } from '@webmonitor/shared'
import { connection } from '../queues'
import { db } from '../lib/db'
import { fetchPage } from '../lib/http'
import { analyzeSeo } from '../lib/seo-analyzer'

const CONCURRENCY = Number(process.env.SEO_CHECK_CONCURRENCY ?? 10)

export const seoCheckWorker = new Worker<SeoCheckJobData, void, string>(
  QUEUES.SEO_CHECK,
  processJob,
  { connection, concurrency: CONCURRENCY }
)

seoCheckWorker.on('failed', (job, err) => {
  console.error(`[seo-check] Job ${job?.id} failed:`, err.message)
})

async function processJob(job: Job<SeoCheckJobData>): Promise<void> {
  const { pageId, siteId, url } = job.data

  const result = await fetchPage(url)

  if (result.error || !result.body) {
    console.warn(`[seo-check] Skipping ${url}: ${result.error ?? 'no body'}`)
    return
  }

  const analysis = analyzeSeo(result.body)

  await db.seoCheck.create({
    data: {
      pageId,
      siteId,
      score: analysis.score,
      issues: analysis.issues as object[],
      title: analysis.title,
      description: analysis.description,
      h1Count: analysis.h1Count,
      canonicalUrl: analysis.canonicalUrl,
      hasViewport: analysis.hasViewport,
      hasOgTags: analysis.hasOgTags,
      hasSchema: analysis.hasSchema,
      imagesMissingAlt: analysis.imagesMissingAlt,
      isIndexable: analysis.isIndexable,
    },
  })

  await db.page.update({
    where: { id: pageId },
    data: {
      seoScore: analysis.score,
      lastSeoCheckedAt: new Date(),
    },
  })
}
