-- Pagos por espacio: clientes, comprobantes (bot Telegram con OCR o a mano),
-- chats vinculados por código y códigos de vinculación de un uso.
CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "numeroContacto" TEXT,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "clientes_workspaceId_idx" ON "clientes"("workspaceId");
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "telegram_chats" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "chatId" BIGINT NOT NULL,
    "apodo" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "ultimoUso" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_chats_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "telegram_chats_usuarioId_idx" ON "telegram_chats"("usuarioId");
ALTER TABLE "telegram_chats" ADD CONSTRAINT "telegram_chats_workspaceId_chatId_key" UNIQUE ("workspaceId", "chatId");
ALTER TABLE "telegram_chats" ADD CONSTRAINT "telegram_chats_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "telegram_chats" ADD CONSTRAINT "telegram_chats_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "codigos_vinculacion" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "creadoPorId" TEXT NOT NULL,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "usadoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "codigos_vinculacion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "codigos_vinculacion_workspaceId_idx" ON "codigos_vinculacion"("workspaceId");
ALTER TABLE "codigos_vinculacion" ADD CONSTRAINT "codigos_vinculacion_codigo_key" UNIQUE ("codigo");
ALTER TABLE "codigos_vinculacion" ADD CONSTRAINT "codigos_vinculacion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "codigos_vinculacion" ADD CONSTRAINT "codigos_vinculacion_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "pagos" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clienteId" TEXT,
    "telegramChatId" TEXT,
    "registradoPorId" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'verificado',
    "para" TEXT,
    "numeroDestino" TEXT,
    "bancoDestino" TEXT,
    "fechaPago" TIMESTAMP(3),
    "horaPago" TEXT,
    "monto" DECIMAL(14,2) NOT NULL,
    "referencia" TEXT,
    "numeroOrigen" TEXT,
    "fuenteFondos" TEXT,
    "imageKey" TEXT,
    "imageUrl" TEXT,
    "rawJson" JSONB,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pagos_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "pagos_workspaceId_idx" ON "pagos"("workspaceId");
CREATE INDEX "pagos_workspaceId_estado_idx" ON "pagos"("workspaceId", "estado");
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_workspaceId_referencia_key" UNIQUE ("workspaceId", "referencia");
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_telegramChatId_fkey" FOREIGN KEY ("telegramChatId") REFERENCES "telegram_chats"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
