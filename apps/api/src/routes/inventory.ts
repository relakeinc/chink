import type { FastifyInstance, FastifyPluginAsync, FastifyReply } from "fastify";
import { prisma } from "@chink-saas/db";
import type { Prisma, ProductStatus } from "@chink-saas/db";
import {
  assertProductImageKey,
  assertProductImageUpload,
  createProductImageUploadUrl,
  deleteR2Object,
  getR2Config,
  publicUrlFor,
} from "../lib/r2.js";
import { workspaceIdFor } from "../lib/workspace-scope.js";
import { publishToWorkspace } from "../lib/realtime-hub.js";

/** Vistas disponibles en las pestañas del catálogo. */
const VIEWS = ["all", "low", "archived"] as const;
type InventoryView = (typeof VIEWS)[number];

const SORTS = ["default", "stock_asc", "stock_desc", "name_asc", "name_desc"] as const;
type InventorySort = (typeof SORTS)[number];

interface ListQuery {
  search?: string;
  category?: string;
  warehouse?: string;
  status?: ProductStatus;
  view?: InventoryView;
  sort?: InventorySort;
  page?: number;
  pageSize?: number;
}

interface ProductDto {
  id: string;
  sku: string;
  name: string;
  category: string;
  stock: number;
  reserved: number;
  available: number;
  unitCost: number;
  totalValue: number;
  status: ProductStatus;
  icon: string;
  imageKey: string | null;
  imageUrl: string | null;
  minStock: number;
  /** Almacén con mayor existencia del producto. */
  warehouse: string | null;
}

type ProductWithLocations = Prisma.ProductGetPayload<{ include: { locations: { include: { warehouse: true } } } }>;

function toProductDto(product: ProductWithLocations): ProductDto {
  const main = [...product.locations].sort((a, b) => b.quantity - a.quantity)[0];
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    category: product.category,
    stock: product.stock,
    reserved: product.reserved,
    available: Math.max(product.stock - product.reserved, 0),
    unitCost: Number(product.unitCost),
    totalValue: Number(product.totalValue),
    status: product.status,
    icon: product.icon,
    imageKey: product.imageKey,
    imageUrl: product.imageUrl,
    minStock: product.minStock,
    warehouse: main && main.quantity > 0 ? main.warehouse.name : null,
  };
}

const listQuerySchema = {
  type: "object",
  properties: {
    search: { type: "string", minLength: 0 },
    category: { type: "string" },
    warehouse: { type: "string" },
    status: { type: "string", enum: ["IN_STOCK", "LOW_STOCK"] },
    view: { type: "string", enum: [...VIEWS], default: "all" },
    sort: { type: "string", enum: [...SORTS], default: "default" },
    page: { type: "integer", minimum: 1, default: 1 },
    pageSize: { type: "integer", minimum: 1, maximum: 100, default: 25 },
  },
} as const;

const productBodySchema = {
  type: "object",
  required: ["sku", "name", "category", "stock", "unitCost"],
  properties: {
    sku: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
    category: { type: "string", minLength: 1 },
    stock: { type: "integer", minimum: 0 },
    reserved: { type: "integer", minimum: 0, default: 0 },
    unitCost: { type: "number", minimum: 0 },
    minStock: { type: "integer", minimum: 0, default: 0 },
    status: { type: "string", enum: ["IN_STOCK", "LOW_STOCK"] },
    icon: { type: "string", default: "package" },
    warehouseId: { type: "string", nullable: true },
  },
} as const;

const productPatchSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string", minLength: 1 },
    category: { type: "string", minLength: 1 },
    reserved: { type: "integer", minimum: 0 },
    unitCost: { type: "number", minimum: 0 },
    minStock: { type: "integer", minimum: 0 },
    status: { type: "string", enum: ["IN_STOCK", "LOW_STOCK"] },
    archived: { type: "boolean" },
    icon: { type: "string" },
    imageKey: { type: "string", nullable: true },
  },
} as const;

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2002";
}

function sendR2Error(reply: FastifyReply, error: unknown) {
  const message = error instanceof Error ? error.message : "No se pudo usar el almacenamiento de imágenes";
  if (/Falta la variable|R2_PUBLIC_BASE_URL/.test(message)) {
    return reply.status(503).send({ error: "Almacenamiento R2 sin configurar. Define R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY y R2_PUBLIC_BASE_URL." });
  }
  return reply.status(400).send({ error: message });
}

function buildWhere(query: ListQuery, workspaceId: string): Prisma.ProductWhereInput {
  const view = query.view ?? "all";
  const where: Prisma.ProductWhereInput = { workspaceId };

  if (view === "archived") {
    where.archived = true;
  } else {
    where.archived = false;
    if (view === "low") where.status = "LOW_STOCK";
  }

  if (query.status) where.status = query.status;

  const search = query.search?.trim();
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { sku: { contains: search, mode: "insensitive" } },
    ];
  }

  if (query.category) where.category = query.category;
  if (query.warehouse) where.locations = { some: { warehouse: { code: query.warehouse, workspaceId } } };

  return where;
}

function buildOrderBy(sort: InventorySort): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case "stock_asc":
      return [{ stock: "asc" }, { position: "asc" }];
    case "stock_desc":
      return [{ stock: "desc" }, { position: "asc" }];
    case "name_asc":
      return [{ name: "asc" }];
    case "name_desc":
      return [{ name: "desc" }];
    default:
      return [{ position: "asc" }];
  }
}

const LOCATIONS = {
  locations: { include: { warehouse: true } },
} satisfies Prisma.ProductInclude;

export const inventoryRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  /** KPI de la cabecera + contadores de las pestañas. */
  app.get("/summary", async (request) => {
    const ws = await workspaceIdFor(request);
    const [totals, lowStock, inStock, archived, categories, warehouses] = await Promise.all([
      prisma.product.aggregate({
        _sum: { stock: true, reserved: true, totalValue: true },
        where: { archived: false, workspaceId: ws },
      }),
      prisma.product.count({ where: { status: "LOW_STOCK", archived: false, workspaceId: ws } }),
      prisma.product.count({ where: { status: "IN_STOCK", archived: false, workspaceId: ws } }),
      prisma.product.count({ where: { archived: true, workspaceId: ws } }),
      prisma.product.findMany({
        distinct: ["category"],
        where: { workspaceId: ws },
        select: { category: true },
        orderBy: { category: "asc" },
      }),
      prisma.warehouse.findMany({ where: { workspaceId: ws }, select: { id: true, name: true, code: true }, orderBy: { position: "asc" } }),
    ]);

    const totalStock = totals._sum.stock ?? 0;
    const reserved = totals._sum.reserved ?? 0;

    return {
      totalStock,
      available: Math.max(totalStock - reserved, 0),
      reserved,
      totalValue: Number(totals._sum.totalValue ?? 0),
      counts: { all: inStock + lowStock, lowStock, archived },
      categories: categories.map((c) => c.category),
      warehouses,
    };
  });

  /** Listado paginado y filtrado del catálogo. */
  app.get("/products", { schema: { querystring: listQuerySchema } }, async (request) => {
    const query = request.query as ListQuery;
    const ws = await workspaceIdFor(request);
    const where = buildWhere(query, ws);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;

    const [total, rows] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        orderBy: buildOrderBy(query.sort ?? "default"),
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: LOCATIONS,
      }),
    ]);

    return {
      data: rows.map(toProductDto),
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.max(Math.ceil(total / pageSize), 1),
      },
    };
  });

  app.get<{ Params: { id: string } }>("/products/:id", async (request, reply) => {
    const ws = await workspaceIdFor(request);
    const product = await prisma.product.findFirst({ where: { id: request.params.id, workspaceId: ws }, include: LOCATIONS });
    if (!product) return reply.status(404).send({ error: "Producto no encontrado" });
    return { data: toProductDto(product) };
  });

  /**
   * Estado del almacenamiento de imágenes. No expone secretos: solo indica si
   * está configurado y con qué bucket y URL pública trabaja.
   */
  app.get("/product-images/status", async () => {
    try {
      const config = getR2Config();
      return { data: { configured: true, bucket: config.bucket, publicBaseUrl: config.publicBaseUrl } };
    } catch {
      return { data: { configured: false, bucket: null, publicBaseUrl: null } };
    }
  });
  /**
   * URLs firmadas para subir fotos directamente a R2. La API no recibe los
   * bytes: firma una URL PUT por producto, el navegador sube el archivo y
   * después confirma la clave con PATCH. Así el bucket guarda el original.
   */
  app.post("/product-images/upload-urls", { preHandler: app.requirePermission("adjust") }, async (request, reply) => {
    const body = (request.body ?? {}) as { productIds?: string[]; contentType?: string; size?: number };
    if (!Array.isArray(body.productIds) || body.productIds.length === 0 || body.productIds.length > 50) {
      return reply.status(400).send({ error: "Selecciona entre 1 y 50 productos." });
    }

    try {
      assertProductImageUpload(body.contentType, body.size);
      const ws = await workspaceIdFor(request);
      const existing = await prisma.product.findMany({ where: { id: { in: body.productIds }, workspaceId: ws }, select: { id: true } });
      if (existing.length !== body.productIds.length) {
        return reply.status(404).send({ error: "Uno o varios productos no existen." });
      }

      const items = [];
      for (const productId of body.productIds) {
        items.push(await createProductImageUploadUrl(productId, body.contentType as string, body.size as number));
      }
      return { data: items };
    } catch (error) {
      return sendR2Error(reply, error);
    }
  });

  /** Alta de producto. Calcula valor total y estado, y abre la existencia en el almacén. */
  app.post("/products", { preHandler: app.requirePermission("register"), schema: { body: productBodySchema } }, async (request, reply) => {
    const body = request.body as {
      sku: string;
      name: string;
      category: string;
      stock: number;
      reserved?: number;
      unitCost: number;
      minStock?: number;
      status?: ProductStatus;
      icon?: string;
      warehouseId?: string | null;
    };

    const reserved = body.reserved ?? 0;
    const minStock = body.minStock ?? 0;
    const totalValue = Number((body.stock * body.unitCost).toFixed(2));
    const status = body.status ?? (minStock > 0 && body.stock <= minStock ? "LOW_STOCK" : "IN_STOCK");

    const ws = await workspaceIdFor(request);

    let warehouseId: string | null = null;
    if (body.warehouseId) {
      const target = await prisma.warehouse.findFirst({ where: { id: body.warehouseId, workspaceId: ws }, select: { id: true } });
      if (!target) return reply.status(400).send({ error: "Almacén no válido" });
      warehouseId = target.id;
    } else {
      const prefs = await prisma.workspaceSetting.findUnique({ where: { id: ws }, select: { defaultWarehouseId: true } });
      warehouseId = prefs?.defaultWarehouseId ?? null;
    }

    const maxPosition = await prisma.product.aggregate({ _max: { position: true }, where: { workspaceId: ws } });

    try {
      const created = await prisma.product.create({
        data: {
          sku: body.sku,
          name: body.name,
          category: body.category,
          stock: body.stock,
          reserved,
          unitCost: body.unitCost,
          totalValue,
          minStock,
          status,
          icon: body.icon ?? "package",
          position: (maxPosition._max.position ?? 0) + 1,
          workspaceId: ws,
          ...(warehouseId ? { locations: { create: { warehouseId, quantity: body.stock, reserved } } } : {}),
        },
        include: LOCATIONS,
      });

      await publishToWorkspace(ws, { channels: ["inventory"] });
      return reply.status(201).send({ data: toProductDto(created) });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return reply.status(409).send({ error: `El SKU ${body.sku} ya existe` });
      }
      throw error;
    }
  });

  /** Cambio masivo de fotos ya subidas a R2. Actualiza la BD en transacción y luego borra las anteriores. */
  app.patch("/products/images", { preHandler: app.requirePermission("adjust") }, async (request, reply) => {
    const body = (request.body ?? {}) as { items?: { id?: string; imageKey?: string | null }[] };
    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 50) {
      return reply.status(400).send({ error: "Envía entre 1 y 50 productos." });
    }

    try {
      const config = getR2Config();
      const ids = body.items.map((item) => item?.id).filter((id): id is string => typeof id === "string");
      if (ids.length !== body.items.length) return reply.status(400).send({ error: "Cada imagen debe incluir el id del producto." });
      const ws = await workspaceIdFor(request);
      const existing = await prisma.product.findMany({ where: { id: { in: ids }, workspaceId: ws } });
      if (existing.length !== ids.length) return reply.status(404).send({ error: "Uno o varios productos no existen." });
      const previous = new Map(existing.map((product) => [product.id, product.imageKey]));

      const updates = body.items.map((item) => {
        const id = item.id as string;
        if (item.imageKey === null) return { id, imageKey: null, imageUrl: null };
        assertProductImageKey(id, item.imageKey);
        return { id, imageKey: item.imageKey as string, imageUrl: publicUrlFor(config, item.imageKey as string) };
      });

      const updated = await prisma.$transaction(
        updates.map((item) =>
          prisma.product.update({ where: { id: item.id }, data: { imageKey: item.imageKey, imageUrl: item.imageUrl }, include: LOCATIONS }),
        ),
      );

      for (const item of updates) {
        const oldKey = previous.get(item.id);
        if (oldKey && oldKey !== item.imageKey) {
          try {
            await deleteR2Object(oldKey);
          } catch (error) {
            request.log.warn({ oldKey, error }, "No se pudo borrar la imagen anterior en R2");
          }
        }
      }

      await publishToWorkspace(ws, { channels: ["inventory"] });
      return { data: updated.map(toProductDto) };
    } catch (error) {
      return sendR2Error(reply, error);
    }
  });

  app.patch<{ Params: { id: string } }>("/products/:id", { preHandler: app.requirePermission("adjust"), schema: { body: productPatchSchema } }, async (request, reply) => {
    const ws = await workspaceIdFor(request);
    const existing = await prisma.product.findFirst({ where: { id: request.params.id, workspaceId: ws } });
    if (!existing) return reply.status(404).send({ error: "Producto no encontrado" });

    const body = (request.body ?? {}) as Partial<{
      name: string;
      category: string;
      reserved: number;
      unitCost: number;
      minStock: number;
      status: ProductStatus;
      archived: boolean;
      icon: string;
      imageKey: string | null;
    }>;

    const reserved = body.reserved ?? existing.reserved;
    const unitCost = body.unitCost ?? Number(existing.unitCost);
    const minStock = body.minStock ?? existing.minStock;
    const status = body.status ?? (minStock > 0 && existing.stock <= minStock ? "LOW_STOCK" : "IN_STOCK");

    let imageKey = existing.imageKey;
    let imageUrl = existing.imageUrl;
    if (body.imageKey !== undefined) {
      if (body.imageKey === null) {
        imageKey = null;
        imageUrl = null;
      } else {
        try {
          assertProductImageKey(request.params.id, body.imageKey);
          imageKey = body.imageKey;
          imageUrl = publicUrlFor(getR2Config(), body.imageKey);
        } catch (error) {
          return sendR2Error(reply, error);
        }
      }
    }

    const updated = await prisma.product.update({
      where: { id: request.params.id },
      data: {
        name: body.name,
        category: body.category,
        reserved,
        unitCost,
        minStock,
        totalValue: Number((existing.stock * unitCost).toFixed(2)),
        status,
        icon: body.icon,
        archived: body.archived,
        imageKey,
        imageUrl,
      },
      include: LOCATIONS,
    });

    if (existing.imageKey && existing.imageKey !== imageKey) {
      try {
        await deleteR2Object(existing.imageKey);
      } catch (error) {
        request.log.warn({ oldKey: existing.imageKey }, "No se pudo borrar la imagen anterior en R2");
      }
    }

    await publishToWorkspace(ws, { channels: ["inventory"] });
    return { data: toProductDto(updated) };
  });
};
