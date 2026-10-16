/**
 * Correo transaccional con el SMTP propio del VPS (dype-mail). Un remitente
 * por categoría, todos bajo relake.co cambiando solo el subdominio:
 *   invitaciones   pz@mail.relake.co
 *   verificación   pz@verify.relake.co
 *   notificaciones pz@notify.relake.co
 *   alertas        pz@alerts.relake.co
 *   reportes       pz@reports.relake.co
 *
 * Sin SMTP_HOST/SMTP_USER/SMTP_PASS el envío lanza error: quien llama decide
 * si el correo es crítico (falla la operación) o accesorio (sigue y avisa).
 */

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

interface SendEmailInput {
  category: EmailCategory;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<{ id: string }> {
  const info = await getTransporter().sendMail({
    from: FROM[input.category],
    to: input.to,
    subject: input.subject,
    html: input.html,
    ...(input.text ? { text: input.text } : {}),
  });
  return { id: String(info.messageId ?? "") };
}

/* ------------------------------------------------------------ Plantillas */

function layout(title: string, body: string): string {
  return `<html><body style="margin:0;background:#f5f5ef;padding:24px;font-family:sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px;">
      <div style="font-size:15px;font-weight:700;color:#242722;margin-bottom:6px;">${title}</div>
      <div style="font-size:13px;line-height:1.6;color:#41483a;">${body}</div>
      <div style="margin-top:20px;font-size:11px;color:#74796f;">Chink · gestión de inventario</div>
    </div>
  </body></html>`;
}

function button(url: string, label: string): string {
  return `<div style="margin:18px 0;"><a href="${url}" style="display:inline-block;background:#cdfa63;color:#242722;font-weight:700;font-size:13px;padding:10px 18px;border-radius:8px;text-decoration:none;">${label}</a></div>`;
}

export function invitationEmail(input: { name: string; role: string; spaceName: string; temporaryPassword: string; resent?: boolean }): {
  subject: string;
  html: string;
  text: string;
} {
  const title = input.resent ? `Nueva clave para entrar a ${input.spaceName}` : `Te invitaron a ${input.spaceName}`;
  const intro = input.resent
    ? `Hola ${input.name}, te generamos una <strong>nueva clave temporal</strong> porque la anterior se reenvió.`
    : `Hola ${input.name}, te invitaron al espacio <strong>${input.spaceName}</strong> con el rol <strong>${input.role}</strong>.`;
  const body = `${intro}<br><br>Tu clave temporal es: <strong style="font-size:16px;">${input.temporaryPassword}</strong><br>Cámbiala cuando entres desde Configuración → Seguridad.${button(`${APP_URL}/login`, "Entrar a Chink")}`;
  return {
    subject: title,
    html: layout(title, body),
    text: `${title}. Clave temporal: ${input.temporaryPassword}. Entra en ${APP_URL}/login`,
  };
}

export function lowStockEmail(input: { product: string; sku: string; stock: number; minStock: number; spaceName: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const title = `Stock bajo: ${input.product}`;
  const body = `El producto <strong>${input.product}</strong> (${input.sku}) quedó en <strong>${input.stock} u.</strong>, por debajo de su mínimo de ${input.minStock} u. en ${input.spaceName}.${button(`${APP_URL}/inventario`, "Ver inventario")}`;
  return {
    subject: title,
    html: layout(title, body),
    text: `${title}. Stock: ${input.stock} u., mínimo: ${input.minStock} u. Revisa en ${APP_URL}/inventario`,
  };
}

export function passwordChangedEmail(input: { name: string }): { subject: string; html: string; text: string } {
  const title = "Cambiaste tu contraseña";
  const body = `Hola ${input.name}, tu contraseña de Chink se actualizó correctamente.<br>Si no fuiste tú, avisa a tu administración cuanto antes.${button(`${APP_URL}/login`, "Entrar a Chink")}`;
  return {
    subject: title,
    html: layout(title, body),
    text: `${title}. Si no fuiste tú, avisa a tu administración. ${APP_URL}/login`,
  };
}

export function reportEmail(input: { name: string; scope: string; cutoff: string; content: string; spaceName: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const title = `Reporte: ${input.name}`;
  const body = `<strong>${input.name}</strong> · ${input.scope}<br>Corte: ${input.cutoff}<br><br>${input.content}<br><br>Generado por ${input.spaceName}.${button(`${APP_URL}/reportes`, "Ver reportes")}`;
  return {
    subject: `${title} · ${input.spaceName}`,
    html: layout(title, body),
    text: `${title}. ${input.scope}. Corte: ${input.cutoff}. ${input.content}`,
  };
}
