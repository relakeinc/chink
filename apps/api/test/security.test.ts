import { afterAll, beforeAll, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@chink-saas/db";
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

test("permisos y membresías se aplican por espacio y en la sesión vigente", async () => {
  const suffix = crypto.randomUUID();
  const register = async (name: string) => {
    const result = await call("POST", "/api/auth/register", undefined, {
      name, email: `${name}-${suffix}@pruebas.co`, password: "Tienda2026*",
    });
    expect(result.status).toBe(201);
    return result.body as { token: string; user: { id: string; workspaceId: string } };
  };
  const a = await register("admina");
  const b = await register("adminb");
  const worker = await register("worker");
  const receipt = await prisma.pago.create({ data: {
    workspaceId: a.user.workspaceId,
    monto: 1000,
    imageData: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
    imageMime: "image/jpeg",
    imageUrl: "https://public.example/old-receipt.jpg",
  } });
  expect((await call("GET", `/api/pagos/${receipt.id}/imagen`)).status).toBe(401);
  expect((await call("GET", `/api/pagos/${receipt.id}/imagen`, b.token)).status).toBe(404);
  const privateImage = await app.inject({ method: "GET", url: `/api/pagos/${receipt.id}/imagen`, headers: { authorization: `Bearer ${a.token}` } });
  expect(privateImage.statusCode).toBe(200);
  expect(privateImage.headers["cache-control"]).toBe("private, no-store");
  expect(privateImage.headers["content-type"]).toBe("image/jpeg");
  const receiptDto = await call("GET", `/api/pagos/${receipt.id}`, a.token);
  expect(receiptDto.body.data.imagen_url).toBe(`/api/pagos/${receipt.id}/imagen`);
  const operator = await prisma.role.findUniqueOrThrow({ where: { name: "Operador" } });
  const admin = await prisma.role.findUniqueOrThrow({ where: { name: "Administradora" } });
  const report = await prisma.permission.findUniqueOrThrow({ where: { key: "report" } });

  await prisma.spaceMember.createMany({ data: [a, b].map((space) => ({
    userId: worker.user.id, workspaceId: space.user.workspaceId, roleId: operator.id, status: "ACTIVE" as const,
  })) });
  const switchedA = await call("PATCH", "/api/team/active-space", worker.token, { workspaceId: a.user.workspaceId });
  expect(switchedA.status).toBe(200);
  const tokenA = switchedA.body.token as string;
  const payload = JSON.parse(Buffer.from(tokenA.split(".")[1]!, "base64url").toString()) as { exp: number; iat: number };
  expect(payload.exp - payload.iat).toBe(12 * 3600);
  expect((await call("GET", "/api/reports/summary", tokenA)).status).toBe(403);
  expect((await call("GET", "/api/team/members", tokenA)).status).toBe(403);
  expect((await call("GET", "/api/team/permissions", tokenA)).status).toBe(403);

  const changed = await call("PATCH", "/api/team/permissions", a.token, {
    roleId: operator.id, permissionId: report.id, allowed: true,
  });
  expect(changed.status).toBe(200);
  expect((await call("GET", "/api/reports/summary", tokenA)).status).toBe(200);
  const matrixA = await call("GET", "/api/team/permissions", a.token);
  const matrixB = await call("GET", "/api/team/permissions", b.token);
  expect(matrixA.body.permissions.find((item: any) => item.id === report.id).grants[operator.id]).toBe(true);
  expect(matrixB.body.permissions.find((item: any) => item.id === report.id).grants[operator.id]).toBe(false);

  const switchedB = await call("PATCH", "/api/team/active-space", tokenA, { workspaceId: b.user.workspaceId });
  expect(switchedB.status).toBe(200);
  expect((await call("GET", "/api/reports/summary", switchedB.body.token)).status).toBe(403);

  expect((await call("PATCH", `/api/team/members/${worker.user.id}`, a.token, { roleId: admin.id })).status).toBe(200);
  expect((await call("GET", "/api/team/members", tokenA)).status).toBe(200);
  expect((await call("PATCH", `/api/team/members/${worker.user.id}`, a.token, { roleId: operator.id })).status).toBe(200);
  expect((await call("GET", "/api/team/members", tokenA)).status).toBe(403);

  await prisma.spaceMember.delete({ where: { userId_workspaceId: { userId: worker.user.id, workspaceId: a.user.workspaceId } } });
  expect((await call("GET", "/api/reports/summary", tokenA)).status).toBe(403);
  expect((await call("GET", `/api/stream?token=${encodeURIComponent(tokenA)}`)).status).toBe(403);

  await prisma.user.update({ where: { id: b.user.id }, data: { sessionVersion: { increment: 1 } } });
  expect((await call("GET", "/api/team/members", b.token)).status).toBe(401);
});
