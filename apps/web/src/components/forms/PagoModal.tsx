import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { PagoRow } from "@/lib/api";
import { FilterSelect } from "@/components/ui/inputs";
import Modal, { inputClass } from "@/components/ui/Modal";
import { Button } from "@/components/ui/primitives";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-[6px]">
      <span className="text-[11px] font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}

const ESTADOS = [
  { value: "verificado", label: "Verificado" },
  { value: "revisar", label: "Por revisar" },
  { value: "ilegible", label: "Ilegible" },
  { value: "duplicado", label: "Duplicado" },
];

interface PagoModalProps {
  open: boolean;
  onClose: () => void;
  /** Edición: precarga y guarda PATCH. Sin initial: alta. */
  initial?: PagoRow;
}

export default function PagoModal({ open, onClose, initial }: PagoModalProps) {
  const [clientes, setClientes] = useState<{ id: string; nombre: string }[]>([]);
  const [monto, setMonto] = useState("");
  const [bancoDestino, setBancoDestino] = useState("");
  const [fuenteFondos, setFuenteFondos] = useState("");
  const [referencia, setReferencia] = useState("");
  const [fecha, setFecha] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [para, setPara] = useState("");
  const [notas, setNotas] = useState("");
  const [estado, setEstado] = useState("verificado");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    void api.getClientes().then((r) => setClientes(r.data.map((c) => ({ id: c.id, nombre: c.nombre })))).catch(() => setClientes([]));
  }, [open ]);

  useEffect(() => {
    if (!open) return;
    setMonto(initial ? String(initial.monto) : "");
    setBancoDestino(initial?.banco_destino ?? "");
    setFuenteFondos(initial?.fuente_fondos ?? "");
    setReferencia(initial?.referencia ?? "");
    setFecha(initial?.fecha_pago ?? "");
    setClienteId(initial?.cliente_id ?? "");
    setPara(initial?.para ?? "");
    setNotas(initial?.notas ?? "");
    setEstado(initial?.estado ?? "verificado");
    setError(null);
  }, [open, initial]);

  async function submit() {
    setError(null);
    const amount = Number(monto.replace(/[^0-9.]/g, ""));
    if (!initial && (!Number.isFinite(amount) || amount <= 0)) {
      setError("Indica un monto mayor que cero.");
      return;
    }

    setSaving(true);
    try {
      if (initial) {
        await api.updatePago(initial.id, {
          estado,
          notas: notas.trim() || undefined,
          clienteId: clienteId || undefined,
        });
      } else {
        await api.createPago({
          monto: amount,
          bancoDestino: bancoDestino.trim() || undefined,
          fuenteFondos: fuenteFondos.trim() || undefined,
          referencia: referencia.trim() || undefined,
          fechaPago: fecha || undefined,
          para: para.trim() || undefined,
          notas: notas.trim() || undefined,
          clienteId: clienteId || undefined,
        });
      }
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el pago");
    } finally {
      setSaving(false);
    }
  }

  const clienteOptions = [{ value: "", label: "Sin cliente" }, ...clientes.map((c) => ({ value: c.id, label: c.nombre }))];

  return (
    <Modal
      open={open}
      title={initial ? "Editar comprobante" : "Registrar pago"}
      description={initial ? "Ajusta estado, cliente o notas del comprobante." : "Alta manual: lo del bot llega solo con foto."}
      onClose={onClose}
      footer={
        <>
          <Button variant="filter" height={36} onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" height={36} onClick={() => void submit()} disabled={saving}>
            {saving ? "Guardando…" : initial ? "Guardar" : "Registrar"}
          </Button>
        </>
      }
    >
      {error ? <p className="text-[12px] text-warn">{error}</p> : null}

      <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2">
        {!initial ? (
          <Field label="Monto (COP)">
            <input className={inputClass} value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" placeholder="Ej: 250000" />
          </Field>
        ) : (
          <Field label="Monto">
            <input className={inputClass} value={monto} disabled />
          </Field>
        )}

        <Field label="Referencia">
          <input className={inputClass} value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Aprobación / CUS / ID" disabled={Boolean(initial)} />
        </Field>

        <Field label="Banco destino (recibe)">
          <input className={inputClass} value={bancoDestino} onChange={(e) => setBancoDestino(e.target.value)} placeholder="Ej: Nequi" disabled={Boolean(initial)} />
        </Field>

        <Field label="Desde (origen)">
          <input className={inputClass} value={fuenteFondos} onChange={(e) => setFuenteFondos(e.target.value)} placeholder="Ej: Bancolombia" disabled={Boolean(initial)} />
        </Field>

        {!initial ? (
          <>
            <Field label="Fecha">
              <input className={inputClass} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </Field>

            <Field label="Cliente">
              <FilterSelect label="Cliente" tone="light" allowClear={false} value={clienteId} options={clienteOptions} onChange={setClienteId} />
            </Field>

            <Field label="Para (destinatario)">
              <input className={inputClass} value={para} onChange={(e) => setPara(e.target.value)} placeholder="Nombre o comercio" />
            </Field>
          </>
        ) : (
          <Field label="Cliente">
            <FilterSelect label="Cliente" tone="light" allowClear={false} value={clienteId} options={clienteOptions} onChange={setClienteId} />
          </Field>
        )}

        <Field label="Estado">
          <FilterSelect label="Estado" tone="light" allowClear={false} value={estado} options={ESTADOS} onChange={setEstado} />
        </Field>

        <Field label="Notas">
          <input className={inputClass} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" />
        </Field>
      </div>
    </Modal>
  );
}
