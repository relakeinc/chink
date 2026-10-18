import type { FastifyPluginAsync } from "fastify";
import { prisma } from "@chink-saas/db";

const body = {
  type: "object",
  properties: {
    spaceName: { type: "string" },
    spaceColor: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" },
    spaceMark: { type: "string", pattern: "^[a-z0-9-]+$" },
    theme: { type: "string", enum: ["light", "halloween", "auto"] },
    legalName: { type: "string" },
    contactEmail: { type: "string" },
    taxId: { type: "string" },
    language: { type: "string" },
    currency: { type: "string" },
    timezone: { type: "string" },
    dateFormat: { type: "string" },
    unit: { type: "string" },
    defaultWarehouseId: { type: "string", nullable: true },
    movementPrefix: { type: "string" },
    defaultMinStock: { type: "integer" },
    allowNegativeStock: { type: "boolean" },
    requireAdjustmentReason: { type: "boolean" },
    lowStockAlerts: { type: "boolean" },
    reserveBeforePicking: { type: "boolean" },
    notifyLowStock: { type: "boolean" },
    notifyMovements: { type: "boolean" },
    notifyWeeklyReport: { type: "boolean" },
  },
} as const;

const options = {
  language: ["Español (España)", "Español (Colombia)", "English (UK)"],
  currency: ["Peso colombiano · COP ($)"],
  timezone: ["America / Bogota (UTC-05:00)", "Europa / Madrid (UTC+02:00)"],
  dateFormat: ["DD/MM/AAAA", "AAAA-MM-DD"],
  unit: ["Unidad (u.)", "Caja (c.)", "Palé (p.)"],
};

/** Galería de iconos del espacio (debe coincidir con assets/icons + lib/workspace). */
const WORKSPACE_MARKS = [
  { id: "workspace-mark", color: "#2F6DF6" },
  { id: "workspace-violet", color: "#7C5CFC" },
  { id: "workspace-teal", color: "#0E9F8A" },
  { id: "workspace-moss", color: "#41483A" },
  { id: "workspace-ember", color: "#C87A2A" },
  { id: "workspace-sky", color: "#1E88E5" },
  { id: "workspace-rose", color: "#E05575" },
  { id: "workspace-bronze", color: "#B7791F" },
];

export const settingRoutes: FastifyPluginAsync = async (app) => {
  /** Preferencias del espacio de trabajo. */
  app.get("/", async () => {
    const [settings, warehouses] = await Promise.all([
      prisma.workspaceSetting.findUnique({ where: { id: "default" }, include: { updatedBy: { select: { name: true } } } }),
      prisma.warehouse.findMany({ orderBy: { position: "asc" } }),
    ]);

    if (!settings) return { data: null, options, warehouses: [] };

    return {
      data: {
        spaceName: settings.spaceName,
        spaceColor: settings.spaceColor,
        spaceMark: settings.spaceMark,
        theme: settings.theme,
        legalName: settings.legalName,
        contactEmail: settings.contactEmail,
        taxId: settings.taxId,
        language: settings.language,
        currency: settings.currency,
        timezone: settings.timezone,
        dateFormat: settings.dateFormat,
        unit: settings.unit,
        defaultWarehouseId: settings.defaultWarehouseId,
        defaultWarehouseLabel: warehouses.find((w) => w.id === settings.defaultWarehouseId)
          ? `${warehouses.find((w) => w.id === settings.defaultWarehouseId)!.name} · ${warehouses.find((w) => w.id === settings.defaultWarehouseId)!.code}`
          : null,
        movementPrefix: settings.movementPrefix,
        defaultMinStock: settings.defaultMinStock,
        allowNegativeStock: settings.allowNegativeStock,
        requireAdjustmentReason: settings.requireAdjustmentReason,
        lowStockAlerts: settings.lowStockAlerts,
        reserveBeforePicking: settings.reserveBeforePicking,
        notifyLowStock: settings.notifyLowStock,
        notifyMovements: settings.notifyMovements,
        notifyWeeklyReport: settings.notifyWeeklyReport,
        updatedAt: settings.updatedAt,
        updatedBy: settings.updatedBy?.name ?? null,
      },
      options,
      warehouses: warehouses.map((w) => ({ value: w.id, label: `${w.name} · ${w.code}` })),
    };
  });

  app.patch("/", { schema: { body } }, async (request, reply) => {
    const current = await prisma.workspaceSetting.findUnique({ where: { id: "default" } });
    if (!current) return reply.status(404).send({ error: "Preferencias no inicializadas" });

    const data = request.body as Record<string, unknown>;

    // Solo se aceptan iconos de la galería del espacio.
    if (typeof data.spaceMark === "string" && !WORKSPACE_MARKS.some((mark) => mark.id === data.spaceMark)) {
      return reply.status(400).send({ error: "Icono de espacio no válido" });
    }

    const allowed = Object.keys(body.properties) as (keyof typeof body.properties)[];

    const update: Record<string, unknown> = { updatedById: request.user.id };
    for (const key of allowed) {
      if (data[key] !== undefined) update[key] = data[key];
    }

    const settings = await prisma.workspaceSetting.update({ where: { id: "default" }, data: update });

    return {
      data: {
        ...settings,
        updatedAt: settings.updatedAt,
      },
    };
  });
};