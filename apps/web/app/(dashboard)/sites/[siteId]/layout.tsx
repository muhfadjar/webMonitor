import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { SiteStatusBadge } from '@/components/StatusBadge'

const tabs: Array<{ href: string; label: string; external?: boolean }> = [
  { href: '', label: 'Overview' },
  { href: '/pages', label: 'Pages' },
  { href: '/ssl', label: 'SSL' },
  { href: '/robots', label: 'Robots' },
  { href: '/alerts', label: 'Alerts' },
  { href: '/report', label: 'Report ↗', external: true },
]

export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { siteId: string }
}) {
  const site = await db.site.findUnique({
    where: { id: params.siteId },
    select: { id: true, domain: true, displayName: true, status: true },
  })
  if (!site) notFound()

  const base = `/sites/${site.id}`

  return (
    <div className="flex flex-col min-h-full">
      {/* Site header */}
      <div className="border-b bg-card px-8 pt-8 pb-0">
        <div className="flex items-center gap-3 mb-4">
          <Link href="/sites" className="text-sm text-muted-foreground hover:text-foreground">
            Sites
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium">{site.displayName ?? site.domain}</span>
          <SiteStatusBadge status={site.status} />
        </div>
        <h1 className="text-2xl font-bold tracking-tight mb-4">
          {site.displayName ?? site.domain}
        </h1>

        {/* Tab nav */}
        <nav className="flex gap-1">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={`${base}${tab.href}`}
              target={tab.external ? '_blank' : undefined}
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border-b-2 border-transparent hover:border-muted-foreground transition-colors"
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="flex-1 p-8">{children}</div>
    </div>
  )
}
