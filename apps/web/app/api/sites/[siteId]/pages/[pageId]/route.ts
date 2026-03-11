import { NextResponse } from 'next/server'
import { withAuthAndErrors } from '@/lib/api-helpers'
import { db } from '@/lib/db'

export const GET = withAuthAndErrors(async (_req, { params }) => {
  const page = await db.page.findUnique({
    where: { id: params['pageId'] },
    include: {
      pageChecks: {
        orderBy: { checkedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          checkedAt: true,
          httpStatus: true,
          responseTimeMs: true,
          isReachable: true,
          redirectUrl: true,
          contentHash: true,
          title: true,
          errorMessage: true,
        },
      },
    },
  })

  if (!page || page.siteId !== params['siteId']) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 })
  }

  return NextResponse.json(page)
})
