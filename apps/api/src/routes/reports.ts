import type { FastifyPluginAsync } from "fastify";
import { prisma } from "@chink-saas/db";
import { emailAssets, reportEmail, sendEmail } from "../lib/email.js";
import { buildReportPdf } from "../lib/report-pdf.js";
import { workspaceIdFor } from "../lib/workspace-scope.js";

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function periodDate(value: string | undefined, fallback: Date): Date {
  return value ? new Date(`${value}T00:00:00.000Z`) : fallback;
}

export const reportRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.requirePermission("report"));

  /** KPIs de la cabecera de Reportes. */
  app.get("/summary", async (request) => {
    const ws = await workspaceIdFor(request);
    const [totals, groups, latest] = await Promise.all([
      prisma.product.aggregate({ _sum: { stock: true, reserved: true, totalValue: true }, where: { archived: false, workspaceId: ws } }),
      prisma.stockMovement.groupBy({ by: ["type"], _count: true, _sum: { quantity: true }, where: { workspaceId: ws } }),
      prisma.stockMovement.findFirst({ where: { workspaceId: ws }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    ]);

    const sum = (type: "ENTRY" | "EXIT" | "ADJUSTMENT") =>
      Math.abs(groups.find((g) => g.type === type)?._sum.quantity ?? 0);

    const entries = sum("ENTRY");
    const exits = sum("EXIT");
    const adjustments = sum("ADJUSTMENT");
    const net = entries - exits + adjustments;
    const closing = totals._sum.stock ?? 0;
    const opening = closing - net;

    return {
      closing,
      cutoff: latest?.createdAt.toISOString() ?? null,
      entries,
      exits,
      net,
      netPercent: opening > 0 ? (net / opening) * 100 : 0,
      opening,
      adjustments,
      lowStock: await prisma.product.count({ where: { status: "LOW_STOCK", archived: false, workspaceId: ws } }),
      lowStockUnits: await prisma.product.aggregate({ _sum: { stock: true }, where: { status: "LOW_STOCK", archived: false, workspaceId: ws } }),
      totalProducts: await prisma.product.count({ where: { archived: false, workspaceId: ws } }),
      totalMovements: groups.reduce((total, group) => total + group._count, 0),
    };
  });

  /** Distribución de unidades por categoría. */
  app.get("/categories", async (request) => {
    const ws = await workspaceIdFor(request);
    const products = await prisma.product.findMany({ where: { archived: false, workspaceId: ws }, select: { category: true, stock: true } });
    const total = products.reduce((acc, p) => acc + p.stock, 0);

    const map = new Map<string, { units: number; products: number }>();
    for (const product of products) {
      const entry = map.get(product.category) ?? { units: 0, products: 0 };
      entry.units += product.stock;
      entry.products += 1;
      map.set(product.category, entry);
    }

    const bars: Record<string, string> = { Embalaje: "bg-ink", Consumibles: "bg-muted-2", Equipamiento: "bg-accent" };

    return {
      total,
      data: [...map.entries()]
        .map(([category, value]) => ({
          name: category,
          units: value.units,
          products: value.products,
          percent: total > 0 ? (value.units / total) * 100 : 0,
          bar: bars[category] ?? "bg-ink",
        }))
        .sort((a, b) => b.units - a.units),
    };
  });

  /** Referencias por debajo del mínimo. */
  app.get("/low-stock", async (request) => {
    const ws = await workspaceIdFor(request);
    const products = await prisma.product.findMany({
      where: { status: "LOW_STOCK", archived: false, workspaceId: ws },
      orderBy: { position: "asc" },
    });
    return { data: products.map((p) => ({ name: p.name, sku: p.sku, minStock: p.minStock, stock: p.stock, imageUrl: p.imageUrl })) };
  });

  /** Productos más y menos vendidos a partir de las salidas del período. */
  app.get("/rotation", async (request) => {
    const query = request.query as { from?: string; to?: string };
    const ws = await workspaceIdFor(request);
    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);
    const from = periodDate(query.from, defaultFrom);
    const to = query.to ? new Date(`${query.to}T23:59:59.999Z`) : now;
    const days = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86_400_000));
    const [products, exits] = await Promise.all([
      prisma.product.findMany({ where: { workspaceId: ws, archived: false }, select: { id: true, sku: true, name: true, category: true, stock: true } }),
      prisma.stockMovement.findMany({ where: { workspaceId: ws, type: "EXIT", createdAt: { gte: from, lte: to } }, select: { productId: true, quantity: true } }),
    ]);
    const totals = new Map<string, { units: number; movements: number }>();
    for (const exit of exits) {
      const current = totals.get(exit.productId) ?? { units: 0, movements: 0 };
      current.units += Math.abs(exit.quantity);
      current.movements += 1;
      totals.set(exit.productId, current);
    }
    const rows = products.map((product) => ({
      productId: product.id,
      sku: product.sku,
      name: product.name,
      category: product.category,
      stock: product.stock,
      units: totals.get(product.id)?.units ?? 0,
      movements: totals.get(product.id)?.movements ?? 0,
    }));
    const sortMost = (a: (typeof rows)[number], b: (typeof rows)[number]) => b.units - a.units || a.name.localeCompare(b.name);
    const sortLeast = (a: (typeof rows)[number], b: (typeof rows)[number]) => a.units - b.units || a.name.localeCompare(b.name);
    return { period: { from: from.toISOString(), to: to.toISOString(), days }, top: rows.toSorted(sortMost).slice(0, 10), slow: rows.toSorted(sortLeast).slice(0, 10) };
  });

  /** Alerta preventiva: productos que llegarán al mínimo pronto según sus salidas. */
  app.get("/sales-rate", async (request) => {
    const query = request.query as { from?: string; to?: string; warningDays?: string };
    const ws = await workspaceIdFor(request);
    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);
    const from = periodDate(query.from, defaultFrom);
    const to = query.to ? new Date(`${query.to}T23:59:59.999Z`) : now;
    const warningDays = Math.min(90, Math.max(1, Number(query.warningDays ?? 7) || 7));
    const days = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86_400_000));
    const [products, exits] = await Promise.all([
      prisma.product.findMany({ where: { workspaceId: ws, archived: false }, select: { id: true, sku: true, name: true, stock: true, minStock: true } }),
      prisma.stockMovement.findMany({ where: { workspaceId: ws, type: "EXIT", createdAt: { gte: from, lte: to } }, select: { productId: true, quantity: true } }),
    ]);
    const sold = new Map<string, number>();
    for (const exit of exits) sold.set(exit.productId, (sold.get(exit.productId) ?? 0) + Math.abs(exit.quantity));
    const alerts = products
      .map((product) => {
        const unitsSold = sold.get(product.id) ?? 0;
        const averageDaily = unitsSold / days;
        const unitsUntilMinimum = Math.max(product.stock - product.minStock, 0);
        const daysToMinimum = averageDaily > 0 ? unitsUntilMinimum / averageDaily : null;
        return { productId: product.id, sku: product.sku, name: product.name, stock: product.stock, minStock: product.minStock, unitsSold, averageDaily, daysToMinimum };
      })
      .filter((row) => row.averageDaily > 0 && (row.stock <= row.minStock || (row.daysToMinimum !== null && row.daysToMinimum <= warningDays)))
      .sort((a, b) => (a.daysToMinimum ?? 0) - (b.daysToMinimum ?? 0));
    return { period: { from: from.toISOString(), to: to.toISOString(), days }, warningDays, data: alerts };
  });

  /** Reportes exportables. */
  app.get("/exports", async (request) => {
    const ws = await workspaceIdFor(request);
    const [totals, movements, lowStock, warehouses] = await Promise.all([
      prisma.product.aggregate({ _sum: { stock: true }, where: { archived: false, workspaceId: ws } }),
      prisma.stockMovement.count({ where: { workspaceId: ws } }),
      prisma.product.count({ where: { status: "LOW_STOCK", archived: false, workspaceId: ws } }),
      prisma.warehouse.count({ where: { active: true, workspaceId: ws } }),
    ]);

    const now = new Date();
    const stamp = `${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()} · ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const productCount = await prisma.product.count({ where: { archived: false, workspaceId: ws } });

    return {
      data: [
        { name: "Inventario actual", scope: "Stock físico, disponible y reservado", cutoff: stamp, content: `${productCount} productos · ${(totals._sum.stock ?? 0).toLocaleString("es-CO")} u.`, format: "CSV / PDF" },
        { name: "Historial de movimientos", scope: "Entradas, salidas, transferencias y ajustes", cutoff: stamp, content: `${movements} movimientos confirmados`, format: "CSV / PDF" },
        { name: "Productos con stock bajo", scope: "Existencias frente al mínimo por producto", cutoff: stamp, content: `${lowStock} productos en alerta`, format: "CSV / PDF" },
        { name: "Existencias por almacén", scope: "Distribución y ocupación de ubicaciones", cutoff: stamp, content: `${warehouses} almacenes activos`, format: "CSV / PDF" },
      ],
    };
  });

  /**
   * Envía un reporte exportable por correo. Regenera el contenido en el
   * servidor para que lo recibido coincida con lo descargable.
   */
  app.post(
    "/email",
    {
      schema: {
        body: {
          type: "object",
          required: ["name", "email"],
          properties: {
            name: { type: "string", minLength: 1 },
            email: { type: "string", minLength: 3 },
          },
        },
      },
    },
    async (request, reply) => {
      const { name, email } = request.body as { name: string; email: string };
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
        return reply.status(400).send({ error: "El correo no parece válido" });
      }

      const ws = await workspaceIdFor(request);
      const [totals, movements, lowStock, warehouses, productCount] = await Promise.all([
        prisma.product.aggregate({ _sum: { stock: true }, where: { archived: false, workspaceId: ws } }),
        prisma.stockMovement.count({ where: { workspaceId: ws } }),
        prisma.product.count({ where: { status: "LOW_STOCK", archived: false, workspaceId: ws } }),
        prisma.warehouse.count({ where: { active: true, workspaceId: ws } }),
        prisma.product.count({ where: { archived: false, workspaceId: ws } }),
      ]);
      const space = await prisma.workspaceSetting.findUnique({ where: { id: ws }, select: { spaceName: true, spaceMark: true } });

      const catalog: Record<string, { scope: string; content: string }> = {
        "Inventario actual": {
          scope: "Stock físico, disponible y reservado",
          content: `${productCount} productos · ${(totals._sum.stock ?? 0).toLocaleString("es-CO")} u.`,
        },
        "Historial de movimientos": { scope: "Entradas, salidas, transferencias y ajustes", content: `${movements} movimientos confirmados` },
        "Productos con stock bajo": { scope: "Existencias frente al mínimo por producto", content: `${lowStock} productos en alerta` },
        "Existencias por almacén": { scope: "Distribución y ocupación de ubicaciones", content: `${warehouses} almacenes activos` },
      };

      const entry = catalog[name];
      if (!entry) return reply.status(404).send({ error: "Reporte no encontrado" });

      const now = new Date();
      const cutoff = `${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()} · ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const spaceName = space?.spaceName ?? "Chink";
      const detail = await buildReportDetail(name, ws);
      const pdf = await buildReportPdf({
        title: name,
        spaceName,
        scope: entry.scope,
        cutoff,
        summary: [entry.content],
        headers: detail.headers,
        widths: detail.widths,
        rows: detail.rows,
      });
      const filename = `${name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.pdf`;
      const content = reportEmail({ name, scope: entry.scope, cutoff, content: `${entry.content} (detalle en el PDF adjunto)`, spaceName, mark: space?.spaceMark ?? "workspace-mark" });
      try {
        const sent = await sendEmail({
          category: "reports",
          to: email.trim(),
          subject: content.subject,
          html: content.html,
          text: content.text,
          attachments: [...emailAssets(space?.spaceMark).attachments, { filename, content: pdf, contentType: "application/pdf" }],
        });
        return { data: { id: sent.id, email: email.trim(), name } };
      } catch (error) {
        return reply.status(502).send({ error: error instanceof Error ? error.message : "No se pudo enviar el reporte" });
      }
    },
  );
};

/**
 * Filas de detalle por reporte (qué, cuándo, dónde): lo que el correo resume,
 * el PDF lo lista.
 */
async function buildReportDetail(name: string, workspaceId: string): Promise<{ headers: string[]; widths: number[]; rows: string[][] }> {
  const fmtInt = (value: number) => value.toLocaleString("es-CO");
  const fmtMoney = (value: number) => `$${value.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (name === "Historial de movimientos") {
    const rows = await prisma.stockMovement.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { product: { select: { name: true, sku: true } }, origin: { select: { name: true } }, destination: { select: { name: true } }, owner: { select: { name: true } } },
    });
    const typeLabel = (type: string) => ({ ENTRY: "Entrada", EXIT: "Salida", TRANSFER: "Transferencia", ADJUSTMENT: "Ajuste" })[type] ?? type;
    const dateOf = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return {
      headers: ["Ref", "Fecha", "Tipo", "Producto", "Cant.", "Origen → Destino", "Responsable"],
      widths: [62, 78, 72, 110, 40, 130, 90],
      rows: rows.map((m) => [
        m.ref,
        dateOf(m.createdAt),
        typeLabel(m.type),
        `${m.product.name} (${m.product.sku})`,
        String(m.quantity),
        m.origin && m.destination ? `${m.origin.name} → ${m.destination.name}` : (m.destination?.name ?? m.origin?.name ?? "—"),
        m.owner.name,
      ]),
    };
  }

  if (name === "Productos con stock bajo") {
    const rows = await prisma.product.findMany({ where: { status: "LOW_STOCK", archived: false, workspaceId }, orderBy: { position: "asc" } });
    return {
      headers: ["Producto", "SKU", "Mínimo", "Stock", "Faltante"],
      widths: [170, 90, 70, 70, 70],
      rows: rows.map((p) => [p.name, p.sku, fmtInt(p.minStock), fmtInt(p.stock), fmtInt(Math.max(p.minStock - p.stock, 0))]),
    };
  }

  if (name === "Existencias por almacén") {
    const rows = await prisma.warehouse.findMany({ where: { workspaceId }, orderBy: { position: "asc" }, include: { locations: true } });
    return {
      headers: ["Código", "Almacén", "Unidades", "Productos", "Ocupación"],
      widths: [70, 150, 70, 70, 80],
      rows: rows.map((w) => {
        const units = w.locations.reduce((acc, l) => acc + l.quantity, 0);
        const products = w.locations.filter((l) => l.quantity > 0).length;
        const occupancy = w.capacity > 0 ? `${((units / w.capacity) * 100).toFixed(1)} %` : "—";
        return [w.code, w.name, fmtInt(units), fmtInt(products), occupancy];
      }),
    };
  }

  // "Inventario actual" (y cualquier otro): catálogo completo.
  const rows = await prisma.product.findMany({
    where: { archived: false, workspaceId },
    orderBy: { position: "asc" },
    include: { locations: { include: { warehouse: true } } },
  });
  return {
    headers: ["SKU", "Producto", "Categoría", "Stock", "Reservado", "Coste/ud"],
    widths: [80, 150, 90, 55, 60, 65],
    rows: rows.map((p) => [p.sku, p.name, p.category, fmtInt(p.stock), fmtInt(p.reserved), fmtMoney(Number(p.unitCost))]),
  };
}
