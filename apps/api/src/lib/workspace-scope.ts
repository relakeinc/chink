import type { FastifyRequest } from "fastify";
import { prisma } from "@chink-saas/db";
import { permissionsForRole } from "./permissions.js";

/**
 * Espacio de trabajo activo de la sesión. Cada cuenta ve y toca solo los
 * datos de su espacio activo: el propio al registrarse o el del equipo que
 * la invitó (se cambia con el conmutador de espacios).
 *
 * La autenticación valida la membresía vigente antes de llamar esta función.
 * Los tokens antiguos sin espacio usan el espacio activo del usuario.
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
 * Rol y estado vigentes de la sesión en su espacio activo.
 */
export async function activeMembership(request: FastifyRequest): Promise<ActiveMembership> {
  const ws = await workspaceIdFor(request);

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
    sessionVersion: number;
  };
  permissions: string[];
}

/**
 * Sesión completa con el rol y los permisos vigentes del espacio elegido.
 */
export async function membershipSession(userId: string, workspaceId?: string): Promise<MembershipSession> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });
  if (!user) {
    throw Object.assign(new Error("Sesión no válida. Vuelve a iniciar sesión."), { statusCode: 401 });
  }
  const member = await prisma.spaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: workspaceId ?? user.workspaceId } },
    include: { role: { select: { name: true } } },
  });
  if (!member) {
    throw Object.assign(new Error("No perteneces a este espacio."), { statusCode: 403 });
  }
  return {
    session: {
      id: user.id,
      email: user.email,
      name: user.name,
      initials: user.initials,
      role: member.role.name,
      status: member.status,
      workspaceId: member.workspaceId,
      sessionVersion: user.sessionVersion,
    },
    permissions: await permissionsForRole(member.workspaceId, member.roleId),
  };
}

