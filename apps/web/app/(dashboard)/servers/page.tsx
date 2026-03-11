import { db } from '@/lib/db'
import { Card, CardContent } from '@/components/ui/card'
import { ServerList } from '@/components/ServerList'

export const metadata = { title: 'Servers' }
export const dynamic = 'force-dynamic'

export default async function ServersPage() {
  const servers = await db.server.findMany({
    orderBy: { ipAddress: 'asc' },
    include: { _count: { select: { sites: true } } },
  })

  const data = servers.map((s) => ({
    id: s.id,
    ipAddress: s.ipAddress,
    name: s.name,
    siteCount: s._count.sites,
  }))

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Servers</h1>
        <p className="text-muted-foreground text-sm mt-1">
          IP addresses detected during site discovery. Name them to group and filter your sites.
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {data.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-muted-foreground text-sm">
                No servers detected yet. Add a site and run discovery to detect server IPs.
              </p>
            </div>
          ) : (
            <ServerList servers={data} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
