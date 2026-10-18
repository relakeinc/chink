import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { SettingsData } from "@/lib/api";
import { useAsync } from "@/lib/useAsync";
import { showNotice } from "@/lib/toast";
import { WORKSPACE_MARKS, workspaceMark, notifyWorkspaceUpdated } from "@/lib/workspace";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/primitives";

const fieldClass =
  "h-[38px] w-full rounded-[6px] border border-[rgba(51,56,48,0.2)] bg-canvas px-[12px] text-[12px] text-ink outline-none focus:border-ink";

const STEPS = ["Espacio", "Contacto", "Icono", "Resumen"] as const;

/**
 * Alta/configuración guiada del espacio: nombre, contacto, icono y resumen.
 * Móvil a pantalla completa; en escritorio, tarjeta centrada.
 */
export default function WorkspaceOnboarding({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useAsync(() => api.getSettings(), []);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ spaceName: "", legalName: "", contactEmail: "", taxId: "", spaceMark: "workspace-mark" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Al abrir, parte de los datos actuales.
  useEffect(() => {
    if (!open) return;
    setStep(0);
    setError(null);
    const current = settings.data?.data;
    if (current) {
      setForm({
        spaceName: current.spaceName,
        legalName: current.legalName,
        contactEmail: current.contactEmail,
        taxId: current.taxId,
        spaceMark: workspaceMark(current.spaceMark),
      });
    }
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  async function finish() {
    setError(null);
    if (form.spaceName.trim().length < 2) {
      setError("Ponle un nombre al espacio (mínimo 2 letras).");
      setStep(0);
      return;
    }
    setSaving(true);
    try {
      await api.updateSettings({
        spaceName: form.spaceName.trim(),
        legalName: form.legalName.trim(),
        contactEmail: form.contactEmail.trim(),
        taxId: form.taxId.trim(),
        spaceMark: form.spaceMark,
      } as Partial<SettingsData>);
      await settings.reload();
      notifyWorkspaceUpdated();
      showNotice("Espacio listo. ¡A trabajar!");
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el espacio");
    } finally {
      setSaving(false);
    }
  }

  const canNext = step === 0 ? form.spaceName.trim().length >= 2 : true;

  return (
    <div className="anim-fade-in fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-canvas p-[16px] md:p-[32px]" role="dialog" aria-label="Crear espacio">
      <div className="w-full max-w-[560px]">
        <div className="mb-[20px] flex items-center gap-[10px]">
          <Icon name="chink-mark" className="h-[24px] w-auto" />
          <span className="text-[11px] font-medium text-muted">Paso {step + 1} de {STEPS.length} · {STEPS[step]}</span>
        </div>

        <h1 className="font-outfit text-[26px] leading-[1.2] font-bold text-ink">
          {step === 0 && "¿Cómo se llama tu espacio?"}
          {step === 1 && "Datos de contacto"}
          {step === 2 && "Elige su icono"}
          {step === 3 && "Todo listo"}
        </h1>
        <p className="mt-[6px] text-[13px] leading-[1.5] text-muted">
          {step === 0 && "Es el nombre que verás en el conmutador y en los reportes."}
          {step === 1 && "Para identificar al negocio en correos y reportes."}
          {step === 2 && "Se muestra en el lateral y en los correos. Puedes cambiarlo cuando quieras."}
          {step === 3 && "Revisa que todo esté bien antes de guardar."}
        </p>

        <div className="mt-[20px] flex flex-col gap-[14px] rounded-[10px] bg-subtle p-[20px]">
          {error ? <p className="text-[12px] text-warn">{error}</p> : null}

          {step === 0 ? (
            <>
              <label className="flex flex-col gap-[6px]">
                <span className="text-[11px] font-medium text-ink">Nombre del espacio</span>
                <input value={form.spaceName} onChange={set("spaceName")} placeholder="Chink · Operaciones" className={fieldClass} />
              </label>
              <label className="flex flex-col gap-[6px]">
                <span className="text-[11px] font-medium text-ink">Razón social <span className="text-muted">(opcional)</span></span>
                <input value={form.legalName} onChange={set("legalName")} placeholder="Chink Logística, S.L." className={fieldClass} />
              </label>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <label className="flex flex-col gap-[6px]">
                <span className="text-[11px] font-medium text-ink">Correo de contacto</span>
                <input type="email" value={form.contactEmail} onChange={set("contactEmail")} placeholder="operaciones@empresa.com" className={fieldClass} />
              </label>
              <label className="flex flex-col gap-[6px]">
                <span className="text-[11px] font-medium text-ink">Identificación fiscal <span className="text-muted">(opcional)</span></span>
                <input value={form.taxId} onChange={set("taxId")} placeholder="B12345678" className={fieldClass} />
              </label>
            </>
          ) : null}

          {step === 2 ? (
            <div className="flex flex-wrap gap-[10px]" role="group" aria-label="Icono del espacio">
              {WORKSPACE_MARKS.map((mark) => {
                const active = form.spaceMark === mark.id;
                return (
                  <button
                    key={mark.id}
                    type="button"
                    aria-label={mark.id}
                    aria-pressed={active}
                    onClick={() => setForm((prev) => ({ ...prev, spaceMark: mark.id, }))}
                    className={`flex size-[52px] items-center justify-center rounded-[10px] border bg-canvas transition-transform hover:scale-105 ${
                      active ? "border-ink ring-2 ring-ink/30" : "border-[rgba(51,56,48,0.2)]"
                    }`}
                  >
                    <Icon name={mark.id} size={32} />
                  </button>
                );
              })}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="flex items-center gap-[14px] rounded-[8px] bg-canvas p-[14px]">
              <Icon name={form.spaceMark} size={44} />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-ink">{form.spaceName || "Sin nombre"}</p>
                <p className="truncate text-[12px] text-muted">{form.contactEmail || "Sin correo de contacto"}</p>
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-between pt-[4px]">
            <div className="flex gap-[6px]">
              {STEPS.map((label, index) => (
                <span key={label} className={`h-[6px] rounded-full ${index <= step ? "w-[24px] bg-ink" : "w-[6px] bg-line"}`} />
              ))}
            </div>
            <div className="flex gap-[8px]">
              <Button variant="filter" height={36} onClick={step === 0 ? onClose : () => setStep((s) => s - 1)}>
                {step === 0 ? "Cancelar" : "Atrás"}
              </Button>
              {step < STEPS.length - 1 ? (
                <Button variant="primary" height={36} onClick={() => canNext && setStep((s) => s + 1)} disabled={!canNext}>
                  Siguiente
                </Button>
              ) : (
                <Button variant="primary" height={36} onClick={() => void finish()} disabled={saving}>
                  {saving ? "Guardando…" : "Crear espacio"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
