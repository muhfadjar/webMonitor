// ─────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────

export enum SiteStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  ERROR = 'ERROR',
  PAUSED = 'PAUSED',
}

export enum PageStatus {
  PENDING = 'PENDING',
  UP = 'UP',
  DOWN = 'DOWN',
  REDIRECT = 'REDIRECT',
  ERROR = 'ERROR',
}

export enum AlertType {
  SSL_EXPIRY = 'SSL_EXPIRY',
  SITE_DOWN = 'SITE_DOWN',
  PAGE_DOWN = 'PAGE_DOWN',
  STATUS_CHANGE = 'STATUS_CHANGE',
  CONTENT_CHANGE = 'CONTENT_CHANGE',
}

export enum Role {
  ADMIN = 'ADMIN',
  VIEWER = 'VIEWER',
}

// ─────────────────────────────────────────────
// Domain entities
// ─────────────────────────────────────────────

export interface User {
  id: string
  email: string
  name: string | null
  role: Role
  createdAt: Date
  updatedAt: Date
}

export interface Site {
  id: string
  domain: string
  displayName: string | null
  status: SiteStatus
  checkIntervalMinutes: number
  createdBy: string
  lastCheckedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface SiteCheck {
  id: string
  siteId: string
  checkedAt: Date
  httpStatus: number | null
  responseTimeMs: number | null
  redirectUrl: string | null
  serverHeader: string | null
  contentType: string | null
  xPoweredBy: string | null
  isReachable: boolean
  errorMessage: string | null
  rawHeaders: Record<string, string> | null
}

export interface SslCertificate {
  id: string
  siteId: string
  checkedAt: Date
  isValid: boolean
  issuer: string | null
  subject: string | null
  validFrom: Date | null
  validTo: Date | null
  daysUntilExpiry: number | null
  serialNumber: string | null
  fingerprintSha256: string | null
  protocol: string | null
  cipherSuite: string | null
  subjectAltNames: string[]
  errorMessage: string | null
}

export interface RobotsEntry {
  id: string
  siteId: string
  fetchedAt: Date
  isAccessible: boolean
  rawContent: string | null
  sitemapUrls: string[]
  disallowRules: Record<string, string[]> | null
  allowRules: Record<string, string[]> | null
  crawlDelay: number | null
  httpStatus: number | null
  errorMessage: string | null
}

export interface Page {
  id: string
  siteId: string
  url: string
  urlHash: string
  path: string | null
  /** Direct parent sitemap XML URL this page was found in */
  sourceSitemap: string | null
  /** Full chain of sitemap XML URLs traversed to reach this page */
  sitemapChain: string[]
  priority: number | null
  changeFreq: string | null
  lastModified: Date | null
  status: PageStatus
  lastCheckedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface PageCheck {
  id: string
  pageId: string
  siteId: string
  checkedAt: Date
  httpStatus: number | null
  responseTimeMs: number | null
  isReachable: boolean
  redirectUrl: string | null
  contentHash: string | null
  contentLength: number | null
  title: string | null
  errorMessage: string | null
}

export interface Alert {
  id: string
  siteId: string | null
  pageId: string | null
  type: AlertType
  thresholdDays: number | null
  isActive: boolean
  notificationEmail: string | null
  webhookUrl: string | null
  lastTriggeredAt: Date | null
  createdAt: Date
}

// ─────────────────────────────────────────────
// API response shapes
// ─────────────────────────────────────────────

export interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: Pagination
}

export interface SiteWithStats extends Site {
  latestCheck: Pick<SiteCheck, 'httpStatus' | 'responseTimeMs' | 'isReachable'> | null
  latestSsl: Pick<SslCertificate, 'isValid' | 'daysUntilExpiry'> | null
  pageCount: number
  pagesUp: number
  pagesDown: number
}

export interface PageWithLatestCheck extends Page {
  latestCheck: Pick<PageCheck, 'httpStatus' | 'responseTimeMs' | 'title'> | null
}

export interface GoogleTagsResult {
  gtm: string[]
  ga4: string[]
  ua: string[]
  ads: string[]
  optimize: string[]
  verificationCodes: string[]
  detectedAt: string
}

export interface DashboardStats {
  totalSites: number
  sitesUp: number
  sitesDown: number
  totalPages: number
  pagesUp: number
  pagesDown: number
  sslExpiringSoon: number
  avgResponseTimeMs: number
}
