import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export type ThemeSetting = "light" | "dark";
export type EffectiveTheme = ThemeSetting;

export function resolveTheme(setting: ThemeSetting | undefined): EffectiveTheme { return setting === "dark" ? "dark" : "light"; }

interface ThemeApi {
  /** Valor guardado en el espacio. */
  setting: ThemeSetting;
  /** Tema aplicado en el DOM. */
  theme: EffectiveTheme;
  /** Guarda la preferencia del espacio y la aplica. */
  setTheme: (next: ThemeSetting) => Promise<void>;
  refresh: () => Promise<void>;
}

const ThemeContext = createContext<ThemeApi>({
  setting: "light",
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
  const [setting, setSetting] = useState<ThemeSetting>("light");
  const [theme, setEffective] = useState<EffectiveTheme>(() => resolveTheme("light"));

  const refresh = useCallback(async () => {
    if (!user) {
      setSetting("light");
      return;
    }
    try {
      const res = await api.getSettings();
      const next = (res.data?.theme === "dark" ? "dark" : "light") as ThemeSetting;
      setSetting(next);
    } catch {
      /* Sin ajustes: se mantiene el automático. */
    }
  }, [user]);

  useEffect(() => {
    if (theme === "dark") document.documentElement.dataset.theme = "dark";
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
