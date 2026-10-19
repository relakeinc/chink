-- Espacios de trabajo por cuenta: cada registro crea el suyo; las invitaciones
-- heredan el del equipo que invita. Los datos existentes pertenecen al espacio "default".
ALTER TABLE "users" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "users" ALTER COLUMN "workspaceId" DROP DEFAULT;
CREATE INDEX "users_workspaceId_idx" ON "users"("workspaceId");

ALTER TABLE "warehouses" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "warehouses" ALTER COLUMN "workspaceId" DROP DEFAULT;
DROP INDEX "warehouses_code_key";
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_workspaceId_code_key" UNIQUE ("workspaceId", "code");
CREATE INDEX "warehouses_workspaceId_idx" ON "warehouses"("workspaceId");

ALTER TABLE "products" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "products" ALTER COLUMN "workspaceId" DROP DEFAULT;
DROP INDEX "products_sku_key";
ALTER TABLE "products" ADD CONSTRAINT "products_workspaceId_sku_key" UNIQUE ("workspaceId", "sku");
CREATE INDEX "products_workspaceId_idx" ON "products"("workspaceId");

ALTER TABLE "stock_movements" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "stock_movements" ALTER COLUMN "workspaceId" DROP DEFAULT;
DROP INDEX "stock_movements_ref_key";
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_workspaceId_ref_key" UNIQUE ("workspaceId", "ref");
CREATE INDEX "stock_movements_workspaceId_idx" ON "stock_movements"("workspaceId");

ALTER TABLE "workspace_settings" ALTER COLUMN "id" DROP DEFAULT;
