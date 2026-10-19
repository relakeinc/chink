import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Icon } from "@/components/ui/Icon";
import { useAuth } from "@/context/AuthContext";
import { api, setToken } from "@/lib/api";
import { useAsync } from "@/lib/useAsync";
import { PopoverPortal, useDismissOnOutside, usePopoverAnchor, OverlayPortal } from "@/components/ui/Popover";
import { notifyWorkspaceUpdated, onWorkspaceUpdated, workspaceMark } from "@/lib/workspace";
import { connectRealtime, notifyLocalChange } from "@/lib/realtime";
import WorkspaceOnboarding from "@/components/forms/WorkspaceOnboarding";

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
  { to: "/pagos", label: "Pagos", icon: "nav-pagos", permission: "consult" },
  { to: "/reportes", label: "Reportes", icon: "nav-reportes", permission: "report" },
];

export const ADMIN_NAV: NavItem[] = [
  { to: "/equipo", label: "Equipo", icon: "nav-equipo", permission: "admin" },
  { to: "/configuracion", label: "Configuración", icon: "nav-config", permission: "admin", smallLabel: true },
];

/** Estado compartido del conmutador: datos del espacio + menú por portal. */
function useWorkspaceMenu() {
  const { can, logout, refresh } = useAuth();
  const navigate = useNavigate();
  const settings = useAsync(() => api.getSettings(), []);
  const spaceName = settings.data?.data?.spaceName ?? "Espacio";
  const legalName = settings.data?.data?.legalName ?? "";
  const mark = workspaceMark(settings.data?.data?.spaceMark);

  // Espacios del usuario (propio + equipos que lo invitaron).
  const spaces = useAsync(() => api.getSpaces(), []);

  // Si los ajustes cambian en otra pantalla, relee sin recargar la página.
  useEffect(
    () =>
      onWorkspaceUpdated(() => {
        void settings.reload();
        void spaces.reload();
      }),
    [settings.reload, spaces.reload],
  );

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

  /** Cambia el espacio activo: nueva sesión con el rol de ese espacio. */
  async function switchSpace(id: string) {
    const res = await api.setActiveSpace(id);
    setToken(res.token);
    await refresh();
    connectRealtime();
    notifyWorkspaceUpdated();
    // Todo recarga solo con el token nuevo (guardia de carrera en useAsync).
    notifyLocalChange(["team", "settings", "inventory"]);
    close();
    navigate("/inicio");
  }

  return { can, logout, navigate, spaceName, legalName, mark, open, setOpen, close, go, switchSpace, spaces: spaces.data?.data ?? [], anchorRef, anchor, panelRef };
}

type WorkspaceMenuApi = ReturnType<typeof useWorkspaceMenu>;

/** Contenido del menú del espacio (cabecera + acciones). */
function WorkspaceMenuItems({ ws, onNavigate, onNewSpace }: { ws: WorkspaceMenuApi; onNavigate?: () => void; onNewSpace?: () => void }) {
  function go(path: string) {
    ws.go(path);
    onNavigate?.();
  }
  return (
    <>
      <div className="flex items-center gap-[10px] border-b border-edge px-[8px] pt-[4px] pb-[10px]">
        <span className="flex size-[32px] shrink-0 items-center justify-center rounded-[8px] border border-edge bg-canvas">
          <Icon name={ws.mark} size={24} />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[12px] font-semibold text-ink">{ws.spaceName}</span>
          {ws.legalName ? <span className="truncate text-[10px] text-muted">{ws.legalName}</span> : null}
        </span>
      </div>

      {/* Conmutador: propio + equipos que invitaron (acceso pendiente no cambia). */}
      {ws.spaces.length > 1 ? (
        <div className="border-b border-edge px-[8px] py-[6px]">
          <p className="px-[8px] pt-[2px] pb-[4px] text-[10px] font-semibold tracking-wide text-muted">MIS ESPACIOS</p>
          {ws.spaces.map((space) => (
            <button
              key={space.id}
              type="button"
              role="menuitemradio"
              aria-checked={space.active}
              disabled={space.active || space.status !== "ACTIVE"}
              onClick={() => {
                onNavigate?.();
                void ws.switchSpace(space.id);
              }}
              className={`flex w-full items-center gap-[8px] rounded-[5px] px-[8px] py-[6px] text-left transition-colors ${
                space.active ? "bg-subtle" : "hover:bg-subtle"
              } ${space.status !== "ACTIVE" ? "opacity-50" : ""}`}
            >
              <Icon name={workspaceMark(space.mark)} size={20} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[12px] font-medium text-ink">{space.name}</span>
                <span className="text-[10px] text-muted">{space.status !== "ACTIVE" ? "Acceso pendiente" : `Rol: ${space.role}`}</span>
              </span>
              {space.active ? <span aria-hidden className="size-[8px] shrink-0 rounded-full bg-accent" /> : null}
            </button>
          ))}
        </div>
      ) : null}

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

      {onNewSpace ? (
        <button
          type="button"
          onClick={() => {
            ws.close();
            onNavigate?.();
            onNewSpace();
          }}
          className="mt-[4px] flex w-full items-center justify-center gap-[6px] rounded-[6px] bg-coal px-[8px] py-[8px] text-[12px] font-semibold text-cream transition-opacity hover:opacity-90"
        >
          <span aria-hidden className="text-[14px] leading-none">+</span> Nuevo espacio
        </button>
      ) : (
        <p className="px-[8px] pt-[8px] text-[10px] leading-[1.4] text-muted">Un solo espacio en esta cuenta.</p>
      )}
    </>
  );
}

/**
 * Conmutador de espacio: en el rail es el logo con badge; en el cajón móvil,
 * una fila con logo, nombre y chevron.
 */
function WorkspaceButton({ layout, onNavigate, onNewSpace }: { layout: "rail" | "row"; onNavigate?: () => void; onNewSpace?: () => void }) {
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
        className={`pressable relative flex h-[52px] w-[64px] shrink-0 items-center justify-center rounded-[10px] transition-colors ${ws.open ? "bg-subtle" : "hover:bg-subtle/60"}`}
      >
          <Icon name={ws.mark} size={38} />
          <span className="absolute right-[4px] bottom-[4px] flex size-[18px] items-center justify-center rounded-full border border-edge bg-canvas shadow-sm">
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
        className="flex flex-col rounded-[10px] border border-edge bg-canvas p-[8px] shadow-lg"
      >
        <div ref={ws.panelRef} role="menu" aria-label="Espacio de trabajo" className="anim-pop flex min-h-0 w-[232px] flex-col overflow-y-auto">
          <WorkspaceMenuItems ws={ws} onNavigate={onNavigate} onNewSpace={onNewSpace} />
        </div>
      </PopoverPortal>
    </span>
  );
}

/**
 * Rail lateral compacto estilo ClickUp: avatar del espacio con desplegable
 * funcional, iconos de 24 px con rótulo y Administración anclada abajo.
 * Solo en escritorio; en móvil hay hoja inferior y dock.
 */
export default function Sidebar() {
  const { can } = useAuth();
  const visibleMain = MAIN_NAV.filter((item) => !item.permission || can(item.permission));
  const visibleAdmin = ADMIN_NAV.filter((item) => !item.permission || can(item.permission));
  const [onboarding, setOnboarding] = useState(false);

  return (
    <>
      <aside className="fixed left-[16px] top-[55px] hidden h-[calc(100vh-55px)] w-[64px] flex-col items-start gap-[16px] pb-[14px] md:flex">
        <WorkspaceButton layout="rail" onNavigate={undefined} onNewSpace={() => setOnboarding(true)} />

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
      <WorkspaceOnboarding open={onboarding} onClose={() => setOnboarding(false)} />
    </>
  );
}

function SidebarLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        [
          "pressable flex h-[52px] w-[64px] shrink-0 flex-col items-center justify-center overflow-hidden rounded-[10px] transition-colors",
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
 * Hoja inferior del espacio en móvil: se abre desde el conmutador del TopBar
 * y ofrece lo mismo que el menú de escritorio, subiendo desde abajo.
 */
export function WorkspaceDrawer({ open, onClose, onNewSpace }: { open: boolean; onClose: () => void; onNewSpace?: () => void }) {
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
    <OverlayPortal>
      <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-label="Espacios de trabajo">
        <button type="button" aria-label="Cerrar" onClick={onClose} className="anim-fade-in absolute inset-0 cursor-default bg-black/40" />
        <div className="anim-sheet-up absolute right-0 bottom-0 left-0 max-h-[85vh] overflow-y-auto rounded-t-[20px] bg-canvas px-[20px] pt-[10px] pb-[28px] shadow-xl">
          <div className="mx-auto mb-[10px] h-[4px] w-[40px] rounded-full bg-line" />
          <h2 className="pb-[12px] text-center text-[16px] font-semibold text-ink">Espacios de trabajo</h2>
          <button
            type="button"
            aria-current="true"
            onClick={onClose}
            className="pressable flex w-full items-center gap-[12px] rounded-[12px] bg-subtle px-[12px] py-[12px] text-left"
          >
            <Icon name={ws.mark} size={32} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold text-ink">{ws.spaceName}</span>
              {ws.legalName ? <span className="block truncate text-[11px] text-muted">{ws.legalName}</span> : null}
            </span>
            <span aria-hidden className="flex size-[22px] items-center justify-center rounded-full bg-coal text-[12px] font-bold text-cream">
              ✓
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onNewSpace?.();
            }}
            className="mt-[14px] flex w-full items-center justify-center gap-[8px] rounded-[10px] bg-coal px-[12px] py-[13px] text-[14px] font-semibold text-cream transition-opacity active:opacity-90"
          >
            <span aria-hidden className="text-[16px] leading-none">+</span> Nuevo espacio
          </button>
          <p className="px-[4px] pt-[10px] text-center text-[11px] leading-[1.5] text-muted">
            Los espacios separan equipos y datos. Hoy hay un solo espacio en esta cuenta.
          </p>
        </div>
      </div>
    </OverlayPortal>
  );
}
