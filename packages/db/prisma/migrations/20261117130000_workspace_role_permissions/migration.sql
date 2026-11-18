CREATE TABLE "workspace_role_permissions" (
    "workspaceId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL,

    CONSTRAINT "workspace_role_permissions_pkey" PRIMARY KEY ("workspaceId", "roleId", "permissionId")
);

ALTER TABLE "users" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "workspace_role_permissions" ADD CONSTRAINT "workspace_role_permissions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_role_permissions" ADD CONSTRAINT "workspace_role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_role_permissions" ADD CONSTRAINT "workspace_role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
