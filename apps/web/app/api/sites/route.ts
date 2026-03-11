import { NextRequest, NextResponse } from 'next/server'
import { withAuthAndErrors, notImplemented, parseSearchParams } from '@/lib/api-helpers'
import { db } from '@/lib/db'
import { CreateSiteSchema, SiteListSchema } from '@/lib/validators'
import { siteDiscoveryQueue, JOB_PRIORITY } from '@/lib/queues'
import { auth } from '@/lib/auth'

export const GET = withAuthAndErrors(async (req) => {
  const params = SiteListSchema.parse(parseSearchParams(req))
  const { page, limit, status } = params
  const skip = (page - 1) * limit

  const where = status ? { status } : {}

  const [sites, total] = await Promise.all([
    db.site.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        siteChecks: {
          orderBy: { checkedAt: 'desc' },
          take: 1,
          select: { httpStatus: true, responseTimeMs: true, isReachable: true },
        },
        sslCertificates: {
          orderBy: { checkedAt: 'desc' },
          take: 1,
          select: { isValid: true, daysUntilExpiry: true },
        },
        _count: {
          select: {
            pages: true,
            // pages with status UP
          },
        },
      },
    }),
    db.site.count({ where }),
  ])

  const data = sites.map((site) => ({
    id: site.id,
    domain: site.domain,
    displayName: site.displayName,
    status: site.status,
    checkIntervalMinutes: site.checkIntervalMinutes,
    lastCheckedAt: site.lastCheckedAt,
    createdAt: site.createdAt,
    latestCheck: site.siteChecks[0] ?? null,
    latestSsl: site.sslCertificates[0] ?? null,
    pageCount: site._count.pages,
  }))

  return NextResponse.json({
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  })
})

export const POST = withAuthAndErrors(async (req) => {
  const session = await auth()
  const body = await req.json()
  const { domain, displayName, checkIntervalMinutes } = CreateSiteSchema.parse(body)

  const site = await db.site.create({
    data: {
      domain,
      displayName,
      checkIntervalMinutes,
      createdBy: session!.user.id,
      status: 'PENDING',
    },
  })

  // Enqueue initial discovery job at HIGH priority
  await siteDiscoveryQueue.add(
    `discover:${site.id}`,
    { siteId: site.id, domain },
    { priority: JOB_PRIORITY.HIGH }
  )

  return NextResponse.json(
    { id: site.id, domain: site.domain, status: site.status, createdAt: site.createdAt },
    { status: 201 }
  )
})
