FROM node:20-alpine AS workspace

RUN apk add --no-cache libc6-compat
RUN npm install -g pnpm

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV PNPM_STORE_PATH=/pnpm/store

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/node-api/package.json ./apps/node-api/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/platform-core/package.json ./packages/platform-core/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN pnpm install --frozen-lockfile --store-dir /pnpm/store

COPY . .

EXPOSE 3000 8787

CMD ["pnpm", "dev"]
