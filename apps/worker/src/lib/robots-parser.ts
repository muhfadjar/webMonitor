export interface RobotsResult {
  isAccessible: boolean
  httpStatus: number | null
  rawContent: string | null
  sitemapUrls: string[]
  disallowRules: Record<string, string[]>
  allowRules: Record<string, string[]>
  crawlDelay: number | null
  errorMessage: string | null
}

/**
 * Parse robots.txt content into structured rules.
 * Handles multi-agent blocks and extracts Sitemap directives.
 */
export function parseRobots(content: string): Omit<RobotsResult, 'isAccessible' | 'httpStatus' | 'errorMessage'> {
  const sitemapUrls: string[] = []
  const disallowRules: Record<string, string[]> = {}
  const allowRules: Record<string, string[]> = {}
  let crawlDelay: number | null = null

  let currentAgents: string[] = []

  for (const rawLine of content.split('\n')) {
    // Strip inline comments and trim
    const line = rawLine.replace(/#.*$/, '').trim()
    if (!line) {
      currentAgents = []
      continue
    }

    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue

    const directive = line.slice(0, colonIdx).trim().toLowerCase()
    const value = line.slice(colonIdx + 1).trim()

    switch (directive) {
      case 'user-agent':
        currentAgents.push(value)
        break

      case 'disallow':
        if (value && currentAgents.length > 0) {
          for (const agent of currentAgents) {
            disallowRules[agent] = [...(disallowRules[agent] ?? []), value]
          }
        }
        break

      case 'allow':
        if (value && currentAgents.length > 0) {
          for (const agent of currentAgents) {
            allowRules[agent] = [...(allowRules[agent] ?? []), value]
          }
        }
        break

      case 'crawl-delay': {
        const delay = parseFloat(value)
        if (!isNaN(delay) && crawlDelay === null) {
          crawlDelay = Math.round(delay)
        }
        break
      }

      case 'sitemap':
        if (value && isValidUrl(value)) {
          sitemapUrls.push(value)
        }
        break
    }
  }

  return { sitemapUrls, disallowRules, allowRules, crawlDelay, rawContent: content }
}

function isValidUrl(s: string): boolean {
  try {
    new URL(s)
    return true
  } catch {
    return false
  }
}
