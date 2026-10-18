export interface BarPoint {
  day: string;
  entries: number;
  exits: number;
}

interface BarChartProps {
  data: BarPoint[];
  /** Techo de la escala, en unidades. */
  max: number;
  height?: number;
}

/**
 * Gráfico de barras duales (entradas/salidas) con la escala a la izquierda,
 * tres líneas de referencia y las barras redondeadas solo por arriba.
 */
export default function BarChart({ data, max, height = 190 }: BarChartProps) {
  const ticks = [max, max / 2, 0];
  const totalEntries = data.reduce((acc, d) => acc + d.entries, 0);
  const totalExits = data.reduce((acc, d) => acc + d.exits, 0);

  return (
    <div className="flex flex-col gap-[12px]">
      {/* Leyenda */}
      <div className="flex items-center gap-[20px]">
        <span className="flex items-center gap-[6px]">
          <span className="size-[8px] rounded-[2px] bg-accent" />
          <span className="text-[11px] leading-[1.4] text-muted">Entradas · {totalEntries} u.</span>
        </span>
        <span className="flex items-center gap-[6px]">
          <span className="size-[8px] rounded-[2px] bg-shell" />
          <span className="text-[11px] leading-[1.4] text-muted">Salidas · {totalExits} u.</span>
        </span>
        <span className="text-[10px] leading-[1.4] text-muted">Unidades</span>
      </div>

      {/* Área de trazado */}
      <div className="flex gap-[16px]">
        <div className="flex w-[20px] shrink-0 flex-col justify-between text-[10px] leading-[1.4] text-muted" style={{ height }}>
          {ticks.map((tick) => (
            <span key={tick}>{Math.round(tick)}</span>
          ))}
        </div>

        <div className="relative min-w-px flex-1">
          {[0, 0.5, 1].map((ratio) => (
            <span
              key={ratio}
              className="anim-fade-up absolute left-0 w-full bg-[rgba(51,56,48,0.2)]"
              style={{ height: 1, top: `${ratio * 100}%`, "--anim-delay": `${ratio * 60}ms` } as React.CSSProperties}
            />
          ))}

          <div className="relative flex items-stretch" style={{ height }}>
            {data.map((point, index) => (
              // La etiqueta no es clave única por sí sola (dos días distintos
              // podrían formatear igual); se combina con el índice.
              <div key={`${point.day}-${index}`} className="flex min-w-px flex-1 flex-col items-center justify-end gap-[8px]">
                <div className="flex items-end gap-[8px]" style={{ height }}>
                  <span
                    className="anim-grow-y anim-delay w-[25px] rounded-t-[3px] bg-accent"
                    style={{ height: Math.max((point.entries / max) * height, 1), "--anim-delay": `${120 + index * 45}ms` } as React.CSSProperties}
                  />
                  <span
                    className="anim-grow-y anim-delay w-[25px] rounded-t-[3px] bg-shell"
                    style={{ height: Math.max((point.exits / max) * height, 1), "--anim-delay": `${150 + index * 45}ms` } as React.CSSProperties}
                  />
                </div>
                <span
                  className={`anim-fade-up anim-delay text-[10px] leading-[1.4] text-muted ${index % 2 === 1 ? "hidden md:block" : ""}`}
                  style={{ "--anim-delay": `${200 + index * 45}ms` } as React.CSSProperties}
                >
                  {point.day}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}