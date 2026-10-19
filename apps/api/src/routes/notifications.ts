import type { FastifyPluginAsync } from "fastify";
import { prisma } from "@chink-saas/db";

export interface NewNotification {
  kind?: string;
  title: string;
  body: string;
  workspaceId?: string | null;
}

/** Crea un aviso in-app para un usuario (campana de notificaciones). */
export async function notifyUser(userId: string, input: NewNotification) {
  return prisma.notification.create({
    data: {
      userId,
      workspaceId: input.workspaceId ?? null,
      kind: input.kind ?? "invite",
      title: input.title,
      body: input.body,
    },
    select: { id: true },
  });
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function formatWhen(date: Date): string {
  const now = new Date();
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  if (now.toDateString() === date.toDateString()) return `Hoy · ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (yesterday.toDateString() === date.toDateString()) return `Ayer · ${time}`;
  return `${date.getDate()} ${MONTHS[date.getMonth()]} · ${time}`;
}

export const notificationRoutes: FastifyPluginAsync = async (app) => {
  /** Últimos avisos del usuario + conteo de no leídos (la campana consulta esto). */
  app.get("/", async (request) => {
    const [items, unread] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: request.user.id },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.notification.count({ where: { userId: request.user.id, read: false } }),
    ]);

    return {
      data: items.map((item) => ({
        id: item.id,
        kind: item.kind,
        title: item.title,
        body: item.body,
        read: item.read,
        when: formatWhen(item.createdAt),
      })),
      unread,
    };
  });

  /** Marca avisos como leídos (todos si no se indican ids). */
  app.patch("/read", async (request) => {
    const body = (request.body ?? {}) as { ids?: string[] };
    const where = { userId: request.user.id, ...(Array.isArray(body.ids) ? { id: { in: body.ids } } : {}) };
    await prisma.notification.updateMany({ where, data: { read: true } });
    const unread = await prisma.notification.count({ where: { userId: request.user.id, read: false } });
    return { data: { unread } };
  });
};
