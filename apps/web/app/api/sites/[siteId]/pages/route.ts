import { NextResponse } from 'next/server'
import { withAuthAndErrors, parseSearchParams, paginatedResponse } from '@/lib/api-helpers'
import { db } from '@/lib/db'
import { PageListSchema } from '@/lib/validators'
import type { Prisma } from '@prisma/client'

export const GET = withAuthAndErrors(async (req, { params }) => {
  const query = PageListSchema.parse(parseSearchParams(req))
  const { page, limit, status, search, sortBy, sortOrder } = query
  const skip = (page - 1) * limit

  const where: Prisma.PageWhereInput = {
    siteId: params['siteId'],
    ...(status && { status }),
    ...(search && { url: { contains: search, mode: 'insensitive' } }),
  }

  const orderBy: Prisma.PageOrderByWithRelationInput =
    sortBy === 'responseTimeMs'
      ? { pageChecks: { _count: sortOrder } } // approximation; Phase 4 will refine
      : { [sortBy]: sortOrder }

  const [pages, total] = await Promise.all([
    db.page.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        pageChecks: {
          orderBy: { checkedAt: 'desc' },
          take: 1,
          select: { httpStatus: true, responseTimeMs: true, title: true },
        },
      },
    }),
    db.page.count({ where }),
  ])

  const data = pages.map((p) => ({
    id: p.id,
    url: p.url,
    path: p.path,
    status: p.status,
    priority: p.priority,
    changeFreq: p.changeFreq,
    lastCheckedAt: p.lastCheckedAt,
    sourceSitemap: p.sourceSitemap,
    latestCheck: p.pageChecks[0] ?? null,
  }))

  return paginatedResponse(data, page, limit, total)
})
