import * as XLSX from 'xlsx'
import { NextResponse } from 'next/server'
import { withAuthAndErrors } from '@/lib/api-helpers'
import { db } from '@/lib/db'
import { siteDiscoveryQueue, JOB_PRIORITY } from '@/lib/queues'
import { auth } from '@/lib/auth'
import { CreateSiteSchema } from '@/lib/validators'

interface ImportResult {
  domain: string
  status: 'imported' | 'skipped' | 'error'
  reason?: string
}

export const POST = withAuthAndErrors(async (req) => {
  const session = await auth()

  const formData = await req.formData()
  const file = formData.get('file')

  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  }

  const buffer = Buffer.from(await (file as File).arrayBuffer())
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return NextResponse.json({ error: 'Empty workbook' }, { status: 400 })

  // Convert to array of objects; header row auto-detected
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

  if (rawRows.length === 0) {
    return NextResponse.json({ error: 'No rows found in file' }, { status: 400 })
  }

  if (rawRows.length > 500) {
    return NextResponse.json({ error: 'Maximum 500 sites per import' }, { status: 400 })
  }

  // Normalize header keys (case-insensitive, strip spaces)
  function pick(row: Record<string, unknown>, ...keys: string[]): string {
    for (const key of keys) {
      const found = Object.keys(row).find((k) => k.toLowerCase().replace(/\s+/g, '') === key.toLowerCase().replace(/\s+/g, ''))
      if (found && row[found] !== '' && row[found] != null) return String(row[found]).trim()
    }
    return ''
  }

  const results: ImportResult[] = []

  for (const raw of rawRows) {
    const domain = pick(raw, 'domain')
    if (!domain) continue

    const parsed = CreateSiteSchema.safeParse({
      domain,
      displayName: pick(raw, 'displayName', 'display_name', 'DisplayName') || undefined,
      checkIntervalMinutes: pick(raw, 'checkIntervalMinutes', 'checkintervalminutes', 'SiteCheckInterval(min)') || undefined,
      pageCheckIntervalMinutes: pick(raw, 'pageCheckIntervalMinutes', 'pagecheckintervalminutes', 'PageCheckInterval(min)') || undefined,
    })

    if (!parsed.success) {
      results.push({ domain, status: 'error', reason: parsed.error.errors[0]?.message ?? 'Invalid' })
      continue
    }

    const { domain: cleanDomain, displayName, checkIntervalMinutes, pageCheckIntervalMinutes } = parsed.data

    const existing = await db.site.findUnique({ where: { domain: cleanDomain }, select: { id: true } })
    if (existing) {
      results.push({ domain: cleanDomain, status: 'skipped', reason: 'Already exists' })
      continue
    }

    try {
      const site = await db.site.create({
        data: {
          domain: cleanDomain,
          displayName,
          checkIntervalMinutes,
          pageCheckIntervalMinutes,
          createdBy: session!.user.id,
          status: 'PENDING',
        },
      })

      await siteDiscoveryQueue.add(
        `discover:${site.id}`,
        { siteId: site.id, domain: cleanDomain },
        { priority: JOB_PRIORITY.HIGH }
      )

      results.push({ domain: cleanDomain, status: 'imported' })
    } catch {
      results.push({ domain, status: 'error', reason: 'Database error' })
    }
  }

  const imported = results.filter((r) => r.status === 'imported').length
  const skipped = results.filter((r) => r.status === 'skipped').length
  const errors = results.filter((r) => r.status === 'error').length

  return NextResponse.json({ imported, skipped, errors, results })
})
