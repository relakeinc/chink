import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createToastHost, createToastQueue, TOAST_POSITIONS } from "super-beautiful-toast/core";
import type { ToastItem, ToastPosition } from "super-beautiful-toast/core";

/**
 * Cola global de avisos.
 *
 * `super-beautiful-toast` publica un núcleo sin framework (DOM plano) y otro
 * adaptador para Vue 3. Este proyecto es React, así que usamos el núcleo y
 * montamos el host a mano: el contrato son tres llamadas
 * (bind / enter / leave) más unbind al retirar el elemento.
 */
export const toastQueue = createToastQueue({
  position: "bottom-right",
  duration: 4000,
  max: 4,
});

const POSITIONS = TOAST_POSITIONS as readonly ToastPosition[];

/** Iconos en línea para no depender de una fuente de iconos. */
const ICONS: Record<string, string> = {
  check_circle:
    '<path d="M20 6 9 17l-5-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  cancel: '<path d="M18 6 6 18M6 6l12 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  warning:
    '<path d="M12 9v4m0 3.5v.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  info: '<path d="M12 8h.01M11 12h1v5h1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  null: "",
};

function buildContent(item: ToastItem): DocumentFragment {
  const fragment = document.createDocumentFragment();

  const shell = document.createElement("div");
  shell.className = `sbt-shell sbt-variant-${item.variant}`;

  const body = document.createElement("div");
  body.className = "sbt-body";

  const content = document.createElement("div");
  content.className = "sbt-content";

  const iconName = item.icon ?? "";
  if (iconName !== "null" && ICONS[iconName]) {
    const icon = document.createElement("span");
    icon.className = "sbt-icon";
    icon.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">${ICONS[iconName]}</svg>`;
    content.appendChild(icon);
  }

  const message = document.createElement("span");
  message.className = "sbt-message";
  message.textContent = item.message ?? "";
  content.appendChild(message);

  body.appendChild(content);

  if (item.closable) {
    const close = document.createElement("button");
    close.type = "button";
    close.className = "sbt-close";
    close.setAttribute("aria-label", "Cerrar aviso");
    close.textContent = "×";
    close.addEventListener("click", () => toastQueue.dismiss(item.id));
    body.appendChild(close);
  }

  shell.appendChild(body);
  fragment.appendChild(shell);
  return fragment;
}

/**
 * Capa de avisos. Los nodos se imperan manualmente porque el núcleo los anima
 * con `transform`/`opacity` en bucle; meterlos en el árbol de React pelearía
 * con esas escrituras.
 */
export default function ToastHost() {
  const hostRef = useRef<ReturnType<typeof createToastHost> | null>(null);
  const stackRefs = useRef(new Map<ToastPosition, HTMLDivElement>());
  const nodes = useRef(new Map<number, HTMLDivElement>());
  const leaving = useRef(new Set<number>());
  // Importante: la cola vive fuera de React, así que hay que copiar su estado
  // a un useState para provocar el re-render. Con un ref el efecto de montaje
  // nunca llega a correr y los avisos no aparecen.
  const [items, setItems] = useState<ToastItem[]>(() => toastQueue.getItems());

  // La firma real es `createToastHost({ queue })`: recibe un objeto, no la cola.
  if (!hostRef.current) hostRef.current = createToastHost({ queue: toastQueue });

  useEffect(() => toastQueue.subscribe(setItems), []);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const alive = new Set<number>();

    for (const item of items) {
      alive.add(item.id);
      const existing = nodes.current.get(item.id);

      if (!existing) {
        const node = document.createElement("div");
        node.className = "sbt-toast";
        node.appendChild(buildContent(item));
        stackRefs.current.get(item.position)?.appendChild(node);
        nodes.current.set(item.id, node);
        host.bind(node, item.id);
        host.enter(node, item.id, () => {});
        continue;
      }

      if (item.closing && !leaving.current.has(item.id)) {
        leaving.current.add(item.id);
        host.leave(existing, item.id, () => {
          toastQueue.remove(item.id);
          leaving.current.delete(item.id);
        });
      }
    }

    for (const [id, node] of nodes.current) {
      if (alive.has(id)) continue;
      host.unbind(id);
      node.remove();
      nodes.current.delete(id);
      leaving.current.delete(id);
    }
  }, [items]);

  return (
    <div className="sbt-layer" aria-live="polite">
      {POSITIONS.map((position) => (
        <div
          key={position}
          ref={(node) => {
            if (node) stackRefs.current.set(position, node);
            else stackRefs.current.delete(position);
          }}
          className={`sbt-stack sbt-${position}`}
        />
      ))}
      <p className="sbt-announcer" />
    </div>
  );
}