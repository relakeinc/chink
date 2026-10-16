-- AlterTable
ALTER TABLE "workspace_settings" ADD COLUMN     "notifyLowStock" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyMovements" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyWeeklyReport" BOOLEAN NOT NULL DEFAULT false;
