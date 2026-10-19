/** Cliente mínimo de la Bot API de Telegram (sin dependencias): enviar mensajes y bajar archivos. */

function botToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error("Falta TELEGRAM_BOT_TOKEN.");
  return token;
}

export async function telegramSendMessage(chatId: number | string, text: string): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${botToken()}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!response.ok) {
    throw new Error(`Telegram sendMessage falló (${response.status}).`);
  }
}

interface TelegramFile {
  buffer: Buffer;
  mimeType: string;
}

/** Descarga un archivo de Telegram por su file_path (de getFile). */
export async function telegramDownloadFile(filePath: string): Promise<TelegramFile> {
  const fileUrl = `https://api.telegram.org/file/bot${botToken()}/${filePath}`;
  const response = await fetch(fileUrl);
  if (!response.ok) throw new Error(`No se pudo descargar el archivo de Telegram (${response.status}).`);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return {
    buffer,
    mimeType: detectarMime(buffer, filePath, response.headers.get("content-type")),
  };
}

/** Resuelve el file_path de un file_id (getFile). */
export async function telegramGetFilePath(fileId: string): Promise<string> {
  const response = await fetch(`https://api.telegram.org/bot${botToken()}/getFile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId }),
  });
  const payload = (await response.json()) as { ok?: boolean; result?: { file_path?: string } };
  const filePath = payload?.result?.file_path;
  if (!response.ok || !payload?.ok || !filePath) {
    throw new Error("No se pudo obtener el archivo de Telegram.");
  }
  return filePath;
}

const MIME_POR_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

/**
 * MIME real del archivo por sus bytes mágicos. El endpoint `file/` de
 * Telegram responde `application/octet-stream` y Gemini lo rechaza con 400,
 * así que la cabecera no es fiable: manda el contenido.
 */
export function detectarMime(buffer: Buffer, filePath?: string, headerMime?: string | null): string {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (buffer.length >= 6 && (buffer.toString("ascii", 0, 6) === "GIF87a" || buffer.toString("ascii", 0, 6) === "GIF89a")) {
    return "image/gif";
  }
  const ext = (filePath?.split(".").pop() || "").toLowerCase();
  if (ext && MIME_POR_EXTENSION[ext]) return MIME_POR_EXTENSION[ext]!;
  if (headerMime && headerMime.startsWith("image/")) return headerMime;
  // Las fotos de Telegram siempre son JPEG: último recurso sensato.
  return "image/jpeg";
}
export function extensionFromMime(mimeType: string, filePath?: string): string {
  const fromPath = (filePath?.split(".").pop() || "").toLowerCase();
  if (fromPath && fromPath.length <= 5 && /^[a-z0-9]+$/.test(fromPath)) return `.${fromPath}`;
  if (mimeType.includes("png")) return ".png";
  if (mimeType.includes("webp")) return ".webp";
  return ".jpg";
}
