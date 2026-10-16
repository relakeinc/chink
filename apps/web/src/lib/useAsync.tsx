import { useCallback, useEffect, useRef, useState } from "react";

export interface AsyncState<T> {
  data: T | null;
  /** Solo `true` en la primera carga: los refrescos posteriores no parpadean. */
  loading: boolean;
  /** `true` mientras hay una petición en vuelo con datos ya en pantalla. */
  refreshing: boolean;
  error: string | null;
  reload: () => Promise<void>;
  setData: (value: T | null) => void;
}

/**
 * Carga asíncrona sencilla con recarga manual.
 *
 * Clave para que la interfaz no parpadee: una vez hay datos, las peticiones
 * siguientes se marcan como `refreshing` y la vista conserva el contenido
 * anterior en lugar de sustituirlo por un esqueleto.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasData = useRef(false);

  const run = useCallback(async () => {
    if (hasData.current) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const result = await fn();
      setData(result);
      hasData.current = true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Error al cargar los datos");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    void run();
  }, [run]);

  return { data, loading, refreshing, error, reload: run, setData };
}

/**
 * Retrasa la propagación de un valor. Se usa en los buscadores para no
 * lanzar una petición por cada tecla.
 */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

/* ------------------------------------------------------------ Esqueletos */

type SkeletonVariant = "kpi" | "table" | "card" | "text";

/** Silueta de carga con la misma forma que el contenido real: evita saltos. */
export function Skeleton({ variant = "card", className = "" }: { variant?: SkeletonVariant; className?: string }) {
  if (variant === "kpi") {
    return (
      <div className={`flex min-h-[87px] items-start rounded-[10px] bg-canvas px-[22px] py-[18px] ${className}`}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`flex min-w-px flex-1 flex-col gap-[10px] ${i > 0 ? "pl-[20px]" : ""}`}>
            <div className="skeleton h-[9px] w-[70px] rounded-[3px]" />
            <div className="skeleton h-[24px] w-[110px] rounded-[4px]" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "table") {
    return (
      <div className={`rounded-[10px] bg-canvas p-[16px] ${className}`}>
        <div className="mb-[14px] flex gap-[8px]">
          <div className="skeleton h-[36px] w-[300px] rounded-[6px]" />
          <div className="skeleton h-[36px] w-[120px] rounded-[6px]" />
          <div className="skeleton h-[36px] w-[120px] rounded-[6px]" />
        </div>
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <div key={row} className="flex items-center gap-[16px] border-b border-[rgba(51,56,48,0.2)] py-[16px]">
            <div className="skeleton size-[34px] rounded-[6px]" />
            <div className="skeleton h-[12px] flex-1 rounded-[3px]" />
            <div className="skeleton h-[12px] w-[90px] rounded-[3px]" />
            <div className="skeleton h-[12px] w-[60px] rounded-[3px]" />
            <div className="skeleton h-[12px] w-[80px] rounded-[3px]" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "text") {
    return <div className={`skeleton h-[120px] rounded-[10px] ${className}`} />;
  }

  return (
    <div className={`flex flex-col gap-[14px] rounded-[10px] bg-canvas p-[20px] ${className}`}>
      <div className="skeleton h-[17px] w-[180px] rounded-[4px]" />
      <div className="skeleton h-[11px] w-[240px] rounded-[3px]" />
      <div className="skeleton h-[120px] w-full rounded-[6px]" />
    </div>
  );
}

export function LoadingBlock({ label, variant = "card", className = "" }: { label?: string; variant?: SkeletonVariant; className?: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label ?? "Cargando"} className={className}>
      <Skeleton variant={variant} />
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="anim-fade-up flex min-h-[120px] flex-col items-center justify-center gap-[10px] rounded-[10px] bg-canvas">
      <span className="text-[13px] text-warn">{message}</span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-[5px] px-[8px] py-[4px] text-[12px] font-semibold text-ink transition-colors hover:bg-subtle"
        >
          Reintentar
        </button>
      ) : null}
    </div>
  );
}