import type { FastifyPluginAsync } from "fastify";
import { prisma } from "@chink-saas/db";
import { workspaceIdFor } from "../lib/workspace-scope.js";
import { notifyUser } from "./notifications.js";
import { publishToWorkspace, publishToUser } from "../lib/realtime-hub.js";
import { normalizarReferencia } from "../lib/bancos.js";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const ESTADOS = ["verificado", "revisar", "duplicado", "ilegible", "eliminado"] as const;

function toDto(row: {
  id: string;
  monto: unknown;
  estado: string;
  bancoDestino: string | null;
  fuenteFondos: string | null;
  numeroDestino: string | null;
  referencia: string | null;
  fechaPago: Date | null;
  horaPago: string | null;
  para: string | null;
  clienteId: string | null;
  imageMime: string | null;
  notas: string | null;
  createdAt: Date;
  cliente?: { nombre: string } | null;
}) {
  return {
    id: row.id,
    monto: Number(row.monto),
    estado: row.estado,
    banco_destino: row.bancoDestino,
    fuente_fondos: row.fuenteFondos,
    numero_destino: row.numeroDestino,
    referencia: row.referencia,
    fecha_pago: row.fechaPago ? row.fechaPago.toISOString().slice(0, 10) : null,
    hora: row.horaPago,
    para: row.para,
    cliente_id: row.clienteId,
    cliente: row.cliente?.nombre ?? null,
    imagen_url: row.imageMime ? `/api/pagos/${row.id}/imagen` : null,
    notas: row.notas,
    creada: row.createdAt,
  };
}

const listQuerySchema = {
  type: "object",
  properties: {
    q: { type: "string" },
    banco: { type: "string" },
    cliente_id: { type: "string" },
    estado: { type: "string" },
    fecha_inicio: { type: "string" },
    fecha_fin: { type: "string" },
    page: { type: "integer", minimum: 1, default: 1 },
    pageSize: { type: "integer", minimum: 1, maximum: 100, default: 25 },
  },
} as const;

export const pagoRoutes: FastifyPluginAsync = async (app) => {
  /** Totales de todos los comprobantes del espacio, independientes de la fecha del pago. */
  app.get("/resumen", async (request) => {
    const workspaceId = await workspaceIdFor(request);
    const groups = await prisma.pago.groupBy({
      by: ["estado", "bancoDestino"],
      where: { workspaceId, NOT: { estado: "eliminado" } },
      _sum: { monto: true },
      _count: { id: true },
    });
    const summary = { totalVerificado: 0, countVerificado: 0, totalRevisar: 0, countRevisar: 0, bancos: 0 };
    const banks = new Set<string>();
    for (const group of groups) {
      const amount = Number(group._sum.monto ?? 0);
      if (group.estado === "verificado") {
        summary.totalVerificado += amount;
        summary.countVerificado += group._count.id;
      } else if (group.estado === "revisar" || group.estado === "ilegible") {
        summary.totalRevisar += amount;
        summary.countRevisar += group._count.id;
      }
      if (group.bancoDestino) banks.add(group.bancoDestino);
    }
    summary.bancos = banks.size;
    return summary;
  });

  /** Listado paginado y filtrable del espacio. */
  app.get("/", { schema: { querystring: listQuerySchema } }, async (request) => {
    const ws = await workspaceIdFor(request);
    const query = request.query as {
      q?: string; banco?: string; cliente_id?: string; estado?: string;
      fecha_inicio?: string; fecha_fin?: string; page?: number; pageSize?: number;
    };
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const and: Record<string, unknown>[] = [{ NOT: { estado: "eliminado" } }];

    if (query.fecha_inicio || query.fecha_fin) {
      and.push({
        fechaPago: {
          ...(query.fecha_inicio ? { gte: new Date(query.fecha_inicio) } : {}),
          ...(query.fecha_fin ? { lte: new Date(`${query.fecha_fin}T23:59:59.999`) } : {}),
        },
      });
    }
    if (query.banco) {
      and.push({
        OR: [
          { bancoDestino: { contains: query.banco, mode: "insensitive" } },
          { fuenteFondos: { contains: query.banco, mode: "insensitive" } },
        ],
      });
    }
    if (query.cliente_id) and.push({ clienteId: query.cliente_id });
    if (query.estado) and.push({ estado: query.estado });
    if (query.q?.trim()) {
      and.push({
        OR: [
          { referencia: { contains: query.q.trim(), mode: "insensitive" } },
          { numeroOrigen: { contains: query.q.trim(), mode: "insensitive" } },
        ],
      });
    }

    const where = { workspaceId: ws, AND: and };
    const [total, rows] = await Promise.all([
      prisma.pago.count({ where }),
      prisma.pago.findMany({
        where,
        omit: { imageData: true },
        include: { cliente: { select: { nombre: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { data: rows.map(toDto), meta: { total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) } };
  });

  /** Serie de 7 días para el gráfico. */
  app.get("/semana", async (request) => {
    const ws = await workspaceIdFor(request);
    const hoy = new Date();
    const hace7 = new Date(hoy);
    hace7.setDate(hoy.getDate() - 7);
    const rows = await prisma.pago.findMany({
      where: { workspaceId: ws, fechaPago: { gte: hace7, lte: hoy }, NOT: { estado: "eliminado" } },
      select: { monto: true, fechaPago: true },
      orderBy: { fechaPago: "asc" },
    });
    return rows.map((row) => ({ monto: Number(row.monto), fecha_pago: row.fechaPago ? toYmd(row.fechaPago) : null }));
  });

  function toYmd(value: Date): string {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }

  app.get("/:id", async (request, reply) => {
    const ws = await workspaceIdFor(request);
    const pago = await prisma.pago.findFirst({
      where: { id: (request.params as { id: string }).id, workspaceId: ws },
      omit: { imageData: true },
      include: { cliente: { select: { nombre: true } } },
    });
    if (!pago) return reply.status(404).send({ error: "Pago no encontrado" });
    return { data: toDto(pago) };
  });

  app.get("/:id/imagen", async (request, reply) => {
    const ws = await workspaceIdFor(request);
    const pago = await prisma.pago.findFirst({
      where: { id: (request.params as { id: string }).id, workspaceId: ws, NOT: { estado: "eliminado" } },
      select: { imageData: true, imageMime: true },
    });
    if (!pago?.imageData || !pago.imageMime) return reply.status(404).send({ error: "Comprobante no encontrado" });
    if (!["image/jpeg", "image/png", "image/webp"].includes(pago.imageMime)) return reply.status(404).send({ error: "Comprobante no disponible" });
    return reply.header("Cache-Control", "private, no-store")
      .header("X-Content-Type-Options", "nosniff")
      .type(pago.imageMime)
      .send(Buffer.from(pago.imageData));
  });

  /**
   * Alta manual (sin bot). Requiere permiso de registro. La referencia se
   * normaliza y se rechazan duplicados dentro del espacio.
   */
  app.post(
    "/",
    { preHandler: app.requirePermission("register"), schema: { body: { type: "object", required: ["monto"], properties: {
      monto: { type: "number", minimum: 0 },
      clienteId: { type: "string", nullable: true },
      bancoDestino: { type: "string" },
      fuenteFondos: { type: "string" },
      referencia: { type: "string" },
      fechaPago: { type: "string" },
      horaPago: { type: "string" },
      para: { type: "string" },
      numeroDestino: { type: "string" },
      numeroOrigen: { type: "string" },
      notas: { type: "string" },
    } } } },
    async (request, reply) => {
      const ws = await workspaceIdFor(request);
      const body = request.body as {
        monto?: number; clienteId?: string | null; bancoDestino?: string; fuenteFondos?: string;
        referencia?: string; fechaPago?: string; horaPago?: string; para?: string;
        numeroDestino?: string; numeroOrigen?: string; notas?: string;
      };

      if (typeof body.monto !== "number" || !(body.monto > 0)) {
        return reply.status(400).send({ error: "El monto debe ser mayor a 0" });
      }

      const referencia = normalizarReferencia(body.referencia);
      if (referencia) {
        const dup = await prisma.pago.findFirst({ where: { workspaceId: ws, referencia }, select: { id: true } });
        if (dup) return reply.status(409).send({ error: "Ya existe un pago con esa referencia en este espacio" });
      }

      let clienteId: string | null = null;
      if (body.clienteId) {
        const cli = await prisma.cliente.findFirst({ where: { id: body.clienteId, workspaceId: ws }, select: { id: true } });
        if (!cli) return reply.status(400).send({ error: "Cliente no válido para este espacio" });
        clienteId = cli.id;
      }

      const creado = await prisma.pago.create({
        data: {
          workspaceId: ws,
          registradoPorId: request.user.id,
          clienteId,
          monto: body.monto,
          bancoDestino: body.bancoDestino?.trim() || null,
          fuenteFondos: body.fuenteFondos?.trim() || null,
          referencia,
          fechaPago: body.fechaPago ? new Date(`${body.fechaPago}T00:00:00`) : new Date(),
          horaPago: body.horaPago?.trim() || null,
          para: body.para?.trim() || null,
          numeroDestino: body.numeroDestino?.replace(/\D/g, "") || null,
          numeroOrigen: body.numeroOrigen?.replace(/\D/g, "") || null,
          notas: body.notas?.trim() || null,
          estado: "verificado",
        },
        include: { cliente: { select: { nombre: true } } },
      });

      await publishToWorkspace(ws, { channels: ["pagos", "dashboard"] });
      return reply.status(201).send({ data: toDto(creado) });
    },
  );

  /** Edita estado/notas/cliente y completa comprobantes pendientes de lectura. */
  app.patch(
    "/:id",
    { preHandler: app.requirePermission("register") },
    async (request, reply) => {
      const ws = await workspaceIdFor(request);
      const id = (request.params as { id: string }).id;
      const body = (request.body ?? {}) as { estado?: string; notas?: string; clienteId?: string | null; monto?: number; referencia?: string; bancoDestino?: string; fuenteFondos?: string; fechaPago?: string; para?: string };

      const existing = await prisma.pago.findFirst({ where: { id, workspaceId: ws }, select: { id: true, estado: true, monto: true } });
      if (!existing) return reply.status(404).send({ error: "Pago no encontrado" });

      const data: Record<string, unknown> = {};
      const canComplete = existing.estado === "revisar";
      const hasDetails = ["monto", "referencia", "bancoDestino", "fuenteFondos", "fechaPago", "para"].some((key) => Object.prototype.hasOwnProperty.call(body, key));
      if (hasDetails && !canComplete) return reply.status(409).send({ error: "Solo se pueden completar los datos de comprobantes pendientes de lectura" });
      if (canComplete) {
        if (body.monto !== undefined) {
          if (!Number.isFinite(body.monto) || body.monto <= 0) return reply.status(400).send({ error: "El monto debe ser mayor a 0" });
          data["monto"] = body.monto;
        }
        if (body.referencia !== undefined) {
          const referencia = normalizarReferencia(body.referencia);
          if (referencia && await prisma.pago.findFirst({ where: { workspaceId: ws, referencia, id: { not: id } }, select: { id: true } })) return reply.status(409).send({ error: "Ya existe un pago con esa referencia" });
          data["referencia"] = referencia;
        }
        if (body.bancoDestino !== undefined) data["bancoDestino"] = body.bancoDestino.trim() || null;
        if (body.fuenteFondos !== undefined) data["fuenteFondos"] = body.fuenteFondos.trim() || null;
        if (body.para !== undefined) data["para"] = body.para.trim() || null;
        if (body.fechaPago !== undefined) {
          const date = new Date(`${body.fechaPago}T00:00:00`);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(body.fechaPago) || Number.isNaN(date.getTime())) return reply.status(400).send({ error: "Fecha no válida" });
          data["fechaPago"] = date;
        }
      }
      if (body.estado !== undefined) {
        if (!ESTADOS.includes(body.estado as (typeof ESTADOS)[number])) {
          return reply.status(400).send({ error: `Estado debe ser uno de: ${ESTADOS.join(", ")}` });
        }
        data["estado"] = body.estado;
      }
      if (canComplete && body.estado === "verificado" && !(Number(body.monto ?? existing.monto) > 0)) return reply.status(400).send({ error: "Indica el monto antes de verificar" });
      if (body.notas !== undefined) data["notas"] = String(body.notas).slice(0, 500) || null;
      if (body.clienteId !== undefined) {
        if (body.clienteId) {
          const cli = await prisma.cliente.findFirst({ where: { id: body.clienteId, workspaceId: ws }, select: { id: true } });
          if (!cli) return reply.status(400).send({ error: "Cliente no válido para este espacio" });
          data["clienteId"] = cli.id;
        } else {
          data["clienteId"] = null;
        }
      }
      if (Object.keys(data).length === 0) return reply.status(400).send({ error: "Nada que actualizar" });

      const updated = await prisma.pago.update({
        where: { id },
        data,
        include: { cliente: { select: { nombre: true } } },
      });
      await publishToWorkspace(ws, { channels: ["pagos", "dashboard"] });
      return { data: toDto(updated) };
    },
  );

  /** Borrado lógico. Requiere permiso de registro. */
  app.delete("/:id", { preHandler: app.requirePermission("register") }, async (request, reply) => {
    const ws = await workspaceIdFor(request);
    const id = (request.params as { id: string }).id;
    const existing = await prisma.pago.findFirst({ where: { id, workspaceId: ws }, select: { id: true } });
    if (!existing) return reply.status(404).send({ error: "Pago no encontrado" });
    await prisma.pago.update({ where: { id }, data: { estado: "eliminado" } });
    await publishToWorkspace(ws, { channels: ["pagos", "dashboard"] });
    return { ok: true };
  });

  /**
   * Cierre del día: suma lo verificado por banco para conciliar contra el
   * dinero en cuenta. `fecha=YYYY-MM-DD` (hoy si falta).
   */
  app.get("/cierre/resumen", async (request) => {
    const ws = await workspaceIdFor(request);
    const raw = String((request.query as { fecha?: string }).fecha || "").trim();
    const base = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00`) : new Date();
    const inicio = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, 0, 0, 0);
    const fin = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 23, 59, 59, 999);

    const rows = await prisma.pago.findMany({
      where: { workspaceId: ws, NOT: { estado: "eliminado" }, fechaPago: { gte: inicio, lte: fin } },
      select: {
        id: true, monto: true, estado: true, bancoDestino: true, fuenteFondos: true,
        numeroDestino: true, referencia: true, horaPago: true, clienteId: true,
        cliente: { select: { nombre: true } }, para: true,
      },
      orderBy: { fechaPago: "asc" },
    });

    const porBanco = new Map<string, { banco: string; total: number; cantidad: number }>();
    let totalVerificado = 0;
    let countVerificado = 0;
    let totalRevisar = 0;
    let countRevisar = 0;

    for (const row of rows) {
      const monto = Number(row.monto || 0);
      const clave = row.bancoDestino || "Sin banco";
      const entry = porBanco.get(clave) ?? { banco: clave, total: 0, cantidad: 0 };
      entry.total += monto;
      entry.cantidad += 1;
      porBanco.set(clave, entry);
      if (row.estado === "verificado") {
        totalVerificado += monto;
        countVerificado += 1;
      } else if (row.estado === "revisar" || row.estado === "ilegible") {
        totalRevisar += monto;
        countRevisar += 1;
      }
    }

    const pad = (n: number) => String(n).padStart(2, "0");
    return {
      fecha: `${inicio.getFullYear()}-${pad(inicio.getMonth() + 1)}-${pad(inicio.getDate())}`,
      totalVerificado,
      countVerificado,
      totalRevisar,
      countRevisar,
      porBanco: [...porBanco.values()].sort((a, b) => b.total - a.total),
      detalle: rows.map((row) => ({
        id: row.id,
        monto: Number(row.monto),
        estado: row.estado,
        banco_destino: row.bancoDestino,
        fuente_fondos: row.fuenteFondos,
        numero_destino: row.numeroDestino,
        referencia: row.referencia,
        hora: row.horaPago,
        cliente: row.cliente?.nombre ?? null,
        para: row.para,
      })),
    };
  });
};

export async function avisarPagoRegistrado(
  workspaceId: string,
  usuarioId: string,
  input: { estado: string; monto: number | string; banco?: string | null; referencia?: string | null },
) {
  const esRevision = input.estado === "revisar" || input.estado === "ilegible";
  await notifyUser(usuarioId, {
    workspaceId,
    kind: "pago",
    title: esRevision ? "Comprobante para revisar" : "Comprobante registrado",
    body: `$${Number(input.monto || 0).toLocaleString("es-CO")} · ${input.banco || "banco sin confirmar"} · Ref ${input.referencia || "s/n"}`,
  });
  publishToUser(usuarioId, { channels: ["notifications", "pagos"] });
}
