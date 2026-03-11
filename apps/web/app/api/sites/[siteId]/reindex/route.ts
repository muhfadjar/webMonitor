import { NextResponse } from 'next/server'
import { withAuthAndErrors } from '@/lib/api-helpers'
import { db } from '@/lib/db'
import { siteDiscoveryQueue, JOB_PRIORITY } from '@/lib/queues'

export const POST = withAuthAndErrors(async (_req, { params }) => {
  const site = await db.site.findUnique({ where: { id: params['siteId'] } })
  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 })

  const job = await siteDiscoveryQueue.add(
    `reindex:${site.id}:${Date.now()}`,
    { siteId: site.id, domain: site.domain, reindex: true },
    { priority: JOB_PRIORITY.HIGH }
  )

  return NextResponse.json({ jobId: job.id, message: 'Re-index queued' }, { status: 202 })
})
