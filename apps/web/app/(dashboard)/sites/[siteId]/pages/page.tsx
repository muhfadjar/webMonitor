import { notFound } from 'next/navigation'
import Link from 'next/link'
import { db } from '@/lib/db'
import { Card, CardContent } from '@/components/ui/card'
import { PageStatusBadge } from '@/components/StatusBadge'
import { RecheckButton } from '@/components/RecheckButton'
import { formatResponseTime, timeAgo, truncateUrl } from '@/lib/utils'
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

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {pages.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">No pages found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-6 py-3 text-left font-medium text-muted-foreground">URL</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">HTTP</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Response</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Last Check</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {pages.map((page) => {
                    const check = page.pageChecks[0]
                    return (
                      <tr key={page.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-6 py-2 max-w-xs">
                          <div className="font-mono text-xs text-muted-foreground truncate" title={page.url}>
                            {truncateUrl(page.url, 70)}
                          </div>
                          {check?.title && (
                            <div className="text-xs truncate">{check.title}</div>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <PageStatusBadge status={page.status} />
                        </td>
                        <td className="px-4 py-2 tabular-nums text-muted-foreground">
                          {check?.httpStatus ?? '—'}
                        </td>
                        <td className="px-4 py-2 tabular-nums text-muted-foreground">
                          {check ? formatResponseTime(check.responseTimeMs) : '—'}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {timeAgo(page.lastCheckedAt)}
                        </td>
                        <td className="px-4 py-2">
                          <RecheckButton
                            url={`/api/sites/${site.id}/pages/${page.id}/recheck`}
                            label="Check"
                            size="sm"
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

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
