'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { PageStatusBadge } from '@/components/StatusBadge'
import { formatResponseTime, timeAgo, truncateUrl } from '@/lib/utils'

interface PageRow {
  id: string
  url: string
  status: string
  lastCheckedAt: string | null
  pageChecks: Array<{
    httpStatus: number | null
    responseTimeMs: number | null
    title: string | null
  }>
}

interface PagesTableProps {
  siteId: string
  pages: PageRow[]
}

export function PagesTable({ siteId, pages }: PagesTableProps) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const allSelected = pages.length > 0 && selected.size === pages.length
  const someSelected = selected.size > 0 && !allSelected

  const toggleAll = useCallback(() => {
    setSelected(allSelected ? new Set() : new Set(pages.map((p) => p.id)))
  }, [allSelected, pages])

  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  async function handleRecheckSelected() {
    if (selected.size === 0) return
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/sites/${siteId}/pages/recheck-selected`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageIds: Array.from(selected) }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage(data.message ?? 'Queued!')
        setSelected(new Set())
        setTimeout(() => {
          setMessage(null)
          router.refresh()
        }, 2000)
      } else {
        setMessage(data.error ?? 'Failed to queue')
      }
    } catch {
      setMessage('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      {/* Bulk action bar — only visible when items are selected */}
      <div className={`flex items-center gap-3 px-1 transition-opacity ${selected.size > 0 ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <span className="text-sm text-muted-foreground">
          {selected.size} selected
        </span>
        <Button size="sm" onClick={handleRecheckSelected} disabled={loading}>
          {loading ? 'Queuing…' : `Re-check selected (${selected.size})`}
        </Button>
        {message && (
          <span className="text-sm text-muted-foreground">{message}</span>
        )}
        <button
          className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setSelected(new Set())}
        >
          Clear selection
        </button>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="px-4 py-3 w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected }}
                  onChange={toggleAll}
                  className="rounded border-border cursor-pointer"
                  aria-label="Select all"
                />
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">URL</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">HTTP</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Response</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Last Check</th>
            </tr>
          </thead>
          <tbody>
            {pages.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-sm text-muted-foreground">
                  No pages found.
                </td>
              </tr>
            ) : (
              pages.map((page) => {
                const check = page.pageChecks[0]
                const isChecked = selected.has(page.id)
                return (
                  <tr
                    key={page.id}
                    className={`border-b last:border-0 transition-colors cursor-pointer ${isChecked ? 'bg-primary/5' : 'hover:bg-muted/20'}`}
                    onClick={() => toggleOne(page.id)}
                  >
                    <td className="px-4 py-2 w-8" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleOne(page.id)}
                        className="rounded border-border cursor-pointer"
                        aria-label={`Select ${page.url}`}
                      />
                    </td>
                    <td className="px-4 py-2 max-w-xs">
                      <div className="font-mono text-xs text-muted-foreground truncate" title={page.url}>
                        {truncateUrl(page.url, 70)}
                      </div>
                      {check?.title && (
                        <div className="text-xs truncate">{check.title}</div>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <PageStatusBadge status={page.status as 'UP' | 'DOWN' | 'ERROR' | 'PENDING' | 'REDIRECT'} />
                    </td>
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">
                      {check?.httpStatus ?? '—'}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">
                      {check ? formatResponseTime(check.responseTimeMs) : '—'}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {timeAgo(page.lastCheckedAt)}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
