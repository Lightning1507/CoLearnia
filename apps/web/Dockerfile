FROM node:26.12.1-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@11.5.2 --activate
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY scripts/prepare.mjs scripts/prepare.mjs
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
RUN pnpm --filter @colearnia/contracts build && pnpm --filter @colearnia/web build

FROM nginx:1.28.0-alpine AS runtime
COPY infra/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
