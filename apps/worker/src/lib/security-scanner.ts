import { URL } from 'url'

export interface SecurityIssue {
  type:
    | 'CONTENT_CHANGED'
    | 'NEW_EXTERNAL_SCRIPT'
    | 'SUSPICIOUS_PATTERN'
    | 'CROSS_DOMAIN_REDIRECT'
  detail: string
}

// ── Suspicious pattern rules ─────────────────────────────────────────────────

const SUSPICIOUS_RULES: Array<{ pattern: RegExp; label: string }> = [
  // Crypto miners
  { pattern: /coinhive\.min\.js|cryptonight|webminepool|crypto-loot\.com|miner\.start\s*\(/i, label: 'Crypto miner script detected' },
  // Obfuscated JavaScript
  { pattern: /eval\s*\(\s*atob\s*\(/, label: 'Obfuscated JS: eval(atob(...))' },
  { pattern: /eval\s*\(\s*unescape\s*\(/, label: 'Obfuscated JS: eval(unescape(...))' },
  { pattern: /document\.write\s*\(\s*unescape\s*\(/, label: 'Obfuscated JS: document.write(unescape(...))' },
  // String.fromCharCode obfuscation (> 8 sequential char codes is suspicious)
  { pattern: /String\.fromCharCode\s*\((?:\s*\d+\s*,){8,}/, label: 'Char code obfuscation (String.fromCharCode)' },
  // Hidden iframes (common malware dropper technique)
  { pattern: /<iframe[^>]+(?:width\s*=\s*["']?\s*0|height\s*=\s*["']?\s*0)[^>]*>/i, label: 'Zero-size hidden iframe' },
  { pattern: /<iframe[^>]+style\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden)[^"']*["']/i, label: 'Hidden iframe (CSS)' },
  // Pharma spam injection
  { pattern: /<[a-z][^>]*>(?:[^<]{0,30})?(?:buy\s+cheap|order\s+online|lowest\s+price)\s+(?:viagra|cialis|levitra|tramadol|xanax|ambien)/i, label: 'Pharma spam keyword injection' },
  // Base64 data URIs executing scripts
  { pattern: /src\s*=\s*["']data:text\/javascript;base64,/i, label: 'Inline base64-encoded script src' },
  // Cookie theft pattern
  { pattern: /document\.cookie[^;]+document\.location\s*=/i, label: 'Potential cookie exfiltration' },
  // Known malware domains (common)
  { pattern: /c\.statcounter\.xyz|clickanalytics\.xyz|stats-counter\.org|countstat\.ru/i, label: 'Known malware tracking domain' },
]

// ── External script domain extraction ────────────────────────────────────────

export function extractExternalScriptDomains(html: string, ownHostname: string): string[] {
  const domains = new Set<string>()
  // <script src="https://...">
  const scriptRe = /<script[^>]+\bsrc\s*=\s*["']?(https?:\/\/[^"'\s>]+)/gi
  // <link href="https://..."> (stylesheet injection)
  const linkRe = /<link[^>]+\bhref\s*=\s*["']?(https?:\/\/[^"'\s>]+)/gi

  for (const re of [scriptRe, linkRe]) {
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) !== null) {
      try {
        const host = new URL(m[1]).hostname
        if (host && host !== ownHostname) {
          domains.add(host.toLowerCase())
        }
      } catch { /* ignore unparseable URLs */ }
    }
  }
  return Array.from(domains).sort()
}

// ── Main scanner ──────────────────────────────────────────────────────────────

export interface ScanInput {
  html: string
  pageUrl: string
  finalUrl: string
  previousContentHash: string | null
  currentContentHash: string | null
  previousExternalScripts: string[]
}

export function scanPage(input: ScanInput): {
  issues: SecurityIssue[]
  externalScripts: string[]
} {
  const issues: SecurityIssue[] = []

  let ownHostname = ''
  try { ownHostname = new URL(input.pageUrl).hostname } catch { /* ok */ }

  // 1. Content change detection
  if (
    input.previousContentHash &&
    input.currentContentHash &&
    input.previousContentHash !== input.currentContentHash
  ) {
    issues.push({
      type: 'CONTENT_CHANGED',
      detail: `Page content changed (hash mismatch)`,
    })
  }

  // 2. Cross-domain redirect detection
  if (input.finalUrl && input.finalUrl !== input.pageUrl) {
    try {
      const originalHost = new URL(input.pageUrl).hostname
      const finalHost = new URL(input.finalUrl).hostname
      if (originalHost !== finalHost) {
        issues.push({
          type: 'CROSS_DOMAIN_REDIRECT',
          detail: `Redirected from ${originalHost} to ${finalHost}`,
        })
      }
    } catch { /* ignore */ }
  }

  // 3. New external scripts (injection detection)
  const externalScripts = extractExternalScriptDomains(input.html, ownHostname)
  if (input.previousExternalScripts.length > 0) {
    const prevSet = new Set(input.previousExternalScripts)
    const newDomains = externalScripts.filter((d) => !prevSet.has(d))
    for (const domain of newDomains) {
      issues.push({
        type: 'NEW_EXTERNAL_SCRIPT',
        detail: `New external script/stylesheet domain: ${domain}`,
      })
    }
  }

  // 4. Suspicious pattern scan
  for (const rule of SUSPICIOUS_RULES) {
    if (rule.pattern.test(input.html)) {
      issues.push({
        type: 'SUSPICIOUS_PATTERN',
        detail: rule.label,
      })
      rule.pattern.lastIndex = 0 // reset stateful regex
    }
  }

  // Deduplicate by detail string
  const seen = new Set<string>()
  const deduped = issues.filter((i) => {
    const key = `${i.type}:${i.detail}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return { issues: deduped, externalScripts }
}
