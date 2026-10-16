import jwt from "@fastify/jwt";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@chink-saas/db";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  initials: string;
  role: string;
  status: string;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: SessionUser;
    user: SessionUser;
  }
}

const SECRET = process.env.JWT_SECRET ?? "chink-saas-dev-secret-change-me";

/** Registra el plugin de JWT. Todas las rutas /api/* lo requieren salvo /api/auth/login. */
export async function registerAuth(app: FastifyInstance) {
  await app.register(jwt, { secret: SECRET });

  app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
      if (request.user.status !== "ACTIVE") {
        return reply.status(403).send({ error: "Tu invitación todavía está pendiente" });
      }
    } catch {
      return reply.status(401).send({ error: "Sesión expirada. Vuelve a iniciar sesión." });
    }
  });

  // Solo verifica el JWT, sin exigir ACTIVE: lo usa /auth/activate, al que el
  // invitado llega justamente con su sesión PENDING.
  app.decorate("authenticateAnyStatus", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: "Sesión expirada. Vuelve a iniciar sesión." });
    }
  });

  app.decorate("requirePermission", (permission: string) => async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    const record = await prisma.rolePermission.findFirst({
      where: { allowed: true, permission: { key: permission }, role: { users: { some: { id: user.id } } } },
      select: { roleId: true },
    });
    if (!record) return reply.status(403).send({ error: "Tu rol no tiene este permiso" });
  });
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateAnyStatus: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requirePermission: (permission: string) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}