import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: string;
  /** Clase de ancho, p. ej. "w-[105px]" o "flex-1 min-w-px". */
  width?: string;
  align?: "left" | "right";
  headerAlign?: "left" | "right";
  render: (row: T, index: number) => ReactNode;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowClass?: (row: T) => string;
  isSelected?: (row: T) => boolean;
  onRowClick?: (row: T) => void;
  rowHeight?: number;
  gap?: number;
}

/**
 * Tabla genérica: cabecera con separadores superior e inferior, filas con
 * borde inferior. El ancho de columna lo fija cada diseño.
 */
export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowClass,
  isSelected,
  onRowClick,
  rowHeight = 58,
  gap = 16,
}: DataTableProps<T>) {
  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-max w-full">
        <div
          className="anim-fade-up flex items-center border-t border-b border-edge px-[12px] sm:px-[20px]"
          style={{ height: 40, gap }}
        >
          {columns.map((column) => (
            <div
              key={column.key}
              className={`shrink-0 ${column.width ?? "flex-1 min-w-px"} ${
                (column.headerAlign ?? column.align) === "right" ? "text-right" : "text-left"
              }`}
            >
              <span className="text-[10px] font-medium leading-[1.4] whitespace-nowrap text-muted">{column.header}</span>
            </div>
          ))}
        </div>

        {rows.map((row, index) => (
          <div
            key={rowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={`anim-fade-up anim-delay flex items-center border-b border-edge px-[12px] sm:px-[20px] transition-colors duration-150 ${
              // La fila seleccionada es verde oscuro: el hover debe oscurecerla,
              // no aclararla con crema translúcida, para no romper el contraste.
              isSelected?.(row) ? "bg-row-selected border-[rgba(45,74,26,0.2)] hover:bg-[#151f0d]" : "hover:bg-subtle/40"
            } ${onRowClick ? "cursor-pointer" : ""} ${rowClass?.(row) ?? ""}`}
            style={{ height: rowHeight, gap, "--anim-delay": `${Math.min(index * 20, 240)}ms` } as React.CSSProperties}
          >
            {columns.map((column) => (
              <div
                key={column.key}
                className={`shrink-0 ${column.width ?? "flex-1 min-w-px"} ${
                  column.align === "right" ? "flex items-center justify-end text-right" : ""
                }`}
              >
                {column.render(row, index)}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Encabezado de tabla del diseño: DM Sans Medium 10px en `muted`. */
export function Th({ children, align = "left" }: { children: ReactNode; align?: "left" | "right" }) {
  return (
    <span className={`text-[10px] font-medium leading-[1.4] text-muted ${align === "right" ? "text-right" : ""}`}>
      {children}
    </span>
  );
}
