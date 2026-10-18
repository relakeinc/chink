import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@/components/ui/Icon";
import { workspaceMark } from "@/lib/workspace";

interface AuthSplitProps {
  title: string;
  description: string;
  children: ReactNode;
  /** CTA de la esquina del panel de marca (p. ej. ir a registro). */
  asideCta?: { label: string; to: string };
}

/**
 * Pantallas de autenticación en dos paneles: formulario centrado a la
 * izquierda y panel de marca a la derecha (solo en escritorio).
 */
export default function AuthSplit({ title, description, children, asideCta }: AuthSplitProps) {
  return (
    <main className="grid min-h-dvh bg-canvas lg:grid-cols-[60%_40%]">
      <div className="relative flex flex-col">
        <div className="flex items-center px-[24px] pt-[24px] md:hidden">
          <Icon name="chink-mark" className="h-[22px] w-auto" />
        </div>
        <div className="hidden px-[32px] pt-[24px] lg:block">
          <Icon name="chink-mark" className="h-[26px] w-auto" />
        </div>

        <div className="flex flex-1 items-center justify-center px-[20px] pb-[48px]">
          <div className="anim-fade-up w-full max-w-[400px]">
            <h1 className="mb-[6px] text-center font-outfit text-[24px] leading-[1.25] font-semibold text-ink">{title}</h1>
            <p className="mb-[20px] text-center text-[13px] leading-[1.5] text-muted">{description}</p>
            {children}
          </div>
        </div>
      </div>

      <div className="relative hidden overflow-hidden bg-ink lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_70%_45%,rgba(205,250,99,0.22),transparent_70%)]" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-[20px] p-[48px]">
          <Icon name={workspaceMark(undefined)} size={72} />
          <p className="max-w-[320px] text-center font-outfit text-[22px] leading-[1.3] font-semibold text-canvas">
            Cada referencia, cada unidad. Una única fuente de verdad.
          </p>
          <div className="flex gap-[10px]">
            {[0, 1, 2].map((i) => (
              <span key={i} className={`h-[6px] rounded-full ${i === 0 ? "w-[24px] bg-accent" : "w-[6px] bg-canvas/30"}`} />
            ))}
          </div>
        </div>
        {asideCta ? (
          <div className="absolute top-[28px] right-[32px]">
            <Link
              to={asideCta.to}
              className="inline-block rounded-[8px] bg-canvas px-[16px] py-[8px] text-[13px] font-semibold text-ink transition-opacity hover:opacity-90"
            >
              {asideCta.label}
            </Link>
          </div>
        ) : null}
      </div>
    </main>
  );
}
