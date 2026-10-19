-- Pertenencia multi-espacio: cada usuario puede estar en varios espacios con
-- rol propio por espacio. Se rellena desde la foto actual (un espacio por usuario).
CREATE TABLE "space_members" (
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "space_members_pkey" PRIMARY KEY ("userId", "workspaceId")
);
CREATE INDEX "space_members_workspaceId_idx" ON "space_members"("workspaceId");

ALTER TABLE "space_members" ADD CONSTRAINT "space_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "space_members" ADD CONSTRAINT "space_members_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "space_members" ADD CONSTRAINT "space_members_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "space_members" ("userId", "workspaceId", "roleId", "status", "createdAt")
SELECT "id", "workspaceId", "roleId", "status", CURRENT_TIMESTAMP FROM "users";

-- Avisos dentro de la app (campana de notificaciones).
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'invite',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "notifications_userId_read_idx" ON "notifications"("userId", "read");

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
