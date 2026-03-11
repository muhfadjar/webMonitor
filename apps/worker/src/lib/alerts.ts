import nodemailer from 'nodemailer'
import { db } from './db'

// ── SMTP transporter (lazy-created) ──────────────────────────────────────────

let _transporter: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter | null {
  if (_transporter) return _transporter

  const host = process.env.SMTP_HOST
  if (!host) return null

  _transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth:
      process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  })
  return _transporter
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface AlertEvent {
  siteId: string
  pageId?: string
  type: 'SSL_EXPIRY' | 'SITE_DOWN' | 'PAGE_DOWN' | 'STATUS_CHANGE' | 'CONTENT_CHANGE'
  details: Record<string, unknown>
}

const COOLDOWN_HOURS = Number(process.env.ALERT_COOLDOWN_HOURS ?? 1)

// ── Main dispatcher ───────────────────────────────────────────────────────────

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
    include: { site: { select: { domain: true, displayName: true } } },
  })

  for (const alert of alerts) {
    // Cooldown check
    if (alert.lastTriggeredAt) {
      const hoursSince = (Date.now() - alert.lastTriggeredAt.getTime()) / (1000 * 60 * 60)
      if (hoursSince < COOLDOWN_HOURS) {
        console.log(`[alert] ${alert.id} skipped — cooldown (${hoursSince.toFixed(1)}h < ${COOLDOWN_HOURS}h)`)
        continue
      }
    }

    const domain = alert.site?.domain ?? event.siteId
    const displayName = alert.site?.displayName ?? domain

    const context = {
      alertId: alert.id,
      type: event.type,
      domain,
      displayName,
      details: event.details,
    }

    // Dispatch email
    if (alert.notificationEmail) {
      await sendEmail(alert.notificationEmail, context).catch((err: Error) =>
        console.error(`[alert] Email dispatch failed for ${alert.id}:`, err.message)
      )
    }

    // Dispatch webhook
    if (alert.webhookUrl) {
      await sendWebhook(alert.webhookUrl, { ...context, siteId: event.siteId, pageId: event.pageId }).catch(
        (err: Error) => console.error(`[alert] Webhook dispatch failed for ${alert.id}:`, err.message)
      )
    }

    await db.alert.update({
      where: { id: alert.id },
      data: { lastTriggeredAt: new Date() },
    })

    console.log(`[alert] Triggered ${alert.type} alert ${alert.id} for ${domain}`)
  }
}

// ── Email ─────────────────────────────────────────────────────────────────────

const ALERT_LABELS: Record<string, string> = {
  SITE_DOWN: 'Site Down',
  PAGE_DOWN: 'Page Down',
  SSL_EXPIRY: 'SSL Certificate Expiring',
  STATUS_CHANGE: 'Status Changed',
  CONTENT_CHANGE: 'Content Changed',
}

async function sendEmail(
  to: string,
  ctx: {
    alertId: string
    type: string
    domain: string
    displayName: string
    details: Record<string, unknown>
  }
): Promise<void> {
  const transporter = getTransporter()
  if (!transporter) {
    console.warn('[alert] SMTP not configured — skipping email')
    return
  }

  const label = ALERT_LABELS[ctx.type] ?? ctx.type
  const subject = `[WebMonitor] ${label}: ${ctx.displayName}`

  const detailLines = Object.entries(ctx.details)
    .map(([k, v]) => `  ${k}: ${String(v)}`)
    .join('\n')

  const text = [
    `Alert: ${label}`,
    `Site: ${ctx.displayName} (${ctx.domain})`,
    '',
    'Details:',
    detailLines,
    '',
    `Alert ID: ${ctx.alertId}`,
    `Timestamp: ${new Date().toISOString()}`,
  ].join('\n')

  const html = `
    <h2 style="color:#dc2626">${label}</h2>
    <p><strong>Site:</strong> ${ctx.displayName} (${ctx.domain})</p>
    <h3>Details</h3>
    <table style="border-collapse:collapse">
      ${Object.entries(ctx.details)
        .map(
          ([k, v]) =>
            `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">${k}</td><td style="padding:4px 0"><strong>${String(v)}</strong></td></tr>`
        )
        .join('')}
    </table>
    <p style="color:#9ca3af;font-size:12px;margin-top:24px">Alert ID: ${ctx.alertId} · ${new Date().toISOString()}</p>
  `

  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? `"WebMonitor" <noreply@webmonitor.local>`,
    to,
    subject,
    text,
    html,
  })
}

// ── Webhook ───────────────────────────────────────────────────────────────────

async function sendWebhook(
  url: string,
  payload: Record<string, unknown>
): Promise<void> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'WebMonitor-Alerts/1.0',
      },
      body: JSON.stringify({ ...payload, timestamp: new Date().toISOString() }),
      signal: controller.signal,
    })

    if (!res.ok) {
      throw new Error(`Webhook responded with HTTP ${res.status}`)
    }
  } finally {
    clearTimeout(timer)
  }
}
