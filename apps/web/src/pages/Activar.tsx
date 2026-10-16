import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api, setToken } from "@/lib/api";
import { Button } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";

/**
 * Activación de invitados: entra con la clave temporal y fija la definitiva.
 * Sin este paso no hay acceso al resto de la app (lo impone RequireAuth).
 */
export default function Activar() {
  const { user, loading, refresh } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!loading && !user) {
    return <Navigate to="/login" replace />;
  }

  if (user && user.status === "ACTIVE") {
    return <Navigate to="/inicio" replace />;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (next.length < 8) {
      setError("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (next !== repeat) {
      setError("La confirmación no coincide.");
      return;
    }
    setSaving(true);
    try {
      const session = await api.activate({ currentPassword: current, newPassword: next });
      setToken(session.token);
      await refresh();
      navigate("/inicio", { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo activar la cuenta");
    } finally {
      setSaving(false);
    }
  }

  const fieldClass =
    "h-[38px] rounded-[6px] border border-[rgba(51,56,48,0.2)] bg-canvas px-[12px] text-[12px] text-ink outline-none focus:border-ink";

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-[20px]">
      <div className="w-full max-w-[420px]">
        <div className="mb-[28px] flex items-center gap-[10px]">
          <Icon name="brand-chink" />
          <span className="font-outfit text-[22px] leading-none font-bold text-ink">chink</span>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-[18px] rounded-[10px] bg-subtle p-[28px]">
          <div>
            <h1 className="font-outfit text-[22px] leading-[1.3] font-semibold text-ink">Activa tu cuenta</h1>
            <p className="mt-[6px] text-[13px] leading-[1.5] text-muted">
              Hola{user ? ` ${user.name.split(" ")[0]}` : ""}, entra con la clave temporal del correo y elige tu contraseña definitiva.
            </p>
          </div>

          <label className="flex flex-col gap-[6px]">
            <span className="text-[11px] font-medium text-ink">Clave temporal</span>
            <input type="password" autoComplete="current-password" required value={current} onChange={(event) => setCurrent(event.target.value)} className={fieldClass} />
          </label>

          <label className="flex flex-col gap-[6px]">
            <span className="text-[11px] font-medium text-ink">Nueva contraseña</span>
            <input type="password" autoComplete="new-password" required value={next} onChange={(event) => setNext(event.target.value)} className={fieldClass} />
          </label>

          <label className="flex flex-col gap-[6px]">
            <span className="text-[11px] font-medium text-ink">Repetir nueva contraseña</span>
            <input type="password" autoComplete="new-password" required value={repeat} onChange={(event) => setRepeat(event.target.value)} className={fieldClass} />
          </label>

          {error ? <p className="text-[12px] text-warn">{error}</p> : null}

          <Button variant="primary" height={38} type="submit" disabled={saving} className="mt-[4px] w-full">
            {saving ? "Activando…" : "Activar cuenta"}
          </Button>
        </form>
      </div>
    </div>
  );
}
