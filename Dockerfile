FROM node:20-alpine AS base

RUN apk add --no-cache libc6-compat
RUN npm install -g pnpm
WORKDIR /app

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/cf-web/package.json ./apps/cf-web/package.json
COPY apps/vercel-api/package.json ./apps/vercel-api/package.json
COPY packages/platform-core/package.json ./packages/platform-core/package.json

RUN pnpm install --no-frozen-lockfile

FROM base AS builder

ARG APP_PATH
ARG APP_PKG

ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/ ./
COPY . .

RUN test -n "$APP_PATH"
RUN test -n "$APP_PKG"
RUN pnpm --filter "$APP_PKG" build

FROM base AS runner

ARG APP_PATH

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/${APP_PATH}/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/${APP_PATH}/public ./${APP_PATH}/public
COPY --from=builder --chown=nextjs:nodejs /app/${APP_PATH}/.next/static ./${APP_PATH}/.next/static

USER nextjs

EXPOSE 3000

CMD ["sh", "-c", "node ${APP_PATH}/server.js"]
