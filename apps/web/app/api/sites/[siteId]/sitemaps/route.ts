import { NextResponse } from 'next/server'
import { withAuthAndErrors } from '@/lib/api-helpers'
import { db } from '@/lib/db'

export const GET = withAuthAndErrors(async (_req, { params }) => {
  // Group pages by sourceSitemap to get unique sitemaps + page count
  const grouped = await db.page.groupBy({
    by: ['sourceSitemap'],
    where: { siteId: params['siteId'], sourceSitemap: { not: null } },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  })

  const data = grouped.map((g) => ({
    url: g.sourceSitemap,
    pageCount: g._count.id,
  }))

  return NextResponse.json({ data })
})
