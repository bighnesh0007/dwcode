# Production image for the Next.js app in client/.
#
# Node 22 matches `"engines": { "node": ">=22" }`, the NODE_VERSION pin in
# render.yaml, and NODE_VERSION in the CI workflow. CI checks that they agree.
#
# Build context is the repo root. This is an npm workspace: the only lockfile is
# at the root, and client/ depends on packages/shared, so both are copied in.
FROM node:26-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
# Whole package, not just package.json: its `prepare` script builds it during npm ci.
COPY packages/shared/ packages/shared/
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --workspace dwcode-client --workspace @dwcode/shared --include-workspace-root

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY packages/shared/ packages/shared/
COPY client/ client/
ENV NEXT_TELEMETRY_DISABLED=1
# Clerk's publishable key is public and only needs to be well-formed at build
# time; pass the real one with --build-arg for a deployable image.
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_Y2ktZHVtbXktZm9yLWJ1aWxkLW9ubHkk
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
RUN npm run build:shared && npm run build -w dwcode-client

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# outputFileTracingRoot is the repo root, so the standalone server lands in
# client/ inside the standalone tree.
COPY --from=builder --chown=nextjs:nodejs /app/client/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/client/.next/static ./client/.next/static
COPY --from=builder /app/client/public ./client/public

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "client/server.js"]
