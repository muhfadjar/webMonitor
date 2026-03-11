import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SslBadge } from '@/components/SslBadge'
import { RecheckButton } from '@/components/RecheckButton'
import { formatDate, timeAgo } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'SSL' }

export default async function SiteSslPage({ params }: { params: { siteId: string } }) {
  const site = await db.site.findUnique({
    where: { id: params.siteId },
    select: { id: true, domain: true },
  })
  if (!site) notFound()

  const certs = await db.sslCertificate.findMany({
    where: { siteId: site.id },
    orderBy: { checkedAt: 'desc' },
    take: 30,
  })

  const latest = certs[0]

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <RecheckButton url={`/api/sites/${site.id}/recheck`} label="Refresh SSL" />
      </div>

      {latest && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Status</CardTitle>
            </CardHeader>
            <CardContent>
              <SslBadge isValid={latest.isValid} daysUntilExpiry={latest.daysUntilExpiry} />
              {latest.errorMessage && (
                <p className="mt-2 text-xs text-destructive">{latest.errorMessage}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Validity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p><span className="text-muted-foreground">From:</span> {formatDate(latest.validFrom)}</p>
              <p><span className="text-muted-foreground">To:</span> {formatDate(latest.validTo)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Certificate</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {latest.subject && <p><span className="text-muted-foreground">Subject:</span> {latest.subject}</p>}
              {latest.issuer && <p><span className="text-muted-foreground">Issuer:</span> {latest.issuer}</p>}
              {latest.protocol && <p><span className="text-muted-foreground">Protocol:</span> {latest.protocol}</p>}
              {latest.cipherSuite && <p><span className="text-muted-foreground">Cipher:</span> {latest.cipherSuite}</p>}
            </CardContent>
          </Card>

          {latest.subjectAltNames.length > 0 && (
            <Card className="sm:col-span-2 lg:col-span-3">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Subject Alternative Names</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {latest.subjectAltNames.map((san) => (
                    <span key={san} className="font-mono text-xs bg-muted px-2 py-1 rounded">{san}</span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* History table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Check History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {certs.length === 0 ? (
            <p className="px-6 py-6 text-sm text-muted-foreground">No SSL checks yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-6 py-2 text-left font-medium text-muted-foreground">Checked</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Days Left</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Expires</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Issuer</th>
                  </tr>
                </thead>
                <tbody>
                  {certs.map((cert) => (
                    <tr key={cert.id} className="border-b last:border-0">
                      <td className="px-6 py-2 text-muted-foreground">{timeAgo(cert.checkedAt)}</td>
                      <td className="px-4 py-2">
                        <SslBadge isValid={cert.isValid} daysUntilExpiry={cert.daysUntilExpiry} />
                      </td>
                      <td className="px-4 py-2 tabular-nums text-muted-foreground">
                        {cert.daysUntilExpiry ?? '—'}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{formatDate(cert.validTo)}</td>
                      <td className="px-4 py-2 text-muted-foreground truncate max-w-xs">{cert.issuer ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
