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
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: response.headers.get("content-type") || "image/jpeg",
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

export function extensionFromMime(mimeType: string, filePath?: string): string {
  const fromPath = (filePath?.split(".").pop() || "").toLowerCase();
  if (fromPath && fromPath.length <= 5 && /^[a-z0-9]+$/.test(fromPath)) return `.${fromPath}`;
  if (mimeType.includes("png")) return ".png";
  if (mimeType.includes("webp")) return ".webp";
  return ".jpg";
}
