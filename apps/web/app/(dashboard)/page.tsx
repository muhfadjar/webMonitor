import Link from 'next/link'
import { db } from '@/lib/db'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SiteStatusBadge } from '@/components/StatusBadge'
import { SslBadge } from '@/components/SslBadge'
import { formatResponseTime, timeAgo } from '@/lib/utils'

export const metadata = { title: 'Dashboard' }
export const dynamic = 'force-dynamic'

async function getStats() {
  const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  const [totalSites, sitesDown, totalPages, pagesDown, sslExpiringSoon] = await Promise.all([
    db.site.count({ where: { status: { in: ['ACTIVE', 'ERROR'] } } }),
    db.site.count({ where: { status: 'ERROR' } }),
    db.page.count({ where: { status: { not: 'PENDING' } } }),
    db.page.count({ where: { status: { in: ['DOWN', 'ERROR'] } } }),
    db.sslCertificate.count({ where: { validTo: { lte: thirtyDaysFromNow }, isValid: true } }),
  ])
  return { totalSites, sitesUp: totalSites - sitesDown, sitesDown, totalPages, pagesDown, sslExpiringSoon }
}

async function getRecentSites() {
  return db.site.findMany({
    orderBy: { lastCheckedAt: { sort: 'desc', nulls: 'last' } },
    take: 10,
    include: {
      siteChecks: {
        orderBy: { checkedAt: 'desc' },
        take: 1,
        select: { responseTimeMs: true, isReachable: true, httpStatus: true },
      },
      sslCertificates: {
        orderBy: { checkedAt: 'desc' },
        take: 1,
        select: { isValid: true, daysUntilExpiry: true },
      },
    },
  })
}

export default async function DashboardPage() {
  const [stats, sites] = await Promise.all([getStats(), getRecentSites()])

  const statCards = [
    { label: 'Total Sites', value: stats.totalSites, sub: `${stats.sitesDown} with errors` },
    { label: 'Sites Up', value: stats.sitesUp, sub: `of ${stats.totalSites} monitored` },
    { label: 'Total Pages', value: stats.totalPages, sub: `${stats.pagesDown} down` },
    { label: 'SSL Expiring', value: stats.sslExpiringSoon, sub: 'within 30 days' },
  ]

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Overview of all monitored websites</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Recent Sites</CardTitle>
          <Link href="/sites" className="text-sm text-primary hover:underline">View all →</Link>
        </CardHeader>
        <CardContent className="p-0">
          {sites.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-muted-foreground">
              No sites yet.{' '}
              <Link href="/sites/new" className="text-primary underline">Add your first site →</Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-6 py-3 text-left font-medium text-muted-foreground">Domain</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Response</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">SSL</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Last Check</th>
                  </tr>
                </thead>
                <tbody>
                  {sites.map((site) => {
                    const check = site.siteChecks[0]
                    const ssl = site.sslCertificates[0]
                    return (
                      <tr key={site.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-6 py-3">
                          <Link href={`/sites/${site.id}`} className="font-medium hover:underline">
                            {site.displayName ?? site.domain}
                          </Link>
                          {site.displayName && (
                            <p className="text-xs text-muted-foreground">{site.domain}</p>
                          )}
                        </td>
                        <td className="px-4 py-3"><SiteStatusBadge status={site.status} /></td>
                        <td className="px-4 py-3 tabular-nums text-muted-foreground">
                          {check ? formatResponseTime(check.responseTimeMs) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <SslBadge isValid={ssl?.isValid ?? null} daysUntilExpiry={ssl?.daysUntilExpiry ?? null} />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{timeAgo(site.lastCheckedAt)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
