import { NextResponse } from 'next/server'
import { withAuthAndErrors } from '@/lib/api-helpers'
import { db } from '@/lib/db'
import { pageCheckQueue, JOB_PRIORITY } from '@/lib/queues'

export const POST = withAuthAndErrors(async (_req, { params }) => {
  const page = await db.page.findUnique({ where: { id: params['pageId'] } })
  if (!page || page.siteId !== params['siteId']) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 })
  }

  const job = await pageCheckQueue.add(
    `recheck-page:${page.id}:${Date.now()}`,
    { pageId: page.id, siteId: page.siteId, url: page.url },
    { priority: JOB_PRIORITY.CRITICAL }
  )

  return NextResponse.json({ jobId: job.id, message: 'Re-check queued' }, { status: 202 })
})
