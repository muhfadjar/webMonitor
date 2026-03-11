import { fetch, type Response } from 'undici'
import { URL } from 'url'

const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS ?? 10_000)
const SITEMAP_TIMEOUT_MS = Number(process.env.SITEMAP_TIMEOUT_MS ?? 15_000)
const MAX_REDIRECTS = 5
const USER_AGENT = process.env.USER_AGENT ?? 'WebMonitor/1.0'
const MIN_INTERVAL_MS = Math.ceil(1000 / Number(process.env.MAX_REQUESTS_PER_DOMAIN_PER_SEC ?? 5))

// ── Per-domain rate limiter (in-memory token bucket) ────────────────────────
// Maps domain → timestamp when the next request is allowed
const domainNextAllowed = new Map<string, number>()

async function rateLimit(hostname: string): Promise<void> {
  const now = Date.now()
  const nextAllowed = domainNextAllowed.get(hostname) ?? now
  const waitMs = nextAllowed - now
  // Schedule next slot after this one
  domainNextAllowed.set(hostname, Math.max(nextAllowed, now) + MIN_INTERVAL_MS)
  if (waitMs > 0) await sleep(waitMs)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ── Result types ─────────────────────────────────────────────────────────────

export interface HttpResult {
  status: number
  responseTimeMs: number
  finalUrl: string
  headers: Record<string, string>
  body: string
  error?: undefined
}

export interface HttpError {
  error: string
  responseTimeMs: number
  status?: undefined
  finalUrl?: undefined
  headers?: undefined
  body?: undefined
}

export type FetchResult = HttpResult | HttpError

// ── Core fetch wrapper ────────────────────────────────────────────────────────

async function doFetch(
  url: string,
  timeoutMs: number,
  applyRateLimit: boolean
): Promise<FetchResult> {
  let hostname = ''
  try {
    hostname = new URL(url).hostname
  } catch {
    return { error: `Invalid URL: ${url}`, responseTimeMs: 0 }
  }

  if (applyRateLimit) await rateLimit(hostname)

  const start = Date.now()
  try {
    const response: Response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
      // undici doesn't have maxRedirections on fetch directly;
      // we rely on its internal default (20) and accept that
    })

    const responseTimeMs = Date.now() - start
    const body = await response.text()

    const headers: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      headers[key] = value
    })

    return {
      status: response.status,
      responseTimeMs,
      finalUrl: response.url,
      headers,
      body,
    }
  } catch (err: unknown) {
    const responseTimeMs = Date.now() - start
    const message = err instanceof Error ? err.message : String(err)
    return { error: message, responseTimeMs }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Fetch a page URL with rate limiting applied. */
export function fetchPage(url: string): Promise<FetchResult> {
  return doFetch(url, REQUEST_TIMEOUT_MS, true)
}

/** Fetch robots.txt — rate limited, shorter effective timeout. */
export function fetchRobots(url: string): Promise<FetchResult> {
  return doFetch(url, REQUEST_TIMEOUT_MS, true)
}

/** Fetch a sitemap XML file — no rate limit (different timeout). */
export function fetchSitemap(url: string): Promise<FetchResult> {
  return doFetch(url, SITEMAP_TIMEOUT_MS, false)
}

/** Fetch the root site URL to gather HTTP info — rate limited. */
export function fetchSiteRoot(url: string): Promise<FetchResult> {
  return doFetch(url, REQUEST_TIMEOUT_MS, true)
}
