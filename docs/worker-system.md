# Worker System

## Overview

Background processing is handled by a **separate Node.js worker service** using BullMQ backed by Redis. This keeps the Next.js app responsive while heavy crawling happens asynchronously.

## Queue Architecture

```
Redis
├── queue:site-discovery     (concurrency: 5)
├── queue:page-check         (concurrency: 20)
├── queue:ssl-check          (concurrency: 10)
└── queue:scheduler          (concurrency: 1)
```

## Worker Types

### 1. Site Discovery Worker (`site-discovery` queue)

Triggered when a new site is added or a re-index is requested.

**Steps:**
1. Normalize domain → prepend `https://`, resolve redirects to determine base URL
2. Perform HTTP GET on root URL, capture:
   - Final URL (after redirects)
   - HTTP status code
   - Response time (ms)
   - Response headers: `Server`, `Content-Type`, `X-Powered-By`, `X-Frame-Options`, etc.
3. Check SSL certificate via TLS socket:
   - Issuer CN and O fields
   - Subject
   - Valid from/to dates
   - Days until expiry
   - Protocol (TLSv1.2 / TLSv1.3)
   - Cipher suite
   - Subject Alternative Names
4. Fetch `https://domain/robots.txt`:
   - Parse `User-agent`, `Disallow`, `Allow`, `Crawl-delay`, `Sitemap` directives
   - Extract all sitemap URLs
5. Compile seed sitemap URL list:
   - `Sitemap:` entries from robots.txt
   - Common fallbacks tried in order if none found: `/sitemap.xml`, `/sitemap_index.xml`, `/sitemap/sitemap.xml`
6. Recursively crawl all sitemaps (see algorithm below)
7. Bulk-insert collected page URLs into `pages` table in batches of 500 using `ON CONFLICT DO NOTHING`
8. Enqueue a `page-check` job for each newly inserted page via `addBulk()`
9. Update `sites` record: `status = 'active'`, `last_checked_at = now()`

**Recursive Sitemap Crawl Algorithm:**

The sitemap crawler uses an iterative queue (not call-stack recursion) to safely handle deep nesting and avoid stack overflows.

```
function crawlSitemaps(seedUrls):
  queue       = seedUrls            // URLs yet to be fetched
  visited     = Set()               // prevents re-fetching the same XML URL
  collectedPages = []               // accumulated page records

  while queue is not empty:
    url = queue.shift()

    if url in visited → skip
    if visited.size >= MAX_SITEMAPS (default 200) → log warning, break
    visited.add(url)

    response = httpGet(url, timeout=15s)
    if response fails → log error, continue to next URL (non-fatal)

    xmlType = detect(response.body)

    if xmlType == "sitemapindex":
      // Contains <sitemap><loc> entries pointing to more XML files
      childUrls = parse all <loc> values inside <sitemap> elements
      for each childUrl:
        if childUrl not in visited → queue.push(childUrl)

    else if xmlType == "urlset":
      // Contains <url><loc> entries — actual page URLs
      pages = parse all <url> elements:
        { url: <loc>, lastModified: <lastmod>, changeFreq: <changefreq>,
          priority: <priority>, sourceSitemap: url }
      collectedPages.push(...pages)

    else:
      log "unexpected XML format at {url}", continue

  return deduplicate(collectedPages)   // by normalized URL
```

**Safeguards:**
- `MAX_SITEMAPS = 200` — hard cap on number of XML files fetched per site
- `MAX_PAGES = 50,000` — hard cap on pages collected per site; stops collecting once reached, logs warning
- `visited` set prevents infinite loops from circular `<loc>` references between sitemaps
- Each HTTP fetch has a 15s timeout independent of the page-check worker timeout
- Non-XML responses (HTML error pages, 404s) at sitemap URLs are logged and skipped — do not abort the job
- Sitemap URLs must share the same registered domain as the monitored site (prevents SSRF via crafted robots.txt)

**Error handling:**
- If root URL is unreachable → set `status = 'error'`, save error message
- If SSL check fails → save error message in `ssl_certificates`, continue
- If robots.txt returns 404 → save `is_accessible = false`, continue
- Individual sitemap fetch failures are logged per-URL but do not abort the job — partial results are saved

---

### 2. Page Check Worker (`page-check` queue)

Processes individual page health checks. High concurrency (20 parallel workers).

**Steps:**
1. HTTP GET the page URL (follow up to 5 redirects, record final URL)
2. Capture:
   - HTTP status code
   - Response time
   - `Content-Length`
   - Final URL if redirected
3. If response is HTML, extract `<title>` tag
4. Compute SHA-256 hash of response body (detect content changes)
5. Insert record into `page_checks`
6. Update `pages.status` and `pages.last_checked_at`
7. Check alert conditions:
   - If status changed (e.g., was UP, now 404) → trigger `PAGE_DOWN` alert
   - If content hash changed → trigger `CONTENT_CHANGE` alert

**Job data:**
```json
{
  "pageId": "uuid",
  "siteId": "uuid",
  "url": "https://example.com/about"
}
```

---

### 3. SSL Check Worker (`ssl-check` queue)

Dedicated SSL-only checks (run on schedule independent of full site checks).

**Steps:**
1. Open TLS connection to host:443
2. Extract certificate details
3. Insert into `ssl_certificates`
4. If `daysUntilExpiry <= threshold` → trigger `SSL_EXPIRY` alert

---

### 4. Scheduler Worker (`scheduler` queue)

Runs a cron-like process to enqueue periodic checks.

**Schedule logic:**
- Every minute: query `sites` where `status = 'active'` AND `last_checked_at + check_interval_minutes <= now()`
- For each due site: enqueue `site-discovery` job (or lighter site-only check)
- Every 5 minutes: enqueue pending `page-check` jobs for pages that haven't been checked in their site's interval

**Cron jobs (via BullMQ's `repeat` option):**
| Job | Schedule | Description |
|---|---|---|
| check-due-sites | `* * * * *` | Enqueue overdue site checks |
| check-expiring-ssl | `0 8 * * *` | Daily SSL expiry scan |
| cleanup-old-checks | `0 3 * * *` | Delete check records older than 90 days |

---

## Job Priority Levels

| Priority | Value | Use Case |
|---|---|---|
| CRITICAL | 1 | Manual re-check triggered by admin |
| HIGH | 5 | Initial site discovery |
| NORMAL | 10 | Scheduled page checks |
| LOW | 20 | Background cleanup jobs |

---

## Concurrency & Rate Limiting

- Page check workers respect `Crawl-Delay` from robots.txt per domain
- Per-domain rate limiting using Redis token bucket (max 5 req/sec per domain by default)
- Sitemap parsing uses streaming XML parser to handle large sitemaps (100k+ URLs) without memory issues

---

## Retry Policy

| Queue | Max Attempts | Backoff |
|---|---|---|
| site-discovery | 3 | Exponential: 1min, 5min, 15min |
| page-check | 2 | Fixed: 30s |
| ssl-check | 3 | Exponential: 1min, 5min |
| scheduler | 1 | No retry |

---

## Fast Indexing

When a new site is added with a large sitemap (e.g., 10,000 pages):

1. All URLs parsed and bulk-inserted in batches of 500 (`~20 DB round trips`)
2. `page-check` jobs enqueued in batch via `addBulk()` (single Redis pipeline)
3. 20 concurrent workers process pages simultaneously
4. Typical time to index 1,000 pages: ~30-60 seconds
5. Typical time to index 10,000 pages: ~5-10 minutes

---

## Environment Variables (Worker Service)

```env
DATABASE_URL=postgresql://user:pass@postgres:5432/webmonitor
REDIS_URL=redis://redis:6379
PAGE_CHECK_CONCURRENCY=20
SITE_DISCOVERY_CONCURRENCY=5
SSL_CHECK_CONCURRENCY=10
MAX_REQUESTS_PER_DOMAIN_PER_SEC=5
REQUEST_TIMEOUT_MS=10000
MAX_REDIRECTS=5
USER_AGENT=WebMonitor/1.0 (+https://your-monitor-domain.com)
```
