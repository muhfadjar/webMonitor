# System Architecture

## Overview

WebMonitor is a monorepo containing a Next.js web application, a separate Node.js worker service, a PostgreSQL database, and Redis for job queuing. All services are containerized with Docker Compose.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          DOCKER COMPOSE NETWORK                         │
│                                                                         │
│  ┌─────────────────┐    ┌──────────────────┐    ┌───────────────────┐  │
│  │  Next.js App    │    │   PostgreSQL 16   │    │    Redis 7        │  │
│  │  (Port 3000)    │◄──►│   (Port 5432)     │◄──►│   (Port 6379)    │  │
│  │                 │    │                  │    │                   │  │
│  │  - UI Pages     │    │  - Sites table   │    │  - BullMQ queues  │  │
│  │  - API Routes   │    │  - Pages table   │    │  - Job results    │  │
│  │  - Auth (NextAuth)   │  - Checks table  │    │  - Rate limiting  │  │
│  └────────┬────────┘    │  - SSL certs     │    └────────┬──────────┘  │
│           │             │  - Alerts        │             │             │
│           │             └──────────────────┘             │             │
│           │                                              │             │
│  ┌────────▼──────────────────────────────────────────────▼──────────┐  │
│  │                     Worker Service (Node.js)                      │  │
│  │                                                                   │  │
│  │  ┌──────────────┐  ┌─────────────────┐  ┌───────────────────┐   │  │
│  │  │  site-worker │  │  page-worker    │  │  scheduler-worker │   │  │
│  │  │              │  │                 │  │                   │   │  │
│  │  │ - HTTP info  │  │ - Status check  │  │ - Cron triggers   │   │  │
│  │  │ - SSL check  │  │ - Response time │  │ - Re-index jobs   │   │  │
│  │  │ - robots.txt │  │ - Content hash  │  │ - Alert checks    │   │  │
│  │  │ - Sitemaps   │  │ - Screenshot*   │  └───────────────────┘   │  │
│  │  └──────────────┘  └─────────────────┘                          │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Tech Stack Decisions

### Next.js 14 (App Router)
- **Why:** Unified full-stack framework — API routes and UI in one repo, no separate backend service needed for the web layer. App Router enables React Server Components for fast initial page loads.
- **API:** REST via Next.js Route Handlers (`/app/api/...`)
- **Auth:** NextAuth.js v5 with credential provider

### PostgreSQL 16
- **Why:** Relational data with strong consistency for monitoring records. Time-series-like check history benefits from table partitioning. Rich indexing (B-tree, partial indexes) keeps queries fast even with millions of check records.

### Redis 7 + BullMQ
- **Why:** BullMQ provides a robust priority queue with retries, concurrency control, and job prioritization. Sitemap pages can be enqueued and processed concurrently (up to N workers) for fast initial indexing.
- **Queues:**
  - `site-discovery` — initial site crawl when a domain is added
  - `page-check` — individual page health checks
  - `ssl-check` — SSL certificate verification
  - `scheduler` — periodic re-check triggers

### Prisma ORM
- **Why:** Type-safe database access, auto-generated migrations, intuitive schema DSL. Works seamlessly with Next.js.

### TailwindCSS + shadcn/ui
- **Why:** Rapid UI development with consistent design system. shadcn/ui provides accessible components without heavy dependencies.

### Docker Compose
- **Why:** Reproducible local development and production deployment. Single `docker-compose up` starts all services.

## Data Flow — Adding a New Site

```
Admin inputs domain
        │
        ▼
POST /api/sites
        │
        ▼
Create site record (status: "pending")
        │
        ▼
Enqueue job → site-discovery queue
        │
        ▼
Worker picks up job
        ├── Fetch site info (HTTP headers, title, meta, server)
        ├── Check SSL certificate (expiry, issuer, chain)
        ├── Fetch robots.txt (parse rules, sitemaps listed)
        └── Discover XML sitemaps
                │
                ▼
        Parse each sitemap
                │
                ▼
        Bulk-insert page URLs into DB
                │
                ▼
        Enqueue page-check jobs (concurrent, batched)
                │
                ▼
        Workers check each page (status, response time, redirects)
                │
                ▼
        Store check results in DB
                │
                ▼
        Update site status → "active"
```

## Indexing Strategy for Speed

1. **Concurrent workers** — BullMQ concurrency set to 20 workers per queue by default (configurable).
2. **Batch DB inserts** — Pages discovered from sitemaps are inserted in bulk (`INSERT ... VALUES` batches of 500).
3. **Prioritized queues** — Initial discovery jobs get higher priority than periodic re-checks.
4. **Sitemap index support** — Sitemap index files (`<sitemapindex>`) are recursively parsed to enumerate all child sitemaps.
5. **Deduplication** — URLs are normalized and de-duplicated before insertion using `ON CONFLICT DO NOTHING`.
6. **Connection pooling** — PgBouncer-style pooling via Prisma's built-in connection pool.

## Security

- All admin routes protected by NextAuth session
- Input domain validated and normalized before processing
- Worker process has no public-facing ports
- Environment secrets injected via Docker secrets / `.env`
- Rate limiting on API routes via Redis token bucket
