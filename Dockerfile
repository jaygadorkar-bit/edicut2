FROM node:26-bookworm-slim AS workspace

RUN apt-get update \
    && apt-get install -y --no-install-recommends libc++1 libatomic1 \
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@12.18.0

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV PNPM_STORE_DIR=/pnpm/store

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/node-api/package.json ./apps/node-api/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/platform-core/package.json ./packages/platform-core/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN pnpm install --frozen-lockfile --store-dir /pnpm/store

COPY . .

EXPOSE 3002

CMD ["pnpm", "dev"]
