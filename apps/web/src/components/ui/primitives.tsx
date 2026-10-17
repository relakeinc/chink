import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon } from "./Icon";
import { ICONS } from "./icons";

/* ---------------------------------------------------------------- Botones */

type ButtonVariant = "primary" | "dark" | "filter" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: string;
  iconSize?: number;
  height?: 32 | 36 | 38;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-ink font-bold",
  dark: "bg-ink text-canvas font-semibold border border-line-strong",
  filter: "bg-ink text-canvas font-normal border border-line-strong",
  ghost: "bg-transparent text-ink font-semibold",
};

const HEIGHTS: Record<number, string> = { 32: "h-[32px]", 36: "h-[36px]", 38: "h-[38px]" };

/*
 * Padding y gap por altura, según el diseño:
 *   38 px → px-16 / gap-8   (acciones de página: Importar, Añadir producto)
 *   36 px → px-12 / gap-8   (filtros, buscador)
 *   32 px → px-12 / gap-7   (Columnas, Exportar)
 * Por eso *Columnas* y *Exportar* comparten caja: ambos son de 32 px.
 */
const METRICS: Record<number, { padding: string; gap: string }> = {
  32: { padding: "px-[12px]", gap: "gap-[7px]" },
  36: { padding: "px-[12px]", gap: "gap-[8px]" },
  38: { padding: "px-[16px]", gap: "gap-[8px]" },
};

/**
 * Iconos que ya vienen claros de fábrica: no se les aplica el filtro en
 * fondos oscuros. El resto se resuelve a su variante `-filter` si existe y,
 * si no, se aclara con filtro (tinta → crema, igual que el texto).
 */
const LIGHT_ICONS = new Set(["chevron-down-filter", "columns-3", "download", "transfer", "upload"]);

export function Button({
  variant = "dark",
  icon,
  iconSize = 15,
  height = 38,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const metrics = METRICS[height] ?? METRICS[38]!;
  const dark = variant === "dark" || variant === "filter";
  const filterName = icon ? `${icon}-filter` : "";
  const resolvedIcon = icon && dark && filterName in ICONS ? filterName : icon;
  const toneClass = icon && dark && !LIGHT_ICONS.has(resolvedIcon ?? "") ? "brightness-0 invert" : "";

  return (
    <button
      type="button"
      className={`inline-flex shrink-0 items-center justify-center rounded-[8px] text-[13px] leading-[1.4] transition-opacity hover:opacity-90 ${VARIANTS[variant]} ${HEIGHTS[height]} ${metrics.padding} ${metrics.gap} ${className}`}
      {...rest}
    >
      {resolvedIcon ? <Icon name={resolvedIcon} size={iconSize} className={toneClass} /> : null}
      {children}
    </button>
  );
}

/* ----------------------------------------------------------------- Badges */

type BadgeTone = "success" | "warn" | "neutral" | "alert" | "outline";

const TONES: Record<BadgeTone, string> = {
  success: "bg-success-soft text-accent-text",
  warn: "bg-warn-bg text-warn",
  neutral: "bg-subtle text-muted",
  alert: "bg-warn-badge text-warn-alert",
  outline: "bg-toolbar-line text-accent-text",
};

export function Badge({ tone = "neutral", className = "", children }: { tone?: BadgeTone; className?: string; children: ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-[5px] px-[8px] py-[4px] text-[10px] font-medium leading-[1.4] whitespace-nowrap ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------- Tarjetas */

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <section className={`rounded-[10px] bg-canvas ${className}`}>{children}</section>;
}

/* -------------------------------------------------- Encabezado de sección */

export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-[16px]">
      <div className="min-w-0">
        <h2 className="font-outfit text-[17px] leading-[1.4] font-semibold text-ink">{title}</h2>
        {subtitle ? <p className="mt-[4px] text-[11px] leading-[1.4] text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function LinkAction({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    // El margen negativo compensa el padding: el fondo del hover sobresale
    // hacia los lados sin desplazar el resto de la fila.
    <button
      type="button"
      onClick={onClick}
      className="-mx-[6px] -my-[3px] shrink-0 rounded-[5px] px-[6px] py-[3px] text-[11px] font-semibold text-ink transition-colors duration-150 hover:bg-subtle"
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------- Progreso */

export function ProgressBar({ ratio, className = "", trackClass = "bg-line" }: { ratio: number; className?: string; trackClass?: string }) {
  const pct = Math.max(0, Math.min(ratio, 1)) * 100;
  return (
    <div className={`h-[6px] w-full rounded-[3px] ${trackClass} ${className}`}>
      <div
        className="anim-grow-x h-[6px] rounded-[3px] bg-ink"
        style={{ width: `${pct}%`, "--anim-delay": "80ms" } as React.CSSProperties}
      />
    </div>
  );
}

/* --------------------------------------------------------------- Toggle */

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-[20px] w-[34px] shrink-0 rounded-[100px] transition-colors ${on ? "bg-ink" : "bg-subtle border border-line-strong"}`}
    >
      <span
        className={`absolute top-[3px] size-[14px] rounded-full transition-all ${on ? "left-[17px] bg-accent" : "left-[3px] bg-muted-2"}`}
      />
    </button>
  );
}