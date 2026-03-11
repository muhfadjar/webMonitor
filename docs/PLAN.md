# Development Plan

## Overview

6 phases, sequenced by dependency. Each phase produces a working, testable increment.

| Phase | Focus | Deliverable |
|---|---|---|
| 1 | Foundation | Monorepo, Docker, DB schema, shared types |
| 2 | Core Backend | Prisma models, API skeleton, auth |
| 3 | Worker Engine | All 4 workers functional, queues wired |
| 4 | API Completion | All endpoints implemented and tested |
| 5 | Frontend | All UI pages functional |
| 6 | Polish | Alerts, SSE, scheduling, production hardening |

---

## Phase 1 — Foundation

**Goal:** Skeleton monorepo running with all infrastructure services healthy.

### 1.1 Monorepo Setup
- [ ] Init pnpm workspace with `pnpm-workspace.yaml`
- [ ] Create `apps/web/`, `apps/worker/`, `packages/shared/` directories
- [ ] Root `package.json` with workspace scripts: `dev`, `build`, `typecheck`, `lint`, `test`
- [ ] Shared TypeScript config (`tsconfig.base.json`) extended by each workspace

### 1.2 Docker Compose
- [ ] Write `docker-compose.yml` with services: `postgres`, `redis`, `app`, `worker`, `pgadmin` (debug profile)
- [ ] Write `apps/web/Dockerfile` (multi-stage: deps → builder → runner)
- [ ] Write `apps/worker/Dockerfile`
- [ ] Create `.env.example` with all required variables documented
- [ ] Verify `docker compose up -d postgres redis` starts cleanly with healthchecks passing

### 1.3 Shared Package
- [ ] Init `packages/shared` with TypeScript
- [ ] Define all TypeScript interfaces in `src/types.ts`:
  - `Site`, `SiteCheck`, `SslCertificate`, `RobotsEntry`, `Page`, `PageCheck`, `Alert`
  - Status enums: `SiteStatus`, `PageStatus`, `AlertType`
- [ ] Define BullMQ job data types in `src/job-types.ts`:
  - `SiteDiscoveryJobData`, `PageCheckJobData`, `SslCheckJobData`
  - Queue name constants: `QUEUES.SITE_DISCOVERY`, `QUEUES.PAGE_CHECK`, etc.
- [ ] Build and verify both apps can import from `@webmonitor/shared`

### 1.4 Database Schema
- [ ] Init Prisma in `apps/web/`: `pnpm prisma init`
- [ ] Write full `prisma/schema.prisma` (all 8 models: User, Site, SiteCheck, SslCertificate, RobotsEntry, Page, PageCheck, Alert)
- [ ] Add all indexes as documented in `database-schema.md`
- [ ] Run first migration: `prisma migrate dev --name init`
- [ ] Write `prisma/seed.ts` to create initial admin user
- [ ] Run seed and verify with Prisma Studio

**Phase 1 verification:**
```bash
docker compose up -d postgres redis
pnpm --filter web prisma migrate dev
pnpm --filter web prisma db seed
pnpm --filter web prisma studio   # inspect tables
pnpm typecheck                    # zero errors
```

---

## Phase 2 — Core Backend (Web App)

**Goal:** Next.js app running with auth, Prisma client, and queue producer wired up.

### 2.1 Next.js App Scaffold
- [ ] Init Next.js 14 with App Router, TypeScript, TailwindCSS in `apps/web/`
- [ ] Install and configure shadcn/ui (`npx shadcn-ui@latest init`)
- [ ] Add base layout: `app/layout.tsx` with font, metadata
- [ ] Configure path aliases (`@/` → `apps/web/`)

### 2.2 Auth
- [ ] Install NextAuth.js v5
- [ ] Write `lib/auth.ts` with Credentials provider (bcrypt password check against DB)
- [ ] Write `app/api/auth/[...nextauth]/route.ts`
- [ ] Write login page: `app/(auth)/login/page.tsx` with email + password form
- [ ] Add session middleware (`middleware.ts`) to protect all `/(dashboard)/*` routes
- [ ] Test: login, session cookie set, redirect to `/`, unauthenticated redirect to `/login`

### 2.3 Core Libraries
- [ ] Write `lib/db.ts` — Prisma client singleton (prevents multiple instances in dev hot-reload)
- [ ] Write `lib/queues.ts` — BullMQ `Queue` instances (producer only, no `Worker`) for all 4 queues
- [ ] Write `lib/validators.ts` — Zod schemas:
  - `CreateSiteSchema` (domain, displayName?, checkIntervalMinutes?)
  - `UpdateSiteSchema`
  - `CreateAlertSchema`
  - `PaginationSchema`
- [ ] Write `lib/utils.ts` — domain normalization, URL helpers, response time formatting

### 2.4 API Route Skeleton
- [ ] Implement all route files as stubs returning `501 Not Implemented` — establishes file structure
- [ ] Add auth guard helper `withAuth(handler)` to avoid repeating session checks
- [ ] Add error handler wrapper `withErrorHandler(handler)` for consistent error responses

**Phase 2 verification:**
```bash
pnpm --filter web dev
# POST /api/auth/signin → 200 with session
# GET /api/sites → 401 without session, 200 with session (empty array)
# GET /dashboard → redirects to /login without session
```

---

## Phase 3 — Worker Engine

**Goal:** All 4 workers implemented and able to process jobs end-to-end.

### 3.1 Worker App Scaffold
- [ ] Init TypeScript Node.js project in `apps/worker/`
- [ ] Install: `bullmq`, `ioredis`, `@prisma/client`, `undici`, `fast-xml-parser`, `node-forge`
- [ ] Write `src/index.ts` — bootstraps all workers, handles `SIGTERM` graceful shutdown
- [ ] Write `src/queues/index.ts` — registers all 4 `Worker` instances with concurrency settings
- [ ] Connect Prisma client in `src/lib/db.ts` (same singleton pattern as web)

### 3.2 HTTP Client Library (`src/lib/http.ts`)
- [ ] Wrapper around `undici` with:
  - Configurable timeout (`REQUEST_TIMEOUT_MS`)
  - Max redirect following (5)
  - Custom `User-Agent` header
  - Per-domain rate limiting via Redis token bucket (5 req/sec default)
  - Returns: `{ status, headers, body, responseTimeMs, finalUrl }`

### 3.3 SSL Checker (`src/lib/ssl.ts`)
- [ ] Open raw TLS socket to `host:443` using Node.js `tls` module
- [ ] Extract from peer certificate:
  - Subject, Issuer (CN, O fields)
  - `valid_from`, `valid_to`
  - `daysUntilExpiry` (computed)
  - Serial number, SHA-256 fingerprint
  - Subject Alternative Names
  - Protocol version, cipher suite
- [ ] Handle errors: connection refused, expired cert, self-signed, wrong host

### 3.4 Robots.txt Parser (`src/lib/robots-parser.ts`)
- [ ] Fetch `https://domain/robots.txt` via HTTP client
- [ ] Parse directives line-by-line:
  - `User-agent`, `Disallow`, `Allow`, `Crawl-delay`, `Sitemap`
- [ ] Return structured object: `{ disallowRules, allowRules, sitemapUrls, crawlDelay }`
- [ ] Handle: missing robots.txt (404), non-200 responses, malformed content

### 3.5 Sitemap Parser (`src/lib/sitemap-parser.ts`)
- [ ] Use `fast-xml-parser` in streaming mode — do not buffer full XML into memory
- [ ] Implement an **iterative queue crawler** (not call-stack recursion) to handle arbitrary nesting depth:
  - Start with seed URLs (from robots.txt + fallbacks)
  - Maintain a `visited: Set<string>` to track fetched XML URLs — prevents infinite loops
  - For each URL dequeued: fetch, detect type, branch:
    - `<sitemapindex>` → extract all `<sitemap><loc>` child URLs → push to queue if not visited
    - `<urlset>` → extract all `<url>` entries → push to collected pages
  - Continue until queue is empty or safety caps hit
- [ ] Each page record carries: `{ url, lastModified, changeFreq, priority, sourceSitemap, sitemapChain }`
  - `sourceSitemap` = the direct parent XML URL
  - `sitemapChain` = full path of XML URLs traversed to reach this page, e.g. `["/sitemap_index.xml", "/en/sitemap.xml"]`
- [ ] Safety caps (configurable via env):
  - `MAX_SITEMAPS = 200` — max XML files fetched per crawl
  - `MAX_PAGES = 50000` — max pages collected per site
- [ ] Enforce same-domain restriction on sitemap child URLs (block SSRF)
- [ ] Each sitemap fetch: 15s timeout, non-fatal on failure (log + continue)
- [ ] Deduplicate final page list by SHA-256 of normalized URL before returning

### 3.6 Site Discovery Worker (`src/workers/site-discovery.worker.ts`)
- [ ] Receives job: `{ siteId, domain }`
- [ ] Step 1: HTTP check root URL → save to `site_checks`
- [ ] Step 2: SSL check → save to `ssl_certificates`
- [ ] Step 3: Fetch robots.txt → save to `robots_entries`
- [ ] Step 4: Build sitemap URL list (from robots.txt + common fallbacks)
- [ ] Step 5: Parse all sitemaps → collect page URLs
- [ ] Step 6: Bulk-insert pages in batches of 500 with `ON CONFLICT DO NOTHING`
- [ ] Step 7: Enqueue `page-check` jobs for all newly inserted pages via `addBulk()`
- [ ] Step 8: Update `sites.status = 'ACTIVE'`, `sites.last_checked_at = now()`
- [ ] On error: set `sites.status = 'ERROR'`, save `error_message`

### 3.7 Page Check Worker (`src/workers/page-check.worker.ts`)
- [ ] Receives job: `{ pageId, siteId, url }`
- [ ] HTTP GET the URL, follow redirects, record final URL
- [ ] Compute SHA-256 of response body
- [ ] Extract `<title>` from HTML response
- [ ] Insert `page_checks` record
- [ ] Update `pages.status` and `pages.last_checked_at`

### 3.8 SSL Check Worker (`src/workers/ssl-check.worker.ts`)
- [ ] Receives job: `{ siteId, domain }`
- [ ] Run SSL check via `src/lib/ssl.ts`
- [ ] Insert `ssl_certificates` record
- [ ] If expiry within threshold → enqueue alert

### 3.9 Scheduler Worker (`src/workers/scheduler.worker.ts`)
- [ ] BullMQ repeatable job running every 60 seconds
- [ ] Query sites where `status = 'ACTIVE'` AND overdue for check
- [ ] Enqueue `site-discovery` jobs for overdue sites at `NORMAL` priority
- [ ] Daily repeatable: scan SSL certs expiring within 30 days → enqueue `ssl-check`
- [ ] Daily repeatable: delete `page_checks` and `site_checks` older than 90 days

**Phase 3 verification:**
```bash
# Add a test site directly to DB via Prisma Studio
# Manually enqueue a site-discovery job via Redis CLI or test script
# Watch docker compose logs -f worker
# Verify in DB: site_checks, ssl_certificates, robots_entries, pages, page_checks populated
```

---

## Phase 4 — API Completion

**Goal:** All API endpoints fully implemented, validated, and returning correct data.

### 4.1 Sites API
- [ ] `GET /api/sites` — paginated list with `latestCheck`, `latestSsl`, page count stats
- [ ] `POST /api/sites` — validate domain, normalize, create site, enqueue discovery job
- [ ] `GET /api/sites/:id` — full detail with all latest sub-records
- [ ] `PATCH /api/sites/:id` — update displayName, checkInterval, status
- [ ] `DELETE /api/sites/:id` — cascade delete (Prisma handles via FK)
- [ ] `POST /api/sites/:id/recheck` — enqueue at `CRITICAL` priority
- [ ] `POST /api/sites/:id/reindex` — reset pages, re-enqueue discovery

### 4.2 History APIs
- [ ] `GET /api/sites/:id/checks` — site check history with date range filter
- [ ] `GET /api/sites/:id/ssl` — SSL certificate history
- [ ] `GET /api/sites/:id/robots` — robots.txt history

### 4.3 Pages API
- [ ] `GET /api/sites/:id/pages` — paginated, filterable, sortable page list
- [ ] `GET /api/sites/:id/pages/:pageId` — single page with check history
- [ ] `POST /api/sites/:id/pages/:pageId/recheck` — enqueue page check at `CRITICAL`

### 4.4 Supporting APIs
- [ ] `GET /api/sites/:id/sitemaps` — list discovered sitemaps grouped by URL
- [ ] `GET /api/sites/:id/alerts` — list alert configs
- [ ] `POST /api/sites/:id/alerts` — create alert
- [ ] `PATCH /api/alerts/:id` — update alert
- [ ] `DELETE /api/alerts/:id` — delete alert
- [ ] `GET /api/dashboard/stats` — aggregate counts across all sites
- [ ] `GET /api/dashboard/uptime` — uptime % per site for 7/30/90 days
- [ ] `GET /api/jobs/status` — BullMQ queue stats via `getJobCounts()`

### 4.5 SSE Stream
- [ ] `GET /api/sites/:id/stream` — Server-Sent Events endpoint
- [ ] Worker publishes progress events to Redis pub/sub channel `site:${siteId}:progress`
- [ ] SSE route subscribes and forwards events to client
- [ ] Events: `{ type: 'ssl_done' | 'robots_done' | 'sitemap_parsed' | 'pages_indexed' | 'complete', payload }`

**Phase 4 verification:**
```bash
# Use curl or Bruno/Insomnia to hit every endpoint
# Verify pagination, filters, sorting work correctly
# Verify auth guard rejects 401 on all routes without session
# Test POST /api/sites with invalid domain → 400 with Zod error details
# Test SSE stream while discovery runs in background
```

---

## Phase 5 — Frontend

**Goal:** All UI pages functional and connected to live API data.

### 5.1 Layout & Navigation
- [ ] `app/(dashboard)/layout.tsx` — sidebar with nav links, user menu, logout
- [ ] `components/layout/Sidebar.tsx` — nav items: Dashboard, Sites, Settings
- [ ] `components/layout/Breadcrumbs.tsx` — auto-generated from route segments
- [ ] Mobile: bottom tab bar replacing sidebar on small screens

### 5.2 Shared UI Components
- [ ] `components/ui/` — install shadcn components: Button, Card, Table, Badge, Input, Select, Dialog, Tabs, Tooltip, Skeleton
- [ ] `components/StatusBadge.tsx` — UP/DOWN/PENDING/ERROR/REDIRECT with color-coded pill
- [ ] `components/SslExpiryBadge.tsx` — days remaining, red < 14, yellow < 30, green otherwise
- [ ] `components/DomainInput.tsx` — auto-strips `https://`, validates on blur
- [ ] `components/charts/ResponseTimeChart.tsx` — Recharts line chart, responsive
- [ ] `components/charts/UptimeBar.tsx` — 24-segment colored uptime bar

### 5.3 Login Page
- [ ] `app/(auth)/login/page.tsx` — email + password form, error state, loading state
- [ ] Redirect to `/` on success

### 5.4 Dashboard Page
- [ ] `app/(dashboard)/page.tsx`
- [ ] Stats cards: Total Sites, Sites Up/Down, Total Pages, Pages with Issues, SSL Expiring
- [ ] Response time line chart (last 24h per site, via SWR + `refreshInterval: 60000`)
- [ ] Recent Issues panel — last 10 alerts/downs with site name + URL
- [ ] Sites table with status badges and quick links

### 5.5 Sites List Page
- [ ] `app/(dashboard)/sites/page.tsx`
- [ ] Table: Domain, Status, Pages count, Uptime %, Avg Response Time, SSL Expiry, Actions
- [ ] Status filter tabs (All / Active / Error / Paused / Pending)
- [ ] Search input (client-side filter or server query param)
- [ ] Add Site button → `/sites/new`

### 5.6 Add Site Page
- [ ] `app/(dashboard)/sites/new/page.tsx`
- [ ] Form: `<DomainInput>`, Display Name, Check Interval selector
- [ ] Submit → POST `/api/sites` → redirect to `/sites/:id` with success toast
- [ ] Show validation errors inline

### 5.7 Site Detail Page
- [ ] `app/(dashboard)/sites/[siteId]/page.tsx`
- [ ] Header: domain, `<StatusBadge>`, last checked time, action buttons (Re-check, Re-index, Pause, Delete)
- [ ] Info row: HTTP Status, Response Time, Page Count, SSL Status
- [ ] Tabs: Overview | Pages | SSL | Robots.txt | Alerts | History
- [ ] Overview tab: server, headers, robots summary, discovery progress (SSE)
- [ ] History tab: site check history table + response time chart

### 5.8 Pages List Page
- [ ] `app/(dashboard)/sites/[siteId]/pages/page.tsx`
- [ ] Stats bar: Total / Up / Down / Redirect / Error / Pending
- [ ] Filter pills by status, search box by URL
- [ ] Table: URL, HTTP Status badge, Response Time, Title, Last Checked, Re-check button
- [ ] Pagination with page size selector (25 / 50 / 100)

### 5.9 Single Page Detail
- [ ] `app/(dashboard)/sites/[siteId]/pages/[pageId]/page.tsx`
- [ ] Full URL, source sitemap, current status
- [ ] Response time chart (last 20 checks)
- [ ] Check history table with content change indicator (hash diff)

### 5.10 SSL Page
- [ ] `app/(dashboard)/sites/[siteId]/ssl/page.tsx`
- [ ] Current cert card: issuer, subject, valid dates, `<SslExpiryBadge>`, protocol, cipher, SANs
- [ ] Historical certificates table (last 10)

### 5.11 Robots.txt Page
- [ ] `app/(dashboard)/sites/[siteId]/robots/page.tsx`
- [ ] Last fetched + HTTP status
- [ ] Raw content in monospace code block with copy button
- [ ] Parsed rules accordion (per user-agent)
- [ ] Sitemaps found list with external links

### 5.12 Alerts Page
- [ ] `app/(dashboard)/sites/[siteId]/alerts/page.tsx`
- [ ] Existing alerts table with active toggle and delete
- [ ] Add alert form: type selector, threshold, email, webhook URL

**Phase 5 verification:**
```bash
# Walk through every page in browser
# Add a site → watch discovery progress in real-time (SSE)
# Verify pages list populates after discovery
# Verify SSL card shows correct cert details
# Verify robots.txt page shows parsed rules
# Resize to mobile — verify sidebar collapses
```

---

## Phase 6 — Polish & Production Hardening

**Goal:** Alerts work, edge cases handled, ready for deployment.

### 6.1 Alert System
- [ ] Write `apps/worker/src/lib/alerts.ts` — alert dispatcher
- [ ] Email alerts via Nodemailer (SMTP config from env)
- [ ] Webhook alerts via HTTP POST with JSON payload
- [ ] Alert deduplication — don't re-trigger within cooldown period (1h default)
- [ ] Trigger points in workers:
  - Site down detection in `site-discovery.worker.ts`
  - Page down detection in `page-check.worker.ts`
  - SSL expiry in `ssl-check.worker.ts`
  - Content change in `page-check.worker.ts`

### 6.2 BullMQ Dashboard (Optional Admin UI)
- [ ] Install `@bull-board/api` + `@bull-board/nextjs`
- [ ] Mount at `/admin/queues` (protected by admin session)
- [ ] Shows waiting/active/completed/failed counts per queue

### 6.3 Error Handling & Resilience
- [ ] Global error boundary in Next.js (`app/error.tsx`, `app/global-error.tsx`)
- [ ] API route: return structured errors consistently `{ error, code, details }`
- [ ] Worker: dead-letter failed jobs to a `failed-jobs` queue for inspection
- [ ] Handle sitemap URLs that return non-XML (HTML error pages)
- [ ] Handle oversized sitemaps (> 50MB) — stream parse, don't buffer

### 6.4 Performance
- [ ] Add `Suspense` + loading skeletons to all dashboard pages
- [ ] Implement `generateStaticParams` for site detail pages where appropriate
- [ ] Lazy-load Recharts charts (dynamic import, `ssr: false`)
- [ ] Database: add `EXPLAIN ANALYZE` on slow queries, add missing indexes if found
- [ ] Prisma: review N+1 queries in sites list (use `include` or raw SQL aggregation)

### 6.5 Security Audit
- [ ] Verify all API routes have session guard
- [ ] Add rate limiting middleware on `POST /api/sites` (prevent spam)
- [ ] Sanitize domain input — reject private IP ranges, localhost, reserved TLDs
- [ ] Add `Content-Security-Policy` headers in `next.config.js`
- [ ] Review Docker Compose — ensure worker has no exposed ports

### 6.6 Production Docker
- [ ] Finalize multi-stage Dockerfiles for minimal image size
- [ ] Add `healthcheck` to app and worker containers
- [ ] Document Nginx reverse proxy config for port 80/443
- [ ] Write `docker compose -f docker-compose.prod.yml` with no volume mounts
- [ ] Test cold start: `docker compose up -d` from scratch, seed, verify all healthy

### 6.7 Documentation Updates
- [ ] Update `docs/development-guide.md` with any deviations from original plan
- [ ] Add `CHANGELOG.md` with v1.0 entry
- [ ] Update `CLAUDE.md` with any new patterns discovered during build

**Phase 6 verification:**
```bash
# Trigger a site going down → verify alert email/webhook fires
# Check BullMQ dashboard at /admin/queues
# Run docker compose build → verify images build cleanly
# docker compose up -d (fresh) → all healthchecks pass within 60s
# Run pnpm typecheck && pnpm lint → zero errors
```

---

## Milestone Summary

| Milestone | Phase Complete | What's Working |
|---|---|---|
| M1 | Phase 1 | Docker up, DB migrated, types compile |
| M2 | Phase 2 | Login works, API skeleton responds |
| M3 | Phase 3 | Worker crawls a site end-to-end |
| M4 | Phase 4 | Full API functional, SSE live |
| M5 | Phase 5 | Full UI navigable with real data |
| M6 | Phase 6 | Alerts fire, production-ready |

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Large sitemaps (100k+ URLs) OOM worker | Medium | Streaming XML parser, batch inserts, cap per-site at 50k pages and 200 XML files |
| Circular sitemap references (A → B → A) | Low | `visited` set in iterative crawler prevents re-fetching any URL already processed |
| Deeply nested sitemap trees | Low | Iterative queue handles unlimited depth safely without call-stack overflow |
| Sitemap child URLs pointing to external domains | Low | Same-domain enforcement — child sitemap URLs must match registered site domain |
| External site blocks crawler (403/429) | High | Respect `Crawl-Delay`, rotate User-Agent, log as `ERROR` status not crash |
| SSL check hangs on slow hosts | Medium | 10s TLS socket timeout enforced in `ssl.ts` |
| Redis memory pressure with large queues | Low | Set `maxmemory-policy allkeys-lru` in Redis config |
| Prisma hot-reload creates too many DB connections | High | Singleton pattern in `lib/db.ts` with global cache in dev |
| NextAuth session expiry during long discoveries | Low | SSE stream handles reconnect; frontend retries on `EventSource` error |

---

## Development Order Within Each Phase

Within each phase, follow this order:
1. Write types/interfaces first
2. Write and test library utilities in isolation
3. Wire up to DB / queue
4. Write API route / worker
5. Write UI last (depends on API contract being stable)
