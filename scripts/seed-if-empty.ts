/**
 * Seed inicial solo si la BD está vacía. El seed normal borra todo, así que
 * aquí solo se ejecuta cuando no hay productos (primer arranque).
 *
 * Sin top-level await: este script vive fuera de apps/api (sin "type":
 * "module") y tsx lo compila como CJS.
 */
import { prisma } from "@chink-saas/db";

async function main(): Promise<void> {
  const count = await prisma.product.count();
  await prisma.$disconnect();

  if (count === 0) {
    console.log("BD vacía: ejecutando seed inicial…");
    await import("../packages/db/prisma/seed.ts");
  } else {
    console.log(`Seed omitido: ya hay ${count} productos.`);
  }
}

void main();
