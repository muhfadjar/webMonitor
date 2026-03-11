import { db } from './db'

interface AlertEvent {
  siteId: string
  pageId?: string
  type: 'SSL_EXPIRY' | 'SITE_DOWN' | 'PAGE_DOWN' | 'STATUS_CHANGE' | 'CONTENT_CHANGE'
  details: Record<string, unknown>
}

/**
 * Check active alerts for the given site/page and trigger those that match.
 * Phase 3 stub: logs to console. Phase 6 will add email + webhook dispatch.
 */
export async function checkAndTriggerAlerts(event: AlertEvent): Promise<void> {
  const alerts = await db.alert.findMany({
    where: {
      isActive: true,
      type: event.type,
      OR: [
        { siteId: event.siteId },
        ...(event.pageId ? [{ pageId: event.pageId }] : []),
      ],
    },
  })

  for (const alert of alerts) {
    // Cooldown: don't re-trigger within 1 hour
    if (alert.lastTriggeredAt) {
      const hoursSince =
        (Date.now() - alert.lastTriggeredAt.getTime()) / (1000 * 60 * 60)
      if (hoursSince < 1) continue
    }

    console.log(`[alert] Triggering ${alert.type} alert ${alert.id}`, {
      siteId: event.siteId,
      pageId: event.pageId,
      details: event.details,
      notificationEmail: alert.notificationEmail,
      webhookUrl: alert.webhookUrl,
    })

    // TODO Phase 6: dispatch email via Nodemailer, dispatch webhook via HTTP POST

    await db.alert.update({
      where: { id: alert.id },
      data: { lastTriggeredAt: new Date() },
    })
  }
}
