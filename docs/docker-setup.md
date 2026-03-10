# Docker Setup

## Services

```
docker-compose.yml
├── app         → Next.js (port 3000)
├── worker      → BullMQ worker (Node.js)
├── postgres    → PostgreSQL 16 (port 5432)
├── redis       → Redis 7 (port 6379)
└── pgadmin     → pgAdmin 4 (port 5050, optional)
```

---

## docker-compose.yml

```yaml
version: '3.9'

services:
  postgres:
    image: postgres:16-alpine
    container_name: webmonitor-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-webmonitor}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-changeme}
      POSTGRES_DB: ${POSTGRES_DB:-webmonitor}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - '5432:5432'
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ${POSTGRES_USER:-webmonitor}']
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: webmonitor-redis
    restart: unless-stopped
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    ports:
      - '6379:6379'
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 10s
      timeout: 5s
      retries: 5

  app:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    container_name: webmonitor-app
    restart: unless-stopped
    ports:
      - '3000:3000'
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:-webmonitor}:${POSTGRES_PASSWORD:-changeme}@postgres:5432/${POSTGRES_DB:-webmonitor}
      REDIS_URL: redis://redis:6379
      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET}
      NEXTAUTH_URL: ${NEXTAUTH_URL:-http://localhost:3000}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - ./apps/web:/app/apps/web
      - /app/apps/web/node_modules
      - /app/apps/web/.next

  worker:
    build:
      context: .
      dockerfile: apps/worker/Dockerfile
    container_name: webmonitor-worker
    restart: unless-stopped
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:-webmonitor}:${POSTGRES_PASSWORD:-changeme}@postgres:5432/${POSTGRES_DB:-webmonitor}
      REDIS_URL: redis://redis:6379
      PAGE_CHECK_CONCURRENCY: ${PAGE_CHECK_CONCURRENCY:-20}
      SITE_DISCOVERY_CONCURRENCY: ${SITE_DISCOVERY_CONCURRENCY:-5}
      SSL_CHECK_CONCURRENCY: ${SSL_CHECK_CONCURRENCY:-10}
      REQUEST_TIMEOUT_MS: ${REQUEST_TIMEOUT_MS:-10000}
      USER_AGENT: ${USER_AGENT:-WebMonitor/1.0}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  pgadmin:
    image: dpage/pgadmin4:latest
    container_name: webmonitor-pgadmin
    restart: unless-stopped
    profiles:
      - debug
    environment:
      PGADMIN_DEFAULT_EMAIL: ${PGADMIN_EMAIL:-admin@admin.com}
      PGADMIN_DEFAULT_PASSWORD: ${PGADMIN_PASSWORD:-admin}
    ports:
      - '5050:80'
    depends_on:
      - postgres

volumes:
  postgres_data:
  redis_data:
```

---

## Dockerfile — Next.js App (`apps/web/Dockerfile`)

```dockerfile
FROM node:20-alpine AS base
WORKDIR /app
RUN npm install -g pnpm

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm --filter web run build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
```

---

## Dockerfile — Worker (`apps/worker/Dockerfile`)

```dockerfile
FROM node:20-alpine
WORKDIR /app
RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml ./
COPY apps/worker/package.json ./apps/worker/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter worker run build

CMD ["node", "apps/worker/dist/index.js"]
```

---

## Environment Variables

Create `.env` in project root:

```env
# PostgreSQL
POSTGRES_USER=webmonitor
POSTGRES_PASSWORD=your-secure-password
POSTGRES_DB=webmonitor

# Application
NEXTAUTH_SECRET=your-32-char-secret-key
NEXTAUTH_URL=http://localhost:3000

# Worker tuning (optional)
PAGE_CHECK_CONCURRENCY=20
SITE_DISCOVERY_CONCURRENCY=5
SSL_CHECK_CONCURRENCY=10
REQUEST_TIMEOUT_MS=10000
USER_AGENT=WebMonitor/1.0

# pgAdmin (optional, for debug profile)
PGADMIN_EMAIL=admin@admin.com
PGADMIN_PASSWORD=admin
```

---

## Commands

```bash
# Start all services
docker compose up -d

# Start with pgAdmin (debug profile)
docker compose --profile debug up -d

# View logs
docker compose logs -f app
docker compose logs -f worker

# Run DB migrations
docker compose exec app pnpm --filter web prisma migrate deploy

# Seed initial admin user
docker compose exec app pnpm --filter web prisma db seed

# Stop everything
docker compose down

# Stop and remove volumes (full reset)
docker compose down -v

# Rebuild after code changes
docker compose build app worker
docker compose up -d app worker
```

---

## Production Considerations

1. **Reverse proxy** — Put Nginx or Traefik in front of the app container (port 80/443)
2. **SSL termination** — Handle at the reverse proxy level (Let's Encrypt via certbot or Traefik)
3. **Secrets** — Use Docker secrets or a secrets manager instead of `.env` for production
4. **Database backups** — Mount a backup script or use `pg_dump` on a cron
5. **Log aggregation** — Send container logs to Loki/ELK via Docker logging driver
6. **Scaling workers** — Scale the worker service: `docker compose up -d --scale worker=3`

---

## Monorepo Structure

```
/
├── apps/
│   ├── web/                   # Next.js application
│   │   ├── app/               # App Router pages + API routes
│   │   ├── components/        # React components
│   │   ├── lib/               # Utilities, DB client, auth
│   │   ├── prisma/            # Schema + migrations
│   │   └── Dockerfile
│   └── worker/                # BullMQ worker service
│       ├── src/
│       │   ├── workers/       # Worker implementations
│       │   ├── queues/        # Queue definitions
│       │   └── index.ts       # Entry point
│       └── Dockerfile
├── packages/
│   └── shared/                # Shared types between app and worker
├── docs/                      # This documentation
├── docker-compose.yml
├── package.json               # pnpm workspace root
└── .env
```
