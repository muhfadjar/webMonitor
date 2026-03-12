import { notFound } from 'next/navigation'
import Link from 'next/link'
import { db } from '@/lib/db'
import { Card, CardContent } from '@/components/ui/card'
import { PagesTable } from '@/components/PagesTable'
import type { Prisma, PageStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Pages' }

const PAGE_SIZE = 50

type SearchParams = {
  page?: string
  status?: string
  q?: string
}

export default async function SitePagesPage({
  params,
  searchParams,
}: {
  params: { siteId: string }
  searchParams: SearchParams
}) {
  const site = await db.site.findUnique({
    where: { id: params.siteId },
    select: { id: true, domain: true },
  })
  if (!site) notFound()

  const currentPage = Math.max(1, Number(searchParams.page ?? 1))
  const validStatuses: PageStatus[] = ['PENDING', 'UP', 'DOWN', 'REDIRECT', 'ERROR']
  const statusFilter = validStatuses.includes(searchParams.status as PageStatus)
    ? (searchParams.status as PageStatus)
    : undefined
  const query = searchParams.q

  const where: Prisma.PageWhereInput = {
    siteId: site.id,
    ...(statusFilter && { status: statusFilter }),
    ...(query && { url: { contains: query, mode: 'insensitive' } }),
  }

  const [pages, total] = await Promise.all([
    db.page.findMany({
      where,
      orderBy: { url: 'asc' },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
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

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const statuses = ['UP', 'DOWN', 'REDIRECT', 'ERROR', 'PENDING']
  const base = `/sites/${site.id}/pages`

  function buildUrl(overrides: Record<string, string | undefined>) {
    const p = new URLSearchParams()
    const merged = { page: String(currentPage), status: statusFilter, q: query, ...overrides }
    Object.entries(merged).forEach(([k, v]) => { if (v) p.set(k, v) })
    const qs = p.toString()
    return `${base}${qs ? '?' + qs : ''}`
  }

  // Serialize dates for the client component
  const serializedPages = pages.map((p) => ({
    id: p.id,
    url: p.url,
    status: p.status,
    lastCheckedAt: p.lastCheckedAt?.toISOString() ?? null,
    hasSecurityIssues: p.hasSecurityIssues,
    seoScore: p.seoScore,
    pageChecks: p.pageChecks.map((c) => ({
      httpStatus: c.httpStatus,
      responseTimeMs: c.responseTimeMs,
      title: c.title,
    })),
  }))

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Link
          href={buildUrl({ status: undefined, page: '1' })}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${!statusFilter ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-foreground'}`}
        >
          All ({total})
        </Link>
        {statuses.map((s) => (
          <Link
            key={s}
            href={buildUrl({ status: s, page: '1' })}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${statusFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-foreground'}`}
          >
            {s}
          </Link>
        ))}
        <form method="GET" action={base} className="ml-auto flex gap-2">
          {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
          <input
            name="q"
            defaultValue={query}
            placeholder="Search URL…"
            className="h-8 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </form>
      </div>

      {/* Table with checkboxes */}
      <PagesTable siteId={site.id} pages={serializedPages} />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center gap-2 justify-end text-sm">
          <span className="text-muted-foreground">
            Page {currentPage} of {totalPages}
          </span>
          {currentPage > 1 && (
            <Link
              href={buildUrl({ page: String(currentPage - 1) })}
              className="px-3 py-1 rounded border hover:bg-muted transition-colors"
            >
              ←
            </Link>
          )}
          {currentPage < totalPages && (
            <Link
              href={buildUrl({ page: String(currentPage + 1) })}
              className="px-3 py-1 rounded border hover:bg-muted transition-colors"
            >
              →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
