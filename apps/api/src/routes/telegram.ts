import type { FastifyPluginAsync } from "fastify";
import { prisma } from "@chink-saas/db";
import { workspaceIdFor, activeMembership } from "../lib/workspace-scope.js";
import { permissionAllowed } from "../lib/permissions.js";
import { notifyUser } from "./notifications.js";
import { publishToUser, publishToWorkspace } from "../lib/realtime-hub.js";
import { randomInt } from "node:crypto";
import { telegramDownloadFile, telegramGetFilePath, telegramSendMessage } from "../lib/telegram.js";
import { extraerComprobante, identificarBanco, normalizarReferencia } from "../lib/bancos.js";

/** ¿El miembro del espacio activo puede registrar pagos (permiso `register`)? */
async function tienePermisoRegistro(workspaceId: string, usuarioId: string): Promise<boolean> {
  const member = await prisma.spaceMember.findUnique({
    where: { userId_workspaceId: { userId: usuarioId, workspaceId } },
    select: { roleId: true, status: true },
  });
  if (!member || member.status !== "ACTIVE") return false;
  return permissionAllowed(workspaceId, member.roleId, "register");
}

function codigoAleatorio(): string {
  return String(randomInt(100000, 1000000));
}

const linkAttempts = new Map<string, { count: number; resetAt: number }>();

function allowLinkAttempt(chatId: bigint): boolean {
  const now = Date.now();
  const key = chatId.toString();
  const existing = linkAttempts.get(key);
  const attempt = !existing || existing.resetAt <= now ? { count: 0, resetAt: now + 10 * 60_000 } : existing;
  attempt.count += 1;
  linkAttempts.set(key, attempt);
  if (linkAttempts.size > 10_000) {
    for (const [id, value] of linkAttempts) if (value.resetAt <= now) linkAttempts.delete(id);
    if (linkAttempts.size > 10_000) linkAttempts.delete(linkAttempts.keys().next().value!);
  }
  return attempt.count <= 5;
}

export const telegramRoutes: FastifyPluginAsync = async (app) => {
  /** Estado de Telegram del espacio: chats vinculados y si puedes vincular. */
  app.get("/estado", async (request) => {
    const ws = await workspaceIdFor(request);
    const member = await activeMembership(request);
    const botUsername = (process.env.TELEGRAM_BOT_USERNAME || "").trim().replace(/^@/, "");
    const chats = await prisma.telegramChat.findMany({
      where: { workspaceId: ws },
      include: { usuario: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    });

  return {
    data: {
      botConfigurado: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      botUsername: botUsername || null,
      rol: member.roleName,
      puedeVincular: await tienePermisoRegistro(ws, request.user.id),
        chats: chats.map((c) => ({
          id: c.id,
          chatId: c.chatId.toString(),
          apodo: c.apodo,
          activo: c.activo,
          ultimoUso: c.ultimoUso,
          usuario: c.usuario ? { id: c.usuario.id, nombre: c.usuario.name, email: c.usuario.email } : null,
        })),
      },
    };
  });

  /**
   * Genera un código de vinculación (6 dígitos, 10 min, un uso).
   * Requiere permiso de registro: solo cajero/admin vinculan su Telegram.
   */
  app.post("/codigo", { preHandler: app.requirePermission("register") }, async (request, reply) => {
    const ws = await workspaceIdFor(request);

    await prisma.codigoVinculacion.deleteMany({ where: { creadoPorId: request.user.id, usadoEn: null } });

    let codigo: string | null = null;
    for (let intento = 0; intento < 10; intento += 1) {
      const candidato = codigoAleatorio();
      const existe = await prisma.codigoVinculacion.findUnique({ where: { codigo: candidato }, select: { id: true } });
      if (!existe) {
        codigo = candidato;
        break;
      }
    }
    if (!codigo) return reply.status(500).send({ error: "No se pudo generar el código" });

    const expiraEn = new Date(Date.now() + 10 * 60 * 1000);
    await prisma.codigoVinculacion.create({
      data: { codigo, workspaceId: ws, creadoPorId: request.user.id, expiraEn },
    });

    const botUsername = (process.env.TELEGRAM_BOT_USERNAME || "").trim().replace(/^@/, "");
    return reply.status(201).send({
      data: {
        codigo,
        expiraEn,
        instrucciones: botUsername
          ? `Abre https://t.me/${botUsername} y envía: /vincular ${codigo}`
          : `Envíale al bot: /vincular ${codigo}`,
      },
    });
  });

  /** Desvincula un chat del espacio. Requiere permiso de registro. */
  app.delete("/chats/:chatId", { preHandler: app.requirePermission("register") }, async (request, reply) => {
    const ws = await workspaceIdFor(request);
    const chatId = String((request.params as { chatId: string }).chatId || "").trim();
    if (!chatId) return reply.status(400).send({ error: "chatId es obligatorio" });

    let chatBigint: bigint;
    try {
      chatBigint = BigInt(chatId);
    } catch {
      return reply.status(400).send({ error: "chatId no válido" });
    }

    const existing = await prisma.telegramChat.findFirst({ where: { workspaceId: ws, chatId: chatBigint }, select: { id: true } });
    if (!existing) return reply.status(404).send({ error: "Chat no encontrado" });

    await prisma.telegramChat.update({ where: { id: existing.id }, data: { activo: false } });
    await publishToWorkspace(ws, { channels: ["telegram"] });
    return { ok: true };
  });
};

/**
 * Webhook público de Telegram (sin JWT: Telegram no manda Authorization,
 * se verifica con el secreto compartido en la cabecera).
 */
export const telegramWebhookRoutes: FastifyPluginAsync = async (app) => {
  app.post("/webhook", async (request, reply) => {
    const expected = process.env.TELEGRAM_SECRET_TOKEN;
    const incoming = (request.headers["x-telegram-bot-api-secret-token"] as string) || "";
    if (!expected || incoming !== expected) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const update = (request.body ?? {}) as {
      message?: {
        chat?: { id?: number | string };
        from?: { first_name?: string; username?: string };
        text?: string;
        photo?: { file_id: string }[];
      };
    };

    void reply.status(200).send({ ok: true });
    void procesarUpdate(update).catch((error: unknown) =>
      request.log.error({ error: error instanceof Error ? error.message : error }, "Error en webhook de Telegram"),
    );
    return undefined;
  });
};

interface TgMessage {
  chat?: { id?: number | string };
  from?: { first_name?: string; username?: string };
  text?: string;
  photo?: { file_id: string }[];
}

async function procesarUpdate(update: { message?: TgMessage }): Promise<void> {
  const msg = update.message;
  if (!msg) return;
  const chatIdRaw = msg.chat?.id;
  if (chatIdRaw === undefined || chatIdRaw === null) return;
  const chatId = BigInt(chatIdRaw);

  if (msg.text && /^\/vincular(\s|$|@)/i.test(msg.text)) {
    await canjearCodigo(msg, chatId);
    return;
  }
  if (msg.text && /^\/espacios(\s|$|@)/i.test(msg.text)) {
    await listarEspacios(msg, chatId);
    return;
  }
  if (msg.text && /^\/usar(\s|$|@)/i.test(msg.text)) {
    await usarEspacio(msg, chatId);
    return;
  }

  if (Array.isArray(msg.photo) && msg.photo.length > 0) {
    const chat = await prisma.telegramChat.findFirst({
      where: { chatId, activo: true },
      orderBy: { ultimoUso: "desc" },
      include: { workspace: { select: { id: true, spaceName: true } } },
    });

    if (!chat) {
      await telegramSendMessage(
        chatId.toString(),
        "❌ Este chat no está vinculado a ningún espacio.\nVincula desde la app: Configuración → Telegram → Generar código, y envíame /vincular CODIGO.",
      );
      return;
    }

    const member = await prisma.spaceMember.findUnique({
      where: { userId_workspaceId: { userId: chat.usuarioId, workspaceId: chat.workspaceId } },
      select: { userId: true },
    });
    if (!member || !(await tienePermisoRegistro(chat.workspaceId, chat.usuarioId))) {
      await telegramSendMessage(
        chatId.toString(),
        `❌ La cuenta vinculada no tiene permiso para registrar en "${chat.workspace.spaceName}".\nPide a un admin que le dé rol de cajero o superior.`,
      );
      return;
    }

    await prisma.telegramChat.update({ where: { id: chat.id }, data: { ultimoUso: new Date() } });
    try {
      await procesarComprobante(msg, chat.workspaceId, chat.usuarioId, chatId.toString(), chat.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isImage = /JPEG|PNG|WebP|5 MB|imagen/i.test(message);
      const isAi = /Gemini|API key|429|quota|rate limit|model|404/i.test(message);
      const response = isImage
        ? "❌ La imagen debe ser JPEG, PNG o WebP y pesar menos de 5 MB. Envíala como foto."
        : isAi
          ? "❌ El servicio de lectura de comprobantes no está disponible ahora. Intenta más tarde o registra el pago manualmente en Chink."
          : "❌ No pude registrar el comprobante. Intenta de nuevo o registra el pago manualmente en Chink.";
      await telegramSendMessage(chatId.toString(), response);
      throw error;
    }
    return;
  }

  if (msg.text && /^\/start(\s|$|@)/i.test(msg.text)) {
    const payload = msg.text.replace(/^\/start\s*/i, "").trim();
    await telegramSendMessage(
      chatId.toString(),
      payload
        ? "ℹ️ Los links viejos ya no funcionan.\n\nVincula desde la app: Configuración → Telegram → Generar código, y envíame: /vincular CODIGO."
        : `👋 ¡Hola${msg.from?.first_name ? ` ${msg.from.first_name}` : ""}! Soy el bot de Chink.\n\nPara vincular tu cuenta:\n1. Ingresa a tu Chink\n2. Ve a Configuración → Telegram\n3. Genera un código (dura 10 min) y envíame: /vincular CODIGO.`,
    );
    return;
  }

  if (msg.text) {
    await telegramSendMessage(
      chatId.toString(),
      "📸 Envíame una foto del comprobante de pago para registrarlo en tu espacio activo.\nUsa /espacios para ver o cambiar de espacio.",
    );
  }
}

async function canjearCodigo(msg: TgMessage, chatId: bigint): Promise<void> {
  const match = (msg.text || "").trim().match(/^\/vincular(?:@\w+)?\s+(\d{6})\s*$/i);
  if (!match) return;

  if (!allowLinkAttempt(chatId)) {
    await telegramSendMessage(chatId.toString(), "Demasiados intentos. Espera 10 minutos y genera un código nuevo.");
    return;
  }

  const registro = await prisma.codigoVinculacion.findUnique({
    where: { codigo: match[1]! },
    include: { workspace: { select: { spaceName: true } } },
  });

  if (!registro) {
    await telegramSendMessage(chatId.toString(), "❌ Ese código no existe. Genera uno nuevo desde Configuración en la app (dura 10 minutos).");
    return;
  }
  if (registro.usadoEn || registro.expiraEn < new Date()) {
    await telegramSendMessage(chatId.toString(), "❌ Ese código venció o ya se usó. Genera uno nuevo desde Configuración en la app.");
    return;
  }

  const member = await prisma.spaceMember.findUnique({
    where: { userId_workspaceId: { userId: registro.creadoPorId, workspaceId: registro.workspaceId } },
    select: { userId: true },
  });
  if (!member || !(await tienePermisoRegistro(registro.workspaceId, registro.creadoPorId))) {
    await telegramSendMessage(chatId.toString(), "❌ Quien generó el código ya no tiene permiso en ese espacio. Pide uno nuevo a un cajero o admin.");
    return;
  }

  await prisma.telegramChat.upsert({
    where: { workspaceId_chatId: { workspaceId: registro.workspaceId, chatId } },
    update: { usuarioId: registro.creadoPorId, activo: true, apodo: msg.from?.first_name ?? null, ultimoUso: new Date() },
    create: {
      workspaceId: registro.workspaceId,
      usuarioId: registro.creadoPorId,
      chatId,
      apodo: msg.from?.first_name ?? null,
      ultimoUso: new Date(),
    },
  });
  await prisma.codigoVinculacion.update({ where: { id: registro.id }, data: { usadoEn: new Date() } });
  linkAttempts.delete(chatId.toString());

  // La app se entera por SSE y muestra el chat sin recargar (en móvil el
  // PWA en segundo plano no revalida solo).
  await publishToWorkspace(registro.workspaceId, { channels: ["telegram"] });

  await telegramSendMessage(
    chatId.toString(),
    `✅ Vinculado al espacio "${registro.workspace.spaceName}".\n\nYa puedes enviarme fotos de comprobantes y los registraré ahí. 📸\n\nSi vinculas más espacios, usa /espacios para cambiar entre ellos.`,
  );
}

async function listarEspacios(msg: TgMessage, chatId: bigint): Promise<void> {
  const chats = await prisma.telegramChat.findMany({
    where: { chatId, activo: true },
    include: { workspace: { select: { id: true, spaceName: true } } },
    orderBy: { ultimoUso: "desc" },
  });

  if (chats.length === 0) {
    await telegramSendMessage(chatId.toString(), "❌ Este chat no está vinculado. Vincula desde la app con /vincular CODIGO.");
    return;
  }

  const lineas = chats.map((c, i) => `${i + 1}. ${c.workspace.spaceName}${i === 0 ? "  ← activo" : ""}`);
  await telegramSendMessage(chatId.toString(), `Tus espacios:\n${lineas.join("\n")}\n\nPara cambiar, envía: /usar N`);
}

async function usarEspacio(msg: TgMessage, chatId: bigint): Promise<void> {
  const match = (msg.text || "").trim().match(/^\/usar(?:@\w+)?\s+(\d+)\s*$/i);
  if (!match) return;

  const chats = await prisma.telegramChat.findMany({
    where: { chatId, activo: true },
    include: { workspace: { select: { spaceName: true } } },
    orderBy: { ultimoUso: "desc" },
  });

  const elegido = chats[Number(match[1]) - 1];
  if (!elegido) {
    await telegramSendMessage(chatId.toString(), "❌ Ese número no corresponde a ningún espacio. Revisa con /espacios.");
    return;
  }

  await prisma.telegramChat.update({ where: { id: elegido.id }, data: { ultimoUso: new Date() } });
  // Cambia el orden de /espacios: la app lo refleja sin recargar.
  await publishToWorkspace(elegido.workspaceId, { channels: ["telegram"] });
  await telegramSendMessage(chatId.toString(), `✅ Espacio activo: "${elegido.workspace.spaceName}". Los próximos comprobantes van ahí.`);
}

async function procesarComprobante(
  msg: TgMessage,
  workspaceId: string,
  usuarioId: string,
  chatIdStr: string,
  telegramChatId: string,
): Promise<void> {
  const photo = msg.photo![msg.photo!.length - 1]!;
  const filePath = await telegramGetFilePath(photo.file_id);
  const { buffer, mimeType } = await telegramDownloadFile(filePath);
  const base64Image = buffer.toString("base64");

  if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType) || buffer.length > 5 * 1024 * 1024) {
    throw new Error("El comprobante debe ser una imagen JPEG, PNG o WebP de hasta 5 MB.");
  }

  let bancoId;
  let analysis;
  try {
    bancoId = await identificarBanco(base64Image, mimeType);
    analysis = await extraerComprobante(base64Image, mimeType, bancoId);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Error desconocido";
    console.error("No se pudo leer el comprobante automáticamente:", reason);
    const pending = await prisma.pago.create({
      data: {
        workspaceId,
        registradoPorId: usuarioId,
        telegramChatId,
        imageData: Uint8Array.from(buffer),
        imageMime: mimeType,
        monto: 0,
        estado: "revisar",
        notas: "Lectura automática fallida. Completa los datos desde Pagos.",
      },
    });
    await publishToWorkspace(workspaceId, { channels: ["pagos", "dashboard"] });
    await notifyUser(usuarioId, {
      workspaceId,
      kind: "pago",
      title: "Comprobante para revisar",
      body: "La foto se guardó, pero no se pudieron leer los datos automáticamente.",
    }).catch(() => undefined);
    await telegramSendMessage(chatIdStr, `📥 Guardé la foto como comprobante para revisar (${pending.id}). Abre Pagos en Chink y completa los datos manualmente.`);
    return;
  }
  const referencia = normalizarReferencia(analysis.referencia);

  const existente = referencia
    ? await prisma.pago.findFirst({ where: { workspaceId, referencia }, select: { id: true } })
    : null;
  if (existente) {
    await telegramSendMessage(
      chatIdStr,
      `Comprobante duplicado\n\nYa existe un pago con referencia ${referencia} en este espacio.`,
    );
    return;
  }

  const montoDudoso = analysis.montoValidation.ok === false;
  const bancoDudoso = bancoId.confianza < 0.85;
  const referenciaDudosa = !referencia;
  const fechaValida = Boolean(analysis.fecha && /^\d{4}-\d{2}-\d{2}$/.test(analysis.fecha) && !Number.isNaN(new Date(`${analysis.fecha}T00:00:00`).getTime()));
  const estado = montoDudoso || bancoDudoso || referenciaDudosa || !fechaValida ? "revisar" : "verificado";
  const motivos: string[] = [];
  if (montoDudoso && analysis.montoValidation.reason) motivos.push(`Monto: ${analysis.montoValidation.reason}`);
  if (bancoDudoso) motivos.push(`Banco sin confirmar (confianza ${Math.round(bancoId.confianza * 100)}%)`);
  if (referenciaDudosa) motivos.push("Referencia no legible");
  if (!fechaValida) motivos.push("Fecha no legible");

  const creado = await prisma.pago.create({
    data: {
      workspaceId,
      registradoPorId: usuarioId,
      telegramChatId,
      imageData: Uint8Array.from(buffer),
      imageMime: mimeType,
      monto: analysis.monto ?? 0,
      fechaPago: fechaValida ? new Date(`${analysis.fecha}T00:00:00`) : null,
      horaPago: analysis.hora,
      bancoDestino: analysis.bancoDestino,
      referencia,
      fuenteFondos: analysis.fuenteFondos,
      para: analysis.para,
      numeroDestino: analysis.numeroDestino,
      numeroOrigen: analysis.numeroOrigen,
      estado,
      notas: motivos.length > 0 ? `Revisión automática: ${motivos.join(" · ")}` : null,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      rawJson: JSON.parse(JSON.stringify({ ...analysis, bancoDetectado: bancoId, telegramChatId: chatIdStr })),
    },
  });

  try {
    await notifyUser(usuarioId, {
      workspaceId,
      kind: "pago",
      title: estado === "revisar" ? "Comprobante para revisar" : "Comprobante registrado",
      body: `$${Number(creado.monto).toLocaleString("es-CO")} · ${creado.bancoDestino || "banco sin confirmar"} · Ref ${creado.referencia || "s/n"}`,
    });
    publishToUser(usuarioId, { channels: ["notifications", "pagos"] });
  } catch (error) {
    console.warn("No se pudo notificar el comprobante:", error instanceof Error ? error.message : error);
  }
  await publishToWorkspace(workspaceId, { channels: ["pagos", "dashboard"] });

  const detalle =
    `Monto: $${analysis.monto ?? "N/A"}\n` +
    `Fecha: ${analysis.fecha ?? "N/A"}\n` +
    `Banco destino: ${analysis.bancoDestino ?? "N/A"}` +
    (analysis.fuenteFondos ? `\nDesde: ${analysis.fuenteFondos}` : "") +
    `\nReferencia: ${analysis.referencia ?? "N/A"}`;

  await telegramSendMessage(
    chatIdStr,
    estado === "revisar" ? `Comprobante registrado para revisión manual\n\n${detalle}` : `Comprobante registrado exitosamente\n\n${detalle}`,
  );
}
