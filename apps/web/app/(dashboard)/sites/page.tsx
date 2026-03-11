import Link from 'next/link'
import { db } from '@/lib/db'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { SiteStatusBadge } from '@/components/StatusBadge'
import { SslBadge } from '@/components/SslBadge'
import { formatResponseTime, timeAgo } from '@/lib/utils'

export const metadata = { title: 'Sites' }
export const dynamic = 'force-dynamic'

type SearchParams = { serverId?: string }

export default async function SitesPage({ searchParams }: { searchParams: SearchParams }) {
  const { serverId } = searchParams

  const [sites, servers] = await Promise.all([
    db.site.findMany({
      where: serverId ? { serverId } : undefined,
      orderBy: { createdAt: 'desc' },
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
        server: { select: { id: true, ipAddress: true, name: true } },
        _count: { select: { pages: true } },
      },
    }),
    db.server.findMany({
      orderBy: { ipAddress: 'asc' },
      select: { id: true, ipAddress: true, name: true },
    }),
  ])

  const activeServer = servers.find((s) => s.id === serverId)

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sites</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {sites.length} monitored domain{sites.length !== 1 ? 's' : ''}
            {activeServer && (
              <span> on {activeServer.name ?? activeServer.ipAddress}</span>
            )}
          </p>
        </div>
        <Link href="/sites/new">
          <Button>Add Site</Button>
        </Link>
      </div>

      {/* Server filter */}
      {servers.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <Link
            href="/sites"
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${!serverId ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-foreground'}`}
          >
            All servers
          </Link>
          {servers.map((s) => (
            <Link
              key={s.id}
              href={`/sites?serverId=${s.id}`}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${serverId === s.id ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-foreground'}`}
            >
              {s.name ?? s.ipAddress}
            </Link>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {sites.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-muted-foreground text-sm mb-4">No sites added yet.</p>
              <Link href="/sites/new">
                <Button>Add your first site</Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-6 py-3 text-left font-medium text-muted-foreground">Domain</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">HTTP</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Response</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">SSL</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Server</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Pages</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Last Check</th>
                  </tr>
                </thead>
                <tbody>
                  {sites.map((site) => {
                    const check = site.siteChecks[0]
                    const ssl = site.sslCertificates[0]
                    return (
                      <tr
                        key={site.id}
                        className="border-b last:border-0 hover:bg-muted/20 transition-colors"
                      >
                        <td className="px-6 py-3">
                          <Link href={`/sites/${site.id}`} className="font-medium hover:underline">
                            {site.displayName ?? site.domain}
                          </Link>
                          {site.displayName && (
                            <p className="text-xs text-muted-foreground">{site.domain}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <SiteStatusBadge status={site.status} />
                        </td>
                        <td className="px-4 py-3 tabular-nums text-muted-foreground">
                          {check?.httpStatus ?? '—'}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-muted-foreground">
                          {check ? formatResponseTime(check.responseTimeMs) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <SslBadge
                            isValid={ssl?.isValid ?? null}
                            daysUntilExpiry={ssl?.daysUntilExpiry ?? null}
                          />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {site.server ? (
                            <Link
                              href={`/sites?serverId=${site.server.id}`}
                              className="font-mono text-xs hover:underline"
                            >
                              {site.server.name ?? site.server.ipAddress}
                            </Link>
                          ) : (
                            <span className="text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-muted-foreground">
                          {site._count.pages}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {timeAgo(site.lastCheckedAt)}
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
    </div>
  )
}
