import { Badge } from '@/components/ui/badge'
import { formatDaysUntilExpiry } from '@/lib/utils'

export function SslBadge({
  isValid,
  daysUntilExpiry,
}: {
  isValid: boolean | null
  daysUntilExpiry: number | null
}) {
  if (isValid === null) return <Badge variant="muted">—</Badge>

  if (!isValid) return <Badge variant="error">Invalid</Badge>

  if (daysUntilExpiry === null) return <Badge variant="muted">—</Badge>

  if (daysUntilExpiry < 0) return <Badge variant="error">Expired</Badge>

  if (daysUntilExpiry < 14)
    return <Badge variant="error">{formatDaysUntilExpiry(daysUntilExpiry)}</Badge>

  if (daysUntilExpiry < 30)
    return <Badge variant="warning">{formatDaysUntilExpiry(daysUntilExpiry)}</Badge>

  return <Badge variant="success">{formatDaysUntilExpiry(daysUntilExpiry)}</Badge>
}
