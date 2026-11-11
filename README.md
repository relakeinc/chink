# <img src="apps/web/src/assets/icons/chink-mark.svg" alt="Chink" width="150" />

Inventario multi-almacén con trazabilidad, roles y reportes.

Producción: [chink.relake.co](https://chink.relake.co)

## Stack

- Web: React, Vite y Tailwind.
- API: Fastify, TypeScript y Prisma.
- Datos: PostgreSQL.
- Monorepo: pnpm y Turbo.

## Requisitos

Node.js 22+, pnpm 9+ y PostgreSQL 17. También puedes usar Docker para la base de datos.

## Inicio rápido

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm --filter @chink-saas/db migrate
pnpm --filter @chink-saas/db seed
pnpm dev
```

La web queda en `http://localhost:5173` y la API en `http://localhost:3100`.

El seed es idempotente pero destructivo: elimina los datos de la base configurada. Úsalo solo en desarrollo.

## Estructura

```text
apps/api    API Fastify y rutas protegidas por permisos
apps/web    Aplicación React
packages/db Prisma, migraciones y seed
scripts     Utilidades de desarrollo y despliegue
nginx       Configuración de producción
```

## Variables de entorno

Copia `.env.example` a `.env` y completa al menos `DATABASE_URL` y `JWT_SECRET`. Las credenciales reales no deben subirse al repositorio.

Las variables de R2, correo, Telegram y Gemini son opcionales según las funciones que uses.

## Comandos útiles

```bash
pnpm dev
pnpm build
pnpm lint
pnpm --filter @chink-saas/api test
pnpm --filter @chink-saas/db seed
```

## Seguridad

- Todas las rutas privadas requieren JWT.
- Las operaciones sensibles requieren permisos del rol activo.
- El stock negativo se permite solo cuando `allowNegativeStock` está activado.
- Las contraseñas se almacenan con bcrypt.
- Los tokens de sesión expiran en 12 horas.
- No subas `.env`, logs, claves privadas ni credenciales.

## Roles

Administradora, Gestor, Operador y Consulta. Los permisos se aplican en la API; ocultar opciones en la interfaz no sustituye la autorización del servidor.

## Desarrollo

Antes de abrir un pull request, ejecuta `pnpm build`, `pnpm lint` y las pruebas de API. Los cambios de Prisma deben incluir migración y actualizar el seed cuando corresponda.
