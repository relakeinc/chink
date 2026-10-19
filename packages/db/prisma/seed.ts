/*
 * Datos de ejemplo del diseño de Figma, coherentes entre pantallas:
 *  - Σ existencias por producto = stock del catálogo
 *  - Σ existencias por almacén  = 1.630 / 620 / 236  (total 2.486)
 *  - Σ reservado por producto y por almacén         = 126
 *  - totalValue = stock * unitCost                   = 50.310,20 COP
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PASSWORD = "chink2026";

/** Galería de iconos del espacio (debe coincidir con assets/icons + API + lib/workspace). */
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

const ROLES = [
  { name: "Administradora" },
  { name: "Gestor" },
  { name: "Operador" },
  { name: "Consulta" },
];

const PERMISSIONS = [
  { key: "consult", label: "Consultar inventario y movimientos", order: 1 },
  { key: "register", label: "Registrar entradas, salidas y transferencias", order: 2 },
  { key: "adjust", label: "Ajustar stock y gestionar almacenes", order: 3 },
  { key: "report", label: "Consultar y exportar reportes", order: 4 },
  { key: "admin", label: "Gestionar equipo y configuración", order: 5 },
];

// Clave de permiso -> qué roles lo tienen.
const MATRIX: Record<string, Record<string, boolean>> = {
  consult: { Administradora: true, Gestor: true, Operador: true, Consulta: true },
  register: { Administradora: true, Gestor: true, Operador: true, Consulta: false },
  adjust: { Administradora: true, Gestor: true, Operador: false, Consulta: false },
  report: { Administradora: true, Gestor: true, Operador: false, Consulta: true },
  admin: { Administradora: true, Gestor: false, Operador: false, Consulta: false },
};

interface SeedUser {
  email: string;
  name: string;
  initials: string;
  role: string;
  status: "ACTIVE" | "PENDING";
  warehouses: string[];
  invitedAt?: string;
  lastAccessAt?: string;
}

const USERS: SeedUser[] = [
  { email: "lucia@chink.es", name: "Lucía Martín", initials: "LM", role: "Administradora", status: "ACTIVE", warehouses: ["ALM-001", "ALM-002", "ALM-003"], lastAccessAt: "2026-10-15T10:42:00" },
  { email: "diego@chink.es", name: "Diego Pérez", initials: "DP", role: "Gestor", status: "ACTIVE", warehouses: ["ALM-001", "ALM-002", "ALM-003"], lastAccessAt: "2026-10-15T09:30:00" },
  { email: "ana@chink.es", name: "Ana López", initials: "AL", role: "Operador", status: "ACTIVE", warehouses: ["ALM-001", "ALM-002"], lastAccessAt: "2026-10-15T10:42:00" },
  { email: "carlos@chink.es", name: "Carlos Ruiz", initials: "CR", role: "Operador", status: "ACTIVE", warehouses: ["ALM-001", "ALM-002", "ALM-003"], lastAccessAt: "2026-10-15T09:56:00" },
  { email: "marta@chink.es", name: "Marta Sánchez", initials: "MS", role: "Consulta", status: "ACTIVE", warehouses: ["ALM-001", "ALM-002", "ALM-003"], lastAccessAt: "2026-10-14T16:20:00" },
  { email: "elena@chink.es", name: "Elena Torres", initials: "ET", role: "Operador", status: "PENDING", warehouses: ["ALM-003"], invitedAt: "2026-10-14T09:00:00" },
];

const WAREHOUSES = [
  { code: "ALM-001", name: "Almacén central", location: "Madrid", address: "C. del Hierro, 24", capacity: 2000, position: 1, responsible: "diego@chink.es" },
  { code: "ALM-002", name: "Centro logístico norte", location: "Bilbao", address: "Pol. industrial Asua, 8", capacity: 1000, position: 2, responsible: "ana@chink.es" },
  { code: "ALM-003", name: "Punto de venta", location: "Madrid", address: "C. de Alcalá, 106", capacity: 500, position: 3, responsible: "carlos@chink.es" },
];

interface SeedProduct {
  sku: string;
  name: string;
  category: string;
  unitCost: number;
  icon: string;
  minStock: number;
  warehouse: string;
}

// Existencias por almacén: [ALM-001, ALM-002, ALM-003] · reservado por almacén.
const PRODUCTS: (SeedProduct & { qty: [number, number, number]; reserved: [number, number, number] })[] = [
  { sku: "EMB-001", name: "Caja modular M", category: "Embalaje", unitCost: 4.8, icon: "package", minStock: 0, warehouse: "ALM-001", qty: [600, 212, 28], reserved: [32, 12, 4] },
  { sku: "EMB-002", name: "Caja modular L", category: "Embalaje", unitCost: 7.2, icon: "package", minStock: 0, warehouse: "ALM-001", qty: [400, 160, 64], reserved: [22, 6, 4] },
  { sku: "EMB-003", name: "Sobre acolchado", category: "Embalaje", unitCost: 0.65, icon: "mail", minStock: 0, warehouse: "ALM-001", qty: [300, 100, 80], reserved: [14, 4, 2] },
  { sku: "SEG-001", name: "Precinto de seguridad", category: "Consumibles", unitCost: 1.9, icon: "shield-check", minStock: 0, warehouse: "ALM-002", qty: [180, 100, 40], reserved: [7, 2, 1] },
  { sku: "TEC-001", name: "Terminal móvil T2", category: "Equipamiento", unitCost: 249, icon: "smartphone", minStock: 0, warehouse: "ALM-001", qty: [100, 30, 18], reserved: [3, 2, 1] },
  { sku: "TEC-002", name: "Escáner industrial S1", category: "Equipamiento", unitCost: 89, icon: "product-illustration", minStock: 50, warehouse: "ALM-003", qty: [30, 10, 2], reserved: [6, 2, 0] },
  { sku: "CON-001", name: "Etiqueta térmica", category: "Consumibles", unitCost: 12.5, icon: "ticket", minStock: 30, warehouse: "ALM-003", qty: [12, 4, 2], reserved: [0, 2, 0] },
  { sku: "CON-002", name: "Cinta kraft", category: "Consumibles", unitCost: 3.6, icon: "disc", minStock: 25, warehouse: "ALM-002", qty: [8, 4, 2], reserved: [0, 0, 0] },
];

interface SeedMovement {
  ref: string;
  type: "ENTRY" | "EXIT" | "TRANSFER" | "ADJUSTMENT";
  quantity: number;
  product: string;
  origin: string | null;
  destination: string | null;
  owner: string;
  createdAt: string;
  note?: string;
}

const MOVEMENTS: SeedMovement[] = [
  { ref: "MOV-012", type: "ENTRY", quantity: 60, product: "EMB-001", origin: null, destination: "ALM-001", owner: "ana@chink.es", createdAt: "2026-10-15T10:42:00", note: "Proveedor → Central" },
  { ref: "MOV-011", type: "ADJUSTMENT", quantity: 2, product: "CON-001", origin: "ALM-001", destination: null, owner: "lucia@chink.es", createdAt: "2026-10-15T10:18:00", note: "Central · Recuento" },
  { ref: "MOV-010", type: "EXIT", quantity: -20, product: "EMB-003", origin: "ALM-003", destination: null, owner: "carlos@chink.es", createdAt: "2026-10-15T09:56:00", note: "Punto de venta → Cliente" },
  { ref: "MOV-009", type: "TRANSFER", quantity: 10, product: "TEC-001", origin: "ALM-001", destination: "ALM-002", owner: "diego@chink.es", createdAt: "2026-10-15T09:30:00", note: "Central → Norte" },
  { ref: "MOV-008", type: "ADJUSTMENT", quantity: -6, product: "CON-002", origin: "ALM-001", destination: null, owner: "lucia@chink.es", createdAt: "2026-10-14T17:05:00", note: "Central · Deterioro" },
  { ref: "MOV-007", type: "EXIT", quantity: -80, product: "EMB-002", origin: "ALM-001", destination: null, owner: "ana@chink.es", createdAt: "2026-10-14T15:20:00", note: "Central → Cliente" },
  { ref: "MOV-006", type: "EXIT", quantity: -120, product: "EMB-001", origin: "ALM-002", destination: null, owner: "carlos@chink.es", createdAt: "2026-10-13T12:40:00", note: "Norte → Cliente" },
  { ref: "MOV-005", type: "ENTRY", quantity: 360, product: "EMB-001", origin: null, destination: "ALM-001", owner: "ana@chink.es", createdAt: "2026-10-12T11:10:00", note: "Proveedor → Central" },
  { ref: "MOV-004", type: "TRANSFER", quantity: 24, product: "SEG-001", origin: "ALM-001", destination: "ALM-003", owner: "diego@chink.es", createdAt: "2026-10-11T16:35:00", note: "Central → Punto de venta" },
  { ref: "MOV-003", type: "EXIT", quantity: -160, product: "EMB-003", origin: "ALM-001", destination: null, owner: "carlos@chink.es", createdAt: "2026-10-11T10:15:00", note: "Central → Cliente" },
  { ref: "MOV-002", type: "ENTRY", quantity: 180, product: "EMB-002", origin: null, destination: "ALM-001", owner: "ana@chink.es", createdAt: "2026-10-10T09:45:00", note: "Proveedor → Central" },
  { ref: "MOV-001", type: "TRANSFER", quantity: 48, product: "EMB-001", origin: "ALM-001", destination: "ALM-002", owner: "diego@chink.es", createdAt: "2026-10-09T14:20:00", note: "Central → Norte" },
];

async function main() {
  // El seed es idempotente: parte de cero cada vez.
  await prisma.stockMovement.deleteMany();
  await prisma.stockLocation.deleteMany();
  await prisma.userWarehouse.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.workspaceSetting.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
  await prisma.permission.deleteMany();

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  // --- Roles, permisos y matriz de acceso
  const roles = Object.fromEntries(
    await Promise.all(ROLES.map(async (role) => [role.name, await prisma.role.create({ data: role })])),
  );

  const permissions = Object.fromEntries(
    await Promise.all(
      PERMISSIONS.map(async (permission) => [permission.key, await prisma.permission.create({ data: permission })]),
    ),
  );

  for (const [key, allowed] of Object.entries(MATRIX)) {
    const permission = permissions[key];
    if (!permission) continue;
    for (const [roleName, grant] of Object.entries(allowed)) {
      const role = roles[roleName];
      if (!role) continue;
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id, allowed: grant } });
    }
  }

  // --- Miembros del equipo
  const users = Object.fromEntries(
    await Promise.all(
      USERS.map(async (user) => {
        const role = roles[user.role];
        if (!role) throw new Error(`Rol desconocido: ${user.role}`);
        const created = await prisma.user.create({
          data: {
            email: user.email,
            name: user.name,
            initials: user.initials,
            passwordHash,
            roleId: role.id,
            status: user.status,
            workspaceId: "default",
            invitedAt: user.invitedAt ? new Date(user.invitedAt) : null,
            lastAccessAt: user.lastAccessAt ? new Date(user.lastAccessAt) : null,
          },
        });
        return [user.email, created];
      }),
    ),
  );

  // --- Pertenencia al espacio original (todos los miembros del seed)
  for (const user of USERS) {
    const record = users[user.email];
    const role = roles[user.role];
    if (!record || !role) continue;
    await prisma.spaceMember.create({
      data: { userId: record.id, workspaceId: "default", roleId: role.id, status: user.status },
    });
  }

  // --- Almacenes
  const warehouses = Object.fromEntries(
    await Promise.all(
      WAREHOUSES.map(async (warehouse) => {
        const responsible = users[warehouse.responsible];
        if (!responsible) throw new Error(`Responsable desconocido: ${warehouse.responsible}`);
        const created = await prisma.warehouse.create({
          data: {
            code: warehouse.code,
            name: warehouse.name,
            location: warehouse.location,
            address: warehouse.address,
            capacity: warehouse.capacity,
            position: warehouse.position,
            responsibleId: responsible.id,
            workspaceId: "default",
          },
        });
        return [warehouse.code, created];
      }),
    ),
  );

  // --- Acceso de cada miembro a almacenes
  for (const user of USERS) {
    const record = users[user.email];
    if (!record) continue;
    for (const code of user.warehouses) {
      const warehouse = warehouses[code];
      if (!warehouse) continue;
      await prisma.userWarehouse.create({ data: { userId: record.id, warehouseId: warehouse.id } });
    }
  }

  // --- Catálogo de productos y sus existencias por almacén
  for (const [index, product] of PRODUCTS.entries()) {
    const stock = product.qty.reduce((acc, value) => acc + value, 0);
    const reserved = product.reserved.reduce((acc, value) => acc + value, 0);
    const totalValue = Number((stock * product.unitCost).toFixed(2));

    const created = await prisma.product.create({
      data: {
        sku: product.sku,
        name: product.name,
        category: product.category,
        stock,
        reserved,
        unitCost: product.unitCost,
        totalValue,
        status: product.minStock > 0 && stock <= product.minStock ? "LOW_STOCK" : "IN_STOCK",
        archived: false,
        position: index + 1,
        icon: product.icon,
        minStock: product.minStock,
        workspaceId: "default",
      },
    });

    const codes = Object.keys(warehouses);
    for (const [slot, code] of codes.entries()) {
      const warehouse = warehouses[code];
      if (!warehouse) continue;
      await prisma.stockLocation.create({
        data: {
          productId: created.id,
          warehouseId: warehouse.id,
          quantity: product.qty[slot] ?? 0,
          reserved: product.reserved[slot] ?? 0,
        },
      });
    }
  }

  // --- Historial de movimientos
  for (const movement of MOVEMENTS) {
    const product = await prisma.product.findFirst({ where: { sku: movement.product, workspaceId: "default" } });
    const owner = users[movement.owner];
    if (!product || !owner) throw new Error(`Datos incompletos en ${movement.ref}`);
    await prisma.stockMovement.create({
      data: {
        ref: movement.ref,
        type: movement.type,
        status: "CONFIRMED",
        quantity: movement.quantity,
        note: movement.note,
        productId: product.id,
        originId: movement.origin ? warehouses[movement.origin]?.id : undefined,
        destinationId: movement.destination ? warehouses[movement.destination]?.id : undefined,
        ownerId: owner.id,
        workspaceId: "default",
        createdAt: new Date(movement.createdAt),
      },
    });
  }

  // --- Preferencias del espacio de trabajo
  // Al crear el espacio se le asigna un icono al azar de la galería.
  const spaceMark = WORKSPACE_MARKS[Math.floor(Math.random() * WORKSPACE_MARKS.length)]!;
  await prisma.workspaceSetting.create({
    data: {
      id: "default",
      spaceName: "Chink · Operaciones",
      spaceColor: spaceMark.color,
      spaceMark: spaceMark.id,
      legalName: "Chink Logística, S.L.",
      contactEmail: "operaciones@chink.es",
      taxId: "B12345678",
      language: "Español (España)",
      currency: "Peso colombiano · COP ($)",
      timezone: "America / Bogota (UTC-05:00)",
      dateFormat: "DD/MM/AAAA",
      unit: "Unidad (u.)",
      defaultWarehouseId: warehouses["ALM-001"]?.id,
      movementPrefix: "MOV-",
      defaultMinStock: 10,
      allowNegativeStock: false,
      requireAdjustmentReason: true,
      lowStockAlerts: true,
      reserveBeforePicking: true,
      updatedById: users["lucia@chink.es"]?.id,
    },
  });

  const [products, movements, members, sites] = await Promise.all([
    prisma.product.count(),
    prisma.stockMovement.count(),
    prisma.user.count(),
    prisma.warehouse.count(),
  ]);

  console.log(`Seed completo: ${products} productos · ${movements} movimientos · ${members} miembros · ${sites} almacenes.`);
  console.log(`Contraseña de todos los miembros: ${PASSWORD}`);
}

main()
  .catch((error) => {
    console.error("Seed falló:", error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });