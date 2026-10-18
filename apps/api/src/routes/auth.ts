import bcrypt from "bcryptjs";
import type { FastifyPluginAsync } from "fastify";
import { prisma } from "@chink-saas/db";
import { emailAssets, passwordChangedEmail, sendEmail } from "../lib/email.js";

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

    // Un invitado PENDING entra con su clave temporal, pero marcado para
    // activar: el frontend lo retiene en /activar hasta que ponga su clave.
    const mustActivate = user.status !== "ACTIVE";

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
      token: app.jwt.sign(session, { expiresIn: "7d" }),
      user: session,
      permissions: user.role.permissions.filter((p) => p.allowed).map((p) => p.permission.key),
      mustActivate,
    };
  });

  /**
   * Registro público: crea la cuenta ACTIVA con el rol más básico (Consulta).
   * Sin invitaciones: cualquiera con el enlace puede entrar a consultar.
   */
  app.post(
    "/register",
    {
      schema: {
        body: {
          type: "object",
          required: ["name", "email", "password"],
          properties: {
            name: { type: "string", minLength: 2, maxLength: 80 },
            email: { type: "string", minLength: 3, maxLength: 120 },
            password: { type: "string", minLength: 8, maxLength: 72 },
          },
        },
      },
    },
    async (request, reply) => {
      const { name, email, password } = request.body as { name: string; email: string; password: string };
      const cleanEmail = email.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
        return reply.status(400).send({ error: "El correo no parece válido" });
      }
      const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
      if (existing) return reply.status(409).send({ error: "Ese correo ya tiene cuenta. Inicia sesión." });

      const role = await prisma.role.findFirst({ where: { name: "Consulta" } });
      if (!role) return reply.status(500).send({ error: "Roles sin inicializar" });

      const initials = name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("");

      const created = await prisma.user.create({
        data: {
          email: cleanEmail,
          name: name.trim(),
          initials: initials || "?",
          passwordHash: await bcrypt.hash(password, 10),
          roleId: role.id,
          status: "ACTIVE",
          lastAccessAt: new Date(),
        },
        include: { role: { include: { permissions: { include: { permission: true } } } } },
      });

      const session = {
        id: created.id,
        email: created.email,
        name: created.name,
        initials: created.initials,
        role: created.role.name,
        status: created.status,
      };

      return reply.status(201).send({
        token: app.jwt.sign(session, { expiresIn: "7d" }),
        user: session,
        permissions: created.role.permissions.filter((p) => p.allowed).map((p) => p.permission.key),
        mustActivate: false,
      });
    },
  );

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
        const space = await prisma.workspaceSetting.findUnique({ where: { id: "default" }, select: { spaceName: true, spaceMark: true } });
        const content = passwordChangedEmail({ name: user.name, spaceName: space?.spaceName ?? "Chink", mark: space?.spaceMark ?? "workspace-mark" });
        await sendEmail({ category: "verification", to: user.email, subject: content.subject, html: content.html, text: content.text, attachments: emailAssets(space?.spaceMark).attachments });
      } catch (error) {
        request.log.warn({ userId: user.id, error }, "No se pudo enviar la confirmación de contraseña");
      }

      return { data: { updated: true } };
    },
  );

    /**
   * Activa la cuenta: verifica la clave temporal, fija la definitiva y pasa a
   * ACTIVE. Solo para invitados PENDING con sesión válida.
   */
  app.patch(
    "/activate",
    {
      onRequest: (request, reply) => app.authenticateAnyStatus(request, reply),
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
      const user = await prisma.user.findUnique({
        where: { id: request.user.id },
        include: { role: { include: { permissions: { include: { permission: true } } } } },
      });
      if (!user) return reply.status(404).send({ error: "Usuario no encontrado" });
      if (user.status !== "PENDING") return reply.status(400).send({ error: "La cuenta ya está activa" });

      const { currentPassword, newPassword } = request.body as { currentPassword: string; newPassword: string };
      const ok = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!ok) return reply.status(400).send({ error: "La clave temporal no es correcta" });
      if (newPassword === currentPassword) {
        return reply.status(400).send({ error: "La nueva contraseña debe ser distinta de la temporal" });
      }

      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await bcrypt.hash(newPassword, 10), status: "ACTIVE", lastAccessAt: new Date() },
        include: { role: { include: { permissions: { include: { permission: true } } } } },
      });

      const session = {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        initials: updated.initials,
        role: updated.role.name,
        status: updated.status,
      };

      return {
        token: app.jwt.sign(session, { expiresIn: "7d" }),
        user: session,
        permissions: updated.role.permissions.filter((p) => p.allowed).map((p) => p.permission.key),
      };
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