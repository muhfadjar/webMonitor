import { NextResponse } from 'next/server'
import { withAuthAndErrors } from '@/lib/api-helpers'
import { db } from '@/lib/db'
import { seoCheckQueue, JOB_PRIORITY } from '@/lib/queues'
import { z } from 'zod'

const BodySchema = z.object({
  pageIds: z.array(z.string().uuid()).min(1).max(500),
})

export const POST = withAuthAndErrors(async (req, { params }) => {
  const body = await req.json()
  const { pageIds } = BodySchema.parse(body)

  const pages = await db.page.findMany({
    where: { id: { in: pageIds }, siteId: params['siteId'] },
    select: { id: true, siteId: true, url: true },
  })

  if (pages.length === 0) {
    return NextResponse.json({ error: 'No matching pages found' }, { status: 404 })
  }

  const jobs = pages.map((page) => ({
    name: `seo-analyze:${page.id}:${Date.now()}`,
    data: { pageId: page.id, siteId: page.siteId, url: page.url },
    opts: { priority: JOB_PRIORITY.HIGH },
  }))

  await seoCheckQueue.addBulk(jobs)

  return NextResponse.json(
    { queued: pages.length, message: `${pages.length} SEO check${pages.length !== 1 ? 's' : ''} queued` },
    { status: 202 }
  )
})
