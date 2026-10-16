#!/bin/sh
# Arranque de prod: migraciones, seed solo si la BD está vacía y servidor.
# Ojo: `pnpm --filter` ejecuta con cwd en el paquete, así que las rutas van
# relativas a apps/api (servidor) o a la raíz vía ../../ (scripts).
set -e
pnpm --filter @chink-saas/db exec prisma migrate deploy
pnpm --filter @chink-saas/api exec tsx ../../scripts/seed-if-empty.ts
exec pnpm --filter @chink-saas/api exec tsx src/server.ts
