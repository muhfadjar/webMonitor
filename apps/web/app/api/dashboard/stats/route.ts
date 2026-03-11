import { NextResponse } from 'next/server'
import { withAuthAndErrors } from '@/lib/api-helpers'
import { db } from '@/lib/db'

export const GET = withAuthAndErrors(async () => {
  const thirtyDaysFromNow = new Date()
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)

  const [
    totalSites,
    sitesDown,
    totalPages,
    pagesDown,
    sslExpiringSoon,
    avgResponseTime,
  ] = await Promise.all([
    db.site.count({ where: { status: { in: ['ACTIVE', 'ERROR'] } } }),
    db.site.count({ where: { status: 'ERROR' } }),
    db.page.count({ where: { status: { not: 'PENDING' } } }),
    db.page.count({ where: { status: { in: ['DOWN', 'ERROR'] } } }),
    db.sslCertificate.count({
      where: {
        validTo: { lte: thirtyDaysFromNow },
        isValid: true,
      },
    }),
    db.siteCheck.aggregate({
      _avg: { responseTimeMs: true },
      where: { checkedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    }),
  ])

  return NextResponse.json({
    totalSites,
    sitesUp: totalSites - sitesDown,
    sitesDown,
    totalPages,
    pagesUp: totalPages - pagesDown,
    pagesDown,
    sslExpiringSoon,
    avgResponseTimeMs: Math.round(avgResponseTime._avg.responseTimeMs ?? 0),
  })
})
