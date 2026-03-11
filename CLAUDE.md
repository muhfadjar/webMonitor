# WebMonitor — CLAUDE.md

Project-level instructions for Claude Code. Read this before making any changes.

## Project Overview

WebMonitor is a website monitoring platform. Admin adds a domain; the system auto-discovers SSL status, health, robots.txt, and all pages from XML sitemaps, then monitors them on a schedule.

## Monorepo Structure

```
apps/web/        → Next.js 14 (App Router) — UI + API routes
apps/worker/     → Node.js worker service — BullMQ job processors
packages/shared/ → Shared TypeScript types between web and worker
docs/            → Architecture and API documentation
```

Always identify which app a change belongs to before editing. Never mix web and worker concerns in the same file.

## Package Manager

**Use `pnpm` exclusively.** Never use `npm` or `yarn`.

```bash
pnpm install                              # install all workspaces
pnpm --filter web <cmd>                   # run command in apps/web
pnpm --filter worker <cmd>               # run command in apps/worker
pnpm --filter shared <cmd>               # run command in packages/shared
```

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 14 App Router | Use Server Components by default |
| Auth | NextAuth.js v5 | Credential provider, session-based |
| Database | PostgreSQL 16 via Prisma ORM | Migrations only via `prisma migrate` |
| Queue | BullMQ + Redis 7 | Workers in `apps/worker`, producers in `apps/web/lib/queues.ts` |
| Validation | Zod | All API inputs validated with Zod schemas in `lib/validators.ts` |
| UI | TailwindCSS + shadcn/ui | shadcn components in `components/ui/` |
| Charts | Recharts | Wrapped in `components/charts/` |
| Data fetching | SWR | Client-side data fetching with `refreshInterval` for live data |
| Infrastructure | Docker Compose | All services containerized |

## Commands

### Development
```bash
docker compose up -d postgres redis       # start infrastructure
pnpm --filter web dev                     # Next.js dev server (port 3000)
pnpm --filter worker dev                  # worker dev mode (separate terminal)
```

### Database
```bash
pnpm --filter web prisma migrate dev --name <name>   # new migration
pnpm --filter web prisma generate                    # regenerate client after schema change
pnpm --filter web prisma studio                      # open Prisma Studio
pnpm --filter web prisma db seed                     # seed admin user
```

### Quality
```bash
pnpm typecheck    # TypeScript check (run before committing)
pnpm lint         # ESLint
pnpm test         # tests
```

### Docker
```bash
docker compose up -d              # full stack
docker compose logs -f worker     # tail worker logs
docker compose down -v            # full reset
```

## Code Conventions

### TypeScript
- Strict mode enabled — no `any`, no `@ts-ignore` without explanation
- All shared types live in `packages/shared/src/types.ts`
- BullMQ job data types in `packages/shared/src/job-types.ts`
- Import shared types as `import type { ... } from '@webmonitor/shared'`

### Next.js App Router
- Prefer **React Server Components** (RSC) — only use `'use client'` when strictly needed (interactivity, hooks, browser APIs)
- Route handlers in `app/api/` — always validate input with Zod before touching DB
- Never import worker-side code (`bullmq` worker classes) into the web app — only use queue producers from `lib/queues.ts`
- Use `lib/db.ts` Prisma singleton — never instantiate `PrismaClient` directly in route handlers

### API Routes Pattern
```typescript
// app/api/sites/route.ts
import { z } from 'zod'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = CreateSiteSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })

  // ... handler logic
}
```

### Database / Prisma
- All schema changes go through `prisma/schema.prisma` + `prisma migrate dev` — never raw `ALTER TABLE`
- Use `select` in Prisma queries to avoid over-fetching columns
- For high-volume inserts (sitemap pages), use raw SQL batch inserts with `ON CONFLICT DO NOTHING`
- Denormalize `site_id` into `page_checks` for query efficiency — this is intentional

### Worker Service
- Each worker file exports a single `Worker` instance from BullMQ
- Workers must be idempotent — safe to re-run on retry
- Always update `sites.status` and `sites.last_checked_at` at the end of a site discovery job
- Log with structured context: `{ jobId, siteId, domain }` — no bare `console.log` strings
- Respect per-domain rate limiting (5 req/sec default) via Redis token bucket in `lib/http.ts`
- Sitemap parser uses an **iterative queue**, not call-stack recursion — handles unlimited nesting depth safely
- Sitemap crawler maintains a `visited: Set<string>` to prevent re-fetching URLs and break circular references
- Hard caps per crawl: `MAX_SITEMAPS=200` XML files, `MAX_PAGES=50000` page URLs (configurable via env)
- Child sitemap URLs must be on the same registered domain as the monitored site — reject cross-domain refs
- Both `<sitemapindex>` (XML pointers) and `<urlset>` (page URLs) are handled at any level of nesting

### Queues
- Queue names are constants — defined once in `packages/shared/src/job-types.ts`, imported everywhere
- Job priority levels: `CRITICAL=1`, `HIGH=5`, `NORMAL=10`, `LOW=20`
- Never enqueue a job from inside another job without checking for duplicates first

### UI Components
- Use shadcn/ui primitives from `components/ui/` — don't reach for Radix directly
- Domain inputs must use `<DomainInput>` component (auto-strips `https://`, validates hostname)
- Status indicators must use `<StatusBadge>` — don't write custom status colors inline
- All charts must use `<ResponsiveContainer>` from Recharts for mobile support

### Styling
- TailwindCSS only — no inline `style={{}}` except for dynamic values that can't be expressed as classes
- Dark mode supported via Tailwind's `dark:` variant
- No custom CSS files — use Tailwind utilities

## Database Schema Rules

- Never delete a column in a migration — mark it nullable first, clean up in a later migration
- New tables require: `id uuid PK`, `created_at timestamptz`, `updated_at timestamptz`
- All foreign keys require an index
- Check history tables (`site_checks`, `page_checks`) are append-only — never UPDATE them

## Security Rules

- Every API route must check session via `getServerSession` before any DB access
- Domain input must be normalized (strip protocol, lowercase, remove trailing slash) before storing
- Never log full HTTP response bodies — log status codes and URLs only
- Worker `USER_AGENT` must identify the bot (configured in env)
- No secrets in code — always use environment variables

## Environment Variables

Web app reads from `.env` at project root. Worker reads same file via Docker Compose env injection.

Required:
```
DATABASE_URL          postgresql connection string
REDIS_URL             redis://redis:6379
NEXTAUTH_SECRET       random 32-char string
NEXTAUTH_URL          public URL of app
```

Optional (worker tuning):
```
PAGE_CHECK_CONCURRENCY        default 20
SITE_DISCOVERY_CONCURRENCY    default 5
SSL_CHECK_CONCURRENCY         default 10
REQUEST_TIMEOUT_MS            default 10000
USER_AGENT                    default "WebMonitor/1.0"
```

## Adding a New Feature

1. Update `packages/shared/src/types.ts` with new interfaces
2. Update `prisma/schema.prisma` if DB changes needed → run `prisma migrate dev --name <name>`
3. Add Zod validator in `apps/web/lib/validators.ts`
4. Add API route handler in `apps/web/app/api/`
5. Add worker logic in `apps/worker/src/workers/` if background processing needed
6. Add new queue job type in `packages/shared/src/job-types.ts`
7. Add UI page/component in `apps/web/app/(dashboard)/` and `apps/web/components/`

## Key Files Reference

| File | Purpose |
|---|---|
| `apps/web/lib/db.ts` | Prisma client singleton |
| `apps/web/lib/auth.ts` | NextAuth configuration |
| `apps/web/lib/queues.ts` | BullMQ queue producers (web side only) |
| `apps/web/lib/validators.ts` | All Zod schemas for API validation |
| `apps/worker/src/workers/site-discovery.worker.ts` | Main site crawl logic |
| `apps/worker/src/workers/page-check.worker.ts` | Individual page checks |
| `apps/worker/src/workers/ssl-check.worker.ts` | SSL certificate checks |
| `apps/worker/src/workers/scheduler.worker.ts` | Cron-style scheduling |
| `apps/worker/src/lib/sitemap-parser.ts` | Streaming XML sitemap parser |
| `apps/worker/src/lib/robots-parser.ts` | robots.txt parser |
| `apps/worker/src/lib/ssl.ts` | TLS certificate inspector |
| `packages/shared/src/types.ts` | Shared TypeScript interfaces |
| `packages/shared/src/job-types.ts` | BullMQ job data types + queue name constants |
| `prisma/schema.prisma` | Database schema (source of truth) |

## Documentation

Full documentation is in [`docs/`](docs/):
- [`docs/architecture.md`](docs/architecture.md) — system design and data flow
- [`docs/database-schema.md`](docs/database-schema.md) — all tables and indexes
- [`docs/api-reference.md`](docs/api-reference.md) — REST API spec
- [`docs/worker-system.md`](docs/worker-system.md) — queue and worker design
- [`docs/frontend-pages.md`](docs/frontend-pages.md) — UI pages and components
- [`docs/docker-setup.md`](docs/docker-setup.md) — Docker Compose and deployment
