'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

export function AddSiteForm() {
  const router = useRouter()
  const [domain, setDomain] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [interval, setInterval] = useState('60')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain,
          displayName: displayName || undefined,
          checkIntervalMinutes: Number(interval),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        const msg =
          data?.details?.fieldErrors?.domain?.[0] ??
          data?.details?.fieldErrors?.displayName?.[0] ??
          data?.error ??
          'Failed to add site'
        setError(msg)
        return
      }

      const site = await res.json()
      router.push(`/sites/${site.id}`)
      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>Add a new site</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="domain">Domain *</Label>
            <Input
              id="domain"
              placeholder="example.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              required
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Enter the bare domain — no https:// needed
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              placeholder="My Website (optional)"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="interval">Check interval (minutes)</Label>
            <Input
              id="interval"
              type="number"
              min={5}
              max={10080}
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
            />
          </div>
        </CardContent>
        <CardFooter className="gap-3">
          <Button type="submit" disabled={loading}>
            {loading ? 'Adding…' : 'Add Site'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={loading}
          >
            Cancel
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
