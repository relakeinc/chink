import type { ServerResponse } from "node:http";
import { prisma } from "@chink-saas/db";

export interface RealtimeEvent {
  channels: string[];
}

interface Client {
  res: ServerResponse;
  heartbeat: NodeJS.Timeout;
  workspaceId: string;
}

const clients = new Map<string, Set<Client>>();

function send(client: Client, event: RealtimeEvent) {
  try {
    client.res.write(`event: change\ndata: ${JSON.stringify(event)}\n\n`);
  } catch {
    /* Cliente caído: se retira al cerrar la conexión. */
  }
}

/** Registra una conexión SSE de un usuario. */
export function subscribeRealtime(userId: string, workspaceId: string, res: ServerResponse) {
  const heartbeat = setInterval(() => {
    try {
      res.write(`: latido\n\n`);
    } catch {
      /* Se limpia al cerrar. */
    }
  }, 25000);
  const client: Client = { res, heartbeat, workspaceId };
  const set = clients.get(userId) ?? new Set<Client>();
  set.add(client);
  clients.set(userId, set);
  res.on("close", () => {
    clearInterval(heartbeat);
    const current = clients.get(userId);
    if (current) {
      current.delete(client);
      if (current.size === 0) clients.delete(userId);
    }
  });
}

/** Emite a un usuario concreto (p. ej. su campana de notificaciones). */
export function publishToUser(userId: string, event: RealtimeEvent) {
  for (const client of clients.get(userId) ?? []) send(client, event);
}

/** Emite a todos los miembros de un espacio (p. ej. cambió su inventario). */
export async function publishToWorkspace(workspaceId: string, event: RealtimeEvent) {
  const members = await prisma.spaceMember.findMany({ where: { workspaceId }, select: { userId: true } });
  for (const member of members) publishToUser(member.userId, event);
}
