import { DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@chink-saas/db";
import { getR2Client, getR2Config } from "../lib/r2.js";

function imageType(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length >= 12 && Buffer.from(bytes).toString("ascii", 0, 4) === "RIFF" && Buffer.from(bytes).toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

async function main() {
  const dryRun = process.env.DRY_RUN === "1";
  const config = getR2Config();
  const client = getR2Client(config);
  const rows = await prisma.pago.findMany({
    where: { imageKey: { not: null } },
    select: { id: true, workspaceId: true, imageKey: true, imageMime: true },
  });
  for (const row of rows) {
    const key = row.imageKey!;
    if (!key.startsWith(`receipts/${row.workspaceId}/`) || key.includes("..")) throw new Error(`Clave no válida para ${row.id}`);
    if (!row.imageMime) {
      const object = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
      if (!object.Body || (object.ContentLength ?? 0) > 5 * 1024 * 1024) throw new Error(`Comprobante demasiado grande: ${row.id}`);
      const bytes = await object.Body.transformToByteArray();
      const mime = imageType(bytes);
      if (!mime || bytes.length > 5 * 1024 * 1024) throw new Error(`Comprobante inválido: ${row.id}`);
      if (!dryRun) await prisma.pago.update({ where: { id: row.id }, data: { imageData: Uint8Array.from(bytes), imageMime: mime } });
    }
    if (dryRun) {
      console.log(`Comprobante validado: ${row.id}`);
      continue;
    }
    await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    await prisma.pago.update({ where: { id: row.id }, data: { imageKey: null, imageUrl: null } });
    console.log(`Comprobante protegido: ${row.id}`);
  }
  console.log(`Comprobantes procesados: ${rows.length}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
