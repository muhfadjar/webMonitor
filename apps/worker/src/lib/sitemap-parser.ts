import { XMLParser } from 'fast-xml-parser'
import { fetchSitemap } from './http'
import { URL } from 'url'

const MAX_SITEMAPS = Number(process.env.MAX_SITEMAPS ?? 200)
const MAX_PAGES = Number(process.env.MAX_PAGES ?? 50_000)

export interface DiscoveredPage {
  url: string
  lastModified: Date | null
  changeFreq: string | null
  priority: number | null
  /** The direct parent sitemap XML URL this page was found in */
  sourceSitemap: string
  /** Full chain of XML URLs traversed to reach this page */
  sitemapChain: string[]
}

const xmlParser = new XMLParser({
  ignoreAttributes: true,
  isArray: (tagName) => tagName === 'url' || tagName === 'sitemap',
  parseTagValue: false,
  trimValues: true,
  removeNSPrefix: true,
})

/**
 * Iterative sitemap crawler.
 *
 * Starts from seed URLs (from robots.txt or common fallbacks),
 * recursively discovers nested <sitemapindex> entries, and collects
 * all <url> entries from <urlset> files.
 *
 * Uses an iterative queue (not call-stack recursion) to safely handle
 * unlimited nesting depth without stack overflow.
 */
export async function crawlSitemaps(
  seedUrls: string[],
  baseDomain: string
): Promise<{ pages: DiscoveredPage[]; sitemapsFetched: number }> {
  // queue entries: [url, ancestorChain]
  const queue: Array<[string, string[]]> = seedUrls.map((url) => [url, []])
  const visited = new Set<string>()
  const collectedPages: DiscoveredPage[] = []

  while (queue.length > 0 && visited.size < MAX_SITEMAPS && collectedPages.length < MAX_PAGES) {
    const entry = queue.shift()
    if (!entry) break
    const [sitemapUrl, chain] = entry

    // Normalize and deduplicate
    const normalizedUrl = normalizeSitemapUrl(sitemapUrl)
    if (visited.has(normalizedUrl)) continue

    // SSRF guard: sitemap child URLs must be on the same registered domain
    if (!isSameDomain(normalizedUrl, baseDomain)) {
      console.warn(`[sitemap-parser] Skipping cross-domain URL: ${normalizedUrl}`)
      continue
    }

    visited.add(normalizedUrl)

    const result = await fetchSitemap(normalizedUrl)
    if (result.error) {
      console.warn(`[sitemap-parser] Failed to fetch ${normalizedUrl}: ${result.error}`)
      continue
    }

    const body = result.body ?? ''
    if (!body.trim().startsWith('<')) {
      console.warn(`[sitemap-parser] Non-XML response at ${normalizedUrl}`)
      continue
    }

    const currentChain = [...chain, normalizedUrl]

    try {
      const parsed = xmlParser.parse(body) as Record<string, unknown>

      if (parsed['sitemapindex']) {
        // Sitemap index: contains pointers to more XML files
        const index = parsed['sitemapindex'] as Record<string, unknown>
        const sitemaps = asArray(index['sitemap'])

        for (const item of sitemaps) {
          const loc = extractLoc(item)
          if (loc) queue.push([loc, currentChain])
        }
      } else if (parsed['urlset']) {
        // URL set: contains actual page URLs
        const urlset = parsed['urlset'] as Record<string, unknown>
        const urls = asArray(urlset['url'])

        for (const item of urls) {
          if (collectedPages.length >= MAX_PAGES) break
          const loc = extractLoc(item)
          if (!loc) continue

          const lastmod = extractText(item, 'lastmod')
          const changefreq = extractText(item, 'changefreq')
          const priorityStr = extractText(item, 'priority')

          collectedPages.push({
            url: loc,
            lastModified: lastmod ? safeDate(lastmod) : null,
            changeFreq: changefreq ?? null,
            priority: priorityStr ? parseFloat(priorityStr) : null,
            sourceSitemap: normalizedUrl,
            sitemapChain: currentChain,
          })
        }
      } else {
        console.warn(`[sitemap-parser] Unknown XML root at ${normalizedUrl}`)
      }
    } catch (err) {
      console.warn(`[sitemap-parser] XML parse error at ${normalizedUrl}:`, err)
    }
  }

  if (visited.size >= MAX_SITEMAPS) {
    console.warn(`[sitemap-parser] MAX_SITEMAPS (${MAX_SITEMAPS}) reached — some sitemaps skipped`)
  }
  if (collectedPages.length >= MAX_PAGES) {
    console.warn(`[sitemap-parser] MAX_PAGES (${MAX_PAGES}) reached — some pages skipped`)
  }

  return { pages: deduplicatePages(collectedPages), sitemapsFetched: visited.size }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizeSitemapUrl(url: string): string {
  try {
    return new URL(url).toString()
  } catch {
    return url
  }
}

function isSameDomain(url: string, baseDomain: string): boolean {
  try {
    const { hostname } = new URL(url)
    return hostname === baseDomain || hostname.endsWith('.' + baseDomain)
  } catch {
    return false
  }
}

function asArray(value: unknown): unknown[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function extractLoc(item: unknown): string | null {
  if (typeof item === 'string') return item.trim() || null
  if (typeof item === 'object' && item !== null) {
    const obj = item as Record<string, unknown>
    const loc = obj['loc']
    if (typeof loc === 'string') return loc.trim() || null
  }
  return null
}

function extractText(item: unknown, key: string): string | null {
  if (typeof item !== 'object' || item === null) return null
  const obj = item as Record<string, unknown>
  const val = obj[key]
  if (typeof val === 'string') return val.trim() || null
  if (typeof val === 'number') return String(val)
  return null
}

function safeDate(s: string): Date | null {
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function deduplicatePages(pages: DiscoveredPage[]): DiscoveredPage[] {
  const seen = new Set<string>()
  return pages.filter((p) => {
    if (seen.has(p.url)) return false
    seen.add(p.url)
    return true
  })
}
