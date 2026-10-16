/*
  Warnings:

  - You are about to drop the column `spaceImageKey` on the `workspace_settings` table. All the data in the column will be lost.
  - You are about to drop the column `spaceImageUrl` on the `workspace_settings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "workspace_settings" DROP COLUMN "spaceImageKey",
DROP COLUMN "spaceImageUrl";
