export interface GoogleTagsResult {
  gtm: string[]              // GTM-XXXXX container IDs
  ga4: string[]              // G-XXXXX GA4 measurement IDs
  ua: string[]               // UA-XXXXX-X Universal Analytics IDs
  ads: string[]              // AW-XXXXX Google Ads conversion IDs
  optimize: string[]         // OPT-XXXXX Google Optimize container IDs
  verificationCodes: string[] // google-site-verification meta content values
  detectedAt: string         // ISO timestamp
}

function unique(arr: string[]): string[] {
  return [...new Set(arr)]
}

export function detectGoogleTags(html: string): GoogleTagsResult {
  const gtm: string[] = []
  const ga4: string[] = []
  const ua: string[] = []
  const ads: string[] = []
  const optimize: string[] = []
  const verificationCodes: string[] = []

  // GTM container IDs — GTM-XXXXXX
  for (const m of html.matchAll(/GTM-[A-Z0-9]+/g)) {
    gtm.push(m[0])
  }

  // GA4 measurement IDs — G-XXXXXXXXXX
  for (const m of html.matchAll(/['"`]G-([A-Z0-9]+)['"`]/g)) {
    ga4.push(`G-${m[1]}`)
  }
  // Also match bare G- in src/href attributes
  for (const m of html.matchAll(/[?&]id=(G-[A-Z0-9]+)/g)) {
    ga4.push(m[1])
  }

  // Universal Analytics — UA-XXXXXXXX-X
  for (const m of html.matchAll(/UA-\d{4,12}-\d+/g)) {
    ua.push(m[0])
  }

  // Google Ads conversion IDs — AW-XXXXXXXXXX
  for (const m of html.matchAll(/['"`]AW-([A-Z0-9]+)['"`]/g)) {
    ads.push(`AW-${m[1]}`)
  }
  for (const m of html.matchAll(/[?&]id=(AW-[A-Z0-9]+)/g)) {
    ads.push(m[1])
  }

  // Google Optimize container IDs — OPT-XXXXXXX
  for (const m of html.matchAll(/OPT-[A-Z0-9]+/g)) {
    optimize.push(m[0])
  }

  // Google Search Console / site verification meta tags
  // <meta name="google-site-verification" content="...">
  for (const m of html.matchAll(
    /<meta\s[^>]*name\s*=\s*['"]google-site-verification['"][^>]*content\s*=\s*['"]([^'"]+)['"]/gi
  )) {
    verificationCodes.push(m[1])
  }
  // Also handle reversed attribute order: content first, then name
  for (const m of html.matchAll(
    /<meta\s[^>]*content\s*=\s*['"]([^'"]+)['"]\s[^>]*name\s*=\s*['"]google-site-verification['"]/gi
  )) {
    verificationCodes.push(m[1])
  }

  return {
    gtm: unique(gtm),
    ga4: unique(ga4),
    ua: unique(ua),
    ads: unique(ads),
    optimize: unique(optimize),
    verificationCodes: unique(verificationCodes),
    detectedAt: new Date().toISOString(),
  }
}

export function hasAnyGoogleTag(result: GoogleTagsResult): boolean {
  return (
    result.gtm.length > 0 ||
    result.ga4.length > 0 ||
    result.ua.length > 0 ||
    result.ads.length > 0 ||
    result.optimize.length > 0 ||
    result.verificationCodes.length > 0
  )
}
