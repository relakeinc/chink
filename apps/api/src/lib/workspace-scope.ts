import type { FastifyRequest } from "fastify";
import { prisma } from "@chink-saas/db";

/**
 * Espacio de trabajo activo de la sesión. Cada cuenta ve y toca solo los
 * datos de su espacio activo: el propio al registrarse o el del equipo que
 * la invitó (se cambia con el conmutador de espacios).
 *
 * Se prefiere el `workspaceId` firmado en el JWT; los tokens antiguos (sin él)
 * se resuelven desde la base de datos. Falla cerrado si el usuario ya no existe.
 */
export async function workspaceIdFor(request: FastifyRequest): Promise<string> {
  const claimed = (request.user as { workspaceId?: string } | undefined)?.workspaceId;
  if (claimed) return claimed;

  const user = await prisma.user.findUnique({ where: { id: request.user.id }, select: { workspaceId: true } });
  if (!user) {
    throw Object.assign(new Error("Sesión no válida. Vuelve a iniciar sesión."), { statusCode: 401 });
  }
  return user.workspaceId;
}

export interface ActiveMembership {
  workspaceId: string;
  roleId: string;
  roleName: string;
  status: string;
}

/**
 * Rol y estado de la sesión en su espacio activo. El rol es por espacio:
 * se lee del JWT firmado y solo se consulta la BD con tokens antiguos.
 */
export async function activeMembership(request: FastifyRequest): Promise<ActiveMembership> {
  const claimed = request.user as { workspaceId?: string; role?: string; status?: string };
  const ws = claimed.workspaceId ?? (await workspaceIdFor(request));

  if (claimed.role) {
    const role = await prisma.role.findUnique({ where: { name: claimed.role }, select: { id: true, name: true } });
    if (role) return { workspaceId: ws, roleId: role.id, roleName: role.name, status: claimed.status ?? "ACTIVE" };
  }

  const member = await prisma.spaceMember.findUnique({
    where: { userId_workspaceId: { userId: request.user.id, workspaceId: ws } },
    include: { role: { select: { id: true, name: true } } },
  });
  if (!member) {
    throw Object.assign(new Error("No perteneces a este espacio."), { statusCode: 403 });
  }
  return { workspaceId: ws, roleId: member.role.id, roleName: member.role.name, status: member.status };
}

export interface MembershipSession {
  session: {
    id: string;
    email: string;
    name: string;
    initials: string;
    role: string;
    status: string;
    workspaceId: string;
  };
  permissions: string[];
}

/**
 * Sesión completa (JWT + permisos) con el rol del espacio activo. Si la
 * membresía no existe (datos antiguos), usa el rol global del usuario.
 */
export async function membershipSession(userId: string): Promise<MembershipSession> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  if (!user) {
    throw Object.assign(new Error("Sesión no válida. Vuelve a iniciar sesión."), { statusCode: 401 });
  }
  const member = await prisma.spaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: user.workspaceId } },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  const role = member?.role ?? user.role;
  const status = member?.status ?? user.status;
  return {
    session: {
      id: user.id,
      email: user.email,
      name: user.name,
      initials: user.initials,
      role: role.name,
      status,
      workspaceId: user.workspaceId,
    },
    permissions: role.permissions.filter((p) => p.allowed).map((p) => p.permission.key),
  };
}

