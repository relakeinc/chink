import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Icon } from "./Icon";
import { Button } from "./primitives";
import { PopoverPortal, useDismissOnOutside, usePopoverAnchor } from "./Popover";

/* -------------------------------------------------------------- Búsqueda */

/** Evento global para sincronizar buscadores entre la barra móvil y la página. */
const SEARCH_EVENT = "chink:search";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Ancho en px; el diseño usa 272 en Inventario y 300 en el resto. */
  width?: number;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  /** Ocupa todo el ancho disponible (barra móvil). */
  fluid?: boolean;
}

export function SearchInput({ value, onChange, placeholder, width = 300, inputRef, fluid = false }: SearchInputProps) {
  const instanceId = useId();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;

  // La lupa global del TopBar emite este evento para enfocar la búsqueda visible.
  useEffect(() => {
    const focus = () => inputRef?.current?.focus();
    window.addEventListener("chink:focus-search", focus);
    return () => window.removeEventListener("chink:focus-search", focus);
  }, [inputRef]);

  // Sincronización entre instancias (barra móvil <-> página): cada edición se
  // emite con el id propio y cada instancia adopta solo las ajenas.
  useEffect(() => {
    const adopt = (event: Event) => {
      const detail = (event as CustomEvent<{ value?: unknown; source?: unknown }>).detail;
      if (!detail || detail.source === instanceId || typeof detail.value !== "string") return;
      if (detail.value !== valueRef.current) onChangeRef.current(detail.value);
    };
    window.addEventListener(SEARCH_EVENT, adopt as EventListener);
    return () => window.removeEventListener(SEARCH_EVENT, adopt as EventListener);
  }, [instanceId]);

  function handleChange(next: string) {
    onChange(next);
    window.dispatchEvent(new CustomEvent(SEARCH_EVENT, { detail: { value: next, source: instanceId } }));
  }

  // Al montar, publica el valor actual para alinear a las demás instancias.
  useEffect(() => {
    if (valueRef.current) {
      window.dispatchEvent(new CustomEvent(SEARCH_EVENT, { detail: { value: valueRef.current, source: instanceId } }));
    }
    // Solo al montar: el resto del tiempo manda lo que escribe el usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId]);

  return (
    <div
      className="flex max-w-full shrink-0 items-center gap-[8px] rounded-[6px] border border-[rgba(51,56,48,0.2)] bg-subtle px-[12px]"
      style={fluid ? { height: 36, width: "100%" } : { height: 36, width }}
    >
      <Icon name="search-sm" size={14} />
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        placeholder={placeholder}
        className="min-w-px flex-1 bg-transparent text-[12px] leading-[1.4] text-ink outline-none placeholder:text-muted"
      />
      <kbd className="hidden shrink-0 text-[10px] leading-[1.4] text-line-strong sm:block">⌘ K</kbd>
    </div>
  );
}

/* --------------------------------------------------------------- Filtros */

export interface FilterOption {
  value: string;
  label: string;
}

interface FilterSelectProps {
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
  /** Etiqueta mostrada cuando no hay ninguna opción seleccionada. */
  placeholder?: string;
  width?: number;
  /** `dark` para los filtros sobre fondo claro; `light` para los formularios. */
  tone?: "dark" | "light";
  /** Opción de "todos" que se puede volver a elegir para limpiar el filtro. */
  allowClear?: boolean;
}

const CHEVRON_DARK = "chevron-down-filter";
const CHEVRON_LIGHT = "chevron-down-ink";

/**
 * Lista desplegable propia. Un `<select>` nativo dibuja su lista con el
 * estilo del sistema operativo (no estilizable), así que se construye con un
 * botón + listbox para respetar el diseño.
 *
 * El panel se monta por portal en `body`: dentro de `main` (que scrollea con
 * `overflow-y-auto`) quedaría recortado y por debajo de las tarjetas.
 */
export function FilterSelect({
  label,
  options,
  value,
  onChange,
  placeholder,
  width,
  tone = "dark",
  allowClear = true,
}: FilterSelectProps) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const panelRef = useRef<HTMLDivElement>(null);
  const { anchorRef, anchor } = usePopoverAnchor(open);
  useDismissOnOutside(open, close, useCallback(() => [anchorRef.current, panelRef.current], [anchorRef]));

  const selected = options.find((option) => option.value === value);
  const display = selected?.label ?? placeholder ?? label;
  const dark = tone === "dark";

  return (
    <div className="relative shrink-0">
      <button
        ref={anchorRef as React.RefObject<HTMLButtonElement>}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((prev) => !prev)}
        style={width ? { width } : undefined}
        className={`pressable flex h-[36px] items-center gap-[10px] rounded-[6px] border px-[12px] text-[12px] leading-[1.4] transition-colors ${
          dark
            ? "border-line-strong bg-ink text-canvas hover:bg-shell"
            : "border-[rgba(51,56,48,0.2)] bg-subtle text-ink hover:bg-line"
        }`}
      >
        <span className="min-w-0 truncate">{display}</span>
        {/* El tono claro necesita tinta: un chevron crema sobre `bg-subtle` es
            ilegible y además falla el contraste. */}
        <Icon name={dark ? CHEVRON_DARK : CHEVRON_LIGHT} size={12} className="ml-auto shrink-0" />
      </button>

      <PopoverPortal anchor={anchor} className="flex flex-col overflow-hidden rounded-[8px] border border-[rgba(51,56,48,0.2)] bg-canvas p-[4px] shadow-lg">
        <div ref={panelRef} role="listbox" aria-label={label} className="anim-pop min-h-0 overflow-y-auto">
          {allowClear ? (
            <OptionRow
              active={value === ""}
              label={placeholder ?? label}
              onClick={() => {
                onChange("");
                close();
              }}
            />
          ) : null}

          {options.map((option) => (
            <OptionRow
              key={option.value}
              active={option.value === value}
              label={option.label}
              onClick={() => {
                onChange(option.value);
                close();
              }}
            />
          ))}
        </div>
      </PopoverPortal>
    </div>
  );
}

function OptionRow({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onClick}
      className={`pressable flex w-full items-center justify-between gap-[10px] rounded-[5px] px-[8px] py-[6px] text-left text-[12px] leading-[1.4] transition-colors ${
        active ? "bg-subtle text-ink" : "text-ink hover:bg-subtle active:bg-subtle"
      }`}
    >
      <span className="truncate">{label}</span>
      {active ? <Icon name="check" size={12} /> : null}
    </button>
  );
}

/* -------------------------------------------------------- Menú de columnas */

interface ColumnMenuItem {
  id: string;
  label: string;
}

interface ColumnMenuProps {
  items: ColumnMenuItem[];
  hiddenIds: Set<string>;
  onToggle: (id: string) => void;
  label?: string;
}

/**
 * Menú de columnas con el mismo portal que los filtros. Los menús antiguos
 * eran `absolute` dentro de una tarjeta con `overflow-hidden`: se recortaban
 * o quedaban detrás del contenido al hacer scroll.
 */
export function ColumnMenu({ items, hiddenIds, onToggle, label = "Columnas" }: ColumnMenuProps) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const panelRef = useRef<HTMLDivElement>(null);
  const { anchorRef, anchor } = usePopoverAnchor(open);
  useDismissOnOutside(open, close, useCallback(() => [anchorRef.current, panelRef.current], [anchorRef]));

  return (
    <span ref={anchorRef as React.RefObject<HTMLSpanElement>} className="inline-flex shrink-0">
      <Button
        variant="dark"
        icon="columns-3"
        iconSize={14}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        {label}
      </Button>

      <PopoverPortal
        anchor={anchor}
        align="right"
        className="flex flex-col overflow-hidden rounded-[8px] border border-[rgba(51,56,48,0.2)] bg-canvas p-[6px] shadow-lg"
      >
        <div ref={panelRef} role="menu" aria-label={label} className="anim-pop flex min-h-0 w-[190px] flex-col gap-[2px] overflow-y-auto">
          {items.map((item) => {
            const hidden = hiddenIds.has(item.id);
            return (
              <button
                key={item.id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={!hidden}
                onClick={() => onToggle(item.id)}
                className="pressable flex items-center gap-[8px] rounded-[5px] px-[8px] py-[6px] text-left text-[12px] leading-[1.4] text-ink transition-colors hover:bg-subtle active:bg-subtle"
              >
                <span
                  className={`flex size-[14px] shrink-0 items-center justify-center rounded-[3px] border ${
                    hidden ? "border-[rgba(65,72,58,0.2)] bg-subtle" : "border-accent bg-accent"
                  }`}
                >
                  {hidden ? null : <Icon name="check" size={10} />}
                </span>
                {item.label}
              </button>
            );
          })}
        </div>
      </PopoverPortal>
    </span>
  );
}

/* ----------------------------------------------------------- Paginación */

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, totalPages, onChange }: PaginationProps) {
  return (
    <div className="flex shrink-0 items-center gap-[10px]">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="pressable text-[11px] leading-[1.4] text-line-strong transition-colors hover:text-ink disabled:opacity-40"
      >
        Anterior
      </button>
      <span className="flex size-[26px] items-center justify-center rounded-[5px] border border-line-strong bg-subtle text-[11px] leading-[1.4] text-ink">
        {page}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        className="pressable text-[11px] leading-[1.4] text-line-strong transition-colors hover:text-ink disabled:opacity-40"
      >
        Siguiente
      </button>
    </div>
  );
}

/* --------------------------------------------------------- Atajo ⌘ + K */

export function useCommandK(ref: React.RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        ref.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [ref]);
}