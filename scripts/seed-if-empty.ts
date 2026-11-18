/** Inicializa el catálogo de roles sin crear cuentas demo ni borrar datos. */
import { prisma } from "@chink-saas/db";

const roles = ["Administradora", "Gestor", "Operador", "Consulta"];
const permissions = [
  { key: "consult", label: "Consultar inventario y movimientos", order: 1, grants: [true, true, true, true] },
  { key: "register", label: "Registrar entradas, salidas y transferencias", order: 2, grants: [true, true, true, false] },
  { key: "adjust", label: "Ajustar stock y gestionar almacenes", order: 3, grants: [true, true, false, false] },
  { key: "report", label: "Consultar y exportar reportes", order: 4, grants: [true, true, false, true] },
  { key: "admin", label: "Gestionar equipo y configuración", order: 5, grants: [true, false, false, false] },
];

async function main(): Promise<void> {
  const roleRows = await Promise.all(roles.map((name) => prisma.role.upsert({
    where: { name }, update: {}, create: { name },
  })));

  for (const entry of permissions) {
    const permission = await prisma.permission.upsert({
      where: { key: entry.key }, update: {}, create: { key: entry.key, label: entry.label, order: entry.order },
    });
    for (const [index, role] of roleRows.entries()) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id, allowed: entry.grants[index] ?? false },
      });
    }
  }
}

main()
  .catch((error: unknown) => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
