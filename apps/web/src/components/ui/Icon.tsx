import { iconUrl } from "./icons";

export interface IconProps {
  name: string;
  /** Lado del cuadro en px. Por defecto conserva el tamaño natural del SVG. */
  size?: number;
  className?: string;
  title?: string;
}

/**
 * Renderiza un SVG del sistema de diseño.
 * Los SVGs traen `width`/`height` en la raíz; solo se fijan cuando se pasa `size`,
 * para poder escalarlos sin deformarlos.
 */
export function Icon({ name, size, className, title }: IconProps) {
  const src = iconUrl(name);
  if (!src) {
    if (import.meta.env.DEV) console.warn(`[Icon] "${name}" no existe en el registro`);
    return null;
  }

  return (
    <img
      src={src}
      alt={title ?? ""}
      aria-hidden={title ? undefined : true}
      width={size}
      height={size}
      className={className}
      style={size ? undefined : { display: "block" }}
      data-icon={name}
    />
  );
}