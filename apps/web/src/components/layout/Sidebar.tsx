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

export const MAIN_NAV: NavItem[] = [
  { to: "/inicio", label: "Inicio", icon: "nav-inicio" },
  { to: "/inventario", label: "Inventario", icon: "nav-inventario", permission: "consult" },
  { to: "/movimientos", label: "Movimientos", icon: "nav-movimientos", permission: "consult" },
  { to: "/almacenes", label: "Almacenes", icon: "nav-almacenes", permission: "consult" },
  { to: "/reportes", label: "Reportes", icon: "nav-reportes", permission: "report" },
];

export const ADMIN_NAV: NavItem[] = [
  { to: "/equipo", label: "Equipo", icon: "nav-equipo", permission: "admin" },
  { to: "/configuracion", label: "Configuración", icon: "nav-config", permission: "admin", smallLabel: true },
];

/** Estado compartido del conmutador: datos del espacio + menú por portal. */
function useWorkspaceMenu() {
  const { can, logout } = useAuth();
  const navigate = useNavigate();
  const settings = useAsync(() => api.getSettings(), []);
  const spaceName = settings.data?.data?.spaceName ?? "Espacio";
  const legalName = settings.data?.data?.legalName ?? "";
  const mark = workspaceMark(settings.data?.data?.spaceMark);

  // Si los ajustes cambian en otra pantalla, relee sin recargar la página.
  useEffect(() => onWorkspaceUpdated(() => void settings.reload()), [settings.reload]);

  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const panelRef = useRef<HTMLDivElement>(null);
  // El menú se ancla a la derecha del conmutador, como en ClickUp.
  const { anchorRef, anchor } = usePopoverAnchor(open, { side: "right" });
  useDismissOnOutside(open, close, useCallback(() => [anchorRef.current, panelRef.current], [anchorRef]));

  function go(path: string) {
    close();
    navigate(path);
  }

  return { can, logout, navigate, spaceName, legalName, mark, open, setOpen, close, go, anchorRef, anchor, panelRef };
}

type WorkspaceMenuApi = ReturnType<typeof useWorkspaceMenu>;

/** Contenido del menú del espacio (cabecera + acciones). */
function WorkspaceMenuItems({ ws, onNavigate }: { ws: WorkspaceMenuApi; onNavigate?: () => void }) {
  function go(path: string) {
    ws.go(path);
    onNavigate?.();
  }
  return (
    <>
      <div className="flex items-center gap-[10px] border-b border-[rgba(51,56,48,0.2)] px-[8px] pt-[4px] pb-[10px]">
        <span className="flex size-[32px] shrink-0 items-center justify-center rounded-[8px] border border-[rgba(51,56,48,0.2)] bg-canvas">
          <Icon name={ws.mark} size={24} />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[12px] font-semibold text-ink">{ws.spaceName}</span>
          {ws.legalName ? <span className="truncate text-[10px] text-muted">{ws.legalName}</span> : null}
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
      {ws.can("admin") ? (
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
          ws.close();
          ws.logout();
          ws.navigate("/login", { replace: true });
          onNavigate?.();
        }}
        className="flex w-full items-center gap-[8px] rounded-[5px] px-[8px] py-[6px] text-left text-[12px] text-ink transition-colors hover:bg-subtle"
      >
        <Icon name="logout" size={14} />
        Cerrar sesión
      </button>

      <p className="px-[8px] pt-[8px] text-[10px] leading-[1.4] text-muted">Un solo espacio en esta cuenta.</p>
    </>
  );
}

/**
 * Conmutador de espacio: en el rail es el logo con badge; en el cajón móvil,
 * una fila con logo, nombre y chevron.
 */
function WorkspaceButton({ layout, onNavigate }: { layout: "rail" | "row"; onNavigate?: () => void }) {
  const ws = useWorkspaceMenu();

  return (
    <span ref={ws.anchorRef as React.RefObject<HTMLSpanElement>} className="inline-flex shrink-0">
      {layout === "rail" ? (
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={ws.open}
          aria-label={`Espacio de trabajo: ${ws.spaceName}`}
          title={ws.spaceName}
          onClick={() => ws.setOpen((prev) => !prev)}
          className={`relative flex h-[52px] w-[64px] shrink-0 items-center justify-center rounded-[10px] transition-colors ${ws.open ? "bg-subtle" : "hover:bg-subtle/60"}`}
        >
          <Icon name={ws.mark} size={38} />
          <span className="absolute right-[4px] bottom-[4px] flex size-[18px] items-center justify-center rounded-full border border-[rgba(51,56,48,0.25)] bg-canvas shadow-sm">
            <Icon name="chevron-down-ink" size={10} />
          </span>
        </button>
      ) : (
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={ws.open}
          onClick={() => ws.setOpen((prev) => !prev)}
          className={`flex w-full items-center gap-[10px] rounded-[10px] p-[8px] transition-colors ${ws.open ? "bg-subtle" : "hover:bg-subtle/60"}`}
        >
          <Icon name={ws.mark} size={32} />
          <span className="flex min-w-0 flex-1 flex-col items-start">
            <span className="truncate text-[13px] font-semibold text-ink">{ws.spaceName}</span>
            {ws.legalName ? <span className="truncate text-[10px] text-muted">{ws.legalName}</span> : null}
          </span>
          <Icon name="chevron-down-ink" size={12} />
        </button>
      )}

      <PopoverPortal
        anchor={ws.open ? ws.anchor : null}
        align="left"
        className="flex flex-col rounded-[10px] border border-[rgba(51,56,48,0.2)] bg-canvas p-[8px] shadow-lg"
      >
        <div ref={ws.panelRef} role="menu" aria-label="Espacio de trabajo" className="anim-pop flex min-h-0 w-[232px] flex-col overflow-y-auto">
          <WorkspaceMenuItems ws={ws} onNavigate={onNavigate} />
        </div>
      </PopoverPortal>
    </span>
  );
}

/**
 * Rail lateral compacto estilo ClickUp: avatar del espacio con desplegable
 * funcional, iconos de 24 px con rótulo y Administración anclada abajo.
 * Solo en escritorio; en móvil hay cajón (SidebarDrawer).
 */
export default function Sidebar() {
  const { can } = useAuth();
  const visibleMain = MAIN_NAV.filter((item) => !item.permission || can(item.permission));
  const visibleAdmin = ADMIN_NAV.filter((item) => !item.permission || can(item.permission));

  return (
    <aside className="fixed left-[16px] top-[55px] hidden h-[calc(100vh-55px)] w-[64px] flex-col items-start gap-[16px] pb-[14px] md:flex">
      <WorkspaceButton layout="rail" />

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

/**
 * Cajón del espacio en móvil: se abre desde el conmutador del TopBar y ofrece
 * lo mismo que el menú de escritorio (sin modales, deslizando desde la izquierda).
 */
export function WorkspaceDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ws = useWorkspaceMenu();

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-label="Espacio de trabajo">
      <button type="button" aria-label="Cerrar" onClick={onClose} className="absolute inset-0 cursor-default bg-ink/40" />
      <div className="anim-pop absolute top-0 left-0 flex h-full w-[280px] flex-col gap-[8px] overflow-y-auto bg-canvas p-[16px] shadow-xl">
        <div className="flex items-center gap-[10px] px-[4px] pt-[4px] pb-[10px]">
          <Icon name={ws.mark} size={36} />
          <span className="flex min-w-0 flex-1 flex-col items-start">
            <span className="truncate text-[14px] font-semibold text-ink">{ws.spaceName}</span>
            {ws.legalName ? <span className="truncate text-[10px] text-muted">{ws.legalName}</span> : null}
          </span>
          <button type="button" aria-label="Cerrar" onClick={onClose} className="flex size-[28px] shrink-0 items-center justify-center rounded-full bg-subtle text-[14px] text-muted">
            ×
          </button>
        </div>
        <div role="menu" aria-label="Espacio de trabajo" className="flex flex-col border-t border-[rgba(51,56,48,0.2)] pt-[8px]">
          <WorkspaceMenuItems ws={ws} onNavigate={onClose} />
        </div>
      </div>
    </div>
  );
}
