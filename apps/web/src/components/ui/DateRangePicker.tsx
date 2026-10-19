import { useCallback, useEffect, useRef, useState } from "react";
import { PopoverPortal, useDismissOnOutside, usePopoverAnchor } from "./Popover";

export interface DateRange {
  from: string | null;
  to: string | null;
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  /** Etiqueta cuando no hay rango elegido. */
  placeholder?: string;
  /** Solo icono de calendario (barra móvil): abre el mismo calendario. */
  compact?: boolean;
}

const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** "9–15 oct 2026" — como el rótulo del diseño. */
export function formatRange(range: DateRange, fallback = "Todas las fechas"): string {
  if (!range.from && !range.to) return fallback;
  const parse = (value: string) => {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  };
  if (range.from && range.to) {
    const a = parse(range.from);
    const b = parse(range.to);
    const sameYear = a.getFullYear() === b.getFullYear();
    const sameMonth = sameYear && a.getMonth() === b.getMonth();
    if (sameMonth) return `${a.getDate()}–${b.getDate()} ${MONTHS_SHORT[b.getMonth()]} ${b.getFullYear()}`;
    if (sameYear) return `${a.getDate()} ${MONTHS_SHORT[a.getMonth()]} – ${b.getDate()} ${MONTHS_SHORT[b.getMonth()]} ${b.getFullYear()}`;
    return `${a.getDate()} ${MONTHS_SHORT[a.getMonth()]} ${a.getFullYear()} – ${b.getDate()} ${MONTHS_SHORT[b.getMonth()]} ${b.getFullYear()}`;
  }
  const only = parse((range.from ?? range.to)!);
  return `${only.getDate()} ${MONTHS[only.getMonth()]} ${only.getFullYear()}`;
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

/** Rango de los últimos `days` días, incluido hoy. */
function lastDays(days: number): DateRange {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  return { from: iso(start), to: iso(end) };
}

const PRESETS: { label: string; range: () => DateRange }[] = [
  { label: "Últimos 7 días", range: () => lastDays(7) },
  { label: "Últimos 30 días", range: () => lastDays(30) },
  { label: "Mes actual", range: () => ({ from: iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), to: iso(new Date()) }) },
];

/**
 * Selector de rango con calendario propio. Un `<input type="date">` pinta su
 * diálogo con el estilo del sistema operativo, que es justo lo que queremos
 * evitar.
 */
export default function DateRangePicker({ value, onChange, placeholder = "Todas las fechas", compact = false }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<DateRange>(value);
  const [cursor, setCursor] = useState(() => {
    const base = value.from ?? value.to;
    const [y, m] = (base ?? iso(new Date())).split("-").map(Number);
    return { year: y ?? new Date().getFullYear(), month: (m ?? 1) - 1 };
  });
  const panelRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const { anchorRef, anchor } = usePopoverAnchor(open);
  useDismissOnOutside(open, close, useCallback(() => [anchorRef.current, panelRef.current], [anchorRef]));

  useEffect(() => {
    if (open) setPending(value);
  }, [open, value]);

  // La barra móvil emite este evento: el calendario visible se abre.
  useEffect(() => {
    const openCalendar = () => setOpen(true);
    window.addEventListener("chink:open-range", openCalendar);
    return () => window.removeEventListener("chink:open-range", openCalendar);
  }, []);

  const today = iso(new Date());

  return (
    <div className="relative shrink-0">
      <button
        ref={anchorRef as React.RefObject<HTMLButtonElement>}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={compact ? placeholder : undefined}
        onClick={() => setOpen((prev) => !prev)}
        className={
          compact
            ? "pressable flex size-[36px] items-center justify-center rounded-[6px] border border-line-strong bg-coal text-cream transition-colors hover:bg-shell"
            : "pressable flex h-[36px] items-center gap-[10px] rounded-[6px] border border-line-strong bg-coal px-[12px] text-[12px] leading-[1.4] whitespace-nowrap text-cream transition-colors hover:bg-shell"
        }
      >
        {compact ? null : formatRange(value, placeholder)}
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true" className="shrink-0">
          <path
            d="M5 1.25V3.75M10 1.25V3.75M1.875 6.25H13.125M5 8.75H5.006M7.5 8.75H7.506M10 8.75H10.006M5 11.25H5.006M7.5 11.25H7.506M10 11.25H10.006M3.125 2.5H11.875C12.565 2.5 13.125 3.06 13.125 3.75V12.5C13.125 13.19 12.565 13.75 11.875 13.75H3.125C2.435 13.75 1.875 13.19 1.875 12.5V3.75C1.875 3.06 2.435 2.5 3.125 2.5Z"
            stroke="#F5F5EF"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {/* Portal a `body`: dentro de `main` el calendario quedaría recortado. */}
      <PopoverPortal anchor={anchor} className="flex flex-col rounded-[8px] border border-edge bg-canvas p-[12px] shadow-lg">
        <div ref={panelRef} role="dialog" aria-label="Rango de fechas" className="anim-pop min-h-0 w-[min(268px,calc(100vw-16px))] overflow-y-auto">
          {/* Cabecera del mes */}
          <div className="mb-[10px] flex items-center justify-between">
            <button
              type="button"
              aria-label="Mes anterior"
              onClick={() => setCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { ...c, month: c.month - 1 }))}
              className="flex size-[24px] items-center justify-center rounded-[4px] text-muted transition-colors hover:bg-subtle hover:text-ink"
            >
              ‹
            </button>
            <span className="text-[12px] font-semibold capitalize text-ink">
              {MONTHS[cursor.month]} {cursor.year}
            </span>
            <button
              type="button"
              aria-label="Mes siguiente"
              onClick={() => setCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { ...c, month: c.month + 1 }))}
              className="flex size-[24px] items-center justify-center rounded-[4px] text-muted transition-colors hover:bg-subtle hover:text-ink"
            >
              ›
            </button>
          </div>

          {/* Rejilla */}
          <div className="mb-[6px] grid grid-cols-7 gap-[2px] text-center">
            {WEEKDAYS.map((day) => (
              <span key={day} className="py-[2px] text-[10px] font-semibold text-muted">
                {day}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-[2px]">
            {buildCalendarDays(cursor.year, cursor.month).map((day, index) => {
              // Sin `index` todas las celdas vacías repetirían la misma clave
              // ("v-null") y React avisaría de claves duplicadas.
              if (!day) return <span key={`empty-${index}`} />;
              const key = iso(day);
              const inRange = isInRange(key, pending);
              const isEdge = key === pending.from || key === pending.to;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPending(pickRange(pending, key))}
                  className={[
                    "flex h-[28px] items-center justify-center rounded-[4px] text-[11px] leading-[1.4] transition-colors",
                    inRange ? "bg-subtle text-ink" : "text-ink hover:bg-subtle",
                    isEdge ? "bg-coal font-semibold text-cream hover:bg-coal" : "",
                    key === today ? "underline underline-offset-2" : "",
                  ].join(" ")}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          {/* Atajos y acciones */}
          <div className="mt-[10px] flex flex-wrap gap-[4px] border-t border-edge pt-[10px]">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  const range = preset.range();
                  setPending(range);
                  onChange(range);
                  setOpen(false);
                }}
                className="rounded-[5px] px-[8px] py-[4px] text-[11px] text-muted transition-colors hover:bg-subtle hover:text-ink"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="mt-[8px] flex justify-end gap-[6px]">
            <button
              type="button"
              onClick={() => {
                onChange({ from: null, to: null });
                setOpen(false);
              }}
              className="rounded-[5px] px-[8px] py-[4px] text-[11px] text-muted transition-colors hover:bg-subtle hover:text-ink"
            >
              Limpiar
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(pending);
                setOpen(false);
              }}
              className="rounded-[5px] bg-coal px-[10px] py-[4px] text-[11px] font-semibold text-cream transition-opacity hover:opacity-90"
            >
              Aplicar
            </button>
          </div>
        </div>
      </PopoverPortal>
    </div>
  );
}

/** Lista de días con huecos al principio para alinear con la semana (lunes). */
function buildCalendarDays(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // lunes = 0
  const total = daysInMonth(year, month);
  const days: (Date | null)[] = Array.from({ length: offset }, () => null);
  for (let day = 1; day <= total; day += 1) days.push(new Date(year, month, day));
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

function isInRange(key: string, range: DateRange) {
  if (!range.from || !range.to) return false;
  return key >= range.from && key <= range.to;
}

/** Primer clic fija el inicio, el segundo el final. */
function pickRange(range: DateRange, key: string): DateRange {
  if (!range.from || range.to || key < range.from) return { from: key, to: null };
  return { from: range.from, to: key };
}