import jwt from "@fastify/jwt";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@chink-saas/db";
import { permissionAllowed } from "../lib/permissions.js";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  initials: string;
  role: string;
  status: string;
  /** Espacio del usuario. Opcional: los tokens emitidos antes de espacios no lo traen. */
  workspaceId?: string;
  sessionVersion?: number;
  roleId?: string;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: SessionUser;
    user: SessionUser;
  }
}

const SECRET = process.env.JWT_SECRET ?? (process.env.NODE_ENV === "production" ? "" : "chink-saas-dev-secret-change-me");
if (!SECRET || (process.env.NODE_ENV === "production" && SECRET === "chink-saas-dev-secret-change-me")) {
  throw new Error("JWT_SECRET debe configurarse con un valor seguro en producción.");
}

/** Registra el plugin de JWT. Todas las rutas /api/* lo requieren salvo /api/auth/login. */
export async function registerAuth(app: FastifyInstance) {
  await app.register(jwt, { secret: SECRET });

  const verifyCurrentSession = async (request: FastifyRequest, reply: FastifyReply, requireActive: boolean) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: "Sesión expirada. Vuelve a iniciar sesión." });
    }

    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { email: true, name: true, initials: true, status: true, workspaceId: true, sessionVersion: true },
    });
    if (!user || user.sessionVersion !== (request.user.sessionVersion ?? 0)) {
      return reply.status(401).send({ error: "Sesión expirada. Vuelve a iniciar sesión." });
    }
    const workspaceId = request.user.workspaceId ?? user.workspaceId;
    const member = await prisma.spaceMember.findUnique({
      where: { userId_workspaceId: { userId: request.user.id, workspaceId } },
      include: { role: { select: { name: true } } },
    });
    if (!member) return reply.status(403).send({ error: "No perteneces a este espacio" });
    if (requireActive && (user.status !== "ACTIVE" || member.status !== "ACTIVE")) {
      return reply.status(403).send({ error: "Tu invitación todavía está pendiente" });
    }
    request.user = {
      ...request.user,
      email: user.email,
      name: user.name,
      initials: user.initials,
      role: member.role.name,
      roleId: member.roleId,
      status: member.status,
      workspaceId,
      sessionVersion: user.sessionVersion,
    };
  };

  app.decorate("authenticate", (request: FastifyRequest, reply: FastifyReply) => verifyCurrentSession(request, reply, true));

  // Solo verifica el JWT, sin exigir ACTIVE: lo usa /auth/activate, al que el
  // invitado llega justamente con su sesión PENDING.
  app.decorate("authenticateAnyStatus", (request: FastifyRequest, reply: FastifyReply) => verifyCurrentSession(request, reply, false));

  app.decorate("requirePermission", (permission: string) => async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    if (!user.workspaceId || !user.roleId || !(await permissionAllowed(user.workspaceId, user.roleId, permission))) {
      return reply.status(403).send({ error: "Tu rol no tiene este permiso" });
    }
  });
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateAnyStatus: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requirePermission: (permission: string) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
