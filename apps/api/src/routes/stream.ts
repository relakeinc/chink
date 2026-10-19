import type { FastifyPluginAsync } from "fastify";
import { subscribeRealtime } from "../lib/realtime-hub.js";

/**
 * Canal de tiempo real (Server-Sent Events). El navegador no puede mandar
 * cabeceras en un EventSource, así que el JWT viaja en `?token=` y se
 * verifica a mano. Emite `change` con `{ channels: [...] }` cuando algo del
 * espacio del usuario cambia: la app recarga sola, sin F5.
 */
export const streamRoutes: FastifyPluginAsync = async (app) => {
  app.get("/stream", async (request, reply) => {
    const token = (request.query as { token?: string } | undefined)?.token;
    if (!token) {
      return reply.status(401).send({ error: "Falta el token" });
    }

    let payload: { id: string; workspaceId?: string };
    try {
      payload = app.jwt.verify(token) as { id: string; workspaceId?: string };
    } catch {
      return reply.status(401).send({ error: "Sesión expirada. Vuelve a iniciar sesión." });
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    // Reintento del navegador si se cae la conexión.
    reply.raw.write(`retry: 10000\n\n`);

    subscribeRealtime(payload.id, payload.workspaceId ?? "", reply.raw);
  });
};
