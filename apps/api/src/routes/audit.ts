import type { FastifyPluginAsync } from "fastify";
import { prisma } from "@chink-saas/db";
import { workspaceIdFor } from "../lib/workspace-scope.js";

const querySchema = {
  type: "object",
  properties: {
    from: { type: "string", format: "date" },
    to: { type: "string", format: "date" },
    search: { type: "string", maxLength: 120 },
    page: { type: "integer", minimum: 1, default: 1 },
    pageSize: { type: "integer", minimum: 1, maximum: 100, default: 50 },
  },
} as const;

function dateStart(value?: string): Date | undefined {
  return value ? new Date(`${value}T00:00:00.000Z`) : undefined;
}

function dateEnd(value?: string): Date | undefined {
  return value ? new Date(`${value}T23:59:59.999Z`) : undefined;
}

export const auditRoutes: FastifyPluginAsync = async (app) => {
  app.get("/products", { preHandler: app.requirePermission("admin"), schema: { querystring: querySchema } }, async (request) => {
    const query = request.query as { from?: string; to?: string; search?: string; page?: number; pageSize?: number };
    const workspaceId = await workspaceIdFor(request);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const search = query.search?.trim();
    const where = {
      workspaceId,
      ...(search
        ? { OR: [{ productName: { contains: search, mode: "insensitive" as const } }, { productSku: { contains: search, mode: "insensitive" as const } }] }
        : {}),
      ...(query.from || query.to ? { createdAt: { gte: dateStart(query.from), lte: dateEnd(query.to) } } : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.productAudit.count({ where }),
      prisma.productAudit.findMany({
        where,
        include: { actor: { select: { name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      data: rows.map((row) => ({
        id: row.id,
        action: row.action,
        productId: row.productId,
        productSku: row.productSku,
        productName: row.productName,
        changes: row.changes,
        actor: row.actor,
        createdAt: row.createdAt.toISOString(),
      })),
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  });
};
