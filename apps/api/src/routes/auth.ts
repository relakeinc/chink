import bcrypt from "bcryptjs";
import type { FastifyPluginAsync } from "fastify";
import { prisma } from "@chink-saas/db";
import { passwordChangedEmail, sendEmail } from "../lib/email.js";

const loginBody = {
  type: "object",
  required: ["email", "password"],
  properties: {
    email: { type: "string", minLength: 3 },
    password: { type: "string", minLength: 1 },
  },
} as const;

export const authRoutes: FastifyPluginAsync = async (app) => {
  /** Inicio de sesión. Devuelve el token y el perfil con sus permisos. */
  app.post("/login", { schema: { body: loginBody } }, async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };

    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });

    // Ojo: `reply.send()` envía de inmediato, así que la respuesta se construye
    // perezosamente dentro de una función.
    const invalid = () => reply.status(401).send({ error: "Correo o contraseña incorrectos" });

    if (!user) return invalid();

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return invalid();

    if (user.status !== "ACTIVE") {
      return reply.status(403).send({ error: "Tu invitación todavía está pendiente" });
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastAccessAt: new Date() } });

    const session = {
      id: user.id,
      email: user.email,
      name: user.name,
      initials: user.initials,
      role: user.role.name,
      status: user.status,
    };

    return {
      token: app.jwt.sign(session, { expiresIn: "12h" }),
      user: session,
      permissions: user.role.permissions.filter((p) => p.allowed).map((p) => p.permission.key),
    };
  });

  /** Cambio de contraseña de la sesión activa. */
  app.patch(
    "/password",
    {
      onRequest: (request, reply) => app.authenticate(request, reply),
      schema: {
        body: {
          type: "object",
          required: ["currentPassword", "newPassword"],
          properties: {
            currentPassword: { type: "string", minLength: 1 },
            newPassword: { type: "string", minLength: 8, maxLength: 72 },
          },
        },
      },
    },
    async (request, reply) => {
      const { currentPassword, newPassword } = request.body as { currentPassword: string; newPassword: string };
      const user = await prisma.user.findUnique({ where: { id: request.user.id } });
      if (!user) return reply.status(404).send({ error: "Usuario no encontrado" });

      const ok = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!ok) return reply.status(400).send({ error: "La contraseña actual no es correcta" });
      if (newPassword === currentPassword) {
        return reply.status(400).send({ error: "La nueva contraseña debe ser distinta de la actual" });
      }

      await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 10) } });

      // Confirmación accesoria: si el correo falla, el cambio ya quedó.
      try {
        const content = passwordChangedEmail({ name: user.name });
        await sendEmail({ category: "verification", to: user.email, subject: content.subject, html: content.html, text: content.text });
      } catch (error) {
        request.log.warn({ userId: user.id, error }, "No se pudo enviar la confirmación de contraseña");
      }

      return { data: { updated: true } };
    },
  );

  /** Perfil de la sesión activa. */  app.get("/me", { onRequest: (request, reply) => app.authenticate(request, reply) }, async (request) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });

    if (!user) return { error: "Usuario no encontrado" };

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        initials: user.initials,
        role: user.role.name,
        status: user.status,
      },
      permissions: user.role.permissions.filter((p) => p.allowed).map((p) => p.permission.key),
    };
  });
};