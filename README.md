# WebMonitor — Website Monitoring Platform

A full-stack website monitoring platform that automatically discovers and monitors all pages in a website, checks SSL certificates, website health, robots.txt compliance, and indexes sitemap pages.

## Documentation Index

| Document | Description |
|---|---|
| [architecture.md](./architecture.md) | System architecture, tech stack decisions, component overview |
| [database-schema.md](./database-schema.md) | PostgreSQL schema, indexes, relationships |
| [api-reference.md](./api-reference.md) | All REST API endpoints with request/response specs |
| [worker-system.md](./worker-system.md) | Background job queue design, worker types, scheduling |
| [frontend-pages.md](./frontend-pages.md) | UI pages, components, and feature descriptions |
| [docker-setup.md](./docker-setup.md) | Docker Compose services, environment variables, deployment |
| [development-guide.md](./development-guide.md) | Local dev setup, scripts, project structure |

## Quick Summary

**Stack:** Next.js 14 (App Router) · PostgreSQL 16 · Redis 7 · BullMQ · Prisma ORM · TailwindCSS · Docker

**Key Features:**
- Admin adds a domain → system auto-discovers everything
- SSL certificate monitoring with expiry alerts
- HTTP health checks (status, response time, redirects)
- robots.txt fetching and rule parsing
- XML sitemap crawling with concurrent page indexing
- Real-time dashboard with historical trend charts
- Scheduled re-checks (configurable per site)
- Alert system (email/webhook) for status changes
