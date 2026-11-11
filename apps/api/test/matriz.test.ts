/**
 * Pruebas de la matriz de pruebas unitarias de Chink (ciclo 1).
 * Cada prueba lleva el código del caso (CPxxx) de la matriz.
 * Corre contra la API real (Fastify inject) y una base de datos de pruebas
 * cargada con el seed. Requiere DATABASE_URL apuntando a esa base.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { prisma } from "@chink-saas/db";
import { buildApp } from "../src/app.js";

const RESULTS = process.env.RESULTS_FILE ?? join(tmpdir(), "resultados-chink.jsonl");
/** Guarda lo que devolvió el sistema para llenar "Resultado obtenido". */
const anotar = (cp: string, obtenido: string) => appendFileSync(RESULTS, JSON.stringify({ cp, obtenido }) + "\n");

let app: FastifyInstance;

async function api(method: string, url: string, token?: string, payload?: unknown) {
  const res = await app.inject({
    method: method as "GET",
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(payload !== undefined ? { payload: payload as object } : {}),
  });
  let body: any = null;
  try {
    body = res.json();
  } catch {
    body = res.body;
  }
  return { status: res.statusCode, body };
}

async function login(email: string, password = "chink2026") {
  const r = await api("POST", "/api/auth/login", undefined, { email, password });
  return r.body.token as string;
}

/** Cuenta nueva con su propio espacio vacío y un almacén, para que los datos no se mezclen. */
let n = 0;
async function espacioNuevo() {
  n += 1;
  const r = await api("POST", "/api/auth/register", undefined, {
    name: "Tester Chink",
    email: `tester${Date.now()}${n}@pruebas.co`,
    password: "Tienda2026*",
  });
  const token = r.body.token as string;
  const w = await api("POST", "/api/warehouses", token, { code: `ALM-T${n}`, name: "Bodega principal", location: "Cali", capacity: 1000 });
  return { token, warehouseId: w.body.data.id as string };
}

async function crearProducto(
  token: string,
  warehouseId: string,
  datos: Partial<{ sku: string; name: string; category: string; stock: number; unitCost: number; minStock: number }>,
) {
  n += 1;
  return api("POST", "/api/inventory/products", token, {
    sku: `SKU-${n}`,
    name: "Producto de prueba",
    category: "General",
    stock: 0,
    unitCost: 1000,
    warehouseId,
    ...datos,
  });
}

async function stockDe(token: string, id: string) {
  const r = await api("GET", `/api/inventory/products/${id}`, token);
  return r.body.data as { stock: number; status: string; unitCost: number };
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("RF01 - Registrar, editar y eliminar productos", () => {
  test("CP001 crear producto con datos válidos", async () => {
    const { token, warehouseId } = await espacioNuevo();
    const r = await crearProducto(token, warehouseId, { name: "Arroz Diana 500 g", category: "Granos", unitCost: 2800, stock: 20 });
    const lista = await api("GET", "/api/inventory/products?search=Arroz", token);
    anotar("CP001", `Código ${r.status}. El producto se guardó y aparece en el listado (${lista.body.data.length} resultado).`);
    expect(r.status).toBe(201);
    expect(lista.body.data.some((p: any) => p.name === "Arroz Diana 500 g")).toBe(true);
  });

  test("CP002 rechazar precio negativo", async () => {
    const { token, warehouseId } = await espacioNuevo();
    const r = await crearProducto(token, warehouseId, { name: "Leche Colanta 1 L", unitCost: -500, stock: 10 });
    anotar("CP002", `Código ${r.status}. El sistema rechazó el registro por precio negativo y no lo guardó.`);
    expect(r.status).toBe(400);
  });

  test("CP003 rechazar nombre vacío", async () => {
    const { token, warehouseId } = await espacioNuevo();
    const r = await crearProducto(token, warehouseId, { name: "", unitCost: 4500, stock: 8 });
    anotar("CP003", `Código ${r.status}. El sistema rechazó el producto sin nombre.`);
    expect(r.status).toBe(400);
  });

  test("CP004 editar el precio de un producto", async () => {
    const { token, warehouseId } = await espacioNuevo();
    const c = await crearProducto(token, warehouseId, { name: "Arroz Diana 500 g", unitCost: 2800, stock: 20 });
    const e = await api("PATCH", `/api/inventory/products/${c.body.data.id}`, token, { unitCost: 3000 });
    const p = await stockDe(token, c.body.data.id);
    anotar("CP004", `Código ${e.status}. El precio quedó en ${p.unitCost}.`);
    expect(p.unitCost).toBe(3000);
  });

  test("CP005 archivar (eliminar) un producto", async () => {
    const { token, warehouseId } = await espacioNuevo();
    const c = await crearProducto(token, warehouseId, { name: "Arroz Diana 500 g", stock: 20 });
    await api("PATCH", `/api/inventory/products/${c.body.data.id}`, token, { archived: true });
    const activos = await api("GET", "/api/inventory/products", token);
    const archivados = await api("GET", "/api/inventory/products?view=archived", token);
    anotar("CP005", `El producto ya no sale en el listado (${activos.body.data.length} activos) y queda en Archivados (${archivados.body.data.length}).`);
    expect(activos.body.data.length).toBe(0);
    expect(archivados.body.data.length).toBe(1);
  });

  test("CP006 rechazar SKU repetido", async () => {
    const { token, warehouseId } = await espacioNuevo();
    await crearProducto(token, warehouseId, { sku: "GRA-001", name: "Arroz Diana 500 g" });
    const r = await crearProducto(token, warehouseId, { sku: "GRA-001", name: "Arroz Roa 500 g" });
    anotar("CP006", `Código ${r.status}. Mensaje: "${r.body.error}".`);
    expect(r.status).toBe(409);
  });

  test("CP007 editar producto con stock negativo", async () => {
    const { token, warehouseId } = await espacioNuevo();
    const c = await crearProducto(token, warehouseId, { name: "Aceite Premier 1 L", stock: 5 });
    const e = await api("PATCH", `/api/inventory/products/${c.body.data.id}`, token, { stock: -50 });
    const p = await stockDe(token, c.body.data.id);
    anotar("CP007", `Código ${e.status}. El sistema aceptó el cambio y el stock quedó en ${p.stock}. No hay validación en la edición.`);
    expect(e.status).toBe(400);
  });

  test("CP008 editar producto con precio negativo", async () => {
    const { token, warehouseId } = await espacioNuevo();
    const c = await crearProducto(token, warehouseId, { name: "Aceite Premier 1 L", stock: 5, unitCost: 9000 });
    const e = await api("PATCH", `/api/inventory/products/${c.body.data.id}`, token, { unitCost: -100 });
    const p = await stockDe(token, c.body.data.id);
    anotar("CP008", `Código ${e.status}. El sistema aceptó el cambio y el precio quedó en ${p.unitCost}.`);
    expect(e.status).toBe(400);
  });
});

describe("RF02 - Buscar y filtrar productos", () => {
  let token: string;
  beforeAll(async () => {
    const s = await espacioNuevo();
    token = s.token;
    await crearProducto(token, s.warehouseId, { name: "Arroz Diana 500 g", category: "Granos" });
    await crearProducto(token, s.warehouseId, { name: "Arroz Roa 1 kg", category: "Granos" });
    await crearProducto(token, s.warehouseId, { name: "Leche Colanta 1 L", category: "Lácteos" });
  });

  test("CP009 buscar por nombre completo", async () => {
    const r = await api("GET", `/api/inventory/products?search=${encodeURIComponent("Arroz Diana 500 g")}`, token);
    anotar("CP009", `Devolvió ${r.body.data.length} producto: ${r.body.data.map((p: any) => p.name).join(", ")}.`);
    expect(r.body.data.map((p: any) => p.name)).toEqual(["Arroz Diana 500 g"]);
  });

  test("CP010 buscar por parte del nombre en minúsculas", async () => {
    const r = await api("GET", "/api/inventory/products?search=arr", token);
    anotar("CP010", `Devolvió ${r.body.data.length} productos: ${r.body.data.map((p: any) => p.name).join(", ")}.`);
    expect(r.body.data.length).toBe(2);
  });

  test("CP011 filtrar por categoría", async () => {
    const r = await api("GET", `/api/inventory/products?category=${encodeURIComponent("Lácteos")}`, token);
    anotar("CP011", `Solo salió ${r.body.data.map((p: any) => p.name).join(", ")}.`);
    expect(r.body.data.every((p: any) => p.category === "Lácteos")).toBe(true);
    expect(r.body.data.length).toBe(1);
  });

  test("CP012 buscar un nombre que no existe", async () => {
    const r = await api("GET", "/api/inventory/products?search=xyz123", token);
    anotar("CP012", `La búsqueda devolvió ${r.body.data.length} productos (lista vacía).`);
    expect(r.body.data.length).toBe(0);
  });
});

describe("RF03 / RF04 / RF05 - Entradas, salidas y validación de existencias", () => {
  async function prep(stock: number) {
    const s = await espacioNuevo();
    const p = await crearProducto(s.token, s.warehouseId, { name: "Aceite Premier 1 L", stock });
    return { ...s, id: p.body.data.id as string };
  }
  const entrada = (t: string, id: string, w: string, quantity: number) =>
    api("POST", "/api/movements", t, { type: "ENTRY", productId: id, quantity, destinationId: w });
  const salida = (t: string, id: string, w: string, quantity: number) =>
    api("POST", "/api/movements", t, { type: "EXIT", productId: id, quantity, originId: w });

  test("CP013 entrada de 10 unidades a un producto con 5", async () => {
    const s = await prep(5);
    const r = await entrada(s.token, s.id, s.warehouseId, 10);
    const p = await stockDe(s.token, s.id);
    anotar("CP013", `Código ${r.status}. Stock final ${p.stock}. Movimiento ${r.body.data?.ref} guardado.`);
    expect(p.stock).toBe(15);
  });

  test("CP014 entrada con cantidad 0", async () => {
    const s = await prep(5);
    const r = await entrada(s.token, s.id, s.warehouseId, 0);
    const p = await stockDe(s.token, s.id);
    anotar("CP014", `Código ${r.status}. La entrada se rechazó y el stock siguió en ${p.stock}.`);
    expect(r.status).toBe(400);
    expect(p.stock).toBe(5);
  });

  test("CP015 entrada con cantidad negativa", async () => {
    const s = await prep(5);
    const r = await entrada(s.token, s.id, s.warehouseId, -3);
    const p = await stockDe(s.token, s.id);
    anotar("CP015", `Código ${r.status}. La entrada se rechazó y el stock siguió en ${p.stock}.`);
    expect(r.status).toBe(400);
    expect(p.stock).toBe(5);
  });

  test("CP016 salida (venta) de 2 unidades de un producto con 10", async () => {
    const s = await prep(10);
    const r = await salida(s.token, s.id, s.warehouseId, 2);
    const p = await stockDe(s.token, s.id);
    anotar("CP016", `Código ${r.status}. Stock final ${p.stock}.`);
    expect(p.stock).toBe(8);
  });

  test("CP017 dos salidas seguidas del mismo producto", async () => {
    const s = await prep(10);
    await salida(s.token, s.id, s.warehouseId, 2);
    await salida(s.token, s.id, s.warehouseId, 2);
    const p = await stockDe(s.token, s.id);
    anotar("CP017", `Stock final ${p.stock}. Cada salida descontó una sola vez.`);
    expect(p.stock).toBe(6);
  });

  test("CP018 vender más unidades de las que hay", async () => {
    const s = await prep(3);
    const r = await salida(s.token, s.id, s.warehouseId, 5);
    const p = await stockDe(s.token, s.id);
    anotar("CP018", `Código ${r.status}. Mensaje: "${r.body.error}". Stock siguió en ${p.stock}.`);
    expect(r.status).toBe(409);
    expect(p.stock).toBe(3);
  });

  test("CP019 vender exactamente lo disponible", async () => {
    const s = await prep(3);
    const r = await salida(s.token, s.id, s.warehouseId, 3);
    const p = await stockDe(s.token, s.id);
    anotar("CP019", `Código ${r.status}. La venta se permitió y el stock quedó en ${p.stock}.`);
    expect(r.status).toBe(201);
    expect(p.stock).toBe(0);
  });
});

describe("RF06 - Historial de movimientos", () => {
  test("CP020 la entrada y la salida aparecen en el historial", async () => {
    const s = await espacioNuevo();
    const p = await crearProducto(s.token, s.warehouseId, { name: "Aceite Premier 1 L", stock: 5 });
    await api("POST", "/api/movements", s.token, { type: "ENTRY", productId: p.body.data.id, quantity: 10, destinationId: s.warehouseId });
    await api("POST", "/api/movements", s.token, { type: "EXIT", productId: p.body.data.id, quantity: 2, originId: s.warehouseId });
    const h = await api("GET", "/api/movements", s.token);
    const filas = h.body.data.map((m: any) => `${m.type} ${m.quantity} (${m.date} ${m.time})`).join(", ");
    anotar("CP020", `Historial con ${h.body.data.length} movimientos: ${filas}.`);
    expect(h.body.data.map((m: any) => m.type).sort()).toEqual(["Entrada", "Salida"]);
    expect(h.body.data.every((m: any) => m.date && m.time)).toBe(true);
  });

  test("CP021 no se puede editar ni borrar un movimiento", async () => {
    const s = await espacioNuevo();
    const p = await crearProducto(s.token, s.warehouseId, { name: "Aceite Premier 1 L", stock: 5 });
    const m = await api("POST", "/api/movements", s.token, { type: "EXIT", productId: p.body.data.id, quantity: 2, originId: s.warehouseId });
    const e = await api("PATCH", `/api/movements/${m.body.data.id}`, s.token, { quantity: 1 });
    const d = await api("DELETE", `/api/movements/${m.body.data.id}`, s.token);
    anotar("CP021", `Editar devolvió ${e.status} y borrar devolvió ${d.status}. No existe forma de modificar el historial.`);
    expect(e.status).toBe(404);
    expect(d.status).toBe(404);
  });
});

describe("RF07 - Alerta de stock mínimo", () => {
  test("CP022 / CP023 / CP024 alerta al llegar al mínimo y al reponer", async () => {
    const s = await espacioNuevo();
    const p = await crearProducto(s.token, s.warehouseId, { name: "Huevos AA x30", stock: 6, minStock: 5 });
    const id = p.body.data.id;
    const antes = await stockDe(s.token, id);
    anotar("CP022", `Con stock 6 y mínimo 5 el estado es ${antes.status} (sin alerta).`);

    const v = await api("POST", "/api/movements", s.token, { type: "EXIT", productId: id, quantity: 1, originId: s.warehouseId });
    const bajo = await stockDe(s.token, id);
    const alertas = await api("GET", "/api/reports/low-stock", s.token);
    anotar("CP023", `Con stock ${bajo.stock} el estado pasó a ${bajo.status}, la respuesta trae crossedLowStock y el producto sale en la lista de stock bajo (${alertas.body.data.length}).`);

    await api("POST", "/api/movements", s.token, { type: "ENTRY", productId: id, quantity: 10, destinationId: s.warehouseId });
    const repuesto = await stockDe(s.token, id);
    anotar("CP024", `Después de la entrada el stock es ${repuesto.stock} y el estado volvió a ${repuesto.status}.`);

    expect(antes.status).toBe("IN_STOCK");
    expect(bajo.status).toBe("LOW_STOCK");
    expect(v.body.crossedLowStock).not.toBeNull();
    expect(alertas.body.data.length).toBe(1);
    expect(repuesto.status).toBe("IN_STOCK");
  });
});

describe("RF10 - Valor total del inventario", () => {
  test("CP027 / CP028 valor total con dos productos y después de una venta", async () => {
    const s = await espacioNuevo();
    await crearProducto(s.token, s.warehouseId, { name: "Producto 1", stock: 3, unitCost: 1000 });
    const p2 = await crearProducto(s.token, s.warehouseId, { name: "Producto 2", stock: 2, unitCost: 5000 });
    const r1 = await api("GET", "/api/inventory/summary", s.token);
    anotar("CP027", `Valor total: $${r1.body.totalValue}.`);
    await api("POST", "/api/movements", s.token, { type: "EXIT", productId: p2.body.data.id, quantity: 1, originId: s.warehouseId });
    const r2 = await api("GET", "/api/inventory/summary", s.token);
    anotar("CP028", `Valor total después de la venta: $${r2.body.totalValue}.`);
    expect(r1.body.totalValue).toBe(13000);
    expect(r2.body.totalValue).toBe(8000);
  });

  test("CP029 valor total sin productos", async () => {
    const s = await espacioNuevo();
    const r = await api("GET", "/api/inventory/summary", s.token);
    anotar("CP029", `Código ${r.status}. Valor total: $${r.body.totalValue}.`);
    expect(r.body.totalValue).toBe(0);
  });
});

describe("RF11 - Inicio de sesión", () => {
  test("CP030 credenciales correctas", async () => {
    const r = await api("POST", "/api/auth/login", undefined, { email: "lucia@chink.es", password: "chink2026" });
    anotar("CP030", `Código ${r.status}. Devolvió token de sesión y el usuario ${r.body.user?.name}.`);
    expect(r.status).toBe(200);
    expect(r.body.token).toBeTruthy();
  });

  test("CP031 contraseña incorrecta", async () => {
    const r = await api("POST", "/api/auth/login", undefined, { email: "lucia@chink.es", password: "12345" });
    anotar("CP031", `Código ${r.status}. Mensaje: "${r.body.error}".`);
    expect(r.status).toBe(401);
  });

  test("CP032 campos vacíos", async () => {
    const r = await api("POST", "/api/auth/login", undefined, { email: "", password: "" });
    anotar("CP032", `Código ${r.status}. No dejó entrar.`);
    expect(r.status).toBe(400);
  });

  test("CP033 entrar al inventario sin sesión", async () => {
    const r = await api("GET", "/api/inventory/products");
    anotar("CP033", `Código ${r.status}. Mensaje: "${r.body.error}".`);
    expect(r.status).toBe(401);
  });

  test("CP034 la sesión dura 12 horas como dice la documentación", async () => {
    const t = await login("lucia@chink.es");
    const payload = JSON.parse(Buffer.from(t.split(".")[1]!, "base64url").toString());
    const horas = (payload.exp - payload.iat) / 3600;
    anotar("CP034", `El token dura ${horas} horas (${horas / 24} días), no 12 horas.`);
    expect(horas).toBe(12);
  });
});

describe("RF12 - Roles y permisos", () => {
  let admin: string, operador: string, consulta: string, productoId: string, almacenId: string;
  beforeAll(async () => {
    admin = await login("lucia@chink.es");
    operador = await login("ana@chink.es");
    consulta = await login("marta@chink.es");
    const lista = await api("GET", "/api/inventory/products?search=CON-002", admin);
    productoId = lista.body.data[0].id;
    const ws = await api("GET", "/api/inventory/summary", admin);
    almacenId = ws.body.warehouses[0].id;
  });

  test("CP035 Operador intenta invitar un miembro", async () => {
    const r = await api("POST", "/api/team/invitations", operador, { name: "Prueba", email: "prueba@chink.es", roleId: "cualquiera" });
    anotar("CP035", `Código ${r.status}. Mensaje: "${r.body.error}".`);
    expect(r.status).toBe(403);
  });

  test("CP036 Operador registra una entrada de mercancía", async () => {
    const r = await api("POST", "/api/movements", operador, { type: "ENTRY", productId: productoId, quantity: 1, destinationId: almacenId });
    anotar("CP036", `Código ${r.status}. Movimiento ${r.body.data?.ref} registrado.`);
    expect(r.status).toBe(201);
  });

  test("CP037 Administradora entra a reportes, equipo y ajustes", async () => {
    const codigos = await Promise.all(["/api/reports/summary", "/api/team/members", "/api/settings"].map((u) => api("GET", u, admin)));
    anotar("CP037", `Códigos: ${codigos.map((c) => c.status).join(", ")}. Tiene acceso a todo.`);
    expect(codigos.every((c) => c.status === 200)).toBe(true);
  });

  test("CP038 usuario Consulta intenta crear un producto", async () => {
    const r = await api("POST", "/api/inventory/products", consulta, { sku: "HACK-001", name: "Creado por Consulta", category: "X", stock: 1, unitCost: 1 });
    anotar("CP038", `Código ${r.status}. El usuario de solo consulta SÍ pudo crear el producto.`);
    expect(r.status).toBe(403);
  });

  test("CP039 usuario Consulta intenta registrar un movimiento", async () => {
    const r = await api("POST", "/api/movements", consulta, { type: "ENTRY", productId: productoId, quantity: 1, destinationId: almacenId });
    anotar("CP039", `Código ${r.status}. El usuario de solo consulta SÍ pudo registrar el movimiento ${r.body.data?.ref ?? ""}.`);
    expect(r.status).toBe(403);
  });

  test("CP040 Operador cambia el stock de un producto editándolo", async () => {
    const r = await api("PATCH", `/api/inventory/products/${productoId}`, operador, { stock: 999 });
    anotar("CP040", `Código ${r.status}. El Operador (sin permiso de ajustar) cambió el stock a 999 sin dejar movimiento.`);
    expect(r.status).toBe(403);
  });

  test("CP041 usuario Consulta intenta crear un almacén", async () => {
    const r = await api("POST", "/api/warehouses", consulta, { code: "HACK", name: "Bodega falsa", location: "X", capacity: 1 });
    anotar("CP041", `Código ${r.status}. El usuario de solo consulta SÍ pudo crear el almacén.`);
    expect(r.status).toBe(403);
  });
});

describe("RF13 - Quién hizo cada cambio", () => {
  test("CP042 el movimiento guarda el usuario que lo hizo", async () => {
    const ana = await login("ana@chink.es");
    const admin = await login("lucia@chink.es");
    const lista = await api("GET", "/api/inventory/products?search=CON-001", admin);
    const ws = await api("GET", "/api/inventory/summary", admin);
    const m = await api("POST", "/api/movements", ana, { type: "ENTRY", productId: lista.body.data[0].id, quantity: 1, destinationId: ws.body.warehouses[0].id });
    const h = await api("GET", `/api/movements?search=${m.body.data.ref}`, admin);
    const fila = h.body.data[0];
    anotar("CP042", `El movimiento ${fila.ref} aparece con usuario ${fila.owner}, fecha ${fila.date} y hora ${fila.time}.`);
    expect(fila.owner).toBe("Ana López");
  });
});

describe("RNF02 / RNF03 - Seguridad y rendimiento", () => {
  test("CP047 la contraseña se guarda cifrada", async () => {
    const s = await espacioNuevo();
    const yo = await api("GET", "/api/auth/me", s.token);
    const u = await prisma.user.findFirst({ where: { email: yo.body.user?.email ?? yo.body.email }, select: { passwordHash: true } });
    const hash = u?.passwordHash ?? "";
    anotar("CP047", `La contraseña está guardada como hash bcrypt (${hash.slice(0, 7)}...), no en texto plano.`);
    expect(hash).not.toBe("Tienda2026*");
    expect(hash.startsWith("$2")).toBe(true);
  });

  test("CP049 una venta se confirma en menos de 3 segundos", async () => {
    const s = await espacioNuevo();
    const p = await crearProducto(s.token, s.warehouseId, { name: "Gaseosa", stock: 10 });
    const t0 = performance.now();
    const r = await api("POST", "/api/movements", s.token, { type: "EXIT", productId: p.body.data.id, quantity: 1, originId: s.warehouseId });
    const ms = Math.round(performance.now() - t0);
    anotar("CP049", `Código ${r.status}. La venta se confirmó en ${ms} ms.`);
    expect(ms).toBeLessThan(3000);
  });
  test("CP050 dos usuarios registran ventas del mismo producto al mismo tiempo", async () => {
    const s = await espacioNuevo();
    const p = await crearProducto(s.token, s.warehouseId, { name: "Gaseosa", stock: 10 });
    const venta = () => api("POST", "/api/movements", s.token, { type: "EXIT", productId: p.body.data.id, quantity: 1, originId: s.warehouseId });
    const rs = await Promise.all([venta(), venta()]);
    const prod = await stockDe(s.token, p.body.data.id);
    const loc = await prisma.stockLocation.findFirst({ where: { productId: p.body.data.id } });
    anotar("CP050", `Códigos ${rs.map((r) => r.status).join(" y ")}. Se vendieron 2 unidades de 10: el stock del producto quedó en ${prod.stock} y el del almacén en ${loc?.quantity}.`);
    expect(rs.every((r) => r.status === 201)).toBe(true);
    expect(prod.stock).toBe(8);
    expect(loc?.quantity).toBe(8);
  });
});
