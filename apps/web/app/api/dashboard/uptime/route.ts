import { NextResponse } from 'next/server'
import { withAuthAndErrors, parseSearchParams } from '@/lib/api-helpers'
import { db } from '@/lib/db'
import { UptimeQuerySchema } from '@/lib/validators'

export const GET = withAuthAndErrors(async (req) => {
  const { days } = UptimeQuerySchema.parse(parseSearchParams(req))
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const sites = await db.site.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, domain: true, displayName: true },
  })

  const uptimeData = await Promise.all(
    sites.map(async (site) => {
      const [total, up] = await Promise.all([
        db.siteCheck.count({ where: { siteId: site.id, checkedAt: { gte: since } } }),
        db.siteCheck.count({
          where: { siteId: site.id, checkedAt: { gte: since }, isReachable: true },
        }),
      ])
      const uptimePercent = total > 0 ? Math.round((up / total) * 100 * 10) / 10 : null
      return { siteId: site.id, domain: site.domain, displayName: site.displayName, uptimePercent, total, up }
    })
  )

  return NextResponse.json({ days, data: uptimeData })
})
