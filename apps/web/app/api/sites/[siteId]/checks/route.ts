import { NextResponse } from 'next/server'
import { withAuthAndErrors, parseSearchParams } from '@/lib/api-helpers'
import { db } from '@/lib/db'
import { CheckHistorySchema } from '@/lib/validators'

export const GET = withAuthAndErrors(async (req, { params }) => {
  const query = CheckHistorySchema.parse(parseSearchParams(req))

  const checks = await db.siteCheck.findMany({
    where: {
      siteId: params['siteId'],
      ...(query.from && { checkedAt: { gte: new Date(query.from) } }),
      ...(query.to && { checkedAt: { lte: new Date(query.to) } }),
    },
    orderBy: { checkedAt: 'desc' },
    take: query.limit,
    select: {
      id: true,
      checkedAt: true,
      httpStatus: true,
      responseTimeMs: true,
      isReachable: true,
      redirectUrl: true,
      serverHeader: true,
      contentType: true,
      errorMessage: true,
    },
  })

  return NextResponse.json({ data: checks })
})
