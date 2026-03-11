import { NextResponse } from 'next/server'
import { withAuthAndErrors, parseSearchParams } from '@/lib/api-helpers'
import { db } from '@/lib/db'
import { z } from 'zod'

const schema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) })

export const GET = withAuthAndErrors(async (req, { params }) => {
  const { limit } = schema.parse(parseSearchParams(req))

  const certs = await db.sslCertificate.findMany({
    where: { siteId: params['siteId'] },
    orderBy: { checkedAt: 'desc' },
    take: limit,
  })

  return NextResponse.json({ data: certs })
})
