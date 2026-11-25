import bcrypt from "bcryptjs";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { prisma } from "@chink-saas/db";
import { emailAssets, passwordChangedEmail, sendEmail } from "../lib/email.js";
import { membershipSession } from "../lib/workspace-scope.js";

const loginBody = {
  type: "object",
  required: ["email", "password"],
  properties: {
    email: { type: "string", minLength: 3 },
    password: { type: "string", minLength: 1 },
  },
} as const;

const codeHash = (email: string, code: string) => createHmac("sha256", process.env.JWT_SECRET || "chink-saas-dev-secret-change-me").update(`${email}:${code}`).digest("hex");
const verificationCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");
const cleanAddress = (email: string) => email.trim().toLowerCase();

export const authRoutes: FastifyPluginAsync = async (app) => {
  /** Inicio de sesión. Devuelve el token y el perfil con sus permisos del espacio activo. */
  app.post("/login", { schema: { body: loginBody } }, async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };

    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { id: true, passwordHash: true, failedLoginCount: true, loginLockedUntil: true },
    });

    // Ojo: `reply.send()` envía de inmediato, así que la respuesta se construye
    // perezosamente dentro de una función.
    const invalid = () => reply.status(401).send({ error: "Correo o contraseña incorrectos" });

    if (!user) return invalid();

    if (user.loginLockedUntil && user.loginLockedUntil > new Date()) return reply.status(429).send({ error: "Demasiados intentos. Intenta de nuevo en 15 minutos." });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      const count = user.loginLockedUntil && user.loginLockedUntil <= new Date() ? 1 : user.failedLoginCount + 1;
      await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: count, loginLockedUntil: count >= 5 ? new Date(Date.now() + 15 * 60_000) : null } });
      return invalid();
    }

    const { session, permissions } = await membershipSession(user.id);

    // Un invitado PENDING entra con su clave temporal, pero marcado para
    // activar: el frontend lo retiene en /activar hasta que ponga su clave.
    const mustActivate = session.status !== "ACTIVE";

    await prisma.user.update({ where: { id: user.id }, data: { lastAccessAt: new Date(), failedLoginCount: 0, loginLockedUntil: null } });

    return {
      token: app.jwt.sign(session, { expiresIn: "12h" }),
      user: session,
      permissions,
      mustActivate,
    };
  });

  /**
   * Registro público: crea una cuenta ACTIVA como administradora de SU PROPIO
   * espacio nuevo y vacío. Nadie pisa datos ajenos: solo quien sea invitado al
   * equipo de un espacio ve los datos de ese espacio.
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
      await prisma.pendingRegistration.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60_000) } } });

      const pending = await prisma.pendingRegistration.findUnique({ where: { email: cleanEmail } });
      if (pending && Date.now() - pending.lastSentAt.getTime() < 60_000) {
        return reply.status(429).send({ error: "Espera un minuto antes de pedir otro código." });
      }
      const code = verificationCode();
      const passwordHash = await bcrypt.hash(password, 10);
      await prisma.pendingRegistration.upsert({
        where: { email: cleanEmail },
        create: { email: cleanEmail, name: name.trim(), passwordHash, codeHash: codeHash(cleanEmail, code), expiresAt: new Date(Date.now() + 300_000) },
        update: { name: name.trim(), passwordHash, codeHash: codeHash(cleanEmail, code), expiresAt: new Date(Date.now() + 300_000), attempts: 0, lastSentAt: new Date() },
      });
      try {
        await sendEmail({ category: "verification", to: cleanEmail, subject: "Tu código de verificación de Chink", text: `Tu código es ${code}. Vence en 5 minutos y solo sirve una vez.`, html: `<p>Tu código de verificación de Chink es <strong>${code}</strong>.</p><p>Vence en 5 minutos y solo sirve una vez.</p>` });
      } catch (error) {
        request.log.error({ error }, "No se pudo enviar el código de registro");
        await prisma.pendingRegistration.deleteMany({ where: { email: cleanEmail, codeHash: codeHash(cleanEmail, code) } });
        return reply.status(503).send({ error: "No se pudo enviar el código. Inténtalo de nuevo." });
      }
      return reply.status(202).send({ verificationRequired: true, email: cleanEmail, expiresInSeconds: 300 });
    },
  );

  app.post("/resend-code", { schema: { body: { type: "object", required: ["email"], properties: { email: { type: "string", minLength: 3, maxLength: 120 } } } } }, async (request, reply) => {
    const email = cleanAddress((request.body as { email: string }).email);
    const pending = await prisma.pendingRegistration.findUnique({ where: { email } });
    if (!pending) return reply.status(404).send({ error: "No hay un registro pendiente para ese correo." });
    if (Date.now() - pending.lastSentAt.getTime() < 60_000) return reply.status(429).send({ error: "Espera un minuto antes de pedir otro código." });
    const code = verificationCode();
    const hash = codeHash(email, code);
    await prisma.pendingRegistration.update({ where: { email }, data: { codeHash: hash, expiresAt: new Date(Date.now() + 300_000), attempts: 0, lastSentAt: new Date() } });
    try {
      await sendEmail({ category: "verification", to: email, subject: "Tu nuevo código de Chink", text: `Tu código es ${code}. Vence en 5 minutos y solo sirve una vez.`, html: `<p>Tu nuevo código de Chink es <strong>${code}</strong>.</p><p>Vence en 5 minutos y solo sirve una vez.</p>` });
    } catch (error) {
      request.log.error({ error }, "No se pudo reenviar el código");
      return reply.status(503).send({ error: "No se pudo enviar el código. Inténtalo de nuevo en un minuto." });
    }
    return { verificationRequired: true, email, expiresInSeconds: 300 };
  });

  app.post("/verify-email", { schema: { body: { type: "object", required: ["email", "code"], properties: { email: { type: "string", minLength: 3, maxLength: 120 }, code: { type: "string", pattern: "^[0-9]{6}$" } } } } }, async (request, reply) => {
    const { code } = request.body as { email: string; code: string };
    const email = cleanAddress((request.body as { email: string }).email);
    const pending = await prisma.pendingRegistration.findUnique({ where: { email } });
    if (!pending) return reply.status(400).send({ error: "No hay un código pendiente. Regístrate de nuevo." });
    if (pending.expiresAt.getTime() <= Date.now()) return reply.status(410).send({ error: "El código venció. Solicita uno nuevo." });
    if (pending.attempts >= 5) return reply.status(429).send({ error: "Demasiados intentos. Solicita un código nuevo." });
    const supplied = Buffer.from(codeHash(email, code), "hex");
    const expected = Buffer.from(pending.codeHash, "hex");
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      await prisma.pendingRegistration.updateMany({ where: { email, codeHash: pending.codeHash, attempts: { lt: 5 } }, data: { attempts: { increment: 1 } } });
      return reply.status(400).send({ error: "Código incorrecto." });
    }
    const role = await prisma.role.findFirst({ where: { name: "Administradora" } });
    if (!role) return reply.status(500).send({ error: "Roles sin inicializar" });
    const workspaceId = crypto.randomUUID();
    const initials = pending.name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
    const created = await prisma.$transaction(async (tx) => {
      const claimed = await tx.pendingRegistration.deleteMany({ where: { email, codeHash: pending.codeHash, expiresAt: { gt: new Date() }, attempts: { lt: 5 } } });
      if (claimed.count !== 1) return null;
      await tx.workspaceSetting.create({ data: { id: workspaceId, spaceName: "Mi espacio", spaceColor: "#242722", spaceMark: "workspace-mark", legalName: "", contactEmail: email, taxId: "", language: "Español (España)", currency: "Peso colombiano · COP ($)", timezone: "America / Bogota (UTC-05:00)", dateFormat: "DD/MM/AAAA", unit: "Unidad (u.)", movementPrefix: "MOV-", defaultMinStock: 10 } });
      const warehouse = await tx.warehouse.create({ data: { workspaceId, code: "PRINCIPAL", name: "Principal", location: "Principal", address: "", capacity: 100000, position: 1 } });
      await tx.workspaceSetting.update({ where: { id: workspaceId }, data: { defaultWarehouseId: warehouse.id } });
      const user = await tx.user.create({ data: { email, name: pending.name, initials, passwordHash: pending.passwordHash, roleId: role.id, status: "ACTIVE", workspaceId, lastAccessAt: new Date() } });
      await tx.spaceMember.create({ data: { userId: user.id, workspaceId, roleId: role.id, status: "ACTIVE" } });
      return user;
    });
    if (!created) return reply.status(409).send({ error: "El código ya se usó o venció." });
    const { session, permissions } = await membershipSession(created.id);
    return reply.status(201).send({ token: app.jwt.sign(session, { expiresIn: "12h" }), user: session, permissions });
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

      await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 10), sessionVersion: { increment: 1 } } });
      const { session } = await membershipSession(user.id, request.user.workspaceId);

      // Confirmación accesoria: si el correo falla, el cambio ya quedó.
      try {
        const space = await prisma.workspaceSetting.findUnique({ where: { id: user.workspaceId }, select: { spaceName: true, spaceMark: true } });
        const content = passwordChangedEmail({ name: user.name, spaceName: space?.spaceName ?? "Chink", mark: space?.spaceMark ?? "workspace-mark" });
        await sendEmail({ category: "verification", to: user.email, subject: content.subject, html: content.html, text: content.text, attachments: emailAssets(space?.spaceMark).attachments });
      } catch (error) {
        request.log.warn({ userId: user.id, error }, "No se pudo enviar la confirmación de contraseña");
      }

      return { data: { updated: true, token: app.jwt.sign(session, { expiresIn: "12h" }) } };
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
      const user = await prisma.user.findUnique({ where: { id: request.user.id } });
      if (!user) return reply.status(404).send({ error: "Usuario no encontrado" });
      if (user.status !== "PENDING") return reply.status(400).send({ error: "La cuenta ya está activa" });

      const { currentPassword, newPassword } = request.body as { currentPassword: string; newPassword: string };
      const ok = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!ok) return reply.status(400).send({ error: "La clave temporal no es correcta" });
      if (newPassword === currentPassword) {
        return reply.status(400).send({ error: "La nueva contraseña debe ser distinta de la temporal" });
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await bcrypt.hash(newPassword, 10), status: "ACTIVE", lastAccessAt: new Date(), sessionVersion: { increment: 1 } },
      });
      await prisma.spaceMember.updateMany({
        where: { userId: user.id, workspaceId: user.workspaceId },
        data: { status: "ACTIVE" },
      });

      const { session, permissions } = await membershipSession(user.id);

      return {
        token: app.jwt.sign(session, { expiresIn: "12h" }),
        user: session,
        permissions,
      };
    },
  );

    /** Perfil de la sesión activa (rol del espacio activo). */  app.get("/me", { onRequest: (request, reply) => app.authenticate(request, reply) }, async (request) => {
    const { session, permissions } = await membershipSession(request.user.id, request.user.workspaceId);

    return {
      user: {
        id: session.id,
        email: session.email,
        name: session.name,
        initials: session.initials,
        role: session.role,
        status: session.status,
      },
      permissions,
    };
  });
};
