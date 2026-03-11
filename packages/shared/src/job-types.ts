// ─────────────────────────────────────────────
// Queue name constants
// ─────────────────────────────────────────────

export const QUEUES = {
  SITE_DISCOVERY: 'site-discovery',
  PAGE_CHECK: 'page-check',
  SSL_CHECK: 'ssl-check',
  SCHEDULER: 'scheduler',
} as const

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES]

// ─────────────────────────────────────────────
// Job priority levels
// ─────────────────────────────────────────────

export const JOB_PRIORITY = {
  CRITICAL: 1,  // manual re-check triggered by admin
  HIGH: 5,      // initial site discovery
  NORMAL: 10,   // scheduled checks
  LOW: 20,      // cleanup / background
} as const

// ─────────────────────────────────────────────
// Job data types (payload sent to each queue)
// ─────────────────────────────────────────────

export interface SiteDiscoveryJobData {
  siteId: string
  domain: string
  /** true = re-index: clears existing pages and re-discovers */
  reindex?: boolean
}

export interface PageCheckJobData {
  pageId: string
  siteId: string
  url: string
}

export interface SslCheckJobData {
  siteId: string
  domain: string
}

export interface SchedulerJobData {
  type: 'check-due-sites' | 'check-due-pages' | 'check-expiring-ssl' | 'cleanup-old-checks'
}

// ─────────────────────────────────────────────
// SSE event types (site discovery progress)
// ─────────────────────────────────────────────

export type SiteDiscoveryEventType =
  | 'http_done'
  | 'ssl_done'
  | 'robots_done'
  | 'sitemap_fetched'
  | 'pages_indexed'
  | 'page_checks_queued'
  | 'complete'
  | 'error'

export interface SiteDiscoveryEvent {
  type: SiteDiscoveryEventType
  siteId: string
  payload?: Record<string, unknown>
}
