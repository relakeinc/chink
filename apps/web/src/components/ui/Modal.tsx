import type { ReactNode } from "react";
import { LAYERS } from "./Popover";

interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export default function Modal({ open, title, description, onClose, children, footer }: ModalProps) {
  if (!open) return null;

  return (
    <div style={{ zIndex: LAYERS.modal }} className="fixed inset-0 flex items-center justify-center bg-ink/40 p-[20px]">
      {/* El fondo usa opacidad pura para poder transicionar sin `backdrop-filter`. */}
      <button type="button" aria-label="Cerrar" onClick={onClose} className="anim-fade-in absolute inset-0 cursor-default" />
      <div className="anim-pop relative w-full max-w-[520px] rounded-[10px] bg-canvas p-[20px] shadow-xl">
        <div className="flex items-start justify-between gap-[12px]">
          <div>
            <h2 className="font-outfit text-[17px] leading-[1.4] font-semibold text-ink">{title}</h2>
            {description ? <p className="mt-[4px] text-[11px] text-muted">{description}</p> : null}
          </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        className="pressable -mr-[4px] -mt-[4px] rounded-[4px] px-[4px] text-[18px] leading-none text-muted transition-colors hover:bg-subtle hover:text-ink"
      >
            ×
          </button>
        </div>

        <div className="mt-[20px] flex flex-col gap-[14px]">{children}</div>

        {footer ? <div className="mt-[20px] flex justify-end gap-[10px]">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Field({ label, children, helper }: { label: string; children: ReactNode; helper?: string }) {
  return (
    <label className="flex flex-col gap-[6px]">
      <span className="text-[11px] font-medium text-ink">{label}</span>
      {children}
      {helper ? <span className="text-[10px] text-muted">{helper}</span> : null}
    </label>
  );
}

export const inputClass =
  "h-[38px] rounded-[6px] border border-[rgba(51,56,48,0.2)] bg-subtle px-[12px] text-[12px] leading-[1.4] text-ink outline-none focus:border-ink";