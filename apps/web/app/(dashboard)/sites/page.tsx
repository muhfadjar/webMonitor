import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const metadata = { title: 'Sites' }

export default function SitesPage() {
  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sites</h1>
          <p className="text-muted-foreground text-sm mt-1">
            All monitored domains
          </p>
        </div>
        <a
          href="/sites/new"
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Add Site
        </a>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monitored Sites</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Full sites table coming in Phase 5.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
