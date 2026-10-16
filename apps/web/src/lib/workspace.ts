/** Galería de iconos del espacio: el copo en varios colores. */
export const WORKSPACE_MARKS = [
  { id: "workspace-mark", color: "#2F6DF6" },
  { id: "workspace-violet", color: "#7C5CFC" },
  { id: "workspace-teal", color: "#0E9F8A" },
  { id: "workspace-moss", color: "#41483A" },
  { id: "workspace-ember", color: "#C87A2A" },
  { id: "workspace-sky", color: "#1E88E5" },
  { id: "workspace-rose", color: "#E05575" },
  { id: "workspace-bronze", color: "#B7791F" },
] as const;

export const DEFAULT_WORKSPACE_MARK = "workspace-mark";

/** Devuelve un icono válido de la galería o el de por defecto. */
export function workspaceMark(id: string | null | undefined): string {
  return WORKSPACE_MARKS.some((mark) => mark.id === id) ? (id as string) : DEFAULT_WORKSPACE_MARK;
}

/**
 * Aviso global de que los ajustes cambiaron: quien muestre datos derivados
 * (p. ej. el conmutador del sidebar) los relee sin recargar la página.
 */
export function notifyWorkspaceUpdated() {
  window.dispatchEvent(new Event("chink:workspace-updated"));
}

export function onWorkspaceUpdated(listener: () => void): () => void {
  window.addEventListener("chink:workspace-updated", listener);
  return () => window.removeEventListener("chink:workspace-updated", listener);
}

/** Iniciales del espacio a partir de su nombre ("Chink · Operaciones" -> "CO"). */
export function workspaceInitials(name: string): string {
  const words = name
    .split(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]+/)
    .filter(Boolean)
    .slice(0, 2);
  const initials = words.map((word) => word[0]!.toUpperCase()).join("");
  return initials || "··";
}

/** Texto legible (tinta o crema) sobre un fondo hexadecimal. */
export function contrastText(hex: string): string {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) return "#242722";
  const value = parseInt(match[1]!, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.55 ? "#242722" : "#F5F5EF";
}
