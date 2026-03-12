import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { formatDate, formatResponseTime, timeAgo } from '@/lib/utils'
import { PrintButton } from '@/components/PrintButton'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { siteId: string } }) {
  const site = await db.site.findUnique({ where: { id: params.siteId }, select: { domain: true, displayName: true } })
  return { title: `Report – ${site?.displayName ?? site?.domain ?? 'Site'}` }
}

export default async function SiteReportPage({ params }: { params: { siteId: string } }) {
  const site = await db.site.findUnique({
    where: { id: params.siteId },
    include: {
      siteChecks: { orderBy: { checkedAt: 'desc' }, take: 20 },
      sslCertificates: { orderBy: { checkedAt: 'desc' }, take: 1 },
      robotsEntries: { orderBy: { fetchedAt: 'desc' }, take: 1 },
      server: { select: { ipAddress: true, name: true } },
      _count: { select: { pages: true } },
    },
  })
  if (!site) notFound()

  // Page counts
  const [pagesUp, pagesDown, pagesError, pagesPending, pagesWithSecurityIssues] = await Promise.all([
    db.page.count({ where: { siteId: site.id, status: 'UP' } }),
    db.page.count({ where: { siteId: site.id, status: 'DOWN' } }),
    db.page.count({ where: { siteId: site.id, status: 'ERROR' } }),
    db.page.count({ where: { siteId: site.id, status: 'PENDING' } }),
    db.page.count({ where: { siteId: site.id, hasSecurityIssues: true } }),
  ])

  // Security findings
  const securityFindings = pagesWithSecurityIssues > 0
    ? await db.pageCheck.findMany({
        where: { siteId: site.id, NOT: { securityIssues: { equals: Prisma.DbNull } } },
        orderBy: { checkedAt: 'desc' },
        take: 50,
        select: {
          securityIssues: true,
          checkedAt: true,
          page: { select: { url: true } },
        },
      })
    : []

  // Pages with issues (DOWN or ERROR)
  const issuePages = await db.page.findMany({
    where: { siteId: site.id, status: { in: ['DOWN', 'ERROR'] } },
    orderBy: { url: 'asc' },
    take: 200,
    include: {
      pageChecks: {
        orderBy: { checkedAt: 'desc' },
        take: 1,
        select: { httpStatus: true, responseTimeMs: true, errorMessage: true, checkedAt: true },
      },
    },
  })

  // Uptime calculations
  const now = Date.now()
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000)
  const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000)

  const [total7d, up7d, total30d, up30d] = await Promise.all([
    db.siteCheck.count({ where: { siteId: site.id, checkedAt: { gte: since7d } } }),
    db.siteCheck.count({ where: { siteId: site.id, checkedAt: { gte: since7d }, isReachable: true } }),
    db.siteCheck.count({ where: { siteId: site.id, checkedAt: { gte: since30d } } }),
    db.siteCheck.count({ where: { siteId: site.id, checkedAt: { gte: since30d }, isReachable: true } }),
  ])

  const uptime7d = total7d > 0 ? (up7d / total7d) * 100 : null
  const uptime30d = total30d > 0 ? (up30d / total30d) * 100 : null

  const avgResponseMs =
    site.siteChecks.length > 0
      ? Math.round(
          site.siteChecks.reduce((s, c) => s + (c.responseTimeMs ?? 0), 0) / site.siteChecks.length
        )
      : null

  const latestSsl = site.sslCertificates[0]
  const latestRobots = site.robotsEntries[0]
  const totalPages = site._count.pages
  const pagesChecked = pagesUp + pagesDown + pagesError

  const reportDate = new Date().toLocaleString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  const statusColor = {
    ACTIVE: 'text-green-700',
    ERROR: 'text-red-700',
    PENDING: 'text-yellow-700',
    PAUSED: 'text-gray-500',
  }[site.status]

  return (
    <>
      {/* Print styles — hide controls, force page breaks */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .page-break { page-break-before: always; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="min-h-screen bg-white text-gray-900">
        {/* Toolbar — hidden when printing */}
        <div className="no-print border-b bg-gray-50 px-8 py-3 flex items-center gap-4">
          <Link href={`/sites/${site.id}`} className="text-sm text-blue-600 hover:underline">
            ← Back to site
          </Link>
          <span className="text-gray-300">|</span>
          <span className="text-sm text-gray-500">Site Report</span>
          <div className="ml-auto">
            <PrintButton />
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-8 py-10 space-y-8">
          {/* ── Report Header ─────────────────────────────────────────── */}
          <div className="flex items-start justify-between border-b-2 border-gray-900 pb-6">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">
                Site Health Report
              </div>
              <h1 className="text-3xl font-bold text-gray-900">
                {site.displayName ?? site.domain}
              </h1>
              {site.displayName && (
                <p className="text-gray-500 mt-0.5">{site.domain}</p>
              )}
            </div>
            <div className="text-right text-sm text-gray-500">
              <p className="font-medium text-gray-700">{reportDate}</p>
              {site.server && (
                <p className="font-mono mt-1">
                  {site.server.name ? `${site.server.name} ` : ''}
                  {site.server.ipAddress}
                </p>
              )}
            </div>
          </div>

          {/* ── Status Summary ────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <SummaryCard
              label="Site Status"
              value={site.status}
              valueClass={statusColor}
            />
            <SummaryCard
              label="7-Day Uptime"
              value={uptime7d !== null ? `${uptime7d.toFixed(1)}%` : 'N/A'}
              valueClass={
                uptime7d === null ? 'text-gray-400'
                : uptime7d >= 99 ? 'text-green-700'
                : uptime7d >= 95 ? 'text-yellow-700'
                : 'text-red-700'
              }
            />
            <SummaryCard
              label="30-Day Uptime"
              value={uptime30d !== null ? `${uptime30d.toFixed(1)}%` : 'N/A'}
              valueClass={
                uptime30d === null ? 'text-gray-400'
                : uptime30d >= 99 ? 'text-green-700'
                : uptime30d >= 95 ? 'text-yellow-700'
                : 'text-red-700'
              }
            />
            <SummaryCard
              label="Avg Response"
              value={avgResponseMs !== null ? formatResponseTime(avgResponseMs) : 'N/A'}
              valueClass="text-gray-900"
            />
          </div>

          {/* ── SSL + Monitoring Info ─────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* SSL */}
            <section className="border border-gray-200 rounded-lg p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
                SSL Certificate
              </h2>
              {latestSsl ? (
                <div className="space-y-1.5 text-sm">
                  <Row label="Valid">
                    <span className={latestSsl.isValid ? 'text-green-700 font-medium' : 'text-red-700 font-medium'}>
                      {latestSsl.isValid ? 'Yes' : 'No'}
                    </span>
                  </Row>
                  {latestSsl.daysUntilExpiry !== null && (
                    <Row label="Expires in">
                      <span className={
                        (latestSsl.daysUntilExpiry ?? 999) <= 14 ? 'text-red-700 font-medium'
                        : (latestSsl.daysUntilExpiry ?? 999) <= 30 ? 'text-yellow-700 font-medium'
                        : 'text-gray-900'
                      }>
                        {latestSsl.daysUntilExpiry} days
                      </span>
                    </Row>
                  )}
                  {latestSsl.validTo && <Row label="Expiry date">{formatDate(latestSsl.validTo)}</Row>}
                  {latestSsl.issuer && <Row label="Issuer">{latestSsl.issuer}</Row>}
                  {latestSsl.protocol && <Row label="Protocol">{latestSsl.protocol}</Row>}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No SSL data available</p>
              )}
            </section>

            {/* Monitoring config */}
            <section className="border border-gray-200 rounded-lg p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
                Monitoring Configuration
              </h2>
              <div className="space-y-1.5 text-sm">
                <Row label="Site check interval">{site.checkIntervalMinutes} min</Row>
                <Row label="Page check interval">{site.pageCheckIntervalMinutes} min</Row>
                <Row label="Last checked">{timeAgo(site.lastCheckedAt)}</Row>
                {latestRobots && (
                  <Row label="robots.txt">
                    <span className={latestRobots.isAccessible ? 'text-green-700' : 'text-red-700'}>
                      {latestRobots.isAccessible ? 'Accessible' : 'Not accessible'}
                    </span>
                  </Row>
                )}
                {latestRobots?.sitemapUrls && latestRobots.sitemapUrls.length > 0 && (
                  <Row label="Sitemaps">{latestRobots.sitemapUrls.length} listed</Row>
                )}
              </div>
            </section>
          </div>

          {/* ── Pages Summary ─────────────────────────────────────────── */}
          <section className="border border-gray-200 rounded-lg p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-4">
              Pages Summary
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-5">
              <PageStat label="Total" value={totalPages} color="text-gray-900" />
              <PageStat label="UP" value={pagesUp} color="text-green-700" />
              <PageStat label="DOWN" value={pagesDown} color="text-red-700" />
              <PageStat label="ERROR" value={pagesError} color="text-orange-700" />
              <PageStat label="PENDING" value={pagesPending} color="text-gray-400" />
            </div>
            {pagesChecked > 0 && (
              <div>
                <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
                  {pagesUp > 0 && (
                    <div
                      className="bg-green-500"
                      style={{ width: `${(pagesUp / pagesChecked) * 100}%` }}
                    />
                  )}
                  {pagesDown > 0 && (
                    <div
                      className="bg-red-500"
                      style={{ width: `${(pagesDown / pagesChecked) * 100}%` }}
                    />
                  )}
                  {pagesError > 0 && (
                    <div
                      className="bg-orange-400"
                      style={{ width: `${(pagesError / pagesChecked) * 100}%` }}
                    />
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1.5">
                  {pagesChecked} of {totalPages} pages checked
                  {pagesChecked > 0 && ` · ${((pagesUp / pagesChecked) * 100).toFixed(1)}% healthy`}
                </p>
              </div>
            )}
          </section>

          {/* ── Issue Pages ───────────────────────────────────────────── */}
          {issuePages.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
                Pages with Issues ({issuePages.length})
              </h2>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-4 py-2.5 text-left font-semibold text-gray-600 text-xs">URL</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600 text-xs w-20">Status</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600 text-xs w-16">HTTP</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600 text-xs w-24">Last Check</th>
                    </tr>
                  </thead>
                  <tbody>
                    {issuePages.map((page, i) => {
                      const check = page.pageChecks[0]
                      return (
                        <tr key={page.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                          <td className="px-4 py-2 text-xs font-mono text-gray-700 break-all max-w-xs">
                            {page.url}
                          </td>
                          <td className="px-3 py-2 text-xs font-semibold">
                            <span className={page.status === 'DOWN' ? 'text-red-700' : 'text-orange-700'}>
                              {page.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500 tabular-nums">
                            {check?.httpStatus ?? '—'}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-400 whitespace-nowrap">
                            {check ? timeAgo(check.checkedAt) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ── All Pages List ────────────────────────────────────────── */}
          <section className="page-break">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
              All Pages ({totalPages})
            </h2>
            {totalPages === 0 ? (
              <p className="text-sm text-gray-400">No pages indexed yet.</p>
            ) : (
              <AllPagesTable siteId={site.id} />
            )}
          </section>

          {/* ── Security Findings ────────────────────────────────────── */}
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
              Security Scan
            </h2>
            {pagesWithSecurityIssues === 0 ? (
              <div className="border border-green-200 bg-green-50 rounded-lg px-5 py-4 text-sm text-green-700 font-medium">
                No security issues detected across all pages.
              </div>
            ) : (
              <div className="border border-red-200 rounded-lg overflow-hidden">
                <div className="bg-red-50 px-5 py-3 border-b border-red-200">
                  <span className="text-sm font-semibold text-red-700">
                    {pagesWithSecurityIssues} page{pagesWithSecurityIssues !== 1 ? 's' : ''} flagged with security issues
                  </span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-4 py-2.5 text-left font-semibold text-gray-600 text-xs">Page</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600 text-xs w-32">Type</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600 text-xs">Detail</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600 text-xs w-24">Detected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {securityFindings.map((f, fi) => {
                      const issues = f.securityIssues as Array<{ type: string; detail: string }> | null ?? []
                      return issues.map((issue, ii) => (
                        <tr key={`${fi}-${ii}`} className={fi % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                          <td className="px-4 py-2 text-xs font-mono text-gray-600 break-all max-w-[200px]">
                            {f.page.url}
                          </td>
                          <td className="px-3 py-2 text-xs font-semibold text-red-700 whitespace-nowrap">
                            {issue.type.replace(/_/g, ' ')}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-700">{issue.detail}</td>
                          <td className="px-3 py-2 text-xs text-gray-400 whitespace-nowrap">
                            {timeAgo(f.checkedAt)}
                          </td>
                        </tr>
                      ))
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── Recent Site Checks ────────────────────────────────────── */}
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
              Recent Site Checks
            </h2>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-600 text-xs">Time</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-gray-600 text-xs">Reachable</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-gray-600 text-xs">HTTP</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-gray-600 text-xs">Response</th>
                  </tr>
                </thead>
                <tbody>
                  {site.siteChecks.map((c, i) => (
                    <tr key={c.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className="px-4 py-2 text-xs text-gray-500">{timeAgo(c.checkedAt)}</td>
                      <td className="px-3 py-2 text-xs font-semibold">
                        <span className={c.isReachable ? 'text-green-700' : 'text-red-700'}>
                          {c.isReachable ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500 tabular-nums">
                        {c.httpStatus ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500 tabular-nums">
                        {formatResponseTime(c.responseTimeMs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Footer */}
          <div className="border-t border-gray-200 pt-4 text-xs text-gray-400 flex justify-between">
            <span>WebMonitor · {site.domain} · © {new Date().getFullYear()} <a href="https://github.com/muhfadjar/webMonitor" target="_blank" rel="noopener noreferrer" className="hover:underline">muhfadjar</a></span>
            <span>{reportDate}</span>
          </div>
        </div>
      </div>
    </>
  )
}

async function AllPagesTable({ siteId }: { siteId: string }) {
  const pages = await db.page.findMany({
    where: { siteId },
    orderBy: { url: 'asc' },
    take: 500,
    include: {
      pageChecks: {
        orderBy: { checkedAt: 'desc' },
        take: 1,
        select: { httpStatus: true, responseTimeMs: true, checkedAt: true },
      },
    },
  })

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-4 py-2.5 text-left font-semibold text-gray-600 text-xs">URL</th>
            <th className="px-3 py-2.5 text-left font-semibold text-gray-600 text-xs w-20">Status</th>
            <th className="px-3 py-2.5 text-left font-semibold text-gray-600 text-xs w-16">HTTP</th>
            <th className="px-3 py-2.5 text-left font-semibold text-gray-600 text-xs w-24">Response</th>
            <th className="px-3 py-2.5 text-left font-semibold text-gray-600 text-xs w-28">Last Check</th>
          </tr>
        </thead>
        <tbody>
          {pages.map((page, i) => {
            const check = page.pageChecks[0]
            const statusColors: Record<string, string> = {
              UP: 'text-green-700',
              DOWN: 'text-red-700',
              ERROR: 'text-orange-700',
              REDIRECT: 'text-blue-700',
              PENDING: 'text-gray-400',
            }
            return (
              <tr key={page.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                <td className="px-4 py-1.5 text-xs font-mono text-gray-700 break-all">{page.url}</td>
                <td className={`px-3 py-1.5 text-xs font-semibold ${statusColors[page.status] ?? 'text-gray-500'}`}>
                  {page.status}
                </td>
                <td className="px-3 py-1.5 text-xs text-gray-500 tabular-nums">
                  {check?.httpStatus ?? '—'}
                </td>
                <td className="px-3 py-1.5 text-xs text-gray-500 tabular-nums">
                  {check ? formatResponseTime(check.responseTimeMs) : '—'}
                </td>
                <td className="px-3 py-1.5 text-xs text-gray-400 whitespace-nowrap">
                  {check ? timeAgo(check.checkedAt) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {pages.length === 500 && (
        <p className="px-4 py-2 text-xs text-gray-400 bg-gray-50 border-t border-gray-200">
          Showing first 500 pages
        </p>
      )}
    </div>
  )
}

function SummaryCard({ label, value, valueClass }: { label: string; value: string; valueClass: string }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-xl font-bold ${valueClass}`}>{value}</p>
    </div>
  )
}

function PageStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{label}</p>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-gray-400 shrink-0">{label}</span>
      <span className="text-gray-900 text-right">{children}</span>
    </div>
  )
}
