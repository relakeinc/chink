import type { FastifyPluginAsync } from "fastify";
import { prisma } from "@chink-saas/db";
import { reportEmail, sendEmail } from "../lib/email.js";

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export const reportRoutes: FastifyPluginAsync = async (app) => {
  /** KPIs de la cabecera de Reportes. */
  app.get("/summary", async () => {
    const [totals, groups, latest] = await Promise.all([
      prisma.product.aggregate({ _sum: { stock: true, reserved: true, totalValue: true }, where: { archived: false } }),
      prisma.stockMovement.groupBy({ by: ["type"], _count: true, _sum: { quantity: true } }),
      prisma.stockMovement.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
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
      lowStock: await prisma.product.count({ where: { status: "LOW_STOCK", archived: false } }),
      lowStockUnits: await prisma.product.aggregate({ _sum: { stock: true }, where: { status: "LOW_STOCK", archived: false } }),
      totalProducts: await prisma.product.count({ where: { archived: false } }),
    };
  });

  /** Distribución de unidades por categoría. */
  app.get("/categories", async () => {
    const products = await prisma.product.findMany({ where: { archived: false }, select: { category: true, stock: true } });
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
  app.get("/low-stock", async () => {
    const products = await prisma.product.findMany({
      where: { status: "LOW_STOCK", archived: false },
      orderBy: { position: "asc" },
    });
    return { data: products.map((p) => ({ name: p.name, sku: p.sku, minStock: p.minStock, stock: p.stock })) };
  });

  /** Reportes exportables. */
  app.get("/exports", async (request) => {    const [totals, movements, lowStock, warehouses] = await Promise.all([
      prisma.product.aggregate({ _sum: { stock: true }, where: { archived: false } }),
      prisma.stockMovement.count(),
      prisma.product.count({ where: { status: "LOW_STOCK", archived: false } }),
      prisma.warehouse.count({ where: { active: true } }),
    ]);

    const now = new Date();
    const stamp = `${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()} · ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const productCount = await prisma.product.count({ where: { archived: false } });

    return {
      data: [
        { name: "Inventario actual", scope: "Stock físico, disponible y reservado", cutoff: stamp, content: `${productCount} productos · ${(totals._sum.stock ?? 0).toLocaleString("es-CO")} u.`, format: "CSV / PDF" },
        { name: "Historial de movimientos", scope: "Entradas, salidas, transferencias y ajustes", cutoff: "9–15 oct 2026", content: `${movements} movimientos confirmados`, format: "CSV / PDF" },
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

      const [totals, movements, lowStock, warehouses, productCount] = await Promise.all([
        prisma.product.aggregate({ _sum: { stock: true }, where: { archived: false } }),
        prisma.stockMovement.count(),
        prisma.product.count({ where: { status: "LOW_STOCK", archived: false } }),
        prisma.warehouse.count({ where: { active: true } }),
        prisma.product.count({ where: { archived: false } }),
      ]);
      const space = await prisma.workspaceSetting.findUnique({ where: { id: "default" }, select: { spaceName: true } });

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
      const content = reportEmail({ name, scope: entry.scope, cutoff, content: entry.content, spaceName: space?.spaceName ?? "Chink" });
      try {
        const sent = await sendEmail({ category: "reports", to: email.trim(), subject: content.subject, html: content.html, text: content.text });
        return { data: { id: sent.id, email: email.trim(), name } };
      } catch (error) {
        return reply.status(502).send({ error: error instanceof Error ? error.message : "No se pudo enviar el reporte" });
      }
    },
  );
};