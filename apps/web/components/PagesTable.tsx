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
  hasSecurityIssues: boolean
  seoScore: number | null
  pageChecks: Array<{
    httpStatus: number | null
    responseTimeMs: number | null
    title: string | null
  }>
}

interface SeoIssue {
  type: string
  severity: 'error' | 'warning' | 'info'
  message: string
  recommendation: string
}

interface SeoDetail {
  score: number
  issues: SeoIssue[]
  title: string | null
  description: string | null
  h1Count: number | null
  canonicalUrl: string | null
  hasViewport: boolean | null
  hasOgTags: boolean | null
  hasSchema: boolean | null
  imagesMissingAlt: number | null
  isIndexable: boolean | null
  checkedAt: string
}

interface PagesTableProps {
  siteId: string
  pages: PageRow[]
}

function SeoScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-muted-foreground">—</span>
  const color =
    score >= 80 ? 'bg-green-100 text-green-700 hover:bg-green-200' :
    score >= 60 ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' :
                  'bg-red-100 text-red-700 hover:bg-red-200'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums cursor-pointer transition-colors ${color}`}>
      {score}
    </span>
  )
}

const SEVERITY_COLORS: Record<string, string> = {
  error: 'text-red-600',
  warning: 'text-yellow-600',
  info: 'text-blue-600',
}
const SEVERITY_ICONS: Record<string, string> = {
  error: '✕',
  warning: '!',
  info: 'i',
}
const SEVERITY_BG: Record<string, string> = {
  error: 'bg-red-100 text-red-600',
  warning: 'bg-yellow-100 text-yellow-600',
  info: 'bg-blue-100 text-blue-600',
}

function SeoDetailPanel({ detail, onClose, onRecheck, rechecking }: {
  detail: SeoDetail
  onClose: () => void
  onRecheck: () => void
  rechecking: boolean
}) {
  const scoreColor =
    detail.score >= 80 ? 'text-green-600' :
    detail.score >= 60 ? 'text-yellow-600' : 'text-red-600'

  const errors = detail.issues.filter((i) => i.severity === 'error')
  const warnings = detail.issues.filter((i) => i.severity === 'warning')
  const infos = detail.issues.filter((i) => i.severity === 'info')

  return (
    <tr>
      <td colSpan={8} className="px-4 pb-4 pt-0 bg-muted/10 border-b">
        <div className="rounded-lg border bg-background p-4 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className={`text-3xl font-bold tabular-nums ${scoreColor}`}>{detail.score}</span>
              <div>
                <p className="text-xs text-muted-foreground font-medium">SEO Score / 100</p>
                <p className="text-xs text-muted-foreground">Checked {timeAgo(detail.checkedAt)}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={onRecheck}
                disabled={rechecking}
                className="text-xs text-primary hover:underline disabled:opacity-50"
              >
                {rechecking ? 'Queuing…' : 'Re-analyze'}
              </button>
              <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
                ✕ Close
              </button>
            </div>
          </div>

          {/* Metadata snapshot */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            <MetaItem label="Title" value={detail.title} />
            <MetaItem label="Description" value={detail.description} />
            <MetaItem label="H1 tags" value={detail.h1Count !== null ? String(detail.h1Count) : null} />
            <MetaItem label="Canonical" value={detail.canonicalUrl} />
            <MetaBool label="Viewport" value={detail.hasViewport} />
            <MetaBool label="OG tags" value={detail.hasOgTags} />
            <MetaBool label="Schema.org" value={detail.hasSchema} />
            <MetaItem label="Images missing alt" value={detail.imagesMissingAlt !== null ? String(detail.imagesMissingAlt) : null} />
            <MetaBool label="Indexable" value={detail.isIndexable} />
          </div>

          {/* Issues */}
          {detail.issues.length === 0 ? (
            <p className="text-xs text-green-600 font-medium">No issues found — great job!</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                {errors.length > 0 && <span className="text-red-600">{errors.length} error{errors.length !== 1 ? 's' : ''}</span>}
                {errors.length > 0 && warnings.length > 0 && <span className="text-muted-foreground"> · </span>}
                {warnings.length > 0 && <span className="text-yellow-600">{warnings.length} warning{warnings.length !== 1 ? 's' : ''}</span>}
                {(errors.length > 0 || warnings.length > 0) && infos.length > 0 && <span className="text-muted-foreground"> · </span>}
                {infos.length > 0 && <span className="text-blue-600">{infos.length} suggestion{infos.length !== 1 ? 's' : ''}</span>}
              </p>
              <ul className="space-y-2">
                {detail.issues.map((issue, i) => (
                  <li key={i} className="flex gap-3 text-xs">
                    <span className={`mt-0.5 shrink-0 w-4 h-4 rounded-full flex items-center justify-center font-bold text-[10px] ${SEVERITY_BG[issue.severity]}`}>
                      {SEVERITY_ICONS[issue.severity]}
                    </span>
                    <div className="space-y-0.5">
                      <p className={`font-medium ${SEVERITY_COLORS[issue.severity]}`}>{issue.message}</p>
                      <p className="text-muted-foreground">{issue.recommendation}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </td>
    </tr>
  )
}

function MetaItem({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="space-y-0.5">
      <p className="text-muted-foreground">{label}</p>
      {value ? (
        <p className="font-medium truncate" title={value}>{value}</p>
      ) : (
        <p className="text-muted-foreground italic">missing</p>
      )}
    </div>
  )
}

function MetaBool({ label, value }: { label: string; value: boolean | null | undefined }) {
  return (
    <div className="space-y-0.5">
      <p className="text-muted-foreground">{label}</p>
      {value === null || value === undefined ? (
        <p className="text-muted-foreground italic">—</p>
      ) : value ? (
        <p className="text-green-600 font-medium">Yes</p>
      ) : (
        <p className="text-red-600 font-medium">No</p>
      )}
    </div>
  )
}

export function PagesTable({ siteId, pages }: PagesTableProps) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [recheckLoading, setRecheckLoading] = useState(false)
  const [seoLoading, setSeoLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [seoChecking, setSeoChecking] = useState<string | null>(null)
  const [expandedPageId, setExpandedPageId] = useState<string | null>(null)
  const [seoDetail, setSeoDetail] = useState<SeoDetail | null>(null)
  const [seoDetailLoading, setSeoDetailLoading] = useState(false)

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
    setRecheckLoading(true)
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
        setTimeout(() => { setMessage(null); router.refresh() }, 2000)
      } else {
        setMessage(data.error ?? 'Failed to queue')
      }
    } catch {
      setMessage('Something went wrong')
    } finally {
      setRecheckLoading(false)
    }
  }

  async function handleSeoAnalyzeSelected() {
    if (selected.size === 0) return
    setSeoLoading(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/sites/${siteId}/pages/seo-analyze-selected`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageIds: Array.from(selected) }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage(data.message ?? 'SEO analysis queued!')
        setSelected(new Set())
        setTimeout(() => { setMessage(null); router.refresh() }, 2000)
      } else {
        setMessage(data.error ?? 'Failed to queue SEO analysis')
      }
    } catch {
      setMessage('Something went wrong')
    } finally {
      setSeoLoading(false)
    }
  }

  async function handleSeoRowRecheck(pageId: string) {
    setSeoChecking(pageId)
    try {
      await fetch(`/api/sites/${siteId}/pages/${pageId}/seo-check`, { method: 'POST' })
      setTimeout(() => { setSeoChecking(null); router.refresh() }, 1500)
    } catch {
      setSeoChecking(null)
    }
  }

  async function toggleSeoDetail(pageId: string, e: React.MouseEvent) {
    e.stopPropagation()

    if (expandedPageId === pageId) {
      setExpandedPageId(null)
      setSeoDetail(null)
      return
    }

    setExpandedPageId(pageId)
    setSeoDetail(null)
    setSeoDetailLoading(true)

    try {
      const res = await fetch(`/api/sites/${siteId}/pages/${pageId}/seo-check`)
      const data = await res.json()
      setSeoDetail(data.check ?? null)
    } catch {
      setSeoDetail(null)
    } finally {
      setSeoDetailLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      {/* Bulk action bar */}
      <div className={`flex items-center gap-3 px-1 transition-opacity ${selected.size > 0 ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <span className="text-sm text-muted-foreground">{selected.size} selected</span>
        <Button size="sm" variant="outline" onClick={handleRecheckSelected} disabled={recheckLoading || seoLoading}>
          {recheckLoading ? 'Queuing…' : `Re-check (${selected.size})`}
        </Button>
        <Button size="sm" variant="outline" onClick={handleSeoAnalyzeSelected} disabled={seoLoading || recheckLoading}>
          {seoLoading ? 'Queuing…' : `Analyze SEO (${selected.size})`}
        </Button>
        {message && <span className="text-sm text-muted-foreground">{message}</span>}
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
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Security</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">SEO</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">HTTP</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Response</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Last Check</th>
            </tr>
          </thead>
          <tbody>
            {pages.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-sm text-muted-foreground">
                  No pages found.
                </td>
              </tr>
            ) : (
              pages.map((page) => {
                const check = page.pageChecks[0]
                const isChecked = selected.has(page.id)
                const isExpanded = expandedPageId === page.id
                const isThisSeoChecking = seoChecking === page.id

                return (
                  <>
                    <tr
                      key={page.id}
                      className={`border-b transition-colors cursor-pointer ${isExpanded ? 'bg-muted/10' : isChecked ? 'bg-primary/5' : 'hover:bg-muted/20'}`}
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
                      <td className="px-4 py-2">
                        {page.hasSecurityIssues ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                            ⚠ Risk
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <span onClick={(e) => toggleSeoDetail(page.id, e)} title="Click for details">
                            <SeoScoreBadge score={page.seoScore} />
                          </span>
                          {page.seoScore === null && (
                            <button
                              onClick={(e) => { e.stopPropagation(); void handleSeoRowRecheck(page.id) }}
                              disabled={isThisSeoChecking}
                              className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline disabled:opacity-50"
                            >
                              {isThisSeoChecking ? '…' : 'Analyze'}
                            </button>
                          )}
                          {isExpanded && (
                            <span className="text-xs text-muted-foreground">{seoDetailLoading ? '…' : '▲'}</span>
                          )}
                        </div>
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
                    {isExpanded && (
                      seoDetailLoading ? (
                        <tr key={`${page.id}-loading`}>
                          <td colSpan={8} className="px-4 py-3 text-center text-xs text-muted-foreground border-b bg-muted/10">
                            Loading SEO analysis…
                          </td>
                        </tr>
                      ) : seoDetail ? (
                        <SeoDetailPanel
                          key={`${page.id}-detail`}
                          detail={seoDetail}
                          onClose={() => { setExpandedPageId(null); setSeoDetail(null) }}
                          onRecheck={() => handleSeoRowRecheck(page.id)}
                          rechecking={isThisSeoChecking}
                        />
                      ) : (
                        <tr key={`${page.id}-empty`}>
                          <td colSpan={8} className="px-4 py-3 text-center text-xs text-muted-foreground border-b bg-muted/10">
                            No SEO analysis yet.{' '}
                            <button
                              className="text-primary hover:underline"
                              onClick={(e) => { e.stopPropagation(); void handleSeoRowRecheck(page.id) }}
                            >
                              Run now
                            </button>
                          </td>
                        </tr>
                      )
                    )}
                  </>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
