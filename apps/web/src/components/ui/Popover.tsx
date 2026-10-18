import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/* ------------------------------------------------------------------ Capas */
/*
 * Escala única de capas. El contenido scrollea dentro de `main`, y cualquier
 * `position: absolute` dentro de él queda recortado por `overflow-y-auto`, por
 * mucho `z-index` que tenga. Por eso todo lo que flota (filtros, calendarios,
 * columnas) se renderiza por portal en `body` con `position: fixed`, por encima
 * de los modales y por debajo de los avisos.
 */
export const LAYERS = {
  content: 30,
  modal: 60,
  popover: 70,
  toast: 80,
} as const;

interface Anchor {
  top: number;
  left: number;
  right: number;
  minWidth: number;
  maxHeight: number;
}

export type PopoverAlign = "left" | "right";

const GAP = 4;
const MARGIN = 8;

/**
 * Portal genérico para capas de pantalla completa (hojas, cajones): las saca
 * del apilado del ancestro (p. ej. un header `fixed` con z-index propio) para
 * que siempre queden por encima del contenido.
 */
export function OverlayPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);
  if (typeof document === "undefined" || !mounted) return null;
  return createPortal(<>{children}</>, document.body);
}

/**
 * Mide el disparador y devuelve la posición `fixed` del panel, corrigiendo el
 * desbordamiento horizontal y volteando arriba cuando no cabe abajo.
 * Con `side: "right"` el panel se ancla a la derecha del disparador, como el
 * conmutador de espacio de ClickUp.
 */
export function usePopoverAnchor(open: boolean, opts?: { side?: "below" | "right" }) {
  const anchorRef = useRef<HTMLElement | null>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  const measure = useCallback(() => {
    const element = anchorRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    if (opts?.side === "right") {
      setAnchor({
        top: Math.max(MARGIN, rect.top),
        left: rect.right + 8,
        right: rect.right,
        minWidth: 0,
        maxHeight: Math.max(160, window.innerHeight - Math.max(MARGIN, rect.top) - MARGIN),
      });
      return;
    }
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const flip = spaceBelow < 200 && spaceAbove > spaceBelow;
    const space = flip ? spaceAbove : spaceBelow;
    setAnchor({
      top: flip ? rect.top - GAP : rect.bottom + GAP,
      left: rect.left,
      right: rect.right,
      minWidth: rect.width,
      maxHeight: Math.max(160, Math.min(420, space - GAP - MARGIN)),
    });
  }, [opts?.side]);

  useLayoutEffect(() => {
    if (!open) {
      setAnchor(null);
      return;
    }
    measure();
    window.addEventListener("resize", measure);
    // `capture` para seguir el scroll de cualquier contenedor ancestro.
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, measure]);

  return { anchorRef, anchor, measure };
}

/** Cierra el panel al pulsar fuera del disparador **y** del propio panel. */
export function useDismissOnOutside(open: boolean, onClose: () => void, elements: () => (HTMLElement | null)[]) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (elements().some((element) => element?.contains(target))) return;
      onCloseRef.current();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, elements]);
}

interface PopoverPortalProps {
  anchor: Anchor | null;
  align?: PopoverAlign;
  children: React.ReactNode;
  className?: string;
}

/**
 * Renderiza `children` en `document.body` con posición `fixed`. Es lo que
 * permite que un desplegable escape del recorte de `main` y del apilado de
 * las tarjetas.
 */
export function PopoverPortal({ anchor, align = "left", children, className }: PopoverPortalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Corrige el desborde lateral una vez montado, cuando ya se conoce el ancho.
  // También permite alinear el borde derecho del panel con el disparador.
  useLayoutEffect(() => {
    if (!anchor || !panelRef.current) return;
    const width = panelRef.current.offsetWidth;
    if (align === "right") {
      panelRef.current.style.left = `${Math.max(MARGIN, Math.min(anchor.right - width, window.innerWidth - width - MARGIN))}px`;
      return;
    }
    const overflowRight = anchor.left + width - (window.innerWidth - MARGIN);
    if (overflowRight > 0) {
      panelRef.current.style.left = `${Math.max(MARGIN, anchor.left - overflowRight)}px`;
    }
  }, [anchor, align]);

  if (!anchor || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      role="presentation"
      className={className}
      style={{
        position: "fixed",
        top: anchor.top,
        left: anchor.left,
        minWidth: anchor.minWidth,
        maxHeight: anchor.maxHeight,
        zIndex: LAYERS.popover,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}