import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Product, Warehouse } from "@/lib/api";
import { FilterSelect } from "@/components/ui/inputs";
import Modal, { inputClass } from "@/components/ui/Modal";
import { Button } from "@/components/ui/primitives";
import { showNotice } from "@/lib/toast";

type MovementType = "ENTRY" | "EXIT" | "TRANSFER" | "ADJUSTMENT";

const TYPES: { value: MovementType; label: string }[] = [
  { value: "ENTRY", label: "Entrada" },
  { value: "EXIT", label: "Salida" },
  { value: "TRANSFER", label: "Transferencia" },
  { value: "ADJUSTMENT", label: "Ajuste" },
];

interface MovementModalProps {
  open: boolean;
  onClose: () => void;
  /** Fuerza el tipo: "Transferir stock" abre siempre en TRANSFER. */
  initialType?: MovementType;
  /** Preselecciona el producto (p. ej. "Ajustar stock" desde Inventario). */
  initialProductId?: string;
  onDone: () => void | Promise<void>;
}

export default function MovementModal({ open, onClose, initialType = "ENTRY", initialProductId = "", onDone }: MovementModalProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [type, setType] = useState<MovementType>(initialType);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [originId, setOriginId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Los catálogos se piden una vez por apertura.
  useEffect(() => {
    if (!open) return;
    void api.getProducts({ pageSize: 100 }).then((r) => setProducts(r.data)).catch(() => setProducts([]));
    void api.getWarehouses().then((r) => setWarehouses(r.data)).catch(() => setWarehouses([]));
  }, [open ]);

  // Al abrir, parte del tipo y producto iniciales (no conserva la vez anterior).
  useEffect(() => {
    if (!open) return;
    setType(initialType);
    setProductId(initialProductId);
    setQuantity("1");
    setDirection("in");
    setOriginId("");
    setDestinationId("");
    setNote("");
    setError(null);
  }, [open, initialType, initialProductId]);

  function reset() {
    setType(initialType);
    setProductId("");
    setQuantity("1");
    setDirection("in");
    setOriginId("");
    setDestinationId("");
    setNote("");
    setError(null);
  }

  const needsDestination = type === "ENTRY" || type === "TRANSFER";
  const needsOrigin = type === "EXIT" || type === "TRANSFER" || type === "ADJUSTMENT";

  async function submit() {
    setError(null);
    const amount = Number(quantity);
    if (!Number.isFinite(amount) || amount < 1) {
      setError("Indica una cantidad mayor que cero.");
      return;
    }
    if (!productId) {
      setError("Elige un producto.");
      return;
    }
    if (needsOrigin && !originId) {
      setError("Indica el almacén de origen.");
      return;
    }
    if (needsDestination && !destinationId) {
      setError("Indica el almacén de destino.");
      return;
    }

    setSaving(true);
    try {
      await api.createMovement({
        type,
        productId,
        quantity: Math.round(amount),
        direction,
        originId: originId || null,
        destinationId: destinationId || null,
        note: note.trim() || undefined,
      });
      showNotice(`${TYPES.find((t) => t.value === type)?.label ?? "Movimiento"} registrado.`);
      await onDone();
      reset();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo registrar el movimiento");
    } finally {
      setSaving(false);
    }
  }

  const warehouseOptions = warehouses.map((w) => ({ value: w.id, label: w.name }));
  const productOptions = products.map((p) => ({ value: p.id, label: `${p.sku} · ${p.name}` }));

  return (
    <Modal
      open={open}
      title={initialType === "TRANSFER" ? "Transferir stock" : "Registrar movimiento"}
      description="El stock se ajusta al confirmar y queda registrado en el historial."
      onClose={onClose}
      footer={
        <>
          <Button variant="filter" height={36} onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" height={36} onClick={() => void submit()} disabled={saving}>
            {saving ? "Guardando…" : "Confirmar"}
          </Button>
        </>
      }
    >
      {error ? <p className="text-[12px] text-warn">{error}</p> : null}

      <div className="grid grid-cols-2 gap-[14px]">
        {initialType !== "TRANSFER" ? (
          <Field label="Tipo">
            <FilterSelect
              label="Tipo de movimiento"
              tone="light"
              allowClear={false}
              value={type}
              options={TYPES}
              onChange={(next) => setType(next as MovementType)}
            />
          </Field>
        ) : null}

        <Field label="Producto">
          <FilterSelect
            label="Producto"
            tone="light"
            allowClear={false}
            placeholder="Elige un producto"
            value={productId}
            options={productOptions}
            onChange={setProductId}
          />
        </Field>

        <Field label="Cantidad">
          <input
            className={inputClass}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            inputMode="numeric"
            placeholder="1"
          />
        </Field>

        {type === "ADJUSTMENT" ? (
          <Field label="Sentido">
            <FilterSelect
              label="Sentido del ajuste"
              tone="light"
              allowClear={false}
              value={direction}
              options={[
                { value: "in", label: "Sumar" },
                { value: "out", label: "Restar" },
              ]}
              onChange={(next) => setDirection(next as "in" | "out")}
            />
          </Field>
        ) : null}

        {needsOrigin ? (
          <Field label="Almacén de origen">
            <FilterSelect
              label="Almacén de origen"
              tone="light"
              allowClear={false}
              placeholder="Elige un almacén"
              value={originId}
              options={warehouseOptions}
              onChange={setOriginId}
            />
          </Field>
        ) : null}

        {needsDestination ? (
          <Field label="Almacén de destino">
            <FilterSelect
              label="Almacén de destino"
              tone="light"
              allowClear={false}
              placeholder={type === "TRANSFER" ? "Elige destino" : "Proveedor · Externo"}
              value={destinationId}
              options={warehouseOptions}
              onChange={setDestinationId}
            />
          </Field>
        ) : null}

        <div className="col-span-2">
          <Field label="Nota">
            <input
              className={inputClass}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Origen → destino, motivo del ajuste…"
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-[6px]">
      <span className="text-[11px] font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}