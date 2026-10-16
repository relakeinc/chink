# API de chink-saas. Se ejecuta con tsx (sin build de tsc) y aplica las
# migraciones + seed inicial en el arranque vía scripts/docker-entrypoint.sh.
FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@12.3.4 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY packages/db/package.json ./packages/db/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @chink-saas/db generate \
  && chmod +x scripts/docker-entrypoint.sh
EXPOSE 3100
ENTRYPOINT ["sh", "scripts/docker-entrypoint.sh"]
