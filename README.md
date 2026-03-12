# WebMonitor — Website Monitoring Platform

A full-stack website monitoring platform that automatically discovers and monitors all pages in a website, checks SSL certificates, website health, robots.txt compliance, and indexes sitemap pages.

## Documentation Index

| Document | Description |
|---|---|
| [docs/architecture.md](./docs/architecture.md) | System architecture, tech stack decisions, component overview |
| [docs/database-schema.md](./docs/database-schema.md) | PostgreSQL schema, indexes, relationships |
| [docs/api-reference.md](./docs/api-reference.md) | All REST API endpoints with request/response specs |
| [docs/worker-system.md](./docs/worker-system.md) | Background job queue design, worker types, scheduling |
| [docs/frontend-pages.md](./docs/frontend-pages.md) | UI pages, components, and feature descriptions |
| [docs/docker-setup.md](./docs/docker-setup.md) | Docker Compose services, environment variables, deployment |
| [docs/development-guide.md](./docs/development-guide.md) | Local dev setup, scripts, project structure |

## Quick Summary

**Stack:** Next.js 14 (App Router) · PostgreSQL 16 · Redis 7 · BullMQ · Prisma ORM · TailwindCSS · Docker

**Key Features:**
- Admin adds a domain → system auto-discovers everything
- SSL certificate monitoring with expiry alerts
- HTTP health checks (status, response time, redirects)
- robots.txt fetching and rule parsing
- XML sitemap crawling with concurrent page indexing
- SEO analysis per page with scored audits and issue reporting
- Google tag detection (GTM, GA4, Ads, Search Console)
- Site tagging and bulk import/export via Excel
- Real-time dashboard with historical trend charts
- Scheduled re-checks (configurable interval per site and per page)
- Alert system (email/webhook) for status changes
