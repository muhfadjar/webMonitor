import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { AlertsManager } from '@/components/AlertsManager'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Alerts' }

export default async function SiteAlertsPage({ params }: { params: { siteId: string } }) {
  const site = await db.site.findUnique({
    where: { id: params.siteId },
    select: { id: true },
  })
  if (!site) notFound()

  const alerts = await db.alert.findMany({
    where: { siteId: site.id },
    orderBy: { createdAt: 'desc' },
  })

  // Serialize dates to strings for the client component
  const serialized = alerts.map((a) => ({
    id: a.id,
    type: a.type,
    isActive: a.isActive,
    notificationEmail: a.notificationEmail,
    webhookUrl: a.webhookUrl,
    thresholdDays: a.thresholdDays,
    lastTriggeredAt: a.lastTriggeredAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
  }))

  return <AlertsManager siteId={site.id} initialAlerts={serialized} />
}
