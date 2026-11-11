import type { ReactNode } from "react";
import AnimatedNumber from "./AnimatedNumber";

export interface KpiItem {
  label: string;
  /** Texto plano o nodo (por ejemplo, un <AnimatedNumber/>). */
  value: ReactNode;
  context?: string;
}

export interface KpiStripProps {
  items: KpiItem[];
  /** El último indicador se pinta como ficha con fondo `subtle` (pantalla Inventario). */
  tileLast?: boolean;
}

/**
 * Banda de indicadores. El diseño usa separadores verticales entre columnas y
 * un padding izquierdo de 20 px en todas menos la primera.
 */
export default function KpiStrip({ items, tileLast = false }: KpiStripProps) {
  return (
    <div className="grid min-h-[87px] grid-cols-2 gap-x-[16px] gap-y-[18px] rounded-[10px] bg-canvas px-[22px] py-[18px] md:flex md:gap-0">
      {items.map((item, index) => {
        const isFirst = index === 0;
        const isLast = index === items.length - 1;
        const delay = `${index * 45}ms`;

        const body = (
          <>
            <span className="text-[9px] font-semibold leading-normal text-muted">{item.label}</span>
            <span className={`mt-[6px] flex flex-col gap-[2px] ${isLast ? "items-center text-center" : "items-start"}`}>
              <span className={`font-outfit leading-[1.3] font-semibold text-ink ${isLast ? "whitespace-nowrap text-[20px]" : "text-[22px]"}`}>{item.value}</span>
              {item.context ? <span className="text-[11px] leading-[1.4] text-muted">{item.context}</span> : null}
            </span>
          </>
        );

        if (tileLast && isLast) {
          return (
              <div key={item.label} className="min-w-px flex-1 md:pl-[20px]">
              <div className="anim-fade-up anim-delay flex h-full flex-col items-center justify-center rounded-[8px] bg-subtle px-[12px] text-center" style={{ "--anim-delay": delay } as React.CSSProperties}>
                {body}
              </div>
            </div>
          );
        }

        return (
          <div
            key={item.label}
            className={[
              "anim-fade-up anim-delay flex min-w-px flex-1 flex-col",
              isFirst ? "" : "md:pl-[20px]",
              isLast ? "md:border-r-0" : "md:border-r md:border-edge",
            ].join(" ")}
            style={{ "--anim-delay": delay } as React.CSSProperties}
          >
            {body}
          </div>
        );
      })}
    </div>
  );
}

/** Atajo: KPI cuyo valor es un número que debe contar. */
export function KpiValue({ value, format, duration }: { value: number; format: (v: number) => string; duration?: number }) {
  return <AnimatedNumber value={value} format={format} duration={duration} />;
}

export function PageFooter({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-[16px] gap-y-[4px] px-[10px] text-[10px] leading-[1.4] text-line-strong">
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return (
    <header className="flex min-h-[82px] animate-[chink-fade-in_280ms_cubic-bezier(0.22,1,0.36,1)_both] flex-wrap items-center justify-between gap-[12px]">
      <div className="min-w-0">
        <h1 className="font-outfit text-[24px] leading-[1.15] font-bold text-ink md:text-[30px]">{title}</h1>
        <p className="mt-[6px] text-[13px] leading-[1.5] text-muted">{description}</p>
      </div>
      {actions ? <div className="flex w-full shrink-0 flex-wrap items-start gap-[10px] sm:w-auto">{actions}</div> : null}
    </header>
  );
}
