import Fastify from "fastify";
import cors from "@fastify/cors";
import { prisma } from "@chink-saas/db";
import { registerAuth } from "./plugins/auth.js";
import { authRoutes } from "./routes/auth.js";
import { inventoryRoutes } from "./routes/inventory.js";
import { teamRoutes } from "./routes/team.js";
import { warehouseRoutes } from "./routes/warehouses.js";
import { movementRoutes } from "./routes/movements.js";
import { reportRoutes } from "./routes/reports.js";
import { settingRoutes } from "./routes/settings.js";
import { notificationRoutes } from "./routes/notifications.js";
import { streamRoutes } from "./routes/stream.js";
import { pagoRoutes } from "./routes/pagos.js";
import { clienteRoutes } from "./routes/clientes.js";
import { telegramRoutes, telegramWebhookRoutes } from "./routes/telegram.js";
import { eventosRoutes } from "./routes/eventos.js";

export async function buildApp() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
  });

  await app.register(cors, { origin: true, methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"] });
  await registerAuth(app);

  app.get("/api/health", async () => ({ status: "ok" }));

  await app.register(authRoutes, { prefix: "/api/auth" });

  // Webhook público de Telegram (verifica secreto, no JWT).
  await app.register(telegramWebhookRoutes, { prefix: "/api/telegram" });

  // Tiempo real por SSE para comprobantes y notificaciones.
  await app.register(eventosRoutes, { prefix: "/api/eventos" });

  // Tiempo real por SSE (el token va en la query: EventSource no manda cabeceras).
  await app.register(streamRoutes, { prefix: "/api" });

  // Todo lo demás exige sesión.
  await app.register(
    async (protectedApp) => {
      protectedApp.addHook("preHandler", async (request, reply) => {
        await protectedApp.authenticate(request, reply);
      });

      await protectedApp.register(inventoryRoutes, { prefix: "/api/inventory" });
      await protectedApp.register(teamRoutes, { prefix: "/api/team" });
      await protectedApp.register(warehouseRoutes, { prefix: "/api/warehouses" });
      await protectedApp.register(movementRoutes, { prefix: "/api/movements" });
      await protectedApp.register(reportRoutes, { prefix: "/api/reports" });
      await protectedApp.register(settingRoutes, { prefix: "/api/settings" });
      await protectedApp.register(notificationRoutes, { prefix: "/api/notifications" });
      await protectedApp.register(pagoRoutes, { prefix: "/api/pagos" });
      await protectedApp.register(clienteRoutes, { prefix: "/api/clientes" });
      await protectedApp.register(telegramRoutes, { prefix: "/api/telegram" });
    },
    { prefix: "/" },
  );

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  return app;
}