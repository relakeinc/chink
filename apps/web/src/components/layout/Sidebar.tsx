import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Icon } from "@/components/ui/Icon";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/useAsync";
import { PopoverPortal, useDismissOnOutside, usePopoverAnchor } from "@/components/ui/Popover";
import { onWorkspaceUpdated, workspaceMark } from "@/lib/workspace";

interface NavItem {
  to: string;
  label: string;
  icon: string;
  /** Clave de permiso necesaria; si falta, el ítem no se muestra. */
  permission?: string;
  /** El diseño usa 8 px en "Configuración" (y no 10 px como el resto). */
  smallLabel?: boolean;
}

const MAIN_NAV: NavItem[] = [
  { to: "/inicio", label: "Inicio", icon: "nav-inicio" },
  { to: "/inventario", label: "Inventario", icon: "nav-inventario", permission: "consult" },
  { to: "/movimientos", label: "Movimientos", icon: "nav-movimientos", permission: "consult" },
  { to: "/almacenes", label: "Almacenes", icon: "nav-almacenes", permission: "consult" },
  { to: "/reportes", label: "Reportes", icon: "nav-reportes", permission: "report" },
];

const ADMIN_NAV: NavItem[] = [
  { to: "/equipo", label: "Equipo", icon: "nav-equipo", permission: "admin" },
  { to: "/configuracion", label: "Configuración", icon: "nav-config", permission: "admin", smallLabel: true },
];

/**
 * Rail lateral compacto estilo ClickUp: avatar del espacio con desplegable
 * funcional, iconos de 24 px con rótulo y Administración anclada abajo.
 */
export default function Sidebar() {
  const { can, logout } = useAuth();
  const navigate = useNavigate();
  const visibleMain = MAIN_NAV.filter((item) => !item.permission || can(item.permission));
  const visibleAdmin = ADMIN_NAV.filter((item) => !item.permission || can(item.permission));

  // El conmutador refleja el espacio real: nombre y color vienen de settings.
  const settings = useAsync(() => api.getSettings(), []);
  const spaceName = settings.data?.data?.spaceName ?? "Espacio";
  const legalName = settings.data?.data?.legalName ?? "";
  const mark = workspaceMark(settings.data?.data?.spaceMark);

  // Si los ajustes cambian en otra pantalla, relee sin recargar la página.
  useEffect(() => onWorkspaceUpdated(() => void settings.reload()), [settings.reload]);

  const [wsOpen, setWsOpen] = useState(false);
  const closeWs = useCallback(() => setWsOpen(false), []);
  const panelRef = useRef<HTMLDivElement>(null);
  // El menú se ancla a la derecha del conmutador, como en ClickUp.
  const { anchorRef, anchor } = usePopoverAnchor(wsOpen, { side: "right" });
  useDismissOnOutside(wsOpen, closeWs, useCallback(() => [anchorRef.current, panelRef.current], [anchorRef]));

  function go(path: string) {
    closeWs();
    navigate(path);
  }

  return (
    <aside className="fixed left-[16px] top-[55px] flex h-[calc(100vh-55px)] w-[64px] flex-col items-start gap-[16px] pb-[14px]">
      <span ref={anchorRef as React.RefObject<HTMLSpanElement>} className="inline-flex shrink-0">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={wsOpen}
          aria-label={`Espacio de trabajo: ${spaceName}`}
          title={spaceName}
          onClick={() => setWsOpen((prev) => !prev)}
          className={`relative flex h-[52px] w-[64px] shrink-0 items-center justify-center rounded-[10px] transition-colors ${wsOpen ? "bg-subtle" : "hover:bg-subtle/60"}`}
        >
          <Icon name={mark} size={38} />
          <span className="absolute right-[4px] bottom-[4px] flex size-[18px] items-center justify-center rounded-full border border-[rgba(51,56,48,0.25)] bg-canvas shadow-sm">
            <Icon name="chevron-down-ink" size={10} />
          </span>
        </button>

        <PopoverPortal
          anchor={wsOpen ? anchor : null}
          align="left"
          className="flex flex-col rounded-[10px] border border-[rgba(51,56,48,0.2)] bg-canvas p-[8px] shadow-lg"
        >
          <div ref={panelRef} role="menu" aria-label="Espacio de trabajo" className="anim-pop flex min-h-0 w-[232px] flex-col overflow-y-auto">
            <div className="flex items-center gap-[10px] border-b border-[rgba(51,56,48,0.2)] px-[8px] pt-[4px] pb-[10px]">
              <span className="flex size-[32px] shrink-0 items-center justify-center rounded-[8px] border border-[rgba(51,56,48,0.2)] bg-canvas">
                <Icon name={mark} size={24} />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[12px] font-semibold text-ink">{spaceName}</span>
                {legalName ? <span className="truncate text-[10px] text-muted">{legalName}</span> : null}
              </span>
            </div>

            <button
              type="button"
              role="menuitem"
              onClick={() => go("/configuracion?seccion=espacio")}
              className="mt-[4px] flex w-full items-center gap-[8px] rounded-[5px] px-[8px] py-[6px] text-left text-[12px] text-ink transition-colors hover:bg-subtle"
            >
              <Icon name="nav-config" size={14} />
              Configuración del espacio
            </button>
            {can("admin") ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => go("/equipo")}
                className="flex w-full items-center gap-[8px] rounded-[5px] px-[8px] py-[6px] text-left text-[12px] text-ink transition-colors hover:bg-subtle"
              >
                <Icon name="nav-equipo" size={14} />
                Gestionar equipo
              </button>
            ) : null}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                closeWs();
                logout();
                navigate("/login", { replace: true });
              }}
              className="flex w-full items-center gap-[8px] rounded-[5px] px-[8px] py-[6px] text-left text-[12px] text-ink transition-colors hover:bg-subtle"
            >
              <Icon name="logout" size={14} />
              Cerrar sesión
            </button>

            <p className="px-[8px] pt-[8px] text-[10px] leading-[1.4] text-muted">Un solo espacio en esta cuenta.</p>
          </div>
        </PopoverPortal>
      </span>

      <nav className="flex w-[64px] shrink-0 flex-col items-start gap-[8px] overflow-hidden">
        {visibleMain.map((item) => (
          <SidebarLink key={item.to} item={item} />
        ))}
      </nav>

      <div className="min-h-[12px] w-[64px] flex-1" />

      {visibleAdmin.length > 0 ? (
        <nav className="flex w-[64px] shrink-0 flex-col items-start gap-[8px] overflow-hidden">
          {visibleAdmin.map((item) => (
            <SidebarLink key={item.to} item={item} />
          ))}
        </nav>
      ) : null}
    </aside>
  );
}

function SidebarLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        [
          "flex h-[52px] w-[64px] shrink-0 flex-col items-center justify-center overflow-hidden rounded-[10px] transition-colors",
          // La barra es crema: no hay fondo oscuro en Administración.
          // Solo el activo lleva la píldora `subtle`.
          isActive ? "bg-subtle" : "hover:bg-subtle/60",
        ].join(" ")
      }
    >
      {({ isActive }) => (
        <>
          <Icon name={item.icon} size={24} />
          <span
            className={`${item.smallLabel ? "text-[8px]" : "text-[9px]"} mt-[3px] leading-[1.4] ${
              isActive ? "font-semibold text-ink" : "font-medium text-muted"
            }`}
          >
            {item.label}
          </span>
        </>
      )}
    </NavLink>
  );
}
