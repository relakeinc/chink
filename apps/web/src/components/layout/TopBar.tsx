import { useCallback, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Icon } from "@/components/ui/Icon";
import { PopoverPortal, useDismissOnOutside, usePopoverAnchor } from "@/components/ui/Popover";
import { showNotice } from "@/lib/toast";

export default function TopBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [accountOpen, setAccountOpen] = useState(false);
  const closeAccount = useCallback(() => setAccountOpen(false), []);
  const panelRef = useRef<HTMLDivElement>(null);
  const { anchorRef, anchor } = usePopoverAnchor(accountOpen);
  useDismissOnOutside(accountOpen, closeAccount, useCallback(() => [anchorRef.current, panelRef.current], [anchorRef]));

  return (
    <header className="fixed left-[15px] right-[25px] top-[16px] z-30 flex h-[30px] items-center gap-[22px]">
      <span className="flex shrink-0 w-[124px] h-[auto] items-center" aria-label="Chink">
        <Icon name="chink-mark" />
      </span>
      <span className="min-w-0 flex-1" />
      <span className="rounded-[4px] bg-surface px-[8px] py-[4px] text-[11px] leading-[1.45] text-muted">
        Entorno de ejemplo
      </span>

      <button type="button" aria-label="Buscar en la página actual" onClick={() => window.dispatchEvent(new Event("chink:focus-search"))} className="flex items-center">
        <Icon name="search-lg" size={18} />
      </button>

      <button
        type="button"
        aria-label="Notificaciones"
        onClick={() => showNotice("No hay notificaciones nuevas.", { variant: "info", icon: "info" })}
        className="relative flex items-center"
      >
        <Icon name="notifications" />
      </button>

      <span className="h-[24px] w-px bg-line" />

      <div ref={anchorRef as React.RefObject<HTMLDivElement>} className="flex items-center gap-[9px]">
        <button type="button" aria-haspopup="menu" aria-expanded={accountOpen} onClick={() => setAccountOpen((prev) => !prev)} className="flex items-center gap-[9px]">
          <span className="flex size-[30px] items-center justify-center rounded-full bg-surface text-[10px] font-semibold text-ink">
            {user?.initials ?? "—"}
          </span>
          <span className="text-[11px] font-medium text-ink">{user?.name ?? ""}</span>
          <Icon name="chevron-down-ink" size={12} />
        </button>

        {/* El menú vive en un portal para no depender del apilado del header. */}
        <PopoverPortal
          anchor={accountOpen ? anchor : null}
          align="right"
          className="flex flex-col rounded-[8px] border border-[rgba(51,56,48,0.2)] bg-canvas p-[8px] shadow-lg"
        >
          <div ref={panelRef} role="menu" aria-label="Cuenta" className="anim-pop flex min-h-0 w-[200px] flex-col overflow-y-auto">
            <div className="border-b border-[rgba(51,56,48,0.2)] px-[8px] pt-[4px] pb-[10px]">
              <p className="text-[12px] font-medium text-ink">{user?.name}</p>
              <p className="text-[10px] text-muted">{user?.email}</p>
              <p className="mt-[4px] text-[10px] text-muted">Rol: {user?.role}</p>
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                closeAccount();
                logout();
                navigate("/login", { replace: true });
              }}
              className="mt-[4px] w-full rounded-[5px] px-[8px] py-[6px] text-left text-[12px] text-ink hover:bg-subtle"
            >
              Cerrar sesión
            </button>
          </div>
        </PopoverPortal>
      </div>
      <span className="sr-only">{location.pathname}</span>
    </header>
  );
}