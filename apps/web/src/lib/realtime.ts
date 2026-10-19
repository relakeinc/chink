import { getToken } from "./api";

export const DATA_CHANGED_EVENT = "chink:data-changed";

export interface DataChangedDetail {
  channels: string[];
}

/** Aviso local: algo cambió (mutación propia o mensaje del servidor). */
export function notifyLocalChange(channels: string[] = []) {
  window.dispatchEvent(new CustomEvent<DataChangedDetail>(DATA_CHANGED_EVENT, { detail: { channels } }));
}

let source: EventSource | null = null;
let reconnectTimer: number | null = null;

function streamUrl(): string | null {
  const token = getToken();
  if (!token) return null;
  const base = import.meta.env.VITE_API_URL ?? "";
  return `${base}/api/stream?token=${encodeURIComponent(token)}`;
}

/**
 * Canal de tiempo real (SSE). El servidor emite `change` cuando algo del
 * espacio cambia: la app recarga sola, sin F5. Reconexión con espera si falla.
 */
export function connectRealtime() {
  disconnectRealtime();
  const url = streamUrl();
  if (!url || typeof EventSource === "undefined") return;

  const current = new EventSource(url);
  source = current;

  current.addEventListener("change", (event) => {
    let channels: string[] = [];
    try {
      channels = (JSON.parse((event as MessageEvent).data) as { channels?: string[] }).channels ?? [];
    } catch {
      /* Sin canales: igual se recarga. */
    }
    notifyLocalChange(channels);
  });

  current.onerror = () => {
    if (current !== source) return;
    // Token muerto o red caída: se cierra y se reintenta en 30 s.
    disconnectRealtime();
    if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      connectRealtime();
    }, 30000);
  };
}

export function disconnectRealtime() {
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (source) {
    source.close();
    source = null;
  }
}
