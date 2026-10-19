import type { FastifyPluginAsync } from "fastify";
import type { MovementType } from "@chink-saas/db";
import type { Prisma } from "@chink-saas/db";
import { prisma } from "@chink-saas/db";
import { emailAssets, lowStockEmail, sendEmail } from "../lib/email.js";
import { workspaceIdFor } from "../lib/workspace-scope.js";

const TYPE_LABEL: Record<MovementType, string> = {
  ENTRY: "Entrada",
  EXIT: "Salida",
  TRANSFER: "Transferencia",
  ADJUSTMENT: "Ajuste",
};

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const listQuerySchema = {
  type: "object",
  properties: {
    search: { type: "string" },
    type: { type: "string", enum: ["ENTRY", "EXIT", "TRANSFER", "ADJUSTMENT"] },
    warehouse: { type: "string" },
    owner: { type: "string" },
    from: { type: "string" },
    to: { type: "string" },
    page: { type: "integer", minimum: 1, default: 1 },
    pageSize: { type: "integer", minimum: 1, maximum: 100, default: 25 },
  },
} as const;

const rangeQuerySchema = {
  type: "object",
  properties: {
    from: { type: "string" },
    to: { type: "string" },
  },
} as const;

const createBodySchema = {
  type: "object",
  required: ["type", "productId", "quantity"],
  properties: {
    type: { type: "string", enum: ["ENTRY", "EXIT", "TRANSFER", "ADJUSTMENT"] },
    productId: { type: "string", minLength: 1 },
    /** Siempre positiva; el signo se deduce del tipo y de `direction`. */
    quantity: { type: "integer", minimum: 1 },
    /** Solo aplica a ADJUSTMENT: suma o resta en el almacén indicado. */
    direction: { type: "string", enum: ["in", "out"], default: "in" },
    originId: { type: "string", nullable: true },
    destinationId: { type: "string", nullable: true },
    note: { type: "string" },
  },
} as const;

/** Devuelve el filtro `where` completo para acotar por rango de fechas. */
function rangeFilter(from?: string, to?: string): Prisma.StockMovementWhereInput | undefined {
  if (!from && !to) return undefined;
  return {
    createdAt: {
      ...(from ? { gte: new Date(`${from}T00:00:00`) } : {}),
      ...(to ? { lte: new Date(`${to}T23:59:59.999`) } : {}),
    },
  };
}

/** Siguiente referencia correlativa dentro del espacio: MOV-012 -> MOV-013. */
async function nextRef(workspaceId: string) {
  const last = await prisma.stockMovement.findFirst({ where: { workspaceId }, orderBy: { ref: "desc" }, select: { ref: true } });
  const current = Number(last?.ref.replace(/\D/g, "") ?? "0");
  return `MOV-${String(current + 1).padStart(3, "0")}`;
}

export const movementRoutes: FastifyPluginAsync = async (app) => {
  /** Alta de movimiento. Aplica el efecto sobre las existencias por almacén. */
  app.post("/", { schema: { body: createBodySchema } }, async (request, reply) => {
    const body = request.body as {
      type: MovementType;
      productId: string;
      quantity: number;
      direction?: "in" | "out";
      originId?: string | null;
      destinationId?: string | null;
      note?: string;
    };

    const product = await prisma.product.findFirst({
      where: { id: body.productId, workspaceId: await workspaceIdFor(request) },
      include: { locations: true },
    });
    if (!product) return reply.status(404).send({ error: "Producto no encontrado" });
    const ws = product.workspaceId;

    if (body.type === "TRANSFER" && !body.destinationId) {
      return reply.status(400).send({ error: "Una transferencia necesita un almacén de destino" });
    }
    if ((body.type === "ENTRY" || body.type === "EXIT" || body.type === "ADJUSTMENT") && !body.originId && body.type !== "ENTRY") {
      return reply.status(400).send({ error: "Indica el almacén afectado" });
    }

    // Los almacenes del movimiento deben pertenecer al espacio de la sesión.
    for (const warehouseId of [body.originId, body.destinationId]) {
      if (!warehouseId) continue;
      const site = await prisma.warehouse.findFirst({ where: { id: warehouseId, workspaceId: ws }, select: { id: true } });
      if (!site) return reply.status(400).send({ error: "Almacén no válido" });
    }

    // Deltas por almacén según el tipo. ENTRY suma en destino; EXIT resta en
    // origen; TRANSFER mueve; ADJUSTMENT aplica el signo que mande el usuario.
    const deltas = new Map<string, number>();
    const apply = (warehouseId: string | null | undefined, delta: number) => {
      if (!warehouseId || delta === 0) return;
      deltas.set(warehouseId, (deltas.get(warehouseId) ?? 0) + delta);
    };

    if (body.type === "ENTRY") apply(body.destinationId, body.quantity);
    else if (body.type === "EXIT") apply(body.originId, -body.quantity);
    else if (body.type === "TRANSFER") {
      apply(body.originId, -body.quantity);
      apply(body.destinationId, body.quantity);
    } else apply(body.originId, body.direction === "out" ? -body.quantity : body.quantity);

    // No se permite dejar existencias negativas.
    for (const [warehouseId, delta] of deltas) {
      const current = product.locations.find((l) => l.warehouseId === warehouseId)?.quantity ?? 0;
      if (current + delta < 0) {
        const warehouse = await prisma.warehouse.findFirst({ where: { id: warehouseId, workspaceId: ws }, select: { name: true } });
        return reply.status(409).send({
          error: `No hay stock suficiente en ${warehouse?.name ?? "ese almacén"} (${current} u.)`,
        });
      }
    }

    const stockDelta = [...deltas.values()].reduce((acc, delta) => acc + delta, 0);

    const created = await prisma.$transaction(async (tx) => {
      for (const [warehouseId, delta] of deltas) {
        const existing = product.locations.find((l) => l.warehouseId === warehouseId);
        if (existing) {
          await tx.stockLocation.update({
            where: { productId_warehouseId: { productId: product.id, warehouseId } },
            data: { quantity: { increment: delta } },
          });
        } else {
          await tx.stockLocation.create({ data: { productId: product.id, warehouseId, quantity: delta } });
        }
      }

      const newStock = product.stock + stockDelta;

      await tx.product.update({
        where: { id: product.id },
        data: {
          stock: newStock,
          totalValue: Number((newStock * Number(product.unitCost)).toFixed(2)),
          status: product.minStock > 0 && newStock <= product.minStock ? "LOW_STOCK" : "IN_STOCK",
        },
      });

      return tx.stockMovement.create({
        data: {
          ref: await nextRef(ws),
          type: body.type,
          status: "CONFIRMED",
          // Las transferencias no alteran el total: se guardan positivas.
          quantity: body.type === "TRANSFER" ? body.quantity : stockDelta,
          note: body.note,
          productId: product.id,
          originId: body.originId ?? null,
          destinationId: body.destinationId ?? null,
          ownerId: request.user.id,
          workspaceId: ws,
        },
        include: { product: true, origin: true, destination: true },
      });
    });

    // Alerta de stock bajo: solo al cruzar el mínimo hacia abajo.
    const crossedBelow = product.minStock > 0 && product.stock > product.minStock && created.product.stock <= product.minStock;
    if (crossedBelow) {
      try {
        const prefs = await prisma.workspaceSetting.findUnique({
          where: { id: ws },
          select: { notifyLowStock: true, contactEmail: true, spaceName: true, spaceMark: true },
        });
        if (prefs?.notifyLowStock && prefs.contactEmail) {
          const content = lowStockEmail({
            product: created.product.name,
            sku: created.product.sku,
            stock: created.product.stock,
            minStock: product.minStock,
            spaceName: prefs.spaceName,
            mark: prefs.spaceMark,
          });
          await sendEmail({ category: "alerts", to: prefs.contactEmail, subject: content.subject, html: content.html, text: content.text, attachments: emailAssets(prefs.spaceMark).attachments });
        }
      } catch (error) {
        request.log.warn({ productId: product.id, error }, "No se pudo enviar la alerta de stock bajo");
      }
    }

    return reply.status(201).send({
      data: {
        id: created.id,
        ref: created.ref,
        type: TYPE_LABEL[created.type],
        product: created.product.name,
        sku: created.product.sku,
        quantity: created.quantity,
        owner: request.user.name,
        status: "Confirmado",
      },
      stockDelta,
      crossedLowStock: crossedBelow
        ? { product: created.product.name, sku: created.product.sku, stock: created.product.stock, minStock: product.minStock }
        : null,
    });
  });

  /** Historial paginado y filtrable. */
  app.get("/", { schema: { querystring: listQuerySchema } }, async (request) => {
    const query = request.query as {
      search?: string;
      type?: MovementType;
      warehouse?: string;
      owner?: string;
      from?: string;
      to?: string;
      page?: number;
      pageSize?: number;
    };
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;

    const search = query.search?.trim();
    const created = rangeFilter(query.from, query.to);
    const ws = await workspaceIdFor(request);

    // Los filtros opcionales se combinan en un único OR: antes el segundo
    // machacaba al primero cuando venían almacén y búsqueda a la vez.
    const ors: Prisma.StockMovementWhereInput[] = [];
    if (query.warehouse) ors.push({ origin: { code: query.warehouse } }, { destination: { code: query.warehouse } });
    if (search) {
      ors.push(
        { ref: { contains: search, mode: "insensitive" } },
        { product: { name: { contains: search, mode: "insensitive" } } },
        { product: { sku: { contains: search, mode: "insensitive" } } },
      );
    }

    const where: Prisma.StockMovementWhereInput = {
      workspaceId: ws,
      ...(query.type ? { type: query.type } : {}),
      ...(query.owner ? { owner: { email: query.owner } } : {}),
      ...(created ?? {}),
      ...(ors.length > 0 ? { OR: ors } : {}),
    };

    const [total, rows, typeCounts] = await Promise.all([
      prisma.stockMovement.count({ where }),
      prisma.stockMovement.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { product: true, owner: true, origin: true, destination: true },
      }),
      prisma.stockMovement.groupBy({ by: ["type"], _count: true, _sum: { quantity: true }, where: { workspaceId: ws } }),
    ]);

    return {
      data: rows.map((row) => ({
        id: row.id,
        ref: row.ref,
        date: `${row.createdAt.getDate()} ${MONTHS[row.createdAt.getMonth()]}`,
        time: `${String(row.createdAt.getHours()).padStart(2, "0")}:${String(row.createdAt.getMinutes()).padStart(2, "0")}`,
        type: TYPE_LABEL[row.type],
        product: row.product.name,
        sku: row.product.sku,
        imageUrl: row.product.imageUrl,
        quantity: row.quantity,
        route: row.note ?? "—",
        owner: row.owner.name,
        status: row.status === "CONFIRMED" ? "Confirmado" : "Pendiente",
      })),
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.max(Math.ceil(total / pageSize), 1),
        counts: {
          all: typeCounts.reduce((acc, c) => acc + c._count, 0),
          ENTRY: typeCounts.find((c) => c.type === "ENTRY")?._count ?? 0,
          EXIT: typeCounts.find((c) => c.type === "EXIT")?._count ?? 0,
          TRANSFER: typeCounts.find((c) => c.type === "TRANSFER")?._count ?? 0,
          ADJUSTMENT: typeCounts.find((c) => c.type === "ADJUSTMENT")?._count ?? 0,
        },
        net: typeCounts.reduce((acc, c) => acc + (c._sum.quantity ?? 0), 0),
      },
    };
  });

  /** KPIs de la banda de resumen. */
  app.get("/summary", { schema: { querystring: rangeQuerySchema } }, async (request) => {
    const { from, to } = request.query as { from?: string; to?: string };
    const ws = await workspaceIdFor(request);
    const created = rangeFilter(from, to);
    const groups = await prisma.stockMovement.groupBy({
      by: ["type"],
      _count: true,
      _sum: { quantity: true },
      where: { workspaceId: ws, ...created },
    });

    const pick = (type: MovementType) => {
      const row = groups.find((g) => g.type === type);
      return { units: Math.abs(row?._sum.quantity ?? 0), count: row?._count ?? 0 };
    };

    const entries = pick("ENTRY");
    const exits = pick("EXIT");
    const transfers = pick("TRANSFER");
    const adjustments = pick("ADJUSTMENT");
    const net = entries.units - exits.units + adjustments.units;

    return { entries, exits, transfers, adjustments, net, balance: entries.units - exits.units + adjustments.units };
  });

  /** Serie diaria de entradas y salidas para los gráficos. */
  app.get("/weekly", { schema: { querystring: rangeQuerySchema } }, async (request) => {
    const { from, to } = request.query as { from?: string; to?: string };
    const ws = await workspaceIdFor(request);
    // Se traen todos los tipos para que los días sin entradas ni salidas
    // (p. ej. el 9 oct, que solo tiene una transferencia) aparezcan con 0.
    const rows = await prisma.stockMovement.findMany({
      where: { workspaceId: ws, ...rangeFilter(from, to) },
      select: { type: true, quantity: true, createdAt: true },
    });

    const days = new Map<string, { day: string; entries: number; exits: number; order: number }>();
    for (const row of rows) {
      // Clave y etiqueta en hora LOCAL: usar UTC para la clave y local para la
      // etiqueta partía los días por la mitad (dos barras con la misma etiqueta).
      const pad = (value: number) => String(value).padStart(2, "0");
      const key = `${row.createdAt.getFullYear()}-${pad(row.createdAt.getMonth() + 1)}-${pad(row.createdAt.getDate())}`;
      const label = `${row.createdAt.getDate()} ${MONTHS[row.createdAt.getMonth()]}`;
      const current = days.get(key) ?? { day: label, entries: 0, exits: 0, order: row.createdAt.getTime() };
      if (row.type === "ENTRY") current.entries += Math.abs(row.quantity);
      else if (row.type === "EXIT") current.exits += Math.abs(row.quantity);
      days.set(key, current);
    }

    return { data: [...days.values()].sort((a, b) => a.order - b.order) };
  });
};