import { PrismaClient } from "@prisma/client";

export { PrismaClient };
export { MemberStatus, MovementStatus, MovementType, ProductStatus } from "@prisma/client";
export type {
  Permission,
  Prisma,
  Product,
  ProductStatus as ProductStatusType,
  Role,
  RolePermission,
  StockLocation,
  StockMovement,
  User,
  Warehouse,
  WorkspaceSetting,
} from "@prisma/client";

/**
 * Instancia compartida de Prisma. En desarrollo Fastify la mantiene viva entre
 * recargas de hot-reload para no abrir un pool nuevo en cada reload.
 */
export const prisma = new PrismaClient();