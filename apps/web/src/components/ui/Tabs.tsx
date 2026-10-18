import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

export interface TabItem {
  id: string;
  label: string;
  /** Contador en línea con punto: "Todos los movimientos · 12" */
  count?: number;
  /** Chip de contraste junto al rótulo (pantalla Inventario). */
  badge?: { value: string; tone: "neutral" | "alert" };
}

export interface TabsProps {
  items: TabItem[];
  active: string;
  onChange: (id: string) => void;
  /** Separación entre pestañas: 22 px en Inventario, 24 px en el resto. */
  gap?: number;
  children?: ReactNode;
}

/** Barra de pestañas con subrayado deslizante y chip con "pop" al cambiar. */
export default function Tabs({ items, active, onChange, gap = 24, children }: TabsProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  // El subrayado se mide tras el montaje y cada vez que cambia la pestaña.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    function measure() {
      const node = list?.querySelector<HTMLElement>(`[data-tab="${active}"]`);
      if (node) setIndicator({ left: node.offsetLeft, width: node.offsetWidth });
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [active, items.length]);

  return (
    <div className="flex h-[50px] shrink-0 items-center overflow-x-auto border-b border-edge px-[20px]" style={{ gap }}>
      <div ref={listRef} className="relative flex h-full shrink-0 items-center" style={{ gap }}>
        {items.map((item) => {
          const isActive = item.id === active;
          return (
            <button
              key={item.id}
              type="button"
              data-tab={item.id}
          onClick={() => onChange(item.id)}
          aria-current={isActive ? "page" : undefined}
          className={`pressable flex h-[50px] items-center gap-[8px] text-[13px] leading-[1.4] transition-colors duration-150 ${
                isActive ? "font-semibold text-ink" : "font-normal text-muted hover:text-ink"
              }`}
            >
              <span className="whitespace-nowrap">
                {item.label}
                {typeof item.count === "number" ? ` · ${item.count}` : ""}
              </span>
              {item.badge ? (
                <Badge value={item.badge.value} tone={item.badge.tone} />
              ) : null}
            </button>
          );
        })}

        {/* Subrayado deslizante: se mueve con transition en vez de saltar. */}
        {indicator && indicator.width > 0 ? (
          <span
            className="pointer-events-none absolute bottom-0 left-0 h-px bg-ink transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ transform: `translateX(${indicator.left}px)`, width: indicator.width }}
          />
        ) : null}
      </div>

      <div className="min-w-px flex-1">{children}</div>
    </div>
  );
}

/** El chip repite su animación cada vez que cambia el contador. */
function Badge({ value, tone }: { value: string; tone: "neutral" | "alert" }) {
  const [pop, setPop] = useState(false);

  useEffect(() => {
    setPop(true);
    const timer = window.setTimeout(() => setPop(false), 300);
    return () => window.clearTimeout(timer);
  }, [value]);

  return (
    <span
      className={`rounded-[5px] px-[7px] py-[3px] text-[10px] font-semibold leading-[1.4] ${
        tone === "alert" ? "bg-warn-badge text-warn-badge-text" : "bg-shell text-muted-2"
      } ${pop ? "anim-badge-pop" : ""}`}
    >
      {value}
    </span>
  );
}