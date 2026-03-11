import { NextResponse } from 'next/server'
import { withAuthAndErrors } from '@/lib/api-helpers'
import { db } from '@/lib/db'

export const GET = withAuthAndErrors(async () => {
  const servers = await db.server.findMany({
    orderBy: { ipAddress: 'asc' },
    include: { _count: { select: { sites: true } } },
  })

  const data = servers.map((s) => ({
    id: s.id,
    ipAddress: s.ipAddress,
    name: s.name,
    siteCount: s._count.sites,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  }))

  return NextResponse.json({ data })
})
