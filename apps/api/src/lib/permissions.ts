import { prisma } from "@chink-saas/db";

/** Los permisos del seed son valores iniciales; cada espacio puede sobrescribirlos. */
export async function permissionAllowed(workspaceId: string, roleId: string, key: string): Promise<boolean> {
  const override = await prisma.workspaceRolePermission.findFirst({
    where: { workspaceId, roleId, permission: { key } },
    select: { allowed: true },
  });
  if (override) return override.allowed;

  const defaultGrant = await prisma.rolePermission.findFirst({
    where: { roleId, permission: { key } },
    select: { allowed: true },
  });
  return defaultGrant?.allowed ?? false;
}

export async function permissionsForRole(workspaceId: string, roleId: string): Promise<string[]> {
  const [defaults, overrides] = await Promise.all([
    prisma.rolePermission.findMany({ where: { roleId }, include: { permission: { select: { key: true } } } }),
    prisma.workspaceRolePermission.findMany({ where: { workspaceId, roleId }, include: { permission: { select: { key: true } } } }),
  ]);
  const grants = new Map(defaults.map((grant) => [grant.permission.key, grant.allowed]));
  for (const override of overrides) grants.set(override.permission.key, override.allowed);
  return [...grants].filter(([, allowed]) => allowed).map(([key]) => key);
}
