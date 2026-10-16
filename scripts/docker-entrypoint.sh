#!/bin/sh
# Arranque de prod: migraciones, seed solo si la BD está vacía y servidor.
set -e
pnpm --filter @chink-saas/db exec prisma migrate deploy
pnpm --filter @chink-saas/api exec tsx scripts/seed-if-empty.ts
exec pnpm --filter @chink-saas/api exec tsx apps/api/src/server.ts
