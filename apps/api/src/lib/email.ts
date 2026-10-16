/**
 * Correo transaccional con el SMTP propio del VPS (dype-mail). Un remitente
 * por categoría, todos bajo relake.co cambiando solo el subdominio:
 *   invitaciones   pz@mail.relake.co
 *   verificación   pz@verify.relake.co
 *   notificaciones pz@notify.relake.co
 *   alertas        pz@alerts.relake.co
 *   reportes       pz@reports.relake.co
 *
 * Diseño tipo newsletter (600 px, tablas, estilos en línea: los clientes de
 * correo no soportan flexbox). Los SVG no se ven en los correos, así que el
 * logo y el icono van en PNG incrustados por CID desde assets/email/.
 *
 * Sin SMTP_HOST/SMTP_USER/SMTP_PASS el envío lanza error: quien llama decide
 * si el correo es crítico (falla la operación) o accesorio (sigue y avisa).
 */

import { fileURLToPath } from "node:url";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

export type EmailCategory = "invitations" | "verification" | "notifications" | "alerts" | "reports";

const FROM: Record<EmailCategory, string> = {
  invitations: process.env.EMAIL_FROM_INVITATIONS ?? "pz@mail.relake.co",
  verification: process.env.EMAIL_FROM_VERIFICATION ?? "pz@verify.relake.co",
  notifications: process.env.EMAIL_FROM_NOTIFICATIONS ?? "pz@notify.relake.co",
  alerts: process.env.EMAIL_FROM_ALERTS ?? "pz@alerts.relake.co",
  reports: process.env.EMAIL_FROM_REPORTS ?? "pz@reports.relake.co",
};

export const APP_URL = (process.env.APP_URL ?? "http://127.0.0.1:5173").replace(/\/+$/, "");

let transporter: Transporter | null = null;

/** Transporte SMTP perezoso: STARTTLS obligatorio, sin verificar un cert autofirmado. */
function getTransporter(): Transporter {
  if (!transporter) {
    const host = process.env.SMTP_HOST?.trim();
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS ?? "";
    if (!host || !user || !pass) throw new Error("SMTP sin configurar (SMTP_HOST/SMTP_USER/SMTP_PASS).");
    const port = Number(process.env.SMTP_PORT ?? 587);
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: process.env.SMTP_SECURE === "true" || port === 465,
      requireTLS: port === 587,
      auth: { user, pass },
      // El cert es del propio VPS: se cifra igual, sin validar la cadena.
      tls: { rejectUnauthorized: false },
    });
  }
  return transporter;
}

export async function verifySmtp(): Promise<void> {
  await getTransporter().verify();
}

export function fromAddress(category: EmailCategory): string {
  return FROM[category];
}

/* ---------------------------------------------------------- Adjuntos CID */

const MARK_IDS = [
  "workspace-mark",
  "workspace-violet",
  "workspace-teal",
  "workspace-moss",
  "workspace-ember",
  "workspace-sky",
  "workspace-rose",
  "workspace-bronze",
] as const;

function assetPath(filename: string): string {
  return fileURLToPath(new URL(`../../assets/email/${filename}`, import.meta.url));
}

function safeMarkId(mark: string | null | undefined): string {
  return (MARK_IDS as readonly string[]).includes(mark ?? "") ? (mark as string) : "workspace-mark";
}

export interface EmailAssets {
  attachments: { filename: string; path: string; cid: string }[];
  markCid: string;
  socialCids: { ig: string; fb: string; x: string; yt: string };
}

/** Icono del espacio + iconos sociales incrustados por CID. */
export function emailAssets(mark: string | null | undefined): EmailAssets {
  const id = safeMarkId(mark);
  return {
    attachments: [
      { filename: `${id}.png`, path: assetPath(`${id}.png`), cid: `mark-${id}` },
      { filename: "social-ig.png", path: assetPath("social-ig.png"), cid: "social-ig" },
      { filename: "social-fb.png", path: assetPath("social-fb.png"), cid: "social-fb" },
      { filename: "social-x.png", path: assetPath("social-x.png"), cid: "social-x" },
      { filename: "social-yt.png", path: assetPath("social-yt.png"), cid: "social-yt" },
    ],
    markCid: `mark-${id}`,
    socialCids: { ig: "social-ig", fb: "social-fb", x: "social-x", yt: "social-yt" },
  };
}

interface SendEmailInput {
  category: EmailCategory;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{ filename: string; path?: string; cid?: string; content?: Buffer; contentType?: string }>;
}

export async function sendEmail(input: SendEmailInput): Promise<{ id: string }> {
  const info = await getTransporter().sendMail({
    from: FROM[input.category],
    to: input.to,
    subject: input.subject,
    html: input.html,
    ...(input.text ? { text: input.text } : {}),
    ...(input.attachments ? { attachments: input.attachments } : {}),
  });
  return { id: String(info.messageId ?? "") };
}

/* ------------------------------------------------------------ Plantillas */

const FONT = "'DM Sans', Arial, Helvetica, sans-serif";

/** Escapa texto de usuario antes de meterlo en el HTML. */
function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

interface ShellInput {
  title: string;
  preheader: string;
  markCid: string;
  socialCids: EmailAssets["socialCids"];
  greeting?: string;
  body: string;
  credential?: string;
  ctaUrl?: string;
  ctaLabel?: string;
  footerSpace: string;
  footerWhy: string;
}

/**
 * Newsletter compacto estilo Lovable/Slack: 520 px, alineado a la izquierda,
 * titular moderado, CTA oscuro en píldora y pie honesto con el motivo del envío.
 */
function shell(input: ShellInput): string {
  const social = (cid: string, alt: string) =>
    `<td align="center" style="padding:0 8px;"><img src="cid:${cid}" width="20" height="20" alt="${alt}" style="display:block;border:0;"></td>`;
  return `<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${esc(input.title)}</title></head><body style="margin:0;padding:0;background:#f5f5ef;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(input.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5ef;padding:32px 0;">
<tr><td align="center">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="width:520px;max-width:520px;background:#ffffff;border-radius:12px;">
<tr><td style="padding:26px 36px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td align="left" valign="middle" style="font-family:${FONT};font-size:24px;font-weight:800;color:#242722;letter-spacing:-0.5px;">Chink.</td>
<td align="right" valign="middle"><img src="cid:${input.markCid}" width="30" height="30" alt="" style="display:block;border:0;"></td>
</tr></table>
</td></tr>
${
  input.greeting
    ? `<tr><td style="padding:26px 36px 0;font-family:${FONT};font-size:14px;font-weight:700;color:#242722;">${esc(input.greeting)}</td></tr>`
    : ""
}
<tr><td style="padding:10px 36px 0;font-family:${FONT};font-size:28px;font-weight:800;color:#242722;text-transform:uppercase;line-height:1.2;">${esc(input.title)}</td></tr>
<tr><td style="padding:12px 36px 0;font-family:${FONT};font-size:14px;color:#41483a;line-height:1.65;">${input.body}</td></tr>
${
  input.credential
    ? `<tr><td style="padding:16px 36px 0;"><span style="display:inline-block;border:1px solid #242722;border-radius:6px;padding:12px 24px;font-family:${FONT};font-size:18px;font-weight:700;letter-spacing:3px;color:#242722;">${esc(input.credential)}</span></td></tr>`
    : ""
}
${
  input.ctaUrl && input.ctaLabel
    ? `<tr><td style="padding:22px 36px 0;"><a href="${input.ctaUrl}" style="display:inline-block;background:#242722;color:#f5f5ef;font-family:${FONT};font-weight:700;font-size:14px;padding:12px 28px;border-radius:999px;text-decoration:none;">${esc(input.ctaLabel)}</a></td></tr>`
    : ""
}
<tr><td style="padding:22px 36px 0;font-family:${FONT};font-size:14px;color:#41483a;line-height:1.65;">Saludos,<br><strong>El equipo Chink</strong></td></tr>
<tr><td align="center" style="padding:30px 36px 8px;font-family:${FONT};font-size:11px;color:#74796f;line-height:1.6;">${esc(input.footerWhy)}</td></tr>
<tr><td align="center" style="padding:0 36px 6px;">
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>
${social(input.socialCids.ig, "Instagram")}${social(input.socialCids.fb, "Facebook")}${social(input.socialCids.x, "X")}${social(input.socialCids.yt, "YouTube")}
</tr></table>
</td></tr>
<tr><td align="center" style="padding:10px 36px 30px;font-family:${FONT};font-size:11px;color:#74796f;">Chink · gestión de inventario — ${esc(input.footerSpace)}</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export interface TemplateOutput {
  subject: string;
  html: string;
  text: string;
}

export function invitationEmail(input: { name: string; role: string; spaceName: string; temporaryPassword: string; mark: string; resent?: boolean }): TemplateOutput {
  const assets = emailAssets(input.mark);
  const title = input.resent ? `Nueva clave para ${input.spaceName}` : `Te invitaron a ${input.spaceName}`;
  const html = shell({
    title,
    preheader: `Tu clave temporal para entrar a ${input.spaceName}`,
    markCid: assets.markCid,
    socialCids: assets.socialCids,
    greeting: `Hola ${esc(input.name)},`,
    body: input.resent
      ? `Te generamos una <strong>nueva clave temporal</strong> porque la anterior se reenvió. Cámbiala cuando entres desde Configuración → Seguridad.`
      : `Te invitaron al espacio <strong>${esc(input.spaceName)}</strong> con el rol <strong>${esc(input.role)}</strong>. Cámbiala cuando entres desde Configuración → Seguridad.`,
    credential: input.temporaryPassword,
    ctaUrl: `${APP_URL}/login`,
    ctaLabel: "Entrar a Chink",
    footerSpace: input.spaceName,
    footerWhy: `Recibiste este correo porque te invitaron a ${input.spaceName}.`,
  });
  return {
    subject: title,
    html,
    text: `${title}. Clave temporal: ${input.temporaryPassword}. Entra en ${APP_URL}/login`,
  };
}

/**
 * Aviso a quien ya es miembro: sin clave temporal (entra con la suya) y sin
 * tocar su cuenta. Solo informa de la nueva invitación a un espacio/rol.
 */
export function invitationExistingEmail(input: { name: string; role: string; spaceName: string; mark: string }): TemplateOutput {
  const assets = emailAssets(input.mark);
  const title = `Te añadieron a ${input.spaceName}`;
  const html = shell({
    title,
    preheader: `Te añadieron al espacio ${input.spaceName}`,
    markCid: assets.markCid,
    socialCids: assets.socialCids,
    greeting: `Hola ${esc(input.name)},`,
    body: `Te añadieron al espacio <strong>${esc(input.spaceName)}</strong> con el rol <strong>${esc(input.role)}</strong>.<br>Como ya tienes cuenta, entra con tu contraseña habitual; no necesitas hacer nada más.`,
    ctaUrl: `${APP_URL}/login`,
    ctaLabel: "Entrar a Chink",
    footerSpace: input.spaceName,
    footerWhy: `Recibiste este correo porque te añadieron a ${input.spaceName}.`,
  });
  return {
    subject: title,
    html,
    text: `${title}. Entra con tu contraseña habitual en ${APP_URL}/login`,
  };
}

export function lowStockEmail(input: { product: string; sku: string; stock: number; minStock: number; spaceName: string; mark: string }): TemplateOutput {
  const assets = emailAssets(input.mark);
  const title = `Stock bajo: ${input.product}`;
  const html = shell({
    title,
    preheader: `${input.product} quedó en ${input.stock} u. (mínimo ${input.minStock})`,
    markCid: assets.markCid,
    socialCids: assets.socialCids,
    body: `El producto <strong>${esc(input.product)}</strong> (${esc(input.sku)}) quedó en <strong>${input.stock} u.</strong>, por debajo de su mínimo de ${input.minStock} u. en ${esc(input.spaceName)}.`,
    ctaUrl: `${APP_URL}/inventario`,
    ctaLabel: "Ver inventario",
    footerSpace: input.spaceName,
    footerWhy: `Recibiste este correo por la alerta de stock bajo de ${input.spaceName}.`,
  });
  return {
    subject: title,
    html,
    text: `${title}. Stock: ${input.stock} u., mínimo: ${input.minStock} u. Revisa en ${APP_URL}/inventario`,
  };
}

export function passwordChangedEmail(input: { name: string; spaceName: string; mark: string }): TemplateOutput {
  const assets = emailAssets(input.mark);
  const title = "Cambiaste tu contraseña";
  const html = shell({
    title,
    preheader: "Tu contraseña de Chink se actualizó",
    markCid: assets.markCid,
    socialCids: assets.socialCids,
    greeting: `Hola ${esc(input.name)},`,
    body: `Tu contraseña de Chink se actualizó correctamente.<br>Si no fuiste tú, avisa a tu administración cuanto antes.`,
    ctaUrl: `${APP_URL}/login`,
    ctaLabel: "Entrar a Chink",
    footerSpace: input.spaceName,
    footerWhy: `Aviso de seguridad de tu cuenta en ${input.spaceName}.`,
  });
  return {
    subject: title,
    html,
    text: `${title}. Si no fuiste tú, avisa a tu administración. ${APP_URL}/login`,
  };
}

export function reportEmail(input: { name: string; scope: string; cutoff: string; content: string; spaceName: string; mark: string }): TemplateOutput {
  const assets = emailAssets(input.mark);
  const title = `Reporte: ${input.name}`;
  const html = shell({
    title,
    preheader: `${input.name} · ${input.scope}`,
    markCid: assets.markCid,
    socialCids: assets.socialCids,
    body: `<strong>${esc(input.name)}</strong> · ${esc(input.scope)}<br>Corte: ${esc(input.cutoff)}<br><br>${esc(input.content)}<br><br>El detalle fila por fila va adjunto en PDF.<br><br>Generado por ${esc(input.spaceName)}.`,
    ctaUrl: `${APP_URL}/reportes`,
    ctaLabel: "Ver reportes",
    footerSpace: input.spaceName,
    footerWhy: `Recibiste este correo porque alguien de ${input.spaceName} te compartió este reporte.`,
  });
  return {
    subject: `${title} · ${input.spaceName}`,
    html,
    text: `${title}. ${input.scope}. Corte: ${input.cutoff}. ${input.content}`,
  };
}
