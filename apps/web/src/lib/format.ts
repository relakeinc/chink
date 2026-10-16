/*
 * Formateadores. El diseño expresa todos los importes en COP con el
 * formato español (punto de miles, coma decimal) y el sufijo " COP".
 */

const nf2 = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatDecimal(value: number, digits = 2): string {
  return digits === 0 ? nf0.format(value) : digits === 1 ? nf1.format(value) : nf2.format(value);
}

/** Entero con separador de miles: 2486 -> "2.486" */
export function formatInt(value: number): string {
  return nf0.format(value);
}

/** Unidades: 2486 -> "2.486 u." */
export function formatUnits(value: number): string {
  return `${nf0.format(value)} u.`;
}

/** Importe: 4032 -> "4.032,00 COP" */
export function formatCOP(value: number): string {
  return `${nf2.format(value)} COP`;
}

/** Porcentaje: 81.5 -> "81,5 %" */
export function formatPercent(value: number, digits = 1): string {
  return `${nf1.format(value)} %`;
}

/** Cantidad con signo tipográfico: 60 -> "+60 u.", -20 -> "−20 u." */
export function formatSignedUnits(value: number, { sign = true }: { sign?: boolean } = {}): string {
  const body = `${nf0.format(Math.abs(value))} u.`;
  if (!sign || value === 0) return body;
  return value > 0 ? `+${body}` : `−${body}`;
}