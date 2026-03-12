import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { seoCheckQueue, JOB_PRIORITY } from '@/lib/queues'

type Params = { siteId: string; pageId: string }

// POST /api/sites/:siteId/pages/:pageId/seo-check — enqueue SEO check
export async function POST(_req: Request, { params }: { params: Params }) {
  const { siteId, pageId } = params

  const page = await db.page.findFirst({
    where: { id: pageId, siteId },
    select: { id: true, url: true },
  })

  if (!page) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 })
  }

  await seoCheckQueue.add(
    `seo:${page.id}`,
    { pageId: page.id, siteId, url: page.url },
    { priority: JOB_PRIORITY.HIGH }
  )

  return NextResponse.json({ queued: true })
}

// GET /api/sites/:siteId/pages/:pageId/seo-check — fetch latest result
export async function GET(_req: Request, { params }: { params: Params }) {
  const { siteId, pageId } = params

  const check = await db.seoCheck.findFirst({
    where: { pageId, siteId },
    orderBy: { checkedAt: 'desc' },
  })

  if (!check) {
    return NextResponse.json({ check: null })
  }

  return NextResponse.json({
    check: {
      ...check,
      checkedAt: check.checkedAt.toISOString(),
    },
  })
}
