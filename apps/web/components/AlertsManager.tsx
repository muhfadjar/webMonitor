'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate, timeAgo } from '@/lib/utils'

type Alert = {
  id: string
  type: string
  isActive: boolean
  notificationEmail: string | null
  webhookUrl: string | null
  thresholdDays: number | null
  lastTriggeredAt: string | null
  createdAt: string
}

const ALERT_TYPES = [
  { value: 'SITE_DOWN', label: 'Site Down' },
  { value: 'SSL_EXPIRY', label: 'SSL Expiry' },
  { value: 'PAGE_DOWN', label: 'Page Down' },
  { value: 'STATUS_CHANGE', label: 'Status Change' },
  { value: 'CONTENT_CHANGE', label: 'Content Change' },
]

export function AlertsManager({ siteId, initialAlerts }: { siteId: string; initialAlerts: Alert[] }) {
  const router = useRouter()
  const [alerts, setAlerts] = useState(initialAlerts)
  const [showForm, setShowForm] = useState(false)
  const [type, setType] = useState('SITE_DOWN')
  const [email, setEmail] = useState('')
  const [webhook, setWebhook] = useState('')
  const [thresholdDays, setThresholdDays] = useState('30')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`/api/sites/${siteId}/alerts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          notificationEmail: email || undefined,
          webhookUrl: webhook || undefined,
          thresholdDays: type === 'SSL_EXPIRY' ? Number(thresholdDays) : undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data?.error ?? 'Failed to create alert')
        return
      }
      setShowForm(false)
      setEmail('')
      setWebhook('')
      router.refresh()
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function toggleAlert(alertId: string, isActive: boolean) {
    await fetch(`/api/alerts/${alertId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !isActive }),
    })
    router.refresh()
  }

  async function deleteAlert(alertId: string) {
    await fetch(`/api/alerts/${alertId}`, { method: 'DELETE' })
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={() => setShowForm(!showForm)} variant="outline" size="sm">
          {showForm ? 'Cancel' : '+ New Alert'}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Create Alert</CardTitle>
          </CardHeader>
          <form onSubmit={handleCreate}>
            <CardContent className="space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label>Alert type</Label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {ALERT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {type === 'SSL_EXPIRY' && (
                <div className="space-y-2">
                  <Label htmlFor="threshold">Alert when expiry is within (days)</Label>
                  <Input
                    id="threshold"
                    type="number"
                    min={1}
                    max={365}
                    value={thresholdDays}
                    onChange={(e) => setThresholdDays(e.target.value)}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Notification email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="alerts@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="webhook">Webhook URL</Label>
                <Input
                  id="webhook"
                  type="url"
                  placeholder="https://hooks.example.com/…"
                  value={webhook}
                  onChange={(e) => setWebhook(e.target.value)}
                />
              </div>

              <p className="text-xs text-muted-foreground">
                At least one of email or webhook URL is required.
              </p>

              <Button type="submit" disabled={loading} size="sm">
                {loading ? 'Creating…' : 'Create Alert'}
              </Button>
            </CardContent>
          </form>
        </Card>
      )}

      {alerts.length === 0 && !showForm ? (
        <p className="text-sm text-muted-foreground">No alerts configured for this site.</p>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <Card key={alert.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">
                      {ALERT_TYPES.find((t) => t.value === alert.type)?.label ?? alert.type}
                    </span>
                    <Badge variant={alert.isActive ? 'success' : 'muted'}>
                      {alert.isActive ? 'Active' : 'Paused'}
                    </Badge>
                  </div>
                  {alert.notificationEmail && (
                    <p className="text-xs text-muted-foreground">Email: {alert.notificationEmail}</p>
                  )}
                  {alert.webhookUrl && (
                    <p className="text-xs text-muted-foreground">Webhook: {alert.webhookUrl}</p>
                  )}
                  {alert.thresholdDays && (
                    <p className="text-xs text-muted-foreground">Threshold: {alert.thresholdDays} days</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Created {formatDate(alert.createdAt)}
                    {alert.lastTriggeredAt && ` · Last fired ${timeAgo(alert.lastTriggeredAt)}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleAlert(alert.id, alert.isActive)}
                  >
                    {alert.isActive ? 'Pause' : 'Enable'}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => deleteAlert(alert.id)}
                  >
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
