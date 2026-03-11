FROM node:20-alpine AS base
RUN apk add --no-cache openssl
RUN npm install -g pnpm@9
WORKDIR /app

# ---- deps stage ----
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

# ---- builder stage ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY . .

# Generate Prisma client for the Linux container platform
RUN pnpm --filter @webmonitor/worker exec prisma generate

RUN pnpm --filter @webmonitor/shared build
RUN pnpm --filter @webmonitor/worker build

# ---- runner stage ----
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 worker

# Copy pnpm virtual store (resolves all dependency symlinks, includes .prisma/client Linux binary)
COPY --from=builder --chown=worker:nodejs /app/node_modules ./node_modules
# Worker-local node_modules (symlinks into the store above)
COPY --from=builder --chown=worker:nodejs /app/apps/worker/node_modules ./apps/worker/node_modules
# Shared compiled package (symlinked from worker node_modules)
COPY --from=builder --chown=worker:nodejs /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=worker:nodejs /app/packages/shared/package.json ./packages/shared/package.json
# Worker compiled output
COPY --from=builder --chown=worker:nodejs /app/apps/worker/dist ./apps/worker/dist

USER worker

CMD ["node", "apps/worker/dist/index.js"]
