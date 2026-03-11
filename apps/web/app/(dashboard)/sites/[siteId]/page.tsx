import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SslBadge } from '@/components/SslBadge'
import { PageStatusBadge } from '@/components/StatusBadge'
import { RecheckButton } from '@/components/RecheckButton'
import { EditSiteForm } from '@/components/EditSiteForm'
import { formatResponseTime, formatDate, timeAgo } from '@/lib/utils'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { siteId: string } }) {
  const site = await db.site.findUnique({ where: { id: params.siteId }, select: { domain: true, displayName: true } })
  return { title: site?.displayName ?? site?.domain ?? 'Site' }
}

export default async function SiteOverviewPage({ params }: { params: { siteId: string } }) {
  const site = await db.site.findUnique({
    where: { id: params.siteId },
    include: {
      siteChecks: { orderBy: { checkedAt: 'desc' }, take: 10 },
      sslCertificates: { orderBy: { checkedAt: 'desc' }, take: 1 },
      robotsEntries: { orderBy: { fetchedAt: 'desc' }, take: 1 },
      server: { select: { id: true, ipAddress: true, name: true } },
      _count: { select: { pages: true } },
    },
  })
  if (!site) notFound()

  const latestCheck = site.siteChecks[0]
  const latestSsl = site.sslCertificates[0]
  const latestRobots = site.robotsEntries[0]

  const [pagesUp, pagesDown, pagesError] = await Promise.all([
    db.page.count({ where: { siteId: site.id, status: 'UP' } }),
    db.page.count({ where: { siteId: site.id, status: 'DOWN' } }),
    db.page.count({ where: { siteId: site.id, status: 'ERROR' } }),
  ])

  return (
    <div className="space-y-6">
      {/* Action bar */}
      <div className="flex flex-wrap gap-2 items-start">
        <RecheckButton url={`/api/sites/${site.id}/recheck`} label="Re-check now" />
        <RecheckButton url={`/api/sites/${site.id}/reindex`} label="Re-index pages" />
        <EditSiteForm
          siteId={site.id}
          initialValues={{
            displayName: site.displayName,
            checkIntervalMinutes: site.checkIntervalMinutes,
            pageCheckIntervalMinutes: site.pageCheckIntervalMinutes,
          }}
        />
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* HTTP */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Last HTTP Check</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {latestCheck ? (
              <>
                <p className="text-2xl font-bold">{latestCheck.httpStatus ?? '—'}</p>
                <p className="text-sm text-muted-foreground">
                  {formatResponseTime(latestCheck.responseTimeMs)}
                </p>
                <p className="text-xs text-muted-foreground">{timeAgo(latestCheck.checkedAt)}</p>
                {latestCheck.redirectUrl && (
                  <p className="text-xs text-muted-foreground truncate">→ {latestCheck.redirectUrl}</p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Not checked yet</p>
            )}
          </CardContent>
        </Card>

        {/* SSL */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">SSL Certificate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {latestSsl ? (
              <>
                <SslBadge isValid={latestSsl.isValid} daysUntilExpiry={latestSsl.daysUntilExpiry} />
                {latestSsl.issuer && <p className="text-xs text-muted-foreground">{latestSsl.issuer}</p>}
                {latestSsl.validTo && (
                  <p className="text-xs text-muted-foreground">Expires {formatDate(latestSsl.validTo)}</p>
                )}
                {latestSsl.protocol && (
                  <p className="text-xs text-muted-foreground">{latestSsl.protocol}</p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Not checked yet</p>
            )}
          </CardContent>
        </Card>

        {/* Pages */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pages</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-2xl font-bold">{site._count.pages}</p>
            <div className="flex gap-3 text-xs text-muted-foreground">
              <span className="text-green-600">{pagesUp} up</span>
              <span className="text-red-600">{pagesDown} down</span>
              {pagesError > 0 && <span className="text-yellow-600">{pagesError} error</span>}
            </div>
            <Link href={`/sites/${site.id}/pages`} className="text-xs text-primary hover:underline">
              View all pages →
            </Link>
          </CardContent>
        </Card>

        {/* Server info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Server</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {site.server && (
              <p>
                <span className="text-muted-foreground">IP:</span>{' '}
                <Link href={`/sites?serverId=${site.server.id}`} className="font-mono hover:underline">
                  {site.server.ipAddress}
                </Link>
                {site.server.name && (
                  <span className="ml-2 text-muted-foreground">({site.server.name})</span>
                )}
              </p>
            )}
            {latestCheck?.serverHeader && (
              <p><span className="text-muted-foreground">Server:</span> {latestCheck.serverHeader}</p>
            )}
            {latestCheck?.contentType && (
              <p><span className="text-muted-foreground">Content-Type:</span> {latestCheck.contentType}</p>
            )}
            {latestCheck?.xPoweredBy && (
              <p><span className="text-muted-foreground">X-Powered-By:</span> {latestCheck.xPoweredBy}</p>
            )}
            {!site.server && !latestCheck?.serverHeader && !latestCheck?.contentType && (
              <p className="text-muted-foreground">No server info</p>
            )}
          </CardContent>
        </Card>

        {/* Robots */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">robots.txt</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {latestRobots ? (
              <>
                <p className={latestRobots.isAccessible ? 'text-green-600' : 'text-red-600'}>
                  {latestRobots.isAccessible ? 'Accessible' : 'Not accessible'}
                </p>
                {latestRobots.sitemapUrls.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {latestRobots.sitemapUrls.length} sitemap{latestRobots.sitemapUrls.length !== 1 ? 's' : ''} listed
                  </p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">Not fetched yet</p>
            )}
          </CardContent>
        </Card>

        {/* Site info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Monitoring</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p><span className="text-muted-foreground">Site check:</span> every {site.checkIntervalMinutes}m</p>
            <p><span className="text-muted-foreground">Page check:</span> every {site.pageCheckIntervalMinutes}m</p>
            <p><span className="text-muted-foreground">Added:</span> {formatDate(site.createdAt)}</p>
            <p><span className="text-muted-foreground">Last checked:</span> {timeAgo(site.lastCheckedAt)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Check history table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Recent Checks</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {site.siteChecks.length === 0 ? (
            <p className="px-6 py-4 text-sm text-muted-foreground">No checks yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-6 py-2 text-left font-medium text-muted-foreground">Time</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Response</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">HTTP</th>
                  </tr>
                </thead>
                <tbody>
                  {site.siteChecks.map((c) => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="px-6 py-2 text-muted-foreground">{timeAgo(c.checkedAt)}</td>
                      <td className="px-4 py-2">
                        <PageStatusBadge status={c.isReachable ? 'UP' : 'DOWN'} />
                      </td>
                      <td className="px-4 py-2 tabular-nums text-muted-foreground">
                        {formatResponseTime(c.responseTimeMs)}
                      </td>
                      <td className="px-4 py-2 tabular-nums text-muted-foreground">
                        {c.httpStatus ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
