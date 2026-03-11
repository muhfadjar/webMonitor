import { z } from 'zod'

// ── Domain input: strip protocol + trailing slash, lowercase ─────────────────
const domainTransform = z
  .string()
  .min(1, 'Domain is required')
  .transform((val) =>
    val
      .replace(/^https?:\/\//i, '')
      .replace(/\/$/, '')
      .toLowerCase()
      .trim()
  )
  .refine(
    (val) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z]{2,})+/.test(val),
    { message: 'Must be a valid domain (e.g. example.com)' }
  )

// ── Sites ────────────────────────────────────────────────────────────────────
export const CreateSiteSchema = z.object({
  domain: domainTransform,
  displayName: z.string().max(255).optional(),
  checkIntervalMinutes: z.coerce.number().int().min(5).max(10080).default(60),
})

export const UpdateSiteSchema = z.object({
  displayName: z.string().max(255).optional(),
  checkIntervalMinutes: z.coerce.number().int().min(5).max(10080).optional(),
  status: z.enum(['ACTIVE', 'PAUSED']).optional(),
})

// ── Alerts ───────────────────────────────────────────────────────────────────
export const CreateAlertSchema = z
  .object({
    type: z.enum([
      'SSL_EXPIRY',
      'SITE_DOWN',
      'PAGE_DOWN',
      'STATUS_CHANGE',
      'CONTENT_CHANGE',
    ]),
    thresholdDays: z.coerce.number().int().min(1).max(365).optional(),
    notificationEmail: z.string().email().optional(),
    webhookUrl: z.string().url().optional(),
  })
  .refine((data) => data.notificationEmail || data.webhookUrl, {
    message: 'At least one of notificationEmail or webhookUrl is required',
  })

export const UpdateAlertSchema = z.object({
  isActive: z.boolean().optional(),
  notificationEmail: z.string().email().optional(),
  webhookUrl: z.string().url().optional(),
  thresholdDays: z.coerce.number().int().min(1).max(365).optional(),
})

// ── Pagination ───────────────────────────────────────────────────────────────
export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
})

export const SiteListSchema = PaginationSchema.extend({
  status: z.enum(['PENDING', 'ACTIVE', 'ERROR', 'PAUSED']).optional(),
})

export const PageListSchema = PaginationSchema.extend({
  status: z
    .enum(['PENDING', 'UP', 'DOWN', 'REDIRECT', 'ERROR'])
    .optional(),
  search: z.string().optional(),
  sortBy: z
    .enum(['url', 'status', 'responseTimeMs', 'lastCheckedAt'])
    .default('url'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export const CheckHistorySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
})

export const UptimeQuerySchema = z.object({
  days: z.coerce.number().refine((v) => [7, 30, 90].includes(v), {
    message: 'days must be 7, 30, or 90',
  }),
})

// ── Login ────────────────────────────────────────────────────────────────────
export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})
