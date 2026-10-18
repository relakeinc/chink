import { Icon } from "@/components/ui/Icon";
import { useTheme } from "@/lib/theme";

/**
 * Decoración temporal de Halloween: capas fijas que nunca interceptan
 * gestos (pointer-events-none) ni alteran el layout. Solo se monta con
 * el tema halloween activo.
 */
export function HalloweenDecor({ variant }: { variant: "app" | "auth" }) {
  const { theme } = useTheme();
  if (theme !== "halloween") return null;

  if (variant === "auth") {
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <Icon name="moon" size={56} className="anim-hw-float absolute top-[48px] left-[48px] opacity-80" />
        <Icon name="bat" size={44} className="anim-hw-sway absolute top-[96px] right-[64px] opacity-70" />
        <Icon name="ghost" size={48} className="anim-hw-float absolute right-[48px] bottom-[64px] opacity-80" />
        <Icon name="candy" size={28} className="anim-hw-float absolute bottom-[48px] left-[64px] opacity-70" />
      </div>
    );
  }

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      <Icon name="moon" size={44} className="anim-hw-float absolute top-[64px] right-[24px] opacity-60 md:right-[48px]" />
      <Icon name="bat" size={40} className="anim-hw-sway absolute top-[120px] right-[88px] hidden opacity-60 sm:block" />
      <Icon name="spiderweb" size={96} className="absolute bottom-0 left-0 opacity-50" />
      <Icon name="ghost" size={40} className="anim-hw-float absolute bottom-[48px] left-[72px] hidden opacity-60 sm:block" />
    </div>
  );
}
