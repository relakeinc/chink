import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Icon } from "@/components/ui/Icon";
import { useAuth } from "@/context/AuthContext";
import { OverlayPortal } from "@/components/ui/Popover";
import { ADMIN_NAV, MAIN_NAV } from "./Sidebar";

/** Secciones principales del dock: Inicio, Inventario y Equipo. */
const DOCK_PATHS = ["/inicio", "/inventario", "/equipo"];

interface DockItem {
  to: string;
  label: string;
  icon: string;
}

function useVisibleItems() {
  const { can } = useAuth();
  const all = [...MAIN_NAV, ...ADMIN_NAV].filter((item) => !item.permission || can(item.permission));
  const dock = DOCK_PATHS.map((to) => all.find((item) => item.to === to)).filter((item): item is DockItem => Boolean(item));
  const rest = all.filter((item) => !DOCK_PATHS.includes(item.to));
  return { dock, rest };
}

/**
 * Menú flotante móvil: dock abajo con las 3 principales + botón que abre la
 * parrilla con el resto de secciones. Solo existe bajo `md`.
 */
export default function MobileNav() {
  const { pathname } = useLocation();
  const { dock, rest } = useVisibleItems();
  // "Más" se marca solo cuando la ruta actual vive en su parrilla.
  const sheetActive = rest.some((item) => item.to === pathname);
  const [allOpen, setAllOpen] = useState(false);

  useEffect(() => {
    if (!allOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setAllOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [allOpen]);

  return (
    <>
      <nav aria-label="Navegación principal" className="fixed bottom-[14px] left-1/2 z-40 flex -translate-x-1/2 items-center gap-[2px] rounded-[22px] border border-[rgba(51,56,48,0.12)] bg-canvas px-[8px] py-[6px] shadow-xl md:hidden">
        {dock.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            aria-label={item.label}
            className={({ isActive }) =>
              `pressable flex w-[56px] flex-col items-center gap-[2px] rounded-[14px] py-[6px] transition-colors ${isActive ? "bg-subtle" : ""}`
            }
          >
            {({ isActive }) => (
              <>
                <Icon name={item.icon} size={24} />
                <span className={`text-[9px] leading-none ${isActive ? "font-semibold text-ink" : "font-medium text-muted"}`}>
                  {item.label}
                </span>
              </>
            )}
          </NavLink>
        ))}
        <button
          type="button"
          aria-label="Todas las secciones"
          aria-haspopup="dialog"
          aria-expanded={allOpen}
          onClick={() => setAllOpen(true)}
          className={`pressable flex w-[56px] flex-col items-center gap-[2px] rounded-[14px] py-[6px] transition-colors ${sheetActive ? "bg-subtle" : ""}`}
        >
          <Icon name="grid-apps" size={24} />
          <span className={`text-[9px] leading-none ${sheetActive ? "font-semibold text-ink" : "font-medium text-muted"}`}>Más</span>
        </button>
      </nav>

      {allOpen ? (
        <OverlayPortal>
          <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-label="Todas las secciones">
            <button type="button" aria-label="Cerrar" onClick={() => setAllOpen(false)} className="anim-fade-in absolute inset-0 cursor-default bg-ink/40" />
            <div className="anim-sheet-up absolute right-0 bottom-0 left-0 rounded-t-[20px] bg-canvas px-[20px] pt-[10px] pb-[28px] shadow-xl">
              <div className="mx-auto mb-[14px] h-[4px] w-[40px] rounded-full bg-line" />
              <div className="mb-[12px] flex items-center justify-between px-[4px]">
                <span className="text-[13px] font-semibold text-ink">Secciones</span>
                <button
                  type="button"
                  aria-label="Cerrar"
                  onClick={() => setAllOpen(false)}
                  className="flex size-[28px] items-center justify-center rounded-full bg-subtle text-[14px] text-muted"
                >
                  ×
                </button>
              </div>
              <div className="grid grid-cols-4 gap-[10px]">
                {rest.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setAllOpen(false)}
                  className="pressable flex flex-col items-center gap-[6px] rounded-[12px] p-[4px]"
                >
                    <span className="flex size-[52px] items-center justify-center rounded-[14px] bg-subtle">
                      <Icon name={item.icon} size={26} />
                    </span>
                    <span className="text-center text-[10px] leading-tight font-medium text-ink">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          </div>
        </OverlayPortal>
      ) : null}
    </>
  );
}
