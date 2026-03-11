import { NextRequest, NextResponse } from 'next/server'
import { withAuthAndErrors, notImplemented } from '@/lib/api-helpers'
import { db } from '@/lib/db'
import { UpdateSiteSchema } from '@/lib/validators'

export const GET = withAuthAndErrors(async (_req, { params }) => {
  const site = await db.site.findUnique({
    where: { id: params['siteId'] },
    include: {
      siteChecks: {
        orderBy: { checkedAt: 'desc' },
        take: 1,
      },
      sslCertificates: {
        orderBy: { checkedAt: 'desc' },
        take: 1,
      },
      robotsEntries: {
        orderBy: { fetchedAt: 'desc' },
        take: 1,
        select: { isAccessible: true, sitemapUrls: true, crawlDelay: true },
      },
      _count: {
        select: { pages: true },
      },
    },
  })

  if (!site) {
    return NextResponse.json({ error: 'Site not found' }, { status: 404 })
  }

  const [pagesUp, pagesDown, pagesError, pagesPending] = await Promise.all([
    db.page.count({ where: { siteId: site.id, status: 'UP' } }),
    db.page.count({ where: { siteId: site.id, status: 'DOWN' } }),
    db.page.count({ where: { siteId: site.id, status: 'ERROR' } }),
    db.page.count({ where: { siteId: site.id, status: 'PENDING' } }),
  ])

  return NextResponse.json({
    ...site,
    latestCheck: site.siteChecks[0] ?? null,
    latestSsl: site.sslCertificates[0] ?? null,
    latestRobots: site.robotsEntries[0] ?? null,
    pageStats: {
      total: site._count.pages,
      up: pagesUp,
      down: pagesDown,
      error: pagesError,
      pending: pagesPending,
    },
    siteChecks: undefined,
    sslCertificates: undefined,
    robotsEntries: undefined,
  })
})

export const PATCH = withAuthAndErrors(async (req, { params }) => {
  const body = await req.json()
  const data = UpdateSiteSchema.parse(body)

  const site = await db.site.findUnique({ where: { id: params['siteId'] } })
  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 })

  const updated = await db.site.update({
    where: { id: params['siteId'] },
    data,
  })

  return NextResponse.json(updated)
})

export const DELETE = withAuthAndErrors(async (_req, { params }) => {
  const site = await db.site.findUnique({ where: { id: params['siteId'] } })
  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 })

  await db.site.delete({ where: { id: params['siteId'] } })

  return new NextResponse(null, { status: 204 })
})
