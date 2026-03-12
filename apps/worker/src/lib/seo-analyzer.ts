export interface SeoIssue {
  type: string
  severity: 'error' | 'warning' | 'info'
  message: string
  recommendation: string
}

export interface SeoAnalysisResult {
  score: number
  issues: SeoIssue[]
  title: string | null
  description: string | null
  h1Count: number
  canonicalUrl: string | null
  hasViewport: boolean
  hasOgTags: boolean
  hasSchema: boolean
  imagesMissingAlt: number
  isIndexable: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractMeta(html: string, name: string): string | null {
  const re = new RegExp(`<meta[^>]+name\\s*=\\s*[\"']${name}[\"'][^>]+content\\s*=\\s*[\"']([^\"']{0,500})[\"']`, 'i')
  const re2 = new RegExp(`<meta[^>]+content\\s*=\\s*[\"']([^\"']{0,500})[\"'][^>]+name\\s*=\\s*[\"']${name}[\"']`, 'i')
  const m = re.exec(html) ?? re2.exec(html)
  return m ? m[1].trim() : null
}

function extractMetaProperty(html: string, property: string): string | null {
  const re = new RegExp(`<meta[^>]+property\\s*=\\s*[\"']${property}[\"'][^>]+content\\s*=\\s*[\"']([^\"']{0,500})[\"']`, 'i')
  const re2 = new RegExp(`<meta[^>]+content\\s*=\\s*[\"']([^\"']{0,500})[\"'][^>]+property\\s*=\\s*[\"']${property}[\"']`, 'i')
  const m = re.exec(html) ?? re2.exec(html)
  return m ? m[1].trim() : null
}

function extractTitle(html: string): string | null {
  const m = /<title[^>]*>([^<]{0,512})<\/title>/i.exec(html)
  return m ? m[1].replace(/\s+/g, ' ').trim() : null
}

function extractCanonical(html: string): string | null {
  const m = /<link[^>]+rel\s*=\s*[\"']canonical[\"'][^>]+href\s*=\s*[\"']([^\"']{0,2000})[\"']/i.exec(html)
    ?? /<link[^>]+href\s*=\s*[\"']([^\"']{0,2000})[\"'][^>]+rel\s*=\s*[\"']canonical[\"']/i.exec(html)
  return m ? m[1].trim() : null
}

function countH1(html: string): number {
  const matches = html.match(/<h1[\s>]/gi)
  return matches ? matches.length : 0
}

function hasViewportMeta(html: string): boolean {
  return /<meta[^>]+name\s*=\s*[\"']viewport[\"']/i.test(html)
}

function hasOgTags(html: string): boolean {
  return /<meta[^>]+property\s*=\s*[\"']og:title[\"']/i.test(html)
    && /<meta[^>]+property\s*=\s*[\"']og:description[\"']/i.test(html)
}

function hasSchemaOrg(html: string): boolean {
  return /application\/ld\+json/i.test(html) || /itemtype\s*=\s*[\"']https?:\/\/schema\.org/i.test(html)
}

function countImagesWithoutAlt(html: string): number {
  const imgRe = /<img\b([^>]*)>/gi
  let count = 0
  let m: RegExpExecArray | null
  while ((m = imgRe.exec(html)) !== null) {
    const attrs = m[1]
    // alt="" is intentionally empty (decorative) — that's fine; missing alt attr = issue
    if (!/\balt\s*=/i.test(attrs)) {
      count++
    }
  }
  return count
}

function isPageIndexable(html: string): boolean {
  // noindex in robots meta tag
  const robotsMeta = extractMeta(html, 'robots')
  if (robotsMeta && /noindex/i.test(robotsMeta)) return false
  // X-Robots-Tag is a header — can't check from HTML, skip
  return true
}

// ── Scoring ───────────────────────────────────────────────────────────────────
// Each check has a weight; passing = full points, partial = partial points

interface Check {
  weight: number
  pass: (result: Omit<SeoAnalysisResult, 'score' | 'issues'>) => boolean
}

const CHECKS: Check[] = [
  { weight: 20, pass: (r) => r.title !== null && r.title.length >= 10 && r.title.length <= 70 },
  { weight: 15, pass: (r) => r.description !== null && r.description.length >= 50 && r.description.length <= 160 },
  { weight: 15, pass: (r) => r.h1Count === 1 },
  { weight: 10, pass: (r) => r.canonicalUrl !== null },
  { weight: 10, pass: (r) => r.hasViewport },
  { weight: 10, pass: (r) => r.hasOgTags },
  { weight: 8,  pass: (r) => r.hasSchema },
  { weight: 7,  pass: (r) => r.imagesMissingAlt === 0 },
  { weight: 5,  pass: (r) => r.isIndexable },
]

const TOTAL_WEIGHT = CHECKS.reduce((s, c) => s + c.weight, 0)

function computeScore(data: Omit<SeoAnalysisResult, 'score' | 'issues'>): number {
  const earned = CHECKS.reduce((s, c) => s + (c.pass(data) ? c.weight : 0), 0)
  return Math.round((earned / TOTAL_WEIGHT) * 100)
}

function buildIssues(data: Omit<SeoAnalysisResult, 'score' | 'issues'>): SeoIssue[] {
  const issues: SeoIssue[] = []

  // Title
  if (data.title === null) {
    issues.push({ type: 'MISSING_TITLE', severity: 'error', message: 'Page has no <title> tag', recommendation: 'Add a descriptive <title> tag between 10–70 characters.' })
  } else if (data.title.length < 10) {
    issues.push({ type: 'TITLE_TOO_SHORT', severity: 'warning', message: `Title is too short (${data.title.length} chars)`, recommendation: 'Expand the title to at least 10 characters to describe the page content.' })
  } else if (data.title.length > 70) {
    issues.push({ type: 'TITLE_TOO_LONG', severity: 'warning', message: `Title is too long (${data.title.length} chars, max 70)`, recommendation: 'Shorten the title to under 70 characters to prevent truncation in search results.' })
  }

  // Meta description
  if (data.description === null) {
    issues.push({ type: 'MISSING_DESCRIPTION', severity: 'error', message: 'Page has no meta description', recommendation: 'Add a <meta name="description"> tag between 50–160 characters.' })
  } else if (data.description.length < 50) {
    issues.push({ type: 'DESCRIPTION_TOO_SHORT', severity: 'warning', message: `Meta description is too short (${data.description.length} chars)`, recommendation: 'Write a meta description of at least 50 characters summarising the page.' })
  } else if (data.description.length > 160) {
    issues.push({ type: 'DESCRIPTION_TOO_LONG', severity: 'warning', message: `Meta description is too long (${data.description.length} chars, max 160)`, recommendation: 'Shorten the meta description to under 160 characters to avoid truncation.' })
  }

  // H1
  if (data.h1Count === 0) {
    issues.push({ type: 'MISSING_H1', severity: 'error', message: 'Page has no <h1> heading', recommendation: 'Add a single <h1> tag containing the primary keyword for this page.' })
  } else if (data.h1Count > 1) {
    issues.push({ type: 'MULTIPLE_H1', severity: 'warning', message: `Page has ${data.h1Count} <h1> headings (should be exactly 1)`, recommendation: 'Use only one <h1> per page. Demote extras to <h2> or lower.' })
  }

  // Canonical
  if (data.canonicalUrl === null) {
    issues.push({ type: 'MISSING_CANONICAL', severity: 'warning', message: 'No canonical URL specified', recommendation: 'Add <link rel="canonical" href="..."> to prevent duplicate content issues.' })
  }

  // Viewport
  if (!data.hasViewport) {
    issues.push({ type: 'MISSING_VIEWPORT', severity: 'warning', message: 'No viewport meta tag found', recommendation: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> for mobile friendliness.' })
  }

  // OG tags
  if (!data.hasOgTags) {
    issues.push({ type: 'MISSING_OG_TAGS', severity: 'info', message: 'Missing Open Graph tags (og:title, og:description)', recommendation: 'Add og:title and og:description meta tags for better social media sharing previews.' })
  }

  // Schema.org
  if (!data.hasSchema) {
    issues.push({ type: 'MISSING_SCHEMA', severity: 'info', message: 'No schema.org structured data found', recommendation: 'Add JSON-LD structured data (e.g. WebPage, Article) to enhance rich snippets in search results.' })
  }

  // Images
  if (data.imagesMissingAlt > 0) {
    issues.push({ type: 'IMAGES_MISSING_ALT', severity: 'warning', message: `${data.imagesMissingAlt} image(s) missing alt attribute`, recommendation: 'Add descriptive alt attributes to all images for accessibility and image SEO.' })
  }

  // Noindex
  if (!data.isIndexable) {
    issues.push({ type: 'NOINDEX', severity: 'error', message: 'Page is marked noindex', recommendation: 'Remove the noindex directive if you want search engines to index this page.' })
  }

  return issues
}

// ── Main export ───────────────────────────────────────────────────────────────

export function analyzeSeo(html: string): SeoAnalysisResult {
  const data: Omit<SeoAnalysisResult, 'score' | 'issues'> = {
    title: extractTitle(html),
    description: extractMeta(html, 'description'),
    h1Count: countH1(html),
    canonicalUrl: extractCanonical(html),
    hasViewport: hasViewportMeta(html),
    hasOgTags: hasOgTags(html),
    hasSchema: hasSchemaOrg(html),
    imagesMissingAlt: countImagesWithoutAlt(html),
    isIndexable: isPageIndexable(html),
  }

  // Also check OG tags via property= attribute for hasOgTags
  const ogTitle = extractMetaProperty(html, 'og:title')
  const ogDesc = extractMetaProperty(html, 'og:description')
  data.hasOgTags = ogTitle !== null && ogDesc !== null

  const score = computeScore(data)
  const issues = buildIssues(data)

  return { ...data, score, issues }
}
