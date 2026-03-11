import { Badge } from '@/components/ui/badge'

type SiteStatus = 'PENDING' | 'ACTIVE' | 'ERROR' | 'PAUSED'
type PageStatus = 'PENDING' | 'UP' | 'DOWN' | 'REDIRECT' | 'ERROR'

const siteVariant: Record<SiteStatus, 'muted' | 'success' | 'error' | 'warning'> = {
  PENDING: 'muted',
  ACTIVE: 'success',
  ERROR: 'error',
  PAUSED: 'warning',
}

const pageVariant: Record<PageStatus, 'muted' | 'success' | 'error' | 'warning' | 'secondary'> = {
  PENDING: 'muted',
  UP: 'success',
  DOWN: 'error',
  REDIRECT: 'warning',
  ERROR: 'error',
}

const siteLabel: Record<SiteStatus, string> = {
  PENDING: 'Pending',
  ACTIVE: 'Active',
  ERROR: 'Error',
  PAUSED: 'Paused',
}

const pageLabel: Record<PageStatus, string> = {
  PENDING: 'Pending',
  UP: 'Up',
  DOWN: 'Down',
  REDIRECT: 'Redirect',
  ERROR: 'Error',
}

export function SiteStatusBadge({ status }: { status: string }) {
  const s = status as SiteStatus
  return <Badge variant={siteVariant[s] ?? 'muted'}>{siteLabel[s] ?? status}</Badge>
}

export function PageStatusBadge({ status }: { status: string }) {
  const s = status as PageStatus
  return <Badge variant={pageVariant[s] ?? 'muted'}>{pageLabel[s] ?? status}</Badge>
}
