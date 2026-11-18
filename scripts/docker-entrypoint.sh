#!/bin/sh
# Arranque de prod: migraciones, catálogo de roles y servidor.
set -e
packages/db/node_modules/.bin/prisma migrate deploy --schema packages/db/prisma/schema.prisma
apps/api/node_modules/.bin/tsx scripts/seed-if-empty.ts
exec apps/api/node_modules/.bin/tsx apps/api/src/server.ts
