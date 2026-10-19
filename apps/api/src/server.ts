import { buildApp } from "./app.js";

const port = Number(process.env.PORT ?? 3100);
const host = process.env.HOST ?? "127.0.0.1";

const app = await buildApp();

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

void registerTelegramWebhook(app).catch((error: unknown) =>
  app.log.error({ error: error instanceof Error ? error.message : error }, "No se pudo registrar el webhook de Telegram"),
);

/**
 * Registra el webhook del bot en Telegram al arrancar (solo con APP_URL https).
 * Sin TELEGRAM_BOT_TOKEN o sin HTTPS (dev local), se omite sin romper nada.
 */
async function registerTelegramWebhook(app: { log: { info: (...args: unknown[]) => void } }): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const secret = process.env.TELEGRAM_SECRET_TOKEN?.trim();
  const baseUrl = (process.env.APP_URL || "").replace(/\/$/, "");
  if (!token || !secret || !/^https:\/\//i.test(baseUrl)) {
    return;
  }

  const webhookUrl = `${baseUrl}/api/telegram/webhook`;
  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: webhookUrl, secret_token: secret }),
  });
  const payload = (await response.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.description ?? `HTTP ${response.status}`);
  }
  app.log.info(`Webhook de Telegram registrado en ${webhookUrl}`);
}