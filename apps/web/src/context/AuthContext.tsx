import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ApiError, api, getToken, setToken } from "@/lib/api";
import type { SessionUser } from "@/lib/api";

interface AuthState {
  user: SessionUser | null;
  permissions: string[];
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  can: (permission: string) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

/** Lee `exp` del JWT sin verificarlo: basta para no usar un token muerto. */
function tokenExpired(): boolean {
  try {
    const parts = (getToken() ?? "").split(".");
    if (parts.length !== 3 || !parts[1]) return true;
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "="))) as {
      exp?: unknown;
    };
    return typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Restaura la sesión a partir del token guardado.
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      // Token caducado: se descarta en local sin pedir a /me (evita 401s).
      if (!getToken() || tokenExpired()) {
        setToken(null);
        setLoading(false);
        return;
      }
      try {
        const session = await api.me();
        if (cancelled) return;
        setUser(session.user);
        setPermissions(session.permissions);
      } catch {
        setToken(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const session = await api.login(email, password);
      setToken(session.token);
      setUser(session.user);
      setPermissions(session.permissions);
    } catch (cause) {
      const message = cause instanceof ApiError ? cause.message : "No se pudo iniciar sesión";
      setError(message);
      throw new Error(message);
    }
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setPermissions([]);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const session = await api.me();
      setUser(session.user);
      setPermissions(session.permissions);
    } catch {
      setToken(null);
      setUser(null);
      setPermissions([]);
    }
  }, []);

  const can = useCallback((permission: string) => permissions.includes(permission), [permissions]);

  const value = useMemo(
    () => ({ user, permissions, loading, error, login, logout, refresh, can }),
    [user, permissions, loading, error, login, logout, refresh, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return context;
}