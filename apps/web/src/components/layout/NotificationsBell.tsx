import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { api } from "@/lib/api";
import { showNotice } from "@/lib/toast";
import { DATA_CHANGED_EVENT, type DataChangedDetail } from "@/lib/realtime";
import { PopoverPortal, useDismissOnOutside, usePopoverAnchor } from "@/components/ui/Popover";

interface BellItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  read: boolean;
  when: string;
}

/**
 * Campana de notificaciones: avisos in-app (p. ej. "te añadieron a un
 * espacio"). Consulta cada 30 s; si llega algo nuevo suena un toast y
 * sube la insignia. Al abrir se marcan como leídas.
 */
export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<BellItem[]>([]);
  const [unread, setUnread] = useState(0);
  const knownIds = useRef<Set<string> | null>(null);
  const close = useCallback(() => setOpen(false), []);
  const { anchorRef, anchor } = usePopoverAnchor(open);
  const panelRef = useRef<HTMLDivElement>(null);
  useDismissOnOutside(open, close, useCallback(() => [anchorRef.current, panelRef.current], [anchorRef]));

  const load = useCallback(async (announce: boolean) => {
    try {
      const res = await api.getNotifications();
      const fresh = res.data.filter((item) => !item.read && !(knownIds.current?.has(item.id) ?? false));
      knownIds.current = new Set(res.data.map((item) => item.id));
      setItems(res.data);
      setUnread(res.unread);
      if (announce && fresh.length > 0) {
        const first = fresh[0]!;
        showNotice(first.title, { variant: "info", icon: "info" });
      }
    } catch {
      /* Sin red no hay campana: se reintenta en el siguiente ciclo. */
    }
  }, []);

  useEffect(() => {
    void load(false);
    // Tiempo real: el servidor avisa por SSE al llegar algo nuevo.
    const onChange = (event: Event) => {
      const channels = (event as CustomEvent<DataChangedDetail>).detail?.channels ?? [];
      if (channels.includes("notifications")) void load(true);
    };
    window.addEventListener(DATA_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, onChange);
  }, [load]);

  async function toggle() {
    if (open) {
      close();
      return;
    }
    setOpen(true);
    if (unread > 0) {
      try {
        await api.markNotificationsRead();
        setItems((prev) => prev.map((item) => ({ ...item, read: true })));
        setUnread(0);
      } catch {
        /* Se reintentará al reabrir. */
      }
    }
  }

  return (
    <>
      <div ref={anchorRef as React.RefObject<HTMLDivElement>} className="flex shrink-0 items-center">
        <button
          type="button"
          aria-label={unread > 0 ? `Notificaciones (${unread} sin leer)` : "Notificaciones"}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => void toggle()}
          className="pressable relative flex shrink-0 items-center rounded-[6px]"
        >
          <Icon name="notifications" />
          {unread > 0 ? (
            <span className="absolute -top-[4px] -right-[4px] flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-accent px-[4px] text-[9px] font-bold text-coal">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>
      </div>
      <PopoverPortal anchor={open ? anchor : null} align="right" className="flex flex-col rounded-[8px] border border-edge bg-canvas p-[8px] shadow-lg">
        <div ref={panelRef} role="menu" aria-label="Notificaciones" className="anim-pop flex max-h-[320px] min-h-0 w-[300px] flex-col overflow-y-auto">
          <p className="px-[8px] pt-[4px] pb-[8px] text-[12px] font-semibold text-ink">Notificaciones</p>
          {items.length === 0 ? (
            <p className="px-[8px] pb-[8px] text-[12px] text-muted">No hay notificaciones nuevas.</p>
          ) : (
            items.map((item) => (
              <div key={item.id} className={`flex gap-[10px] rounded-[5px] px-[8px] py-[8px] ${item.read ? "" : "bg-subtle"}`}>
                <span aria-hidden className={`mt-[5px] size-[8px] shrink-0 rounded-full ${item.read ? "bg-line" : "bg-accent"}`} />
                <span className="flex min-w-0 flex-col gap-[2px]">
                  <span className="text-[12px] font-semibold text-ink">{item.title}</span>
                  <span className="text-[11px] leading-[1.4] text-muted">{item.body}</span>
                  <span className="text-[10px] text-muted">{item.when}</span>
                </span>
              </div>
            ))
          )}
        </div>
      </PopoverPortal>
    </>
  );
}
