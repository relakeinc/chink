import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Icon } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/useAsync";
import { onWorkspaceUpdated, workspaceMark } from "@/lib/workspace";
import { PopoverPortal, useDismissOnOutside, usePopoverAnchor, OverlayPortal } from "@/components/ui/Popover";
import { NotificationsBell } from "./NotificationsBell";
import { showNotice } from "@/lib/toast";
import { WorkspaceDrawer } from "./Sidebar";
import WorkspaceOnboarding from "@/components/forms/WorkspaceOnboarding";

export default function TopBar() {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Espacio actual para el conmutador móvil.
  const settings = useAsync(() => api.getSettings(), []);
  const spaceName = settings.data?.data?.spaceName ?? "Espacio";
  const mark = workspaceMark(settings.data?.data?.spaceMark);
  useEffect(() => onWorkspaceUpdated(() => void settings.reload()), [settings.reload]);
  const [wsOpen, setWsOpen] = useState(false);

  // Menú de cuenta: popover en escritorio, hoja inferior en móvil.
  const [accountOpen, setAccountOpen] = useState(false);
  const closeAccount = useCallback(() => setAccountOpen(false), []);
  const panelRef = useRef<HTMLDivElement>(null);
  const { anchorRef, anchor } = usePopoverAnchor(accountOpen);
  useDismissOnOutside(accountOpen, closeAccount, useCallback(() => [anchorRef.current, panelRef.current], [anchorRef]));
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  function openAccount() {
    setAccountOpen(true);
    setSheetOpen(true);
  }

  function go(path: string) {
    closeAccount();
    setSheetOpen(false);
    navigate(path);
  }

  function signOut() {
    closeAccount();
    setSheetOpen(false);
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <header className="fixed top-[16px] right-[12px] left-[12px] z-30 flex h-[30px] items-center gap-[14px] md:right-[25px] md:left-[16px] md:gap-[22px]">
      <span className="hidden h-[28px] shrink-0 items-center md:flex" aria-label="Chink">
        <Logo className="h-[28px] w-auto" />
      </span>

      {/* Conmutador del espacio: solo móvil, abre cajón con lo mismo que en desktop. */}
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={wsOpen}
        aria-label={`Espacio de trabajo: ${spaceName}`}
        onClick={() => setWsOpen(true)}
        className="pressable flex min-w-0 shrink-0 items-center gap-[8px] rounded-[8px] md:hidden"
      >
        <Icon name={mark} size={28} />
        <span className="max-w-[130px] truncate text-[13px] font-semibold text-ink">{spaceName}</span>
        <Icon name="chevron-down-ink" size={12} />
      </button>
      <WorkspaceDrawer open={wsOpen} onClose={() => setWsOpen(false)} onNewSpace={() => setShowOnboarding(true)} />
      <OverlayPortal>
        <WorkspaceOnboarding open={showOnboarding} onClose={() => setShowOnboarding(false)} />
      </OverlayPortal>

      <span className="min-w-0 flex-1" />
      <span className="hidden rounded-[4px] bg-surface px-[8px] py-[4px] text-[11px] leading-[1.45] text-muted sm:block">
        Entorno de ejemplo
      </span>

      <button type="button" aria-label="Buscar en la página actual" onClick={() => window.dispatchEvent(new Event("chink:focus-search"))} className="pressable flex shrink-0 items-center rounded-[6px]">
        <Icon name="search-lg" size={18} />
      </button>

      <NotificationsBell />

      <span className="h-[24px] w-px shrink-0 bg-line" />

      <div ref={anchorRef as React.RefObject<HTMLDivElement>} className="flex shrink-0 items-center gap-[9px]">
        <button type="button" aria-haspopup="menu" aria-expanded={accountOpen} onClick={openAccount} className="pressable flex items-center gap-[9px] rounded-[8px]">
          <span className="flex size-[30px] items-center justify-center rounded-full bg-surface text-[10px] font-semibold text-ink">
            {user?.initials ?? "—"}
          </span>
          <span className="hidden text-[11px] font-medium text-ink sm:inline">{user?.name ?? ""}</span>
          <Icon name="chevron-down-ink" size={12} className="hidden sm:block" />
        </button>

        {/* Escritorio: menú por portal. En móvil va oculto (ahí manda la hoja). */}
        <PopoverPortal
          anchor={accountOpen ? anchor : null}
          align="right"
          className="hidden flex-col rounded-[8px] border border-edge bg-canvas p-[8px] shadow-lg md:flex"
        >
          <div ref={panelRef} role="menu" aria-label="Cuenta" className="anim-pop flex min-h-0 w-[200px] flex-col overflow-y-auto">
            <div className="border-b border-edge px-[8px] pt-[4px] pb-[10px]">
              <p className="text-[12px] font-medium text-ink">{user?.name}</p>
              <p className="text-[10px] text-muted">{user?.email}</p>
              <p className="mt-[4px] text-[10px] text-muted">Rol: {user?.role}</p>
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={() => go("/configuracion?seccion=espacio")}
              className="mt-[4px] w-full rounded-[5px] px-[8px] py-[6px] text-left text-[12px] text-ink hover:bg-subtle"
            >
              Configuración del espacio
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                closeAccount();
                setShowOnboarding(true);
              }}
              className="w-full rounded-[5px] px-[8px] py-[6px] text-left text-[12px] font-semibold text-ink hover:bg-subtle"
            >
              <span aria-hidden className="text-[14px] leading-none">+</span> Nuevo espacio
            </button>
            {can("admin") ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => go("/equipo")}
                className="w-full rounded-[5px] px-[8px] py-[6px] text-left text-[12px] text-ink hover:bg-subtle"
              >
                Gestionar equipo
              </button>
            ) : null}
            <button
              type="button"
              role="menuitem"
              onClick={signOut}
              className="mt-[4px] w-full rounded-[5px] px-[8px] py-[6px] text-left text-[12px] text-ink hover:bg-subtle"
            >
              Cerrar sesión
            </button>
          </div>
        </PopoverPortal>

        {/* Móvil: hoja inferior estilo app, por portal para quedar sobre el dock. */}
        {sheetOpen ? (
          <OverlayPortal>
            <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-label="Cuenta">
              <button type="button" aria-label="Cerrar" onClick={() => setSheetOpen(false)} className="anim-fade-in absolute inset-0 cursor-default bg-black/40" />
              <div className="anim-sheet-up absolute right-0 bottom-0 left-0 rounded-t-[20px] bg-canvas px-[20px] pt-[10px] pb-[28px] shadow-xl">
              <div className="mx-auto mb-[14px] h-[4px] w-[40px] rounded-full bg-line" />
              <div className="flex flex-col items-center gap-[6px] pb-[14px]">
                <span className="flex size-[64px] items-center justify-center rounded-full bg-surface text-[18px] font-semibold text-ink">
                  {user?.initials ?? "—"}
                </span>
                <span className="text-[16px] font-semibold text-ink">{user?.name ?? ""}</span>
                <span className="text-[12px] text-muted">{user?.email ?? ""}</span>
                <span className="text-[11px] text-muted">Rol: {user?.role ?? ""}</span>
              </div>
              <div className="flex flex-col border-t border-edge pt-[8px]">
                <button
                  type="button"
                  onClick={() => go("/configuracion?seccion=espacio")}
                  className="pressable flex w-full items-center gap-[12px] rounded-[8px] px-[8px] py-[12px] text-left text-[14px] text-ink transition-colors hover:bg-subtle active:bg-subtle"
                >
                  <Icon name="nav-config" size={18} />
                  Configuración del espacio
                </button>
                <button
                  type="button"
                  onClick={() => go("/equipo")}
                  className="pressable flex w-full items-center gap-[12px] rounded-[8px] px-[8px] py-[12px] text-left text-[14px] text-ink transition-colors hover:bg-subtle active:bg-subtle"
                >
                  <Icon name="nav-equipo" size={18} />
                  Gestionar equipo
                </button>
                <button
                  type="button"
                  onClick={signOut}
                  className="pressable flex w-full items-center gap-[12px] rounded-[8px] px-[8px] py-[12px] text-left text-[14px] text-ink transition-colors hover:bg-subtle active:bg-subtle"
                >
                  <Icon name="logout" size={18} />
                  Cerrar sesión
                </button>
              </div>
            </div>
          </div>
          </OverlayPortal>
        ) : null}
      </div>
      <span className="sr-only">{location.pathname}</span>
    </header>
  );
}
