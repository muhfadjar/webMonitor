import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// ── shadcn/ui helper ─────────────────────────────────────────────────────────
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── Domain helpers ───────────────────────────────────────────────────────────

/** Strip protocol and trailing slash, return bare domain */
export function normalizeDomain(input: string): string {
  return input
    .replace(/^https?:\/\//i, '')
    .replace(/\/$/, '')
    .toLowerCase()
    .trim()
}

/** Build https URL from bare domain */
export function siteUrl(domain: string): string {
  return `https://${domain}`
}

// ── Formatting ───────────────────────────────────────────────────────────────

export function formatResponseTime(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

export function formatDaysUntilExpiry(days: number | null): string {
  if (days === null) return '—'
  if (days < 0) return 'Expired'
  if (days === 0) return 'Expires today'
  if (days === 1) return '1 day'
  return `${days} days`
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function truncateUrl(url: string, maxLength = 64): string {
  if (url.length <= maxLength) return url
  return url.slice(0, maxLength) + '…'
}

export function formatDate(date: Date | string | null): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(date))
}

export function timeAgo(date: Date | string | null): string {
  if (!date) return '—'
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// ── HTTP status helpers ──────────────────────────────────────────────────────

export function httpStatusLabel(status: number | null): string {
  if (status === null) return 'Unknown'
  if (status >= 200 && status < 300) return 'OK'
  if (status >= 300 && status < 400) return 'Redirect'
  if (status >= 400 && status < 500) return 'Client Error'
  if (status >= 500) return 'Server Error'
  return String(status)
}

export function isSuccessStatus(status: number | null): boolean {
  return status !== null && status >= 200 && status < 400
}
