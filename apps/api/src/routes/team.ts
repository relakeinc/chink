import bcrypt from "bcryptjs";
import type { FastifyPluginAsync } from "fastify";
import { prisma } from "@chink-saas/db";
import { emailAssets, invitationEmail, invitationExistingEmail, sendEmail } from "../lib/email.js";

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
): Promise<boolean> {
  try {
    const space = await prisma.workspaceSetting.findUnique({ where: { id: "default" }, select: { spaceName: true, spaceMark: true } });
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
): Promise<boolean> {
  try {
    const space = await prisma.workspaceSetting.findUnique({ where: { id: "default" }, select: { spaceName: true, spaceMark: true } });
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
  app.post("/invitations", { schema: { body: inviteBodySchema } }, async (request, reply) => {
    const body = request.body as {
      email: string;
      name: string;
      roleId: string;
      warehouseIds?: string[];
    };

    const email = body.email.trim().toLowerCase();

    const role = await prisma.role.findUnique({ where: { id: body.roleId } });
    if (!role) return reply.status(400).send({ error: "Rol no válido" });

    // Ya es miembro: no se crea nada ni se toca su cuenta; solo se le avisa.
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return {
        data: {
          id: existing.id,
          email: existing.email,
          role: role.name,
          temporaryPassword: null,
          alreadyMember: true,
          emailSent: await sendMemberNoticeEmail(request.log, {
            to: email,
            name: existing.name,
            role: role.name,
          }),
        },
      };
    }

    // Contraseña temporal: la cuenta queda pendiente hasta activarla.
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
        invitedAt: new Date(),
        warehouses: body.warehouseIds?.length
          ? { create: body.warehouseIds.map((warehouseId) => ({ warehouseId })) }
          : undefined,
      },
      include: { role: true, warehouses: { include: { warehouse: true } } },
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
        }),
      },
    });
  });

  /**
   * Reenvía una invitación pendiente: genera una contraseña temporal nueva y
   * renueva la fecha de invitación. Sin correo saliente, la contraseña se
   * entrega al administrador para compartirla por su canal habitual.
   */
  app.post<{ Params: { id: string } }>("/invitations/:id/resend", async (request, reply) => {
    const member = await prisma.user.findUnique({ where: { id: request.params.id } });
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
        }),
      },
    };
  });

  /** Matriz de roles y permisos. */

  /** Directorio de miembros con su rol, almacenes y último acceso. */
  app.get("/members", async (request) => {
    const query = request.query as { search?: string; warehouse?: string };
    const search = query.search?.trim().toLowerCase();
    const warehouse = query.warehouse?.trim();

    const members = await prisma.user.findMany({
      where: {
        ...(search
          ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }] }
          : {}),
        ...(warehouse ? { warehouses: { some: { warehouse: { code: warehouse } } } } : {}),
      },
      include: {
        role: true,
        warehouses: { include: { warehouse: true } },
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
    });

    const meId = request.user.id;

    return {
      data: members.map((member) => ({
        id: member.id,
        name: member.name,
        isYou: member.id === meId,
        email: member.email,
        initials: member.initials,
        role: member.role.name,
        warehouses:
          member.warehouses.length === 3
            ? "Todos los almacenes"
            : member.warehouses
                .map((entry) => entry.warehouse.name.replace("Almacén ", "").replace("Centro logístico ", ""))
                .join(" · ") || "—",
        lastAccess: formatLastAccess(member.status, member.lastAccessAt, member.invitedAt),
        status: member.status === "ACTIVE" ? "Activo" : "Pendiente",
        action: member.status === "PENDING" ? "Reenviar invitación" : member.id === meId ? "Ver perfil →" : "Editar acceso",
      })),
      meta: {
        active: members.filter((m) => m.status === "ACTIVE").length,
        pending: members.filter((m) => m.status === "PENDING").length,
        roles: new Set(members.map((m) => m.role.name)).size,
        warehouses: new Set(members.flatMap((m) => m.warehouses.map((e) => e.warehouseId))).size,
      },
    };
  });

  /** Matriz de roles y permisos. */
  app.get("/permissions", async () => {
    const [roles, permissions, matrix] = await Promise.all([
      prisma.role.findMany({
        include: { _count: { select: { users: true } }, users: { select: { status: true } } },
        orderBy: { id: "asc" },
      }),
      prisma.permission.findMany({ orderBy: { order: "asc" } }),
      prisma.rolePermission.findMany(),
    ]);

    const counts = await prisma.user.groupBy({ by: ["roleId", "status"], _count: true });

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

  /** Actualiza el rol de un miembro. */
  app.patch<{ Params: { id: string } }>("/members/:id", async (request, reply) => {
    const { roleId } = request.body as { roleId?: string };
    if (!roleId) return reply.status(400).send({ error: "Falta roleId" });

    const member = await prisma.user.findUnique({ where: { id: request.params.id } });
    if (!member) return reply.status(404).send({ error: "Miembro no encontrado" });
    if (member.id === request.user.id) return reply.status(400).send({ error: "No puedes cambiarte el rol a ti mismo" });

    await prisma.user.update({ where: { id: member.id }, data: { roleId } });
    return { data: { id: member.id, roleId } };
  });
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