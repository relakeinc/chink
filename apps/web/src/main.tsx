import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/lib/theme";
import AppLayout from "@/components/layout/AppLayout";
import RequireAuth from "@/components/layout/RequireAuth";
import Login from "@/pages/Login";
import Registro from "@/pages/Registro";
import Activar from "@/pages/Activar";
import Inicio from "@/pages/Inicio";
import Inventario from "@/pages/Inventario";
import Movimientos from "@/pages/Movimientos";
import Almacenes from "@/pages/Almacenes";
import Reportes from "@/pages/Reportes";
import Equipo from "@/pages/Equipo";
import Configuracion from "@/pages/Configuracion";
import ToastHost from "@/components/toast/ToastHost";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import "super-beautiful-toast/style.css";
import "@/styles/index.css";

const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  { path: "/registro", element: <Registro /> },
  {
    element: <RequireAuth />,
    children: [
      { path: "activar", element: <Activar /> },
      {
        path: "/",
        element: <AppLayout />,
        children: [
          { index: true, element: <Inicio /> },
          { path: "inicio", element: <Inicio /> },
          { path: "inventario", element: <Inventario /> },
          { path: "movimientos", element: <Movimientos /> },
          { path: "almacenes", element: <Almacenes /> },
          { path: "reportes", element: <Reportes /> },
          { path: "equipo", element: <Equipo /> },
          { path: "configuracion", element: <Configuracion /> },
          { path: "*", element: <Inicio /> },
        ],
      },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <ThemeProvider>
        <ErrorBoundary>
          <RouterProvider router={router} />
          <ToastHost />
        </ErrorBoundary>
      </ThemeProvider>
    </AuthProvider>
  </StrictMode>,
);