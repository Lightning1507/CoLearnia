FROM node:24.22.1-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip build-essential ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.5.2 --activate
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY scripts/prepare.mjs scripts/prepare.mjs
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @colearnia/contracts build && pnpm --filter @colearnia/server build
RUN pnpm --filter @colearnia/server deploy --legacy --prod /out/server

FROM node:24.22.1-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
WORKDIR /app
COPY --from=build --chown=node:node /out/server ./
RUN mkdir -p /app/storage && chown node:node /app/storage
USER node
EXPOSE 3001 40000/udp 40000/tcp
CMD ["node", "dist/main.js"]
