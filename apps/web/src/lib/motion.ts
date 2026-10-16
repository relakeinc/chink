import { useEffect, useRef, useState } from "react";

/** Respeta la preferencia del sistema. Devuelve `true` si hay que reducir. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

/**
 * Cuenta de 0 a `target` para los KPI. Mantiene el formato en cada frame,
 * así que "2.486 u." se ve igual durante toda la animación.
 */
export function useCountUp(target: number, duration = 400): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(reduced ? target : 0);
  const fromRef = useRef(0);
  const frame = useRef(0);

  useEffect(() => {
    if (reduced) {
      setValue(target);
      return;
    }

    const from = fromRef.current;
    const start = performance.now();

    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1);
      // easeOutExpo: arranca rápido y frena suave.
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const next = from + (target - from) * eased;
      setValue(next);
      if (progress < 1) {
        frame.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    }

    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, duration, reduced]);

  return value;
}