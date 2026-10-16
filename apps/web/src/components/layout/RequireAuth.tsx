import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <span className="text-[13px] text-muted">Cargando…</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // Invitado sin activar: solo puede estar en /activar hasta poner su clave.
  if (user.status === "PENDING" && location.pathname !== "/activar") {
    return <Navigate to="/activar" replace />;
  }

  return <Outlet />;
}