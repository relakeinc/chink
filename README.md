# Chink SaaS — gestión de inventario

Aplicación de inventario multi-almacén: catálogo, movimientos con trazabilidad,
reportes, equipo con roles y configuración del espacio. Frontend React + API
Fastify + PostgreSQL, en un monorepo pnpm + Turbo. Producción en
https://chink.relake.co.

## Índice

1. [Arquitectura](#1-arquitectura)
2. [Requisitos](#2-requisitos)
3. [Puesta en marcha local](#3-puesta-en-marcha-local)
4. [Variables de entorno](#4-variables-de-entorno)
5. [Base de datos](#5-base-de-datos)
6. [API](#6-api)
7. [Autenticación y activación](#7-autenticación-y-activación)
8. [Frontend](#8-frontend)
9. [Imágenes de producto (R2)](#9-imágenes-de-producto-r2)
10. [Correo transaccional (SMTP)](#10-correo-transaccional-smtp)
11. [Despliegue en el VPS](#11-despliegue-en-el-vps)
12. [Git](#12-git)
13. [Resolución de problemas](#13-resolución-de-problemas)
14. [Seguridad](#14-seguridad)

## 1. Arquitectura

```
chink-saas/
├── apps/
│   ├── api/        # Fastify 5 + Prisma (puerto 3100 en dev)
│   └── web/        # React 19 + Vite + Tailwind 4 (puerto 5173 en dev)
├── packages/
│   └── db/        # Esquema Prisma, migraciones y seed
├── scripts/        # dev.ps1 (arranque), gen-icons.mjs, entrypoint prod
├── nginx/          # vhost de producción (chink.relake.co.conf)
└── docker-compose.yml  # prod: db + api
```

El frontend llama a la API por rutas relativas (`/api/...`): en dev Vite las
proxea al backend; en prod las sirve nginx. No hay CORS entre ambos.

## 2. Requisitos

- Node.js >= 22 y pnpm >= 9 (`corepack enable`).
- PostgreSQL 17 con una BD `chink_saas` (local) o Docker.
- Windows: PowerShell 5.1 para `scripts/dev.ps1`. En Linux/Mac, arranca
  `pnpm dev` a mano en cada paquete.

## 3. Puesta en marcha local

```bash
cp .env.example .env          # y completa lo que falte
pnpm install
pnpm --filter @chink-saas/db migrate   # crea el esquema
pnpm --filter @chink-saas/db seed      # datos del diseño (BORRA todo antes)
```

Arrancar todo (API + web + túnel SMTP, esperando puertos en vez de sleeps):

```powershell
. .\scripts\dev.ps1
Start-Dev -Fresh
```

- Web: http://127.0.0.1:5173 · API: http://127.0.0.1:3100/api/health
- Cuentas del seed (contraseña común `chink2026`): `lucia@chink.es`
  (Administradora), `diego@chink.es` (Gestor), `ana@chink.es` (Operador),
  `marta@chink.es` (Consulta). El login muestra estas cuentas **solo en
  desarrollo** (`import.meta.env.DEV`); en producción van ocultas.
- Tras el primer arranque en producción, **cambia estas contraseñas** (o
  desactiva esas cuentas): cualquiera que lea el seed las conoce.

Comandos útiles (`turbo run …` desde la raíz):

| Comando            | Qué hace                                    |
| ------------------ | ------------------------------------------- |
| `pnpm typecheck`   | `tsc --noEmit` en los 4 paquetes            |
| `pnpm lint`        | hoy equivale a typecheck (sin linter aparte) |
| `pnpm build`       | build de web (Vite)                         |
| `pnpm db:generate` | regenera el cliente Prisma                  |
| `pnpm db:migrate`  | `prisma migrate dev` (crea migración)       |
| `pnpm db:seed`     | resetea y siembra datos del diseño          |
| `pnpm db:reset`    | `prisma migrate reset` (¡borra la BD!)      |

## 4. Variables de entorno

Todo vive en `.env` (raíz, **ignorado por git**). `.env.example` es la plantilla.

| Variable | Uso | Ejemplo local |
| -------- | --- | ------------- |
| `DATABASE_URL` | Conexión Prisma | `postgresql://postgres:postgres@127.0.0.1:5432/chink_saas?schema=public` |
| `PORT` / `HOST` | API | `3100` / `127.0.0.1` |
| `JWT_SECRET` | Firma de sesiones (12 h) | genera uno propio en prod |
| `VITE_API_URL` | Base del frontend (vacío = relativo) | `""` |
| `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BASE_URL` | Fotos de producto (§9) | bucket `chink-pz` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | Correo (§10) | túnel `127.0.0.1:2525` |
| `APP_URL` | Enlaces dentro de los correos | `http://127.0.0.1:5173` (prod: `https://chink.relake.co`) |
| `EMAIL_FROM_*` | Remitentes por categoría | `pz@mail.relake.co`, etc. |
| `POSTGRES_USER/PASSWORD/DB` | Solo compose en prod | ver `docker-compose.yml` |

## 5. Base de datos

- Motor: PostgreSQL. Modelos principales: `User`/`Role`/`Permission`,
  `Warehouse` + `StockLocation` (existencias por ubicación),
  `Product` (+ `icon`, `imageKey`, `imageUrl`, `minStock`, `archived`),
  `StockMovement` (`ENTRY|EXIT|TRANSFER|ADJUSTMENT`), `WorkspaceSetting`
  (singleton `id="default"`: nombre, icono, preferencias, avisos).
- Flujo de cambios: edita `schema.prisma` → `pnpm db:migrate` (genera y aplica
  la migración) → ajusta `seed.ts` si hace falta.
- El seed es **destructivo e idempotente**: borra movimientos, ubicaciones,
  productos, almacenes, usuarios y ajustes, y deja los valores exactos del
  diseño (stock 2486, reservado 126, valor 50310.20 COP, 8 productos,
  12 movimientos, 3 almacenes, 6 miembros).
- En producción el arranque ejecuta `migrate deploy` y el seed **solo si la BD
  está vacía** (`scripts/seed-if-empty.ts`): nunca borra datos existentes.

## 6. API

Fastify con prefijo `/api`. Salud: `GET /api/health`. Todo lo demás exige JWT
(`Authorization: Bearer …`), salvo `POST /api/auth/login`.

| Módulo | Prefijo | Operaciones |
| ------ | ------- | ----------- |
| Auth | `/api/auth` | `login`, `me`, `PATCH password`, `PATCH activate` |
| Inventario | `/api/inventory` | `summary`, `products` (filtros/paginación), `GET/POST/PATCH :id`, `PATCH products/images` (masivo), `POST product-images/upload-urls`, `GET product-images/status` |
| Movimientos | `/api/movements` | historial, `summary`, `weekly` (serie diaria), `POST` (aplica stock + alerta de mínimo) |
| Almacenes | `/api/warehouses` | lista, `POST`, `locations`, `summary` |
| Equipo | `/api/team` | `members` (search + filtro `warehouse`), `permissions`, `PATCH members/:id`, `invitations`, `POST invitations/:id/resend` |
| Reportes | `/api/reports` | `summary`, `categories`, `low-stock`, `exports`, `POST email` |
| Ajustes | `/api/settings` | `GET`, `PATCH` (nombre, icono, preferencias, avisos) |

Notas:

- Crear movimiento actualiza `StockLocation` + totales en transacción y rechaza
  stock negativo (409), salvo `allowNegativeStock`.
- `GET /inventory/products/:id` existe para fichas; el listado pagina de 25
  (máx. 100).
- Los importes viajan en COP como número con 2 decimales.

## 7. Autenticación y activación

- Invitar (`Equipo → Invitar miembro`) crea al usuario en estado `PENDING`
  con clave temporal de 8 caracteres y manda el correo con la clave.
- Si el correo **ya es miembro**, no se crea ni se cambia nada: responde
  `alreadyMember: true` y solo le llega un aviso informativo.
- El invitado entra con su clave temporal; el login devuelve `mustActivate` y
  el frontend lo retiene en **`/activar`** (bloqueo total vía `RequireAuth`)
  hasta fijar una contraseña ≥ 8 y distinta. Al activar pasa a `ACTIVE`.
- Reenviar invitación regenera la temporal y renueva la fecha.
- Registro público (`/registro`): crea cuenta `ACTIVE` como administradora de
  su **propio espacio nuevo y vacío**. Cada cuenta ve solo los datos de su
  espacio (`workspaceId` en usuarios, ajustes, almacenes, productos y
  movimientos); los invitados heredan el espacio del equipo que los invita.

## 8. Frontend

Rutas: `/login`, `/activar`, `/inicio`, `/inventario`, `/movimientos`,
`/almacenes`, `/reportes`, `/equipo`, `/configuracion`. Navegación filtrada por
permiso (`consult`, `register`, `adjust`, `report`, `admin`).

- Pestañas de Configuración: Preferencias (incluye Espacio de trabajo con
  galería de iconos, y Apariencia con el tema: Automático/Claro/Halloween),
  Notificaciones, Seguridad (cambio de contraseña).
- Componentes propios en `components/ui`: `FilterSelect`, `DateRangePicker`,
  `ColumnMenu`, `DataTable`, `Modal`, `Tabs`, `Popover` (por portal: los
  desplegables flotan sobre tarjetas, modales y scroll; capas en
  `Popover.tsx`: contenido 30, modal 60, popover 70, toast 80).
- Iconos: SVG en `assets/icons`, registrados por `scripts/gen-icons.mjs`
  (corre el script al añadir/quitar iconos; no edites `icons.ts` a mano).
- Avisos globales con `showNotice()` (cola `super-beautiful-toast`).
- Moneda: todo se formatea en COP (`lib/format.ts`); no hay otras monedas.
- `pnpm build` genera `apps/web/dist` (ignorado por git).

## 9. Imágenes de producto (R2)

Flujo sin pasar bytes por la API: el frontend pide URLs firmadas
(`POST product-images/upload-urls`), sube directo al bucket con PUT y confirma
la clave con `PATCH`. Al reemplazar/borrar, la API elimina el objeto anterior.

- Bucket `chink-pz` (cuenta `8d8d…`); objetos públicos en
  `R2_PUBLIC_BASE_URL` (dominio `r2.dev` del bucket).
- Solo JPEG/PNG/WebP de hasta 5 MB (validado en cliente y servidor).
- El bucket necesita CORS para PUT desde el origen web
  (`AllowedOrigins` del dominio, métodos `GET/PUT/HEAD`).
- Edición individual (modal Añadir) y masiva (`PATCH products/images`, máx. 50,
  transaccional).

## 10. Correo transaccional (SMTP)

Servidor propio del VPS (`dype-mail`, `correo.dype.fun`), STARTTLS + AUTH en
587. Un remitente por categoría bajo `relake.co` (ver `EMAIL_FROM_*`):

| Categoría | Remitente | Dispara cuando |
| --------- | --------- | -------------- |
| invitaciones | `pz@mail.relake.co` | invitar / reenviar (con clave temporal) |
| verificación | `pz@verify.relake.co` | cambio de contraseña propia |
| notificaciones | `pz@notify.relake.co` | (reservado: avisos de equipo) |
| alertas | `pz@alerts.relake.co` | un movimiento cruza un mínimo (respeta el toggle) |
| reportes | `pz@reports.relake.co` | botón *Enviar por correo* en Reportes |

- Plantillas: `apps/api/src/lib/email.ts` (función `shell()` + 5 plantillas).
  Diseño newsletter 520 px con **tablas** (los clientes no soportan flex),
  textos de usuario siempre escapados, logo y copo en **PNG incrustados por
  CID** (`apps/api/assets/email/`, generados desde los SVG).
- Si el correo falla, la operación sigue y la UI lo dice (`emailSent: false`;
  en invitaciones muestra la clave para compartirla a mano).
- Reportes por correo llevan **PDF adjunto** con el detalle fila por fila
  (`apps/api/src/lib/report-pdf.ts`, pdfkit): inventario, movimientos (200),
  stock bajo y almacenes.
- DNS (Cloudflare, zona `relake.co`): cada subdominio de correo tiene `A` al
  VPS + `TXT` SPF `v=spf1 ip4:89.117.76.234 ~all`. Solo se añaden registros;
  no se toca lo existente.
- En local el SMTP se usa por túnel SSH (`127.0.0.1:2525`, lo levanta
  `scripts/dev.ps1`); en el VPS apunta directo a `172.17.0.1:587`.

## 11. Despliegue en el VPS

`docker-compose.yml` levanta `db` (postgres:16, volumen `chink-saas-pgdata`) y
`api` (imagen `chink-saas-api`, puerto host `127.0.0.1:3102`). El frontend se
compila en el servidor y lo sirve nginx.

```bash
cd /opt/chink-saas
cp .env.example .env   # completa secretos (ver §4; SMTP_HOST=172.17.0.1)
docker compose up -d --build   # migraciones + seed inicial automáticos
pnpm install && pnpm --filter @chink-saas/web build
sudo cp nginx/chink.relake.co.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/chink.relake.co /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d chink.relake.co
```

Actualizar: `git pull && docker compose up -d --build` (el seed **no** se
repite si hay productos). Logs: `docker logs chink-saas-api-1`.

## 12. Git

Historial por capas: base → db → api → web-shell → pantallas → deploy →
fixes. Rama `main` en `github.com:relakeinc/chink` (origen configurado en el
VPS con clave de escritura; el resto de claves del servidor son de lectura).

## 13. Resolución de problemas

- **Puertos ocupados**: en el VPS el 3100 lo usa otro proyecto y el 3101
  lautch-app-web; por eso la API expone el 3101→3102 local / `3102` en compose.
- **`pnpm --filter … exec` cambia el cwd al paquete**: rutas relativas en
  scripts, a `src/…` o vía `../../`.
- **tsx + top-level await fuera de un paquete ESM** falla: envolver en
  `main()`.
- **`prisma generate` EPERM en Windows**: para los servidores dev (el .dll del
  motor queda bloqueado) y reintenta.
- **Toast que no aparece**: el adaptador usa `createToastHost({ queue })`.
- **Hooks de React**: ningún hook después de un `return` temprano.
- **La subida a R2 falla en navegador**: revisa CORS del bucket y que la URL
  firmada no haya caducado (5 min).
- **Cola de correo del VPS**: `postqueue -p` (vacía = todo entregado).

## 14. Seguridad

- `.env` y `*.err`/`*.log` están ignorados: **nunca** commitees secretos. Las
  claves demo (`chink2026`) son públicas por diseño: rótalas en producción.
- JWT expira en 12 h; `JWT_SECRET` obligatorio en prod.
- Subidas validadas por tipo y tamaño en cliente y servidor; las URLs firmadas
  caducan en 5 min y las claves van acotadas por producto (`products/<id>/…`).
- Tras clonar en un equipo nuevo, crea su `.env` desde el ejemplo y pide los
  secretos por canal seguro (nunca por chat ni correo).
