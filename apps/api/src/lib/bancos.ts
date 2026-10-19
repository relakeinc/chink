import { normalizeBankName, parseJsonSeguro, parseMontoCOP, runGeminiPrompt, validarMonto } from "./gemini.js";

/**
 * Intermediario de bancos: antes de extraer el comprobante, una pasada rápida
 * identifica el banco con evidencia visible. Solo con confianza alta (>= 0.85)
 * se acepta el banco; si no, el pago va a revisión.
 */
export interface BancoDetectado {
  banco: string;
  confianza: number;
  evidencias: string[];
}

const BANCOS = [
  { id: "Nequi", marcas: "logo morado Nequi, color morado, palabra Nequi", referencia: "Aprobación, Número Nequi, Referencia", destino: "Nequi o celular de 10 dígitos" },
  { id: "Bancolombia", marcas: "logo amarillo y negro, colores negro/amarillo, palabra Bancolombia", referencia: "Número de aprobación, Autorización, Referencia", destino: "Cuenta de ahorros/corriente, número largo" },
  { id: "Davivienda", marcas: "logo rojo Davivienda, casita roja", referencia: "Número de transacción, Aprobación", destino: "Cuenta Davivienda o DaviPlata" },
  { id: "DaviPlata", marcas: "logo rojo DaviPlata", referencia: "Número de aprobación, Referencia", destino: "celular de 10 dígitos" },
  { id: "BBVA", marcas: "logo azul BBVA", referencia: "Referencia, Autorización, Núm. de operación", destino: "Cuenta BBVA" },
  { id: "Banco de Bogotá", marcas: "logo Banco de Bogotá", referencia: "Número de aprobación, Referencia", destino: "Cuenta Banco de Bogotá" },
  { id: "Banco de Occidente", marcas: "logo occidental", referencia: "Aprobación, Referencia", destino: "Cuenta Banco de Occidente" },
  { id: "Banco Popular", marcas: "texto Banco Popular", referencia: "Aprobación, Referencia", destino: "Cuenta Banco Popular" },
  { id: "Scotiabank Colpatria", marcas: "logo rojo Scotia, Colpatria", referencia: "Autorización, Referencia", destino: "Cuenta o tarjeta" },
  { id: "Nu", marcas: "logo morado Nu ultravioleta", referencia: "Código de autorización, Referencia", destino: "Cuenta Nu / tarjeta" },
  { id: "Lulo", marcas: "texto Lulo", referencia: "Referencia, Aprobación", destino: "Cuenta Lulo" },
  { id: "RappiPay", marcas: "texto RappiPay o Rappi", referencia: "Referencia, ID", destino: "Cuenta RappiPay" },
  { id: "Transfiya", marcas: "texto Transfiya", referencia: "Código, Referencia", destino: "celular + banco destino" },
  { id: "PSE", marcas: "logo amarillo PSE", referencia: "CUS, Referencia PSE", destino: "según comercio" },
] as const;

function perfilBanco(nombre: string): (typeof BANCOS)[number] | null {
  const lower = nombre.toLowerCase();
  return BANCOS.find((b) => lower.includes(b.id.toLowerCase())) ?? null;
}

/** Etapa 1 (rápida): ¿de qué banco es este comprobante? */
export async function identificarBanco(base64Image: string, mimeType: string): Promise<BancoDetectado> {
  const prompt = `Mira ESTA imagen de comprobante de pago colombiano y responde SOLO un JSON válido:
{"banco":"","confianza":0,"evidencias":[]}
Reglas:
- "banco" debe ser EXACTAMENTE uno de: ${BANCOS.map((b) => b.id).join(" | ")}. Si no hay banco claro, usa "".
- "confianza" es 0..1: 1.0 solo si ves el logo Y el nombre del banco Y colores/plantilla típicos. 0.5 si solo sospechas por colores. 0 si no hay pistas.
- "evidencias": lista corta de lo que VES (ej: ["logo morado con texto Nequi", "fondo morado"]).
- No inventes: si la imagen no es un comprobante o no se lee, {"banco":"","confianza":0,"evidencias":[]}.
- Sin texto extra, solo JSON.`;

  try {
    const texto = await runGeminiPrompt(prompt, base64Image, mimeType);
    const parsed = parseJsonSeguro(texto);
    if (!parsed) return { banco: "", confianza: 0, evidencias: [] };
    const banco = normalizeBankName(parsed["banco"]) ?? "";
    const confianza = Math.max(0, Math.min(1, Number(parsed["confianza"]) || 0));
    const evidencias = Array.isArray(parsed["evidencias"]) ? (parsed["evidencias"] as unknown[]).map(String).slice(0, 5) : [];
    const perfil = banco ? perfilBanco(banco) : null;
    return { banco: perfil ? perfil.id : banco, confianza: perfil ? confianza : 0, evidencias };
  } catch {
    return { banco: "", confianza: 0, evidencias: ["falló la identificación"] };
  }
}

export interface ComprobanteExtraido {
  estado?: string;
  para: string | null;
  numeroDestino: string | null;
  bancoDestino: string | null;
  fuenteFondos: string | null;
  fecha: string | null;
  hora: string | null;
  monto: number | null;
  montoRawText: string | null;
  montoValidation: { ok: boolean; reason?: string };
  referencia: string | null;
  numeroOrigen: string | null;
}

/** Etapa 2: extracción completa con pistas del banco identificado. */
export async function extraerComprobante(
  base64Image: string,
  mimeType: string,
  banco: BancoDetectado,
): Promise<ComprobanteExtraido> {
  const perfil = banco.banco ? perfilBanco(banco.banco) : null;
  const pistaBanco = perfil
    ? `Pista de banco (confianza ${Math.round(banco.confianza * 100)}%): parece ${perfil.id}. Marcas típicas: ${perfil.marcas}. Referencia suele llamarse: ${perfil.referencia}. Destino típico: ${perfil.destino}. Si la imagen NO coincide con este banco, ignora la pista y extrae lo que veas.`
    : `No se identificó el banco con confianza: extrae lo que veas y deja banco_destino/fuente_fondos en null si no son legibles.`;

  const prompt = `Extrae los datos de este comprobante de pago colombiano y devuelve SOLO un objeto JSON válido con esta estructura exacta, sin texto adicional, sin markdown, sin bloques de código:
{"para":"","numero_destino":"","banco_destino":"","fuente_fondos":"","fecha":"YYYY-MM-DD","hora":"HH:MM","monto":0,"monto_raw_text":"","referencia":"","numero_origen":""}
${pistaBanco}
Instrucciones importantes:
- CAMPOS MÁS IMPORTANTES: referencia (número de transacción, código de autorización, aprobación, ID, CUS de PSE, número Nequi), fuente_fondos (banco de donde SALE el dinero), fecha, hora.
- para: nombre del destinatario, beneficiario o comercio.
- numero_destino: solo dígitos (celular, cuenta, llave). Si no aplica, null.
- banco_destino: entidad que RECIBE. fuente_fondos: entidad de donde SALE. Nunca los confundas ("Desde" = fuente, "Para/hacia" = destino).
- referencia: busca "aprobación", "autorización", "transacción", "referencia", "CUS", "ID". Es CRUCIAL. Devuélvela tal cual aparece (sin espacios extra).
- monto: pesos colombianos ("$ 4.021,00" = 4021.00, "$54.000" = 54000).
- monto_raw_text: monto tal cual aparece. fecha YYYY-MM-DD, hora HH:MM 24h. numero_origen: desde donde se envió.
- Si un campo no aparece, null exactamente.`;

  const texto = await runGeminiPrompt(prompt, base64Image, mimeType);
  const parsed = parseJsonSeguro(texto);
  if (!parsed) throw new Error("ILEGIBLE");

  const str = (v: unknown): string | null => {
    const t = String(v ?? "").trim();
    return t ? t : null;
  };
  const montoRaw = str(parsed["monto_raw_text"]);
  const monto = parseMontoCOP(montoRaw ?? (typeof parsed["monto"] === "number" ? parsed["monto"] : null));

  if (monto == null && !str(parsed["referencia"])) throw new Error("NO_ES_COMPROBANTE");

  return {
    para: str(parsed["para"]),
    numeroDestino: str(parsed["numero_destino"])?.replace(/\D/g, "") || null,
    bancoDestino: normalizeBankName(parsed["banco_destino"]),
    fuenteFondos: normalizeBankName(parsed["fuente_fondos"]),
    fecha: str(parsed["fecha"]),
    hora: str(parsed["hora"]),
    monto,
    montoRawText: montoRaw,
    montoValidation: validarMonto(montoRaw, monto),
    referencia: str(parsed["referencia"]),
    numeroOrigen: str(parsed["numero_origen"])?.replace(/\D/g, "") || null,
  };
}

/** Normaliza referencias para el dedupe: mayúsculas, sin espacios/puntos/guiones. */
export function normalizarReferencia(ref: unknown): string | null {
  if (ref == null) return null;
  const clean = String(ref).trim().toUpperCase().replace(/[\s.\-]+/g, "");
  return clean || null;
}
