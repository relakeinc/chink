import type { FastifyRequest } from "fastify";
import { prisma } from "@chink-saas/db";

/**
 * Espacio de trabajo de la sesión activa. Cada cuenta ve y toca solo los
 * datos de su espacio: el propio al registrarse o el del equipo que la invitó.
 *
 * Se prefiere el `workspaceId` firmado en el JWT; los tokens antiguos (sin él)
 * se resuelven desde la base de datos. Falla cerrado si el usuario ya no existe.
 */
export async function workspaceIdFor(request: FastifyRequest): Promise<string> {
  const claimed = (request.user as { workspaceId?: string } | undefined)?.workspaceId;
  if (claimed) return claimed;

  const user = await prisma.user.findUnique({ where: { id: request.user.id }, select: { workspaceId: true } });
  if (!user) {
    throw Object.assign(new Error("Sesión no válida. Vuelve a iniciar sesión."), { statusCode: 401 });
  }
  return user.workspaceId;
}
