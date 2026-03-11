# Development Guide

## Prerequisites

- Node.js 20+
- pnpm 8+
- Docker + Docker Compose
- Git

## Default Admin Account

The database seed creates one admin account automatically on first startup.

| Field    | Default value               |
|----------|-----------------------------|
| Email    | `admin@webmonitor.local`    |
| Password | `admin123`                  |
| Role     | ADMIN                       |

> **Change the password after first login.**
>
> Override defaults via environment variables before first `docker compose up`:
> ```env
> SEED_ADMIN_EMAIL=you@example.com
> SEED_ADMIN_PASSWORD=your-secure-password
> SEED_ADMIN_NAME=Your Name
> ```

---

## Docker (recommended — fully automated)

```bash
cp .env.example .env
# Set NEXTAUTH_SECRET (required):
echo "NEXTAUTH_SECRET=$(openssl rand -base64 32)" >> .env

docker compose up -d
```

`docker compose up` automatically:
1. Starts Postgres + Redis
2. Runs `prisma migrate deploy` (applies all migrations)
3. Runs `prisma db seed` (creates admin user if not exists)
4. Starts the web app and worker

Open http://localhost:3000 and log in with the credentials above.

---

## Local Development Setup

```bash
# Install dependencies
pnpm install

# Copy environment file
cp .env.example .env
# Edit .env with your values

# Start infrastructure only
docker compose up -d postgres redis

# Run database migrations
pnpm --filter @webmonitor/web prisma migrate dev

# Seed initial admin user
pnpm --filter @webmonitor/web prisma db seed

# Start Next.js dev server
pnpm --filter @webmonitor/web dev

# In another terminal, start worker in dev mode
pnpm --filter @webmonitor/worker dev
```

## Project Structure

```
apps/web/
├── app/
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx           # Sidebar layout
│   │   ├── page.tsx             # Dashboard
│   │   ├── sites/
│   │   │   ├── page.tsx
│   │   │   ├── new/page.tsx
│   │   │   └── [siteId]/
│   │   │       ├── page.tsx
│   │   │       ├── pages/
│   │   │       ├── ssl/
│   │   │       ├── robots/
│   │   │       └── alerts/
│   │   └── ...
│   └── api/
│       ├── auth/[...nextauth]/route.ts
│       ├── sites/
│       │   ├── route.ts         # GET /api/sites, POST /api/sites
│       │   └── [siteId]/
│       │       ├── route.ts
│       │       ├── checks/route.ts
│       │       ├── ssl/route.ts
│       │       ├── robots/route.ts
│       │       ├── pages/
│       │       │   ├── route.ts
│       │       │   └── [pageId]/route.ts
│       │       ├── sitemaps/route.ts
│       │       ├── alerts/route.ts
│       │       ├── recheck/route.ts
│       │       ├── reindex/route.ts
│       │       └── stream/route.ts   # SSE
│       ├── dashboard/
│       │   ├── stats/route.ts
│       │   └── uptime/route.ts
│       └── jobs/status/route.ts
├── components/
│   ├── ui/                     # shadcn/ui components
│   ├── sites/                  # Site-specific components
│   ├── pages/                  # Page monitoring components
│   ├── charts/                 # Recharts wrappers
│   └── layout/                 # Sidebar, nav, breadcrumbs
├── lib/
│   ├── db.ts                   # Prisma client singleton
│   ├── auth.ts                 # NextAuth config
│   ├── queues.ts               # BullMQ queue clients (producer side)
│   ├── validators.ts           # Zod schemas for API validation
│   └── utils.ts
└── prisma/
    ├── schema.prisma
    ├── migrations/
    └── seed.ts

apps/worker/
└── src/
    ├── workers/
    │   ├── site-discovery.worker.ts
    │   ├── page-check.worker.ts
    │   ├── ssl-check.worker.ts
    │   └── scheduler.worker.ts
    ├── queues/
    │   └── index.ts             # Queue + worker registration
    ├── lib/
    │   ├── db.ts                # Prisma client
    │   ├── http.ts              # Axios/undici HTTP client with timeout
    │   ├── ssl.ts               # TLS certificate checker
    │   ├── sitemap-parser.ts    # XML sitemap parser (streaming)
    │   ├── robots-parser.ts     # robots.txt parser
    │   └── alerts.ts            # Alert notification sender
    └── index.ts                 # Bootstrap all workers

packages/shared/
└── src/
    ├── types.ts                 # Shared TypeScript interfaces
    └── job-types.ts             # BullMQ job data types
```

## Key Dependencies

### Web App
```json
{
  "next": "^14",
  "next-auth": "^5",
  "@prisma/client": "^5",
  "bullmq": "^5",
  "ioredis": "^5",
  "zod": "^3",
  "recharts": "^2",
  "tailwindcss": "^3",
  "@radix-ui/react-*": "latest",
  "swr": "^2"
}
```

### Worker
```json
{
  "bullmq": "^5",
  "ioredis": "^5",
  "@prisma/client": "^5",
  "undici": "^6",
  "fast-xml-parser": "^4",
  "node-forge": "^1",
  "tls": "built-in"
}
```

## Dev Scripts

```bash
# Run all dev servers
pnpm dev

# Type check
pnpm typecheck

# Lint
pnpm lint

# Run tests
pnpm test

# DB operations
pnpm --filter @webmonitor/web prisma studio          # Open Prisma Studio UI
pnpm --filter @webmonitor/web prisma migrate dev     # Create migration from schema changes
pnpm --filter @webmonitor/web prisma migrate reset   # Reset DB (dev only)
pnpm --filter @webmonitor/web prisma generate        # Regenerate client after schema change

# Docker (full stack)
docker compose up -d
docker compose down -v  # reset
```

## Adding a New Feature Checklist

1. Update `prisma/schema.prisma` if DB changes needed
2. Run `pnpm --filter @webmonitor/web prisma migrate dev --name <migration-name>`
3. Add/update API route handler in `app/api/`
4. Add Zod validator in `lib/validators.ts`
5. Update worker if background processing needed
6. Add UI components and page
7. Update types in `packages/shared/`

## Common Issues

**Port already in use:**
```bash
lsof -i :3000 | kill -9 <PID>
```

**Prisma client out of sync:**
```bash
pnpm --filter @webmonitor/web prisma generate
```

**Redis connection refused:**
```bash
docker compose up -d redis
```

**Worker not picking up jobs:**
- Check `REDIS_URL` is correct in worker `.env`
- Check queue names match between producer (web) and consumer (worker)
- View queue monitor at `http://localhost:3000/admin/queues` (admin login required)
