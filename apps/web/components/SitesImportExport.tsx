'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

interface ImportResult {
  domain: string
  status: 'imported' | 'skipped' | 'error'
  reason?: string
}

interface ImportResponse {
  imported: number
  skipped: number
  errors: number
  results: ImportResult[]
}

// Build a minimal .xlsx example file client-side via SheetJS
async function downloadExampleXlsx() {
  const XLSX = await import('xlsx')
  const rows = [
    { domain: 'example.com', displayName: 'Example Site', checkIntervalMinutes: 60, pageCheckIntervalMinutes: 1440 },
    { domain: 'shop.example.com', displayName: 'Shop', checkIntervalMinutes: 30, pageCheckIntervalMinutes: 720 },
    { domain: 'blog.example.com', displayName: '', checkIntervalMinutes: 60, pageCheckIntervalMinutes: 1440 },
  ]
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [{ wch: 24 }, { wch: 20 }, { wch: 24 }, { wch: 28 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sites')
  XLSX.writeFile(wb, 'sites-import-example.xlsx')
}

export function SitesImportExport() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [summary, setSummary] = useState<ImportResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showResults, setShowResults] = useState(false)

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    setError(null)
    setSummary(null)
    setShowResults(false)

    try {
      const form = new FormData()
      form.append('file', file)

      const res = await fetch('/api/sites/import', { method: 'POST', body: form })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Import failed')
      } else {
        setSummary(data as ImportResponse)
        setShowResults(true)
        router.refresh()
      }
    } catch {
      setError('Something went wrong')
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={handleImport}
      />

      <Button variant="outline" size="sm" onClick={downloadExampleXlsx}>
        Example
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={() => fileRef.current?.click()}
        disabled={importing}
      >
        {importing ? 'Importing…' : 'Import'}
      </Button>

      <Button variant="outline" size="sm" onClick={() => { window.location.href = '/api/sites/export' }}>
        Export
      </Button>

      {error && <span className="text-xs text-red-600">{error}</span>}

      {/* Results modal */}
      {showResults && summary && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setShowResults(false)}
        >
          <div
            className="bg-background rounded-lg border shadow-lg w-full max-w-lg p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold">Import Complete</h2>

            <div className="flex gap-4 text-sm">
              <div className="flex-1 rounded-md bg-green-50 border border-green-200 px-3 py-2 text-center">
                <p className="text-xl font-bold text-green-700">{summary.imported}</p>
                <p className="text-xs text-green-600">Imported</p>
              </div>
              <div className="flex-1 rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2 text-center">
                <p className="text-xl font-bold text-yellow-700">{summary.skipped}</p>
                <p className="text-xs text-yellow-600">Skipped</p>
              </div>
              <div className="flex-1 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-center">
                <p className="text-xl font-bold text-red-700">{summary.errors}</p>
                <p className="text-xs text-red-600">Errors</p>
              </div>
            </div>

            {summary.results.length > 0 && (
              <div className="max-h-64 overflow-y-auto rounded-md border text-xs">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Domain</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.results.map((r, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-3 py-1.5 font-mono">{r.domain}</td>
                        <td className="px-3 py-1.5">
                          {r.status === 'imported' && <span className="text-green-600 font-medium">Imported</span>}
                          {r.status === 'skipped' && <span className="text-yellow-600">{r.reason ?? 'Skipped'}</span>}
                          {r.status === 'error' && <span className="text-red-600">{r.reason ?? 'Error'}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end">
              <Button size="sm" onClick={() => setShowResults(false)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
