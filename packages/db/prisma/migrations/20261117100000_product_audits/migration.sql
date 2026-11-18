-- Registro administrativo de alta, edición y archivo de productos.
CREATE TABLE "product_audits" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productSku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "changes" JSONB,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_audits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "product_audits_workspaceId_createdAt_idx" ON "product_audits"("workspaceId", "createdAt");
CREATE INDEX "product_audits_productId_createdAt_idx" ON "product_audits"("productId", "createdAt");
ALTER TABLE "product_audits" ADD CONSTRAINT "product_audits_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_audits" ADD CONSTRAINT "product_audits_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_audits" ADD CONSTRAINT "product_audits_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
