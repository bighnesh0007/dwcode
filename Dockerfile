# Node 22, matching `"engines": { "node": ">=22" }` in both package.json files,
# the NODE_VERSION pin in render.yaml, and NODE_VERSION in the CI workflow.
#
# This was `node:18-alpine`, which is EOL (April 2025) and below the Node >= 20
# that Next.js 16 requires — the image could not correctly build or run the app
# (audit finding H-8). Nothing in CI builds this image, which is why the drift
# went unnoticed; OPS-03 adds that job.
FROM node:22-alpine AS base

# Build context is the repo root; the Next.js app lives in client/.
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY client/package.json client/package-lock.json* ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY client/ ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000

# Liveness for orchestrators. Hits the app's own health route (OPS-04); until
# that lands this falls back to the root page, which is still a real signal that
# the Next.js server is serving.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
