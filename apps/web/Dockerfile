FROM node:20-alpine AS base
RUN npm install -g pnpm@9
WORKDIR /app

# ---- deps stage: install all workspace dependencies ----
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

# ---- migrator stage: runs prisma migrate deploy + seed ----
FROM base AS migrator
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY package.json pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY apps/web/prisma ./apps/web/prisma/
COPY packages/shared/ ./packages/shared/
CMD ["sh", "-c", "pnpm --filter @webmonitor/web prisma migrate deploy && pnpm --filter @webmonitor/web prisma db seed"]

# ---- builder stage: build shared then web ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter @webmonitor/shared build
RUN pnpm --filter @webmonitor/web build

# ---- runner stage: minimal production image ----
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/web/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
