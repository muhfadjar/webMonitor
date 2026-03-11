import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Robots' }

export default async function SiteRobotsPage({ params }: { params: { siteId: string } }) {
  const site = await db.site.findUnique({
    where: { id: params.siteId },
    select: { id: true, domain: true },
  })
  if (!site) notFound()

  const entries = await db.robotsEntry.findMany({
    where: { siteId: site.id },
    orderBy: { fetchedAt: 'desc' },
    take: 5,
  })

  const latest = entries[0]

  return (
    <div className="space-y-6">
      {!latest ? (
        <p className="text-sm text-muted-foreground">robots.txt has not been fetched yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div>
                  <Badge variant={latest.isAccessible ? 'success' : 'error'}>
                    {latest.isAccessible ? 'Accessible' : 'Not accessible'}
                  </Badge>
                </div>
                <p><span className="text-muted-foreground">HTTP {latest.httpStatus}</span></p>
                <p className="text-muted-foreground">Fetched {formatDate(latest.fetchedAt)}</p>
                {latest.crawlDelay !== null && (
                  <p><span className="text-muted-foreground">Crawl-delay:</span> {latest.crawlDelay}s</p>
                )}
              </CardContent>
            </Card>

            {latest.sitemapUrls.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Sitemaps ({latest.sitemapUrls.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1">
                    {latest.sitemapUrls.map((url) => (
                      <li key={url}>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-xs text-primary hover:underline break-all"
                        >
                          {url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>

          {latest.rawContent && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Raw Content</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="font-mono text-xs bg-muted p-4 rounded-md overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
                  {latest.rawContent}
                </pre>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
