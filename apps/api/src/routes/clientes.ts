import type { FastifyPluginAsync } from "fastify";
import { prisma } from "@chink-saas/db";
import { workspaceIdFor } from "../lib/workspace-scope.js";
import { publishToWorkspace } from "../lib/realtime-hub.js";

export const clienteRoutes: FastifyPluginAsync = async (app) => {
  /** Clientes del espacio con totales y último pago. */
  app.get("/", async (request) => {
    const ws = await workspaceIdFor(request);
    const query = request.query as { q?: string };
    const search = query.q?.trim();

    const clientes = await prisma.cliente.findMany({
      where: {
        workspaceId: ws,
        ...(search
          ? { OR: [{ nombre: { contains: search, mode: "insensitive" } }, { numeroContacto: { contains: search, mode: "insensitive" } }] }
          : {}),
      },
      orderBy: { nombre: "asc" },
    });

    if (clientes.length === 0) return { data: [] };

    const ids = clientes.map((c) => c.id);
    const pagos = await prisma.pago.findMany({
      where: { workspaceId: ws, clienteId: { in: ids }, NOT: { estado: "eliminado" } },
      select: { clienteId: true, monto: true, fechaPago: true },
    });

    const agg = new Map<string, { total_pagos: number; monto_total: number; ultimo_pago: string | null }>();
    for (const id of ids) agg.set(id, { total_pagos: 0, monto_total: 0, ultimo_pago: null });
    for (const pago of pagos) {
      if (!pago.clienteId) continue;
      const entry = agg.get(pago.clienteId);
      if (!entry) continue;
      entry.total_pagos += 1;
      entry.monto_total += Number(pago.monto || 0);
      if (pago.fechaPago) {
        const dia = pago.fechaPago.toISOString().slice(0, 10);
        if (!entry.ultimo_pago || dia > entry.ultimo_pago) entry.ultimo_pago = dia;
      }
    }

    return {
      data: clientes.map((c) => ({
        id: c.id,
        nombre: c.nombre,
        numero_contacto: c.numeroContacto,
        notas: c.notas,
        ...agg.get(c.id),
      })),
    };
  });

  /** Alta de cliente. Requiere permiso de registro. */
  app.post(
    "/",
    { preHandler: app.requirePermission("register") },
    async (request, reply) => {
      const ws = await workspaceIdFor(request);
      const body = (request.body ?? {}) as { nombre?: string; numeroContacto?: string | null; notas?: string | null };
      const nombre = String(body.nombre ?? "").trim();
      if (!nombre) return reply.status(400).send({ error: "El nombre es obligatorio" });

      const creado = await prisma.cliente.create({
        data: { workspaceId: ws, nombre, numeroContacto: body.numeroContacto?.trim() || null, notas: body.notas?.trim() || null },
      });
      await publishToWorkspace(ws, { channels: ["clientes"] });
      return reply.status(201).send({
        data: { id: creado.id, nombre: creado.nombre, numero_contacto: creado.numeroContacto, notas: creado.notas },
      });
    },
  );

  /** Edita cliente del espacio. Requiere permiso de registro. */
  app.patch(
    "/:id",
    { preHandler: app.requirePermission("register") },
    async (request, reply) => {
      const ws = await workspaceIdFor(request);
      const id = (request.params as { id: string }).id;
      const body = (request.body ?? {}) as { nombre?: string; numeroContacto?: string | null; notas?: string | null };

      const existing = await prisma.cliente.findFirst({ where: { id, workspaceId: ws }, select: { id: true } });
      if (!existing) return reply.status(404).send({ error: "Cliente no encontrado" });

      const data: Record<string, unknown> = {};
      if (body.nombre !== undefined) {
        const nombre = String(body.nombre).trim();
        if (!nombre) return reply.status(400).send({ error: "El nombre no puede estar vacío" });
        data["nombre"] = nombre;
      }
      if (body.numeroContacto !== undefined) data["numeroContacto"] = body.numeroContacto?.trim() || null;
      if (body.notas !== undefined) data["notas"] = body.notas?.trim() || null;
      if (Object.keys(data).length === 0) return reply.status(400).send({ error: "Nada que actualizar" });

      const updated = await prisma.cliente.update({ where: { id }, data });
      await publishToWorkspace(ws, { channels: ["clientes"] });
      return { data: { id: updated.id, nombre: updated.nombre, numero_contacto: updated.numeroContacto, notas: updated.notas } };
    },
  );

  /** Elimina cliente sin pagos. Requiere permiso de registro. */
  app.delete(
    "/:id",
    { preHandler: app.requirePermission("register") },
    async (request, reply) => {
      const ws = await workspaceIdFor(request);
      const id = (request.params as { id: string }).id;

      const existing = await prisma.cliente.findFirst({ where: { id, workspaceId: ws }, select: { id: true } });
      if (!existing) return reply.status(404).send({ error: "Cliente no encontrado" });

      const count = await prisma.pago.count({ where: { workspaceId: ws, clienteId: id, NOT: { estado: "eliminado" } } });
      if (count > 0) {
        return reply.status(409).send({ error: "No puedes eliminar un cliente con pagos registrados." });
      }

      await prisma.cliente.delete({ where: { id } });
      await publishToWorkspace(ws, { channels: ["clientes"] });
      return { ok: true };
    },
  );
};
