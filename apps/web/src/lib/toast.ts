import { toastQueue } from "@/components/toast/ToastHost";
import type { ToastOptions } from "super-beautiful-toast/core";

/**
 * API de avisos. Reemplaza al `<Notice>` por página: la cola es global y el
 * host vive una sola vez en el árbol de la aplicación.
 *
 *   showNotice("Historial exportado.");
 *   showNotice("El SKU ya existe", { variant: "error" });
 */
export function showNotice(message: string, options: Partial<ToastOptions> = {}) {
  toastQueue.show({
    message,
    variant: "success",
    icon: "check_circle",
    duration: 4000,
    ...options,
  });
}

/**
 * Conserva la firma que usaban las páginas (`{ notice, showNotice }`) para no
 * obligar a tocar todas a la vez. `notice` ya no se usa: el aviso vive en la
 * cola global, no en el estado del componente.
 */
export function useNotice() {
  return { notice: null as string | null, showNotice };
}