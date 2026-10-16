import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** Tipos e imágenes permitidas para fotos de producto. */
const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;
export const PRODUCT_IMAGE_PREFIX = "products/";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta la variable ${name} para usar el bucket R2 de imágenes.`);
  return value;
}

export interface R2Config {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
}

export function getR2Config(): R2Config {
  const publicBaseUrl = requiredEnv("R2_PUBLIC_BASE_URL").replace(/\/+$/, "");
  if (!/^https:\/\//.test(publicBaseUrl)) {
    throw new Error("R2_PUBLIC_BASE_URL debe ser una URL pública https.");
  }

  return {
    accountId: requiredEnv("R2_ACCOUNT_ID"),
    bucket: requiredEnv("R2_BUCKET"),
    accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
    publicBaseUrl,
  };
}

let client: S3Client | null = null;

export function getR2Client(config: R2Config): S3Client {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }
  return client;
}

export function assertProductImageUpload(contentType: unknown, size: unknown): asserts contentType is keyof typeof IMAGE_EXTENSIONS {
  if (typeof contentType !== "string" || !IMAGE_EXTENSIONS[contentType]) {
    throw new Error("Solo se permiten imágenes JPEG, PNG o WebP.");
  }
  if (typeof size !== "number" || !Number.isInteger(size) || size <= 0 || size > MAX_PRODUCT_IMAGE_BYTES) {
    throw new Error("La imagen debe pesar entre 1 byte y 5 MB.");
  }
}

export function buildProductImageKey(productId: string, contentType: keyof typeof IMAGE_EXTENSIONS): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(productId)) throw new Error("Identificador de producto no válido.");
  return `${PRODUCT_IMAGE_PREFIX}${productId}/${crypto.randomUUID()}.${IMAGE_EXTENSIONS[contentType]}`;
}

export function publicUrlFor(config: R2Config, key: string): string {
  return `${config.publicBaseUrl}/${key}`;
}

export function assertProductImageKey(productId: string, key: unknown): asserts key is string {
  if (typeof key !== "string" || !key.startsWith(`${PRODUCT_IMAGE_PREFIX}${productId}/`) || key.includes("..") || key.length > 220) {
    throw new Error("Clave de imagen no válida para este producto.");
  }
}

export async function createProductImageUploadUrl(productId: string, contentType: string, size: number) {
  assertProductImageUpload(contentType, size);
  const config = getR2Config();
  const key = buildProductImageKey(productId, contentType);
  const uploadUrl = await getSignedUrl(
    getR2Client(config),
    new PutObjectCommand({ Bucket: config.bucket, Key: key, ContentType: contentType, ContentLength: size }),
    { expiresIn: 300 },
  );
  return { productId, key, uploadUrl, publicUrl: publicUrlFor(config, key), expiresIn: 300 };
}

export async function deleteR2Object(key: string): Promise<void> {
  const config = getR2Config();
  await getR2Client(config).send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
}
