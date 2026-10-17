import { Icon } from "./Icon";

interface ProductThumbProps {
  imageUrl?: string | null;
  icon?: string;
  name?: string;
  size?: number;
}

/**
 * Miniatura del producto: foto de R2 si existe; si no, el icono del catálogo
 * en ficha gris (salvo la ilustración, que va a sangre como en el diseño).
 */
export function ProductThumb({ imageUrl, icon = "package", name = "", size = 34 }: ProductThumbProps) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        loading="lazy"
        style={{ width: size, height: size }}
        className="shrink-0 rounded-[6px] bg-subtle object-cover"
      />
    );
  }
  if (icon === "product-illustration") return <Icon name="product-illustration" />;
  return (
    <span
      style={{ width: size, height: size }}
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-[6px] bg-subtle"
    >
      <Icon name={icon} size={Math.max(Math.round(size * 0.6), 12)} />
    </span>
  );
}
