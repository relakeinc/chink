import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { api, setToken } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/primitives";
import AuthSplit from "@/components/layout/AuthSplit";

const fieldClass =
  "h-[38px] rounded-[6px] border border-[rgba(51,56,48,0.2)] bg-canvas px-[12px] text-[12px] text-ink outline-none focus:border-ink";

/** Registro público: crea cuenta ACTIVA con rol Consulta. Sin invitaciones. */
export default function Registro() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  if (user) return <Navigate to="/inicio" replace />;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (name.trim().length < 2) {
      setError("Indica tu nombre.");
      return;
    }
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    setSending(true);
    try {
      const session = await api.register({ name: name.trim(), email: email.trim(), password });
      setToken(session.token);
      await refresh();
      navigate("/inicio", { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo crear la cuenta");
    } finally {
      setSending(false);
    }
  }

  return (
    <AuthSplit
      title="Crea tu cuenta"
      description="Empieza a consultar tu inventario en segundos, sin invitaciones."
      asideCta={{ label: "Entrar", to: "/login" }}
    >
      <form onSubmit={submit} className="flex flex-col gap-[14px] rounded-[10px] bg-subtle p-[24px]">
        {error ? <p className="text-[12px] text-warn">{error}</p> : null}
        <label className="flex flex-col gap-[6px]">
          <span className="text-[11px] font-medium text-ink">Nombre</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Tu nombre" autoComplete="name" required minLength={2} className={fieldClass} />
        </label>
        <label className="flex flex-col gap-[6px]">
          <span className="text-[11px] font-medium text-ink">Correo electrónico</span>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nombre@empresa.com" autoComplete="email" required className={fieldClass} />
        </label>
        <label className="flex flex-col gap-[6px]">
          <span className="text-[11px] font-medium text-ink">Contraseña</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo 8 caracteres" autoComplete="new-password" required minLength={8} className={fieldClass} />
        </label>
        <Button variant="primary" height={38} type="submit" disabled={sending} className="mt-[4px] w-full">
          {sending ? "Creando…" : "Crear cuenta"}
        </Button>
        <p className="text-center text-[12px] text-muted">
          ¿Ya tienes cuenta?{" "}
          <Link to="/login" className="font-semibold text-ink hover:underline">
            Entra aquí
          </Link>
        </p>
      </form>
    </AuthSplit>
  );
}
