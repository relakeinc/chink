import { afterAll, beforeAll, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";

let app: FastifyInstance;

async function call(method: "GET" | "POST" | "PATCH", url: string, token?: string, payload?: object) {
  const response = await app.inject({ method, url, headers: token ? { authorization: `Bearer ${token}` } : {}, payload });
  return { status: response.statusCode, body: response.json() as any };
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

test("un espacio nuevo queda aislado y permite crear, vender y proyectar el stock", async () => {
  const email = `flujo-${crypto.randomUUID()}@pruebas.co`;
  const registered = await call("POST", "/api/auth/register", undefined, { name: "Dueña de tienda", email, password: "Tienda2026*" });
  expect(registered.status).toBe(201);
  const firstToken = registered.body.token as string;
  const firstWorkspace = registered.body.user.workspaceId as string;

  const createdSpace = await call("POST", "/api/team/spaces", firstToken, { spaceName: "Tienda de abarrotes" });
  expect(createdSpace.status).toBe(201);
  const token = createdSpace.body.token as string;
  expect(createdSpace.body.user.workspaceId).not.toBe(firstWorkspace);

  const empty = await call("GET", "/api/inventory/products", token);
  expect(empty.status).toBe(200);
  expect(empty.body.meta.total).toBe(0);
  expect((await call("GET", "/api/movements", token)).body.meta.total).toBe(0);
  const warehouses = await call("GET", "/api/warehouses", token);
  expect(warehouses.body.data).toHaveLength(1);
  const warehouseId = warehouses.body.data[0].id as string;

  const product = await call("POST", "/api/inventory/products", token, {
    sku: "ARR-DIA-500", name: "Arroz Diana 500 g", category: "Abarrotes", stock: 25, minStock: 5, unitCost: 2200, salePrice: 3000,
  });
  expect(product.status).toBe(201);
  expect(product.body.data).toMatchObject({ stock: 25, minStock: 5, unitCost: 2200, salePrice: 3000, warehouse: "Principal" });
  const productId = product.body.data.id as string;

  const exit = await call("POST", "/api/movements", token, { type: "EXIT", productId, quantity: 5, originId: warehouseId });
  expect(exit.status).toBe(201);
  expect(exit.body.stockDelta).toBe(-5);
  expect((await call("GET", `/api/inventory/products/${productId}`, token)).body.data.stock).toBe(20);
  const excess = await call("POST", "/api/movements", token, { type: "EXIT", productId, quantity: 21, originId: warehouseId });
  expect(excess.status).toBe(409);
  expect((await call("GET", `/api/inventory/products/${productId}`, token)).body.data.stock).toBe(20);

  const forecast = await call("GET", "/api/reports/sales-rate", token);
  expect(forecast.status).toBe(200);
  expect(forecast.body.data.find((row: any) => row.productId === productId)).toMatchObject({ unitsSold: 5, daysToMinimum: 3 });
  const rotation = await call("GET", "/api/reports/rotation", token);
  expect((await call("GET", "/api/reports/profit", token)).body).toMatchObject({ revenue: 15000, cost: 11000, profit: 4000 });
  expect(rotation.body.top[0].productId).toBe(productId);
  expect(rotation.body.slow[0].productId).toBe(productId);
  const audit = await call("GET", "/api/audit/products", token);
  expect(audit.body.data[0]).toMatchObject({ productId, action: "CREATED", actor: { email } });

  const oldSpace = await call("PATCH", "/api/team/active-space", token, { workspaceId: firstWorkspace });
  expect(oldSpace.status).toBe(200);
  expect((await call("GET", "/api/inventory/products", oldSpace.body.token)).body.meta.total).toBe(0);
  expect((await call("GET", "/api/movements", oldSpace.body.token)).body.meta.total).toBe(0);
});
