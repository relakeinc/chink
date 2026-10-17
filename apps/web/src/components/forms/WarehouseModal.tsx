import { useState } from "react";
import { api } from "@/lib/api";
import type { RoleMatrix } from "@/lib/api";
import { FilterSelect } from "@/components/ui/inputs";
import Modal, { inputClass } from "@/components/ui/Modal";
import { Button } from "@/components/ui/primitives";
import { showNotice } from "@/lib/toast";

interface WarehouseModalProps {
  open: boolean;
  onClose: () => void;
  onDone: () => void | Promise<void>;
}

const DEFAULT_CODE = `ALM-${String(Date.now() % 1000).padStart(3, "0")}`;

export default function WarehouseModal({ open, onClose, onDone }: WarehouseModalProps) {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [address, setAddress] = useState("");
  const [capacity, setCapacity] = useState("1000");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setError(null);
    if (name.trim().length < 2) {
      setError("Ponle un nombre al almacén.");
      return;
    }
    if (!location.trim()) {
      setError("Indica la localidad.");
      return;
    }
    const cap = Number(capacity);
    if (!Number.isFinite(cap) || cap < 1) {
      setError("La capacidad debe ser mayor que cero.");
      return;
    }

    setSaving(true);
    try {
      await api.createWarehouse({
        code: code.trim(),
        name: name.trim(),
        location: location.trim(),
        address: address.trim(),
        capacity: Math.round(cap),
      });
      showNotice(`Almacén ${name.trim()} creado.`);
      setName("");
      setLocation("");
      setAddress("");
      setCapacity("1000");
      await onDone();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo crear el almacén");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Añadir almacén"
      description="Registra una nueva ubicación para distribuir las existencias."
      onClose={onClose}
      footer={
        <>
          <Button variant="filter" height={36} onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" height={36} onClick={() => void submit()} disabled={saving}>
            {saving ? "Guardando…" : "Crear almacén"}
          </Button>
        </>
      }
    >
      {error ? <p className="text-[12px] text-warn">{error}</p> : null}

      <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2">
        <label className="flex flex-col gap-[6px]">
          <span className="text-[11px] font-medium text-ink">Código</span>
          <input className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} placeholder="ALM-004" />
        </label>
        <label className="flex flex-col gap-[6px]">
          <span className="text-[11px] font-medium text-ink">Nombre</span>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Almacén sur" />
        </label>
        <label className="flex flex-col gap-[6px]">
          <span className="text-[11px] font-medium text-ink">Localidad</span>
          <input className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Sevilla" />
        </label>
        <label className="flex flex-col gap-[6px]">
          <span className="text-[11px] font-medium text-ink">Capacidad (u.)</span>
          <input className={inputClass} value={capacity} onChange={(e) => setCapacity(e.target.value)} inputMode="numeric" />
        </label>
        <label className="col-span-2 flex flex-col gap-[6px]">
          <span className="text-[11px] font-medium text-ink">Dirección</span>
          <input className={inputClass} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Pol. El Pino, 12" />
        </label>
      </div>
    </Modal>
  );
}

interface InviteModalProps {
  open: boolean;
  onClose: () => void;
  matrix: RoleMatrix | null;
  warehouseOptions: { value: string; label: string }[];
  onDone: () => void | Promise<void>;
}

/** Invita a un miembro. La cuenta nace pendiente hasta que se activa. */
export function InviteModal({ open, onClose, matrix, warehouseOptions, onDone }: InviteModalProps) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setError(null);
    if (!name.trim()) {
      setError("Indica el nombre.");
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError("El correo no parece válido.");
      return;
    }
    if (!roleId) {
      setError("Elige un rol.");
      return;
    }

    setSaving(true);
    try {
      const result = await api.inviteMember({
        email: email.trim(),
        name: name.trim(),
        roleId,
        warehouseIds: warehouseId ? [warehouseId] : undefined,
      });
      if (result.data.alreadyMember) {
        showNotice(
          result.data.emailSent
            ? `Ya es miembro: se le avisó por correo a ${result.data.email}.`
            : `Ya es miembro, pero el aviso por correo no salió.`,
          result.data.emailSent ? {} : { variant: "warning", icon: "warning" },
        );
      } else {
        showNotice(
          result.data.emailSent
            ? `Invitación enviada a ${result.data.email}.`
            : `Invitación creada, pero el correo no salió. Clave temporal: ${result.data.temporaryPassword}`,
          result.data.emailSent ? {} : { variant: "warning", icon: "warning" },
        );
      }
      setEmail("");
      setName("");
      await onDone();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo enviar la invitación");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Invitar miembro"
      description="La invitación caduca en 7 días. El acceso depende del rol asignado."
      onClose={onClose}
      footer={
        <>
          <Button variant="filter" height={36} onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" height={36} onClick={() => void submit()} disabled={saving}>
            {saving ? "Enviando…" : "Enviar invitación"}
          </Button>
        </>
      }
    >
      {error ? <p className="text-[12px] text-warn">{error}</p> : null}

      <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2">
        <label className="flex flex-col gap-[6px]">
          <span className="text-[11px] font-medium text-ink">Nombre</span>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Pablo Vidal" />
        </label>
        <label className="flex flex-col gap-[6px]">
          <span className="text-[11px] font-medium text-ink">Correo</span>
          <input className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pablo@chink.es" type="email" />
        </label>
        <label className="flex flex-col gap-[6px]">
          <span className="text-[11px] font-medium text-ink">Rol</span>
          <FilterSelect
            label="Rol"
            tone="light"
            allowClear={false}
            placeholder="Elige un rol"
            value={roleId}
            options={(matrix?.roles ?? []).map((r) => ({ value: r.id, label: r.name }))}
            onChange={setRoleId}
          />
        </label>
        <label className="flex flex-col gap-[6px]">
          <span className="text-[11px] font-medium text-ink">Almacén</span>
          <FilterSelect
            label="Almacén"
            tone="light"
            placeholder="Todos los almacenes"
            value={warehouseId}
            options={warehouseOptions}
            onChange={setWarehouseId}
          />
        </label>
      </div>
    </Modal>
  );
}