import type { FastifyPluginAsync } from "fastify";
import { prisma } from "@chink-saas/db";

const createBodySchema = {
  type: "object",
  required: ["code", "name", "location", "capacity"],
  properties: {
    code: { type: "string", minLength: 2, maxLength: 16 },
    name: { type: "string", minLength: 2 },
    location: { type: "string", minLength: 1 },
    address: { type: "string" },
    capacity: { type: "integer", minimum: 1 },
  },
} as const;

export const warehouseRoutes: FastifyPluginAsync = async (app) => {
  /** Alta de almacén. El código debe ser único. */
  app.post("/", { schema: { body: createBodySchema } }, async (request, reply) => {
    const body = request.body as { code: string; name: string; location: string; address?: string; capacity: number };

    try {
      const max = await prisma.warehouse.aggregate({ _max: { position: true } });
      const created = await prisma.warehouse.create({
        data: {
          code: body.code.trim().toUpperCase(),
          name: body.name.trim(),
          location: body.location.trim(),
          address: body.address?.trim() ?? "",
          capacity: body.capacity,
          position: (max._max.position ?? 0) + 1,
        },
      });
      return reply.status(201).send({
        data: {
          id: created.id,
          code: created.code,
          name: created.name,
          location: created.location,
          address: created.address,
          capacity: created.capacity,
        },
      });
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2002") {
        return reply.status(409).send({ error: `El código ${body.code} ya está en uso` });
      }
      throw error;
    }
  });

  /** Almacenes con stock, capacidad y ocupación. */
  app.get("/", async () => {
    const warehouses = await prisma.warehouse.findMany({
      orderBy: { position: "asc" },
      include: {
        responsible: { select: { name: true } },
        locations: { include: { product: { select: { id: true } } } },
      },
    });

    return {
      data: warehouses.map((warehouse) => {
        const stock = warehouse.locations.reduce((acc, l) => acc + l.quantity, 0);
        const reserved = warehouse.locations.reduce((acc, l) => acc + l.reserved, 0);
        const productCount = new Set(warehouse.locations.map((l) => l.productId)).size;
        return {
          id: warehouse.id,
          code: warehouse.code,
          name: warehouse.name,
          location: warehouse.location,
          address: warehouse.address,
          active: warehouse.active,
          stock,
          available: stock - reserved,
          reserved,
          capacity: warehouse.capacity,
          ratio: warehouse.capacity > 0 ? stock / warehouse.capacity : 0,
          productCount,
          owner: warehouse.responsible?.name ?? "—",
        };
      }),
    };
  });

  /** Existencias por ubicación: una fila por producto, una columna por almacén. */
  app.get("/locations", async () => {
    const [warehouses, products] = await Promise.all([
      prisma.warehouse.findMany({ orderBy: { position: "asc" } }),
      prisma.product.findMany({ where: { archived: false }, orderBy: { position: "asc" }, include: { locations: true } }),
    ]);

    return {
      warehouses: warehouses.map((w) => ({ id: w.id, code: w.code, name: w.name })),
      data: products.map((product) => {
        const byWarehouse = Object.fromEntries(product.locations.map((l) => [l.warehouseId, l]));
        return {
          id: product.id,
          sku: product.sku,
          product: product.name,
          status: product.status === "LOW_STOCK" ? "Stock bajo" : "En stock",
          total: product.stock,
          quantities: warehouses.map((w) => byWarehouse[w.id]?.quantity ?? 0),
        };
      }),
    };
  });

  /** Totales de capacidad para la banda de KPIs. */
  app.get("/summary", async () => {
    const warehouses = await prisma.warehouse.findMany({ include: { locations: true } });
    const stock = warehouses.reduce((acc, w) => acc + w.locations.reduce((s, l) => s + l.quantity, 0), 0);
    const capacity = warehouses.reduce((acc, w) => acc + w.capacity, 0);

    return {
      active: warehouses.filter((w) => w.active).length,
      stock,
      capacity,
      occupancy: capacity > 0 ? stock / capacity : 0,
      free: capacity - stock,
    };
  });
};