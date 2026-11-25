CREATE TABLE "pending_registrations" (
  "email" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "pending_registrations_expiresAt_idx" ON "pending_registrations"("expiresAt");
ALTER TABLE "users" ADD COLUMN "failedLoginCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "loginLockedUntil" TIMESTAMP(3);
