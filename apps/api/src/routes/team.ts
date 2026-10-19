import bcrypt from "bcryptjs";
import type { FastifyPluginAsync } from "fastify";
import { prisma } from "@chink-saas/db";
import { emailAssets, invitationEmail, invitationExistingEmail, sendEmail } from "../lib/email.js";
import { workspaceIdFor, membershipSession } from "../lib/workspace-scope.js";
import { notifyUser } from "./notifications.js";

const inviteBodySchema = {
  type: "object",
  required: ["email", "name", "roleId"],
  properties: {
    email: { type: "string", minLength: 3 },
    name: { type: "string", minLength: 2 },
    roleId: { type: "string", minLength: 1 },
    warehouseIds: { type: "array", items: { type: "string" } },
  },
} as const;

/** Envía la invitación por correo sin tumbar la operación si falla. */
async function sendInvitationEmail(
  log: { warn: (obj: unknown, msg: string) => void },
  input: { to: string; name: string; role: string; temporaryPassword: string; resent?: boolean },
  workspaceId: string,
): Promise<boolean> {
  try {
    const space = await prisma.workspaceSetting.findUnique({ where: { id: workspaceId }, select: { spaceName: true, spaceMark: true } });
    const content = invitationEmail({ ...input, mark: space?.spaceMark ?? "workspace-mark", spaceName: space?.spaceName ?? "Chink" });
    await sendEmail({ category: "invitations", to: input.to, subject: content.subject, html: content.html, text: content.text, attachments: emailAssets(space?.spaceMark).attachments });
    return true;
  } catch (error) {
    log.warn({ to: input.to, error }, "No se pudo enviar la invitación por correo");
    return false;
  }
}

/** Avisa a quien ya es miembro (sin clave, sin tocar su cuenta). */
async function sendMemberNoticeEmail(
  log: { warn: (obj: unknown, msg: string) => void },
  input: { to: string; name: string; role: string },
  workspaceId: string,
): Promise<boolean> {
  try {
    const space = await prisma.workspaceSetting.findUnique({ where: { id: workspaceId }, select: { spaceName: true, spaceMark: true } });
    const content = invitationExistingEmail({ ...input, mark: space?.spaceMark ?? "workspace-mark", spaceName: space?.spaceName ?? "Chink" });
    await sendEmail({ category: "invitations", to: input.to, subject: content.subject, html: content.html, text: content.text, attachments: emailAssets(space?.spaceMark).attachments });
    return true;
  } catch (error) {
    log.warn({ to: input.to, error }, "No se pudo avisar al miembro por correo");
    return false;
  }
}

export const teamRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Invita a un miembro. La cuenta nace en estado PENDING: no puede iniciar
   * sesión hasta que se active (así lo refleja la matriz de permisos).
   */
  app.post("/invitations", { preHandler: app.requirePermission("admin"), schema: { body: inviteBodySchema } }, async (request, reply) => {
    const body = request.body as {
      email: string;
      name: string;
      roleId: string;
      warehouseIds?: string[];
    };

    const email = body.email.trim().toLowerCase();
    const ws = await workspaceIdFor(request);

    const role = await prisma.role.findUnique({ where: { id: body.roleId } });
    if (!role) return reply.status(400).send({ error: "Rol no válido" });

    // Ya tiene cuenta: entra a este espacio con su rol asignado, sin tocar
    // su espacio propio. Recibe correo + aviso dentro de la app.
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      const already = await prisma.spaceMember.findUnique({
        where: { userId_workspaceId: { userId: existing.id, workspaceId: ws } },
      });
      if (!already) {
        await prisma.spaceMember.create({
          data: { userId: existing.id, workspaceId: ws, roleId: role.id, status: "ACTIVE" },
        });
        const space = await prisma.workspaceSetting.findUnique({ where: { id: ws }, select: { spaceName: true } });
        await notifyUser(existing.id, {
          workspaceId: ws,
          title: `Te añadieron a ${space?.spaceName ?? "un espacio"}`,
          body: `Te añadieron al espacio ${space?.spaceName ?? ""} con el rol ${role.name}. Cámbiate desde el conmutador.`,
        });
      }
      return {
        data: {
          id: existing.id,
          email: existing.email,
          role: role.name,
          temporaryPassword: null,
          alreadyMember: Boolean(already),
          addedToSpace: !already,
          emailSent: await sendMemberNoticeEmail(request.log, {
            to: email,
            name: existing.name,
            role: role.name,
          }, ws),
        },
      };
    }

    // Los almacenes asignados deben pertenecer al espacio que invita.
    if (body.warehouseIds?.length) {
      const sites = await prisma.warehouse.findMany({ where: { id: { in: body.warehouseIds }, workspaceId: ws }, select: { id: true } });
      if (sites.length !== body.warehouseIds.length) {
        return reply.status(400).send({ error: "Uno o varios almacenes no pertenecen a tu espacio" });
      }
    }

    // Contraseña temporal: la cuenta queda pendiente hasta activarla.
    // El invitado hereda el espacio del equipo que lo invita.
    const temporaryPassword = crypto.randomUUID().slice(0, 8);
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);

    const initials = body.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");

    const created = await prisma.user.create({
      data: {
        email,
        name: body.name.trim(),
        initials: initials || "?",
        passwordHash,
        roleId: role.id,
        status: "PENDING",
        workspaceId: ws,
        invitedAt: new Date(),
        warehouses: body.warehouseIds?.length
          ? { create: body.warehouseIds.map((warehouseId) => ({ warehouseId })) }
          : undefined,
      },
      include: { role: true, warehouses: { include: { warehouse: true } } },
    });

    await prisma.spaceMember.create({
      data: { userId: created.id, workspaceId: ws, roleId: role.id, status: "PENDING" },
    });

    return reply.status(201).send({
      data: {
        id: created.id,
        email: created.email,
        role: created.role.name,
        temporaryPassword,
        emailSent: await sendInvitationEmail(request.log, {
          to: email,
          name: body.name.trim(),
          role: role.name,
          temporaryPassword,
        }, ws),
      },
    });
  });

  /**
   * Reenvía una invitación pendiente: genera una contraseña temporal nueva y
   * renueva la fecha de invitación. Sin correo saliente, la contraseña se
   * entrega al administrador para compartirla por su canal habitual.
   */
  app.post<{ Params: { id: string } }>("/invitations/:id/resend", { preHandler: app.requirePermission("admin") }, async (request, reply) => {
    const ws = await workspaceIdFor(request);
    const member = await prisma.user.findFirst({ where: { id: request.params.id, workspaceId: ws } });
    if (!member) return reply.status(404).send({ error: "Miembro no encontrado" });
    if (member.status !== "PENDING") return reply.status(400).send({ error: "Solo se reenvían invitaciones pendientes" });

    const temporaryPassword = crypto.randomUUID().slice(0, 8);
    await prisma.user.update({
      where: { id: member.id },
      data: { passwordHash: await bcrypt.hash(temporaryPassword, 10), invitedAt: new Date() },
    });

    return {
      data: {
        id: member.id,
        email: member.email,
        temporaryPassword,
        emailSent: await sendInvitationEmail(request.log, {
          to: member.email,
          name: member.name,
          role: (await prisma.role.findUnique({ where: { id: member.roleId }, select: { name: true } }))?.name ?? "",
          temporaryPassword,
          resent: true,
        }, ws),
      },
    };
  });

  /** Matriz de roles y permisos. */

  /** Espacios del usuario (propio + equipos que lo invitaron), para el conmutador. */
  app.get("/spaces", async (request) => {
    const memberships = await prisma.spaceMember.findMany({
      where: { userId: request.user.id },
      include: {
        role: { select: { name: true } },
        workspace: { select: { id: true, spaceName: true, spaceMark: true, spaceColor: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    const ws = await workspaceIdFor(request);
    return {
      data: memberships.map((m) => ({
        id: m.workspace.id,
        name: m.workspace.spaceName,
        mark: m.workspace.spaceMark,
        color: m.workspace.spaceColor,
        role: m.role.name,
        status: m.status,
        active: m.workspace.id === ws,
      })),
    };
  });

  /** Cambia el espacio activo. Devuelve sesión nueva con el rol de ese espacio. */
  app.patch("/active-space", async (request, reply) => {
    const { workspaceId } = (request.body ?? {}) as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "Falta el espacio" });
    const member = await prisma.spaceMember.findUnique({
      where: { userId_workspaceId: { userId: request.user.id, workspaceId } },
    });
    if (!member) return reply.status(404).send({ error: "No perteneces a ese espacio" });
    if (member.status !== "ACTIVE") return reply.status(403).send({ error: "Tu acceso a ese espacio sigue pendiente" });

    await prisma.user.update({ where: { id: request.user.id }, data: { workspaceId, roleId: member.roleId } });
    const { session, permissions } = await membershipSession(request.user.id);
    return { token: app.jwt.sign(session, { expiresIn: "7d" }), user: session, permissions };
  });

  /** Directorio de miembros del espacio con su rol, almacenes y último acceso. */
  app.get("/members", async (request) => {
    const query = request.query as { search?: string; warehouse?: string };
    const search = query.search?.trim().toLowerCase();
    const warehouse = query.warehouse?.trim();
    const ws = await workspaceIdFor(request);

    const [memberships, siteCount] = await Promise.all([
      prisma.spaceMember.findMany({
        where: {
          workspaceId: ws,
          ...(search
            ? {
                user: {
                  OR: [{ name: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }],
                },
              }
            : {}),
          ...(warehouse ? { user: { warehouses: { some: { warehouse: { code: warehouse, workspaceId: ws } } } } } : {}),
        },
        include: {
          role: true,
          user: { include: { warehouses: { include: { warehouse: true } } } },
        },
        orderBy: [{ status: "asc" }, { user: { name: "asc" } }],
      }),
      prisma.warehouse.count({ where: { workspaceId: ws } }),
    ]);

    const meId = request.user.id;

    return {
      data: memberships.map((member) => ({
        id: member.user.id,
        name: member.user.name,
        isYou: member.user.id === meId,
        email: member.user.email,
        initials: member.user.initials,
        role: member.role.name,
        warehouses:
          member.user.warehouses.length === siteCount && siteCount > 0
            ? "Todos los almacenes"
            : member.user.warehouses
                .map((entry) => entry.warehouse.name.replace("Almacén ", "").replace("Centro logístico ", ""))
                .join(" · ") || "—",
        lastAccess: formatLastAccess(member.status, member.user.lastAccessAt, member.user.invitedAt),
        status: member.status === "ACTIVE" ? "Activo" : "Pendiente",
        action: member.status === "PENDING" ? "Reenviar invitación" : member.user.id === meId ? "Ver perfil →" : "Editar acceso",
      })),
      meta: {
        active: memberships.filter((m) => m.status === "ACTIVE").length,
        pending: memberships.filter((m) => m.status === "PENDING").length,
        roles: new Set(memberships.map((m) => m.role.name)).size,
        warehouses: new Set(memberships.flatMap((m) => m.user.warehouses.map((e) => e.warehouseId))).size,
      },
    };
  });

  /** Matriz de roles y permisos. */
  app.get("/permissions", async (request) => {
    const ws = await workspaceIdFor(request);
    const [roles, permissions, matrix] = await Promise.all([
      prisma.role.findMany({ select: { id: true, name: true }, orderBy: { id: "asc" } }),
      prisma.permission.findMany({ orderBy: { order: "asc" } }),
      prisma.rolePermission.findMany(),
    ]);

    const counts = await prisma.spaceMember.groupBy({ by: ["roleId", "status"], _count: true, where: { workspaceId: ws } });

    return {
      roles: roles.map((role) => {
        const active = counts.find((c) => c.roleId === role.id && c.status === "ACTIVE")?._count ?? 0;
        const pending = counts.find((c) => c.roleId === role.id && c.status === "PENDING")?._count ?? 0;
        const suffix = pending > 0 ? ` + ${pending} invitado${pending > 1 ? "s" : ""}` : "";
        return { id: role.id, name: role.name, header: `${role.name} · ${active}${suffix}` };
      }),
      permissions: permissions.map((permission) => ({
        id: permission.id,
        label: permission.label,
        grants: Object.fromEntries(
          matrix.filter((m) => m.permissionId === permission.id).map((m) => [m.roleId, m.allowed]),
        ),
      })),
    };
  });

  /** Actualiza el rol de un miembro EN ESTE ESPACIO (el rol es por espacio). */
  app.patch<{ Params: { id: string } }>(
    "/members/:id",
    { preHandler: app.requirePermission("admin") },
    async (request, reply) => {
      const { roleId } = request.body as { roleId?: string };
      if (!roleId) return reply.status(400).send({ error: "Falta roleId" });

      const ws = await workspaceIdFor(request);
      const member = await prisma.spaceMember.findUnique({
        where: { userId_workspaceId: { userId: request.params.id, workspaceId: ws } },
      });
      if (!member) return reply.status(404).send({ error: "Miembro no encontrado" });
      if (member.userId === request.user.id) return reply.status(400).send({ error: "No puedes cambiarte el rol a ti mismo" });

      await prisma.spaceMember.update({
        where: { userId_workspaceId: { userId: member.userId, workspaceId: ws } },
        data: { roleId },
      });
      // Si es su espacio activo, el rol global lo acompaña (coherencia).
      await prisma.user.updateMany({ where: { id: member.userId, workspaceId: ws }, data: { roleId } });
      return { data: { id: member.userId, roleId } };
    },
  );

  /**
   * Cambia un permiso de un rol. Solo administración: es lo que hace real el
   * "Editar acceso" de la matriz.
   */
  app.patch(
    "/permissions",
    {
      preHandler: app.requirePermission("admin"),
      schema: {
        body: {
          type: "object",
          required: ["roleId", "permissionId", "allowed"],
          properties: {
            roleId: { type: "string", minLength: 1 },
            permissionId: { type: "string", minLength: 1 },
            allowed: { type: "boolean" },
          },
        },
      },
    },
    async (request, reply) => {
      const { roleId, permissionId, allowed } = request.body as { roleId: string; permissionId: string; allowed: boolean };
      const [role, permission] = await Promise.all([
        prisma.role.findUnique({ where: { id: roleId } }),
        prisma.permission.findUnique({ where: { id: permissionId } }),
      ]);
      if (!role || !permission) return reply.status(404).send({ error: "Rol o permiso no encontrado" });

      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId } },
        update: { allowed },
        create: { roleId, permissionId, allowed },
      });
      return { data: { roleId, permissionId, allowed } };
    },
  );
};

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function formatLastAccess(
  status: string,
  lastAccessAt: Date | null,
  invitedAt: Date | null,
): string {
  if (status !== "ACTIVE") {
    if (!invitedAt) return "Invitación pendiente";
    return `Invitada el ${invitedAt.getDate()} ${MONTHS[invitedAt.getMonth()]}`;
  }
  if (!lastAccessAt) return "—";

  const now = new Date();
  const sameDay = now.toDateString() === lastAccessAt.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  const time = `${String(lastAccessAt.getHours()).padStart(2, "0")}:${String(lastAccessAt.getMinutes()).padStart(2, "0")}`;
  if (sameDay) return `Hoy · ${time}`;
  if (yesterday.toDateString() === lastAccessAt.toDateString()) return `Ayer · ${time}`;
  return `${lastAccessAt.getDate()} ${MONTHS[lastAccessAt.getMonth()]} · ${time}`;
}