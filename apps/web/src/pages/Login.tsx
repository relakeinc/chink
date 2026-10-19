import { useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/primitives";
import AuthSplit from "@/components/layout/AuthSplit";

const DEMO_ACCOUNTS = [
  { email: "lucia@chink.es", role: "Administradora" },
  { email: "diego@chink.es", role: "Gestor" },
  { email: "ana@chink.es", role: "Operador" },
  { email: "marta@chink.es", role: "Consulta" },
];

const DEMO_PASSWORD = "chink2026";

/** Las cuentas de ejemplo solo existen en desarrollo: en producción van ocultas. */
const SHOW_DEMO = import.meta.env.DEV;

const fieldClass =
  "h-[38px] rounded-[6px] border border-edge bg-canvas px-[12px] text-[12px] text-ink outline-none focus:border-ink";

export default function Login() {
  const { user, login, error } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState(SHOW_DEMO ? "lucia@chink.es" : "");
  const [password, setPassword] = useState(SHOW_DEMO ? DEMO_PASSWORD : "");
  const [sending, setSending] = useState(false);

  if (user) {
    if (user.status === "PENDING") {
      return <Navigate to="/activar" replace />;
    }
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== "/login" ? from : "/inicio"} replace />;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSending(true);
    try {
      await login(email, password);
    } catch {
      /* el error se muestra desde el contexto */
    } finally {
      setSending(false);
    }
  }

  return (
    <AuthSplit
      title="Inicia sesión"
      description="Entra con tu cuenta para acceder al inventario de tu espacio de trabajo."
      asideCta={{ label: "Crear cuenta", to: "/registro" }}
    >
      <form onSubmit={submit} className="flex flex-col gap-[14px] rounded-[10px] bg-subtle p-[24px]">
        {error ? <p className="text-[12px] text-warn">{error}</p> : null}
        <label className="flex flex-col gap-[6px]">
          <span className="text-[11px] font-medium text-ink">Correo electrónico</span>
          <input type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="next" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} className={fieldClass} />
        </label>
        <label className="flex flex-col gap-[6px]">
          <span className="text-[11px] font-medium text-ink">Contraseña</span>
          <input type="password" enterKeyHint="go" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className={fieldClass} />
        </label>
        <Button variant="primary" height={38} type="submit" disabled={sending} className="mt-[4px] w-full">
          {sending ? "Entrando…" : "Entrar"}
        </Button>
        <p className="text-center text-[12px] text-muted">
          ¿Sin cuenta?{" "}
          <Link to="/registro" className="font-semibold text-ink hover:underline">
            Crea una aquí
          </Link>
        </p>
      </form>

      {SHOW_DEMO ? (
        <div className="mt-[16px] rounded-[8px] bg-subtle p-[16px]">
          <p className="text-[11px] font-semibold text-ink">Cuentas de ejemplo</p>
          <p className="mt-[4px] text-[10px] leading-[1.4] text-muted">
            Contraseña para todas: <code className="font-semibold text-ink">{DEMO_PASSWORD}</code>
          </p>
          <div className="mt-[10px] flex flex-wrap gap-[6px]">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                onClick={() => {
                  setEmail(account.email);
                  setPassword(DEMO_PASSWORD);
                }}
                className="rounded-[5px] bg-canvas px-[8px] py-[4px] text-[10px] text-muted hover:text-ink"
              >
                {account.role}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </AuthSplit>
  );
}
