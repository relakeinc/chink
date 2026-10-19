import { GoogleGenerativeAI } from "@google/generative-ai";

function geminiKeys(): string[] {
  return [process.env.GEMINI_API_KEY_1, process.env.GEMINI_API_KEY_2, process.env.GEMINI_API_KEY_3].filter(
    (k): k is string => Boolean(k && String(k).trim()),
  );
}

let keyIndex = 0;

function nextKey(): string {
  const keys = geminiKeys();
  if (keys.length === 0) throw new Error("No hay API keys de Gemini configuradas");
  const key = keys[keyIndex % keys.length]!;
  keyIndex = (keyIndex + 1) % keys.length;
  return key;
}

/**
 * Cadena de modelos a probar: el primario (`GEMINI_MODEL`) y luego los de
 * `GEMINI_FALLBACK_MODELS`. Google retira modelos Lite sin aviso (el 2.0
 * murió con un 404 en pleno uso); sin fallback, todas las fotos del bot
 * fallan hasta que alguien edita el .env del servidor.
 */
function modelChain(): string[] {
  const primary = (process.env.GEMINI_MODEL || "").trim() || "gemini-2.5-flash-lite";
  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS || "gemini-2.5-flash-lite,gemini-flash-lite-latest")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return [primary, ...fallbacks.filter((m) => m !== primary)];
}

/** 404 / "no longer available": el modelo fue retirado, probar el siguiente. */
function esModeloRetirado(error: unknown): boolean {
  const message = String((error as { message?: unknown })?.message || "");
  return /404|not\s*found|no longer available/i.test(message);
}

export function cleanMarkdownBlocks(text: unknown): string {
  const raw = String(text ?? "").trim();
  if (!raw) return raw;
  if (raw.startsWith("```")) {
    return raw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
  }
  return raw;
}

/** Llama a Gemini con imagen y devuelve el texto limpio. Rota keys ante rate limit y modelos ante retiros. */
export async function runGeminiPrompt(prompt: string, base64Image: string, mimeType: string): Promise<string> {
  const keys = geminiKeys();
  if (keys.length === 0) throw new Error("No hay API keys de Gemini configuradas");

  let lastError: unknown = null;
  for (const modelName of modelChain()) {
    for (let attempt = 0; attempt < keys.length; attempt += 1) {
      const key = nextKey();
      try {
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { data: base64Image, mimeType: mimeType || "image/jpeg" } }] }],
        });
        return cleanMarkdownBlocks(result?.response?.text?.());
      } catch (error) {
        lastError = error;
        const message = String((error as { message?: unknown })?.message || "");
        if (/429|rate limit/i.test(message) && attempt < keys.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }
        break;
      }
    }
    // Solo se cambia de modelo si el actual fue retirado; otro error (red,
    // clave inválida, imagen) se propaga tal cual.
    if (!esModeloRetirado(lastError)) throw lastError;
  }
  throw lastError ?? new Error("Gemini no respondió");
}

export function parseJsonSeguro(text: string): Record<string, unknown> | null {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    const inicio = raw.indexOf("{");
    const fin = raw.lastIndexOf("}");
    if (inicio >= 0 && fin > inicio) {
      try {
        const parsed: unknown = JSON.parse(raw.slice(inicio, fin + 1));
        return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

const BANCOS_CONOCIDOS = [
  "Nequi",
  "Bancolombia",
  "Davivienda",
  "DaviPlata",
  "BBVA",
  "Banco de Bogotá",
  "Banco de Occidente",
  "Banco Popular",
  "Scotiabank Colpatria",
  "Bancoomeva",
  "Lulo",
  "RappiPay",
  "Transfiya",
  "PSE",
  "Nu",
];

export function normalizeBankName(value: unknown): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  if (lower.includes("bancolombia")) return "Bancolombia";
  if (lower.includes("nequi")) return "Nequi";
  if (lower.includes("daviplata")) return "DaviPlata";
  if (lower.includes("davivienda") || lower.includes("davi")) return "Davivienda";
  if (lower.includes("nubank") || /\bnu\b/.test(lower)) return "Nu";
  if (lower.includes("transfiya")) return "Transfiya";
  if (lower.includes("pse")) return "PSE";
  if (lower.includes("bbva")) return "BBVA";
  if (lower.includes("bogotá") || lower.includes("bogota")) return "Banco de Bogotá";
  if (lower.includes("occidente")) return "Banco de Occidente";
  if (lower.includes("popular")) return "Banco Popular";
  if (lower.includes("scotia") || lower.includes("colpatria")) return "Scotiabank Colpatria";
  if (lower.includes("bancoomeva")) return "Bancoomeva";
  if (lower.includes("rappi")) return "RappiPay";
  if (lower.includes("lulo")) return "Lulo";
  for (const conocido of BANCOS_CONOCIDOS) {
    if (lower.includes(conocido.toLowerCase())) return conocido;
  }
  return text.replace(/\s+/g, " ").slice(0, 60);
}

/** Normaliza montos COP: "$ 501.000,00" -> 501000, "54.000" -> 54000. */
export function parseMontoCOP(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? Number(raw.toFixed(2)) : null;
  let text = String(raw).trim().replace(/\s+/g, "").replace(/[^\d.,]/g, "");
  if (!text) return null;
  const hasComma = text.includes(",");
  const hasDot = text.includes(".");
  if (hasComma && hasDot) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    text = /,\d{1,2}$/.test(text) ? text.replace(",", ".") : text.replace(/,/g, "");
  } else if (hasDot) {
    text = /\.\d{1,2}$/.test(text) ? text : text.replace(/\./g, "");
  }
  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
}

export function validarMonto(rawText: unknown, value: unknown): { ok: boolean; reason?: string } {
  const raw = String(rawText ?? "");
  const valueNum = Number(value);
  if (!Number.isFinite(valueNum) || valueNum <= 0) {
    return { ok: false, reason: "Monto inválido o no legible" };
  }
  if ((raw.includes(".") || raw.includes(",")) && valueNum < 10000) {
    return { ok: false, reason: "Monto sospechoso: posible parse incorrecto de separadores" };
  }
  return { ok: true };
}
