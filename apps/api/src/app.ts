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

export async function buildApp() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
  });

  await app.register(cors, { origin: true, methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"] });
  await registerAuth(app);

  app.get("/api/health", async () => ({ status: "ok" }));

  await app.register(authRoutes, { prefix: "/api/auth" });

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
    },
    { prefix: "/" },
  );

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  return app;
}