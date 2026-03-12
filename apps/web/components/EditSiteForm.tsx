'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { TagInput } from '@/components/TagInput'

interface EditSiteFormProps {
  siteId: string
  initialValues: {
    displayName: string | null
    checkIntervalMinutes: number
    pageCheckIntervalMinutes: number
    tags: string[]
  }
}

export function EditSiteForm({ siteId, initialValues }: EditSiteFormProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [displayName, setDisplayName] = useState(initialValues.displayName ?? '')
  const [checkInterval, setCheckInterval] = useState(String(initialValues.checkIntervalMinutes))
  const [pageInterval, setPageInterval] = useState(String(initialValues.pageCheckIntervalMinutes))
  const [tags, setTags] = useState<string[]>(initialValues.tags)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`/api/sites/${siteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName || undefined,
          checkIntervalMinutes: Number(checkInterval),
          pageCheckIntervalMinutes: Number(pageInterval),
          tags,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data?.error ?? 'Failed to update site')
        return
      }

      setOpen(false)
      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Edit Settings
      </Button>
    )
  }

  return (
    <Card className="w-full max-w-lg">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Edit Site Settings</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="edit-displayName">Display name</Label>
            <Input
              id="edit-displayName"
              placeholder="My Website (optional)"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Tags</Label>
            <TagInput tags={tags} onChange={setTags} placeholder="Add tag… (Enter or comma)" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-checkInterval">
                Site check interval
                <span className="ml-1 text-xs font-normal text-muted-foreground">(minutes)</span>
              </Label>
              <Input
                id="edit-checkInterval"
                type="number"
                min={5}
                max={10080}
                value={checkInterval}
                onChange={(e) => setCheckInterval(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">How often to check site health (HTTP, SSL, robots)</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-pageInterval">
                Page check interval
                <span className="ml-1 text-xs font-normal text-muted-foreground">(minutes)</span>
              </Label>
              <Input
                id="edit-pageInterval"
                type="number"
                min={60}
                max={10080}
                value={pageInterval}
                onChange={(e) => setPageInterval(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">How often to recheck individual pages</p>
            </div>
          </div>
        </CardContent>
        <CardFooter className="gap-3">
          <Button type="submit" size="sm" disabled={loading}>
            {loading ? 'Saving…' : 'Save Changes'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => { setOpen(false); setError(null) }}
            disabled={loading}
          >
            Cancel
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
