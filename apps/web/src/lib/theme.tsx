import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export type ThemeSetting = "light" | "halloween" | "auto";
export type EffectiveTheme = "light" | "halloween";

/** Temporada Halloween: 15 de octubre → 5 de noviembre (inclusive). */
export function inHalloweenSeason(now: Date = new Date()): boolean {
  const m = now.getMonth() + 1;
  const d = now.getDate();
  return (m === 10 && d >= 15) || (m === 11 && d <= 5);
}

export function resolveTheme(setting: ThemeSetting | undefined, now: Date = new Date()): EffectiveTheme {
  if (setting === "halloween") return "halloween";
  if (setting === "light") return "light";
  return inHalloweenSeason(now) ? "halloween" : "light";
}

interface ThemeApi {
  /** Valor guardado en el espacio (o "auto" si no hay sesión). */
  setting: ThemeSetting;
  /** Tema aplicado en el DOM. */
  theme: EffectiveTheme;
  /** Guarda la preferencia del espacio y la aplica. */
  setTheme: (next: ThemeSetting) => Promise<void>;
  refresh: () => Promise<void>;
}

const ThemeContext = createContext<ThemeApi>({
  setting: "auto",
  theme: "light",
  setTheme: async () => {},
  refresh: async () => {},
});

export function useTheme(): ThemeApi {
  return useContext(ThemeContext);
}

/**
 * Aplica `data-theme` en <html> según la preferencia del espacio.
 * Sin sesión (login/registro) usa el modo automático por fechas.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [setting, setSetting] = useState<ThemeSetting>("auto");
  const [theme, setEffective] = useState<EffectiveTheme>(() => resolveTheme("auto"));

  const refresh = useCallback(async () => {
    if (!user) {
      setSetting("auto");
      return;
    }
    try {
      const res = await api.getSettings();
      const next = (res.data?.theme ?? "auto") as ThemeSetting;
      setSetting(next);
    } catch {
      /* Sin ajustes: se mantiene el automático. */
    }
  }, [user]);

  useEffect(() => {
    if (theme === "halloween") document.documentElement.dataset.theme = "halloween";
    else delete document.documentElement.dataset.theme;
  }, [theme]);

  useEffect(() => {
    setEffective(resolveTheme(setting));
  }, [setting]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onUpdate = () => void refresh();
    window.addEventListener("chink:workspace-updated", onUpdate);
    return () => window.removeEventListener("chink:workspace-updated", onUpdate);
  }, [refresh]);

  const setTheme = useCallback(
    async (next: ThemeSetting) => {
      await api.updateSettings({ theme: next });
      setSetting(next);
      window.dispatchEvent(new Event("chink:workspace-updated"));
    },
    [],
  );

  return <ThemeContext.Provider value={{ setting, theme, setTheme, refresh }}>{children}</ThemeContext.Provider>;
}
