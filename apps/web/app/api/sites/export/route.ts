import * as XLSX from 'xlsx'
import { withAuthAndErrors } from '@/lib/api-helpers'
import { db } from '@/lib/db'

export const GET = withAuthAndErrors(async () => {
  const sites = await db.site.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      domain: true,
      displayName: true,
      status: true,
      checkIntervalMinutes: true,
      pageCheckIntervalMinutes: true,
      lastCheckedAt: true,
      createdAt: true,
      server: { select: { ipAddress: true, name: true } },
      sslCertificates: {
        orderBy: { checkedAt: 'desc' },
        take: 1,
        select: { isValid: true, daysUntilExpiry: true, validTo: true, issuer: true },
      },
      siteChecks: {
        orderBy: { checkedAt: 'desc' },
        take: 1,
        select: { httpStatus: true, responseTimeMs: true, isReachable: true },
      },
      _count: { select: { pages: true } },
    },
  })

  const rows = sites.map((s) => {
    const ssl = s.sslCertificates[0]
    const check = s.siteChecks[0]
    return {
      Domain: s.domain,
      'Display Name': s.displayName ?? '',
      Status: s.status,
      'Site Check Interval (min)': s.checkIntervalMinutes,
      'Page Check Interval (min)': s.pageCheckIntervalMinutes,
      'HTTP Status': check?.httpStatus ?? '',
      'Response Time (ms)': check?.responseTimeMs ?? '',
      Reachable: check ? (check.isReachable ? 'Yes' : 'No') : '',
      'SSL Valid': ssl ? (ssl.isValid ? 'Yes' : 'No') : '',
      'SSL Expiry (days)': ssl?.daysUntilExpiry ?? '',
      'SSL Expiry Date': ssl?.validTo ? ssl.validTo.toISOString().slice(0, 10) : '',
      'SSL Issuer': ssl?.issuer ?? '',
      'Server IP': s.server?.ipAddress ?? '',
      'Server Name': s.server?.name ?? '',
      'Page Count': s._count.pages,
      'Last Checked': s.lastCheckedAt ? s.lastCheckedAt.toISOString().replace('T', ' ').slice(0, 19) : '',
      'Added': s.createdAt.toISOString().replace('T', ' ').slice(0, 19),
    }
  })

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)

  // Auto-width columns
  const colWidths = Object.keys(rows[0] ?? {}).map((key) => ({
    wch: Math.max(key.length, ...rows.map((r) => String((r as Record<string, unknown>)[key] ?? '').length)) + 2,
  }))
  ws['!cols'] = colWidths

  XLSX.utils.book_append_sheet(wb, ws, 'Sites')

  const xlsxBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer

  return new Response(xlsxBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="sites-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  })
})
