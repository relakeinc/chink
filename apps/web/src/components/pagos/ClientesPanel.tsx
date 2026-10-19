import { useState } from "react";
import { api } from "@/lib/api";
import { useAsync, ErrorBlock, LoadingBlock } from "@/lib/useAsync";
import { formatCOP, formatInt } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { SearchInput } from "@/components/ui/inputs";
import { Button } from "@/components/ui/primitives";
import Modal, { inputClass } from "@/components/ui/Modal";
import { useNotice } from "@/lib/toast";

interface ClienteRow {
  id: string;
  nombre: string;
  numero_contacto: string | null;
  notas: string | null;
  total_pagos: number;
  monto_total: number;
  ultimo_pago: string | null;
}

export default function ClientesPanel() {
  const { can } = useAuth();
  const puedeRegistrar = can("register");
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState<ClienteRow | null>(null);
  const [nombre, setNombre] = useState("");
  const [contacto, setContacto] = useState("");
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { showNotice } = useNotice();

  const list = useAsync(() => api.getClientes(search ? { q: search } : undefined), [search]);
  const rows: ClienteRow[] = list.data?.data ?? [];

  function abrirNuevo() {
    setEditando(null);
    setNombre("");
    setContacto("");
    setNotas("");
    setError(null);
    setShowModal(true);
  }

  function abrirEditar(c: ClienteRow) {
    setEditando(c);
    setNombre(c.nombre);
    setContacto(c.numero_contacto ?? "");
    setNotas(c.notas ?? "");
    setError(null);
    setShowModal(true);
  }

  async function guardar() {
    setError(null);
    if (nombre.trim().length < 2) {
      setError("El nombre es obligatorio (mínimo 2 letras).");
      return;
    }
    setSaving(true);
    try {
      if (editando) {
        await api.updateCliente(editando.id, { nombre: nombre.trim(), numeroContacto: contacto.trim() || null, notas: notas.trim() || null });
        showNotice("Cliente actualizado.");
      } else {
        await api.createCliente({ nombre: nombre.trim(), numeroContacto: contacto.trim() || null, notas: notas.trim() || null });
        showNotice("Cliente creado.");
      }
      setShowModal(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function eliminar(c: ClienteRow) {
    if (!window.confirm(`¿Eliminar a ${c.nombre}? Solo si no tiene pagos.`)) return;
    try {
      await api.deleteCliente(c.id);
      showNotice("Cliente eliminado.");
    } catch (cause) {
      showNotice(cause instanceof Error ? cause.message : "No se pudo eliminar", { variant: "error" });
    }
  }

  const baseColumns: Column<ClienteRow>[] = [
    {
      key: "nombre",
      header: "Cliente",
      width: "flex-1 min-w-px",
      render: (c: ClienteRow) => (
        <span className="flex flex-col gap-[3px] leading-[1.4]">
          <span className="text-[13px] font-semibold text-ink">{c.nombre}</span>
          <span className="text-[10px] text-muted">{[c.numero_contacto, c.ultimo_pago ? `Último pago: ${c.ultimo_pago}` : null].filter(Boolean).join(" · ") || "—"}</span>
        </span>
      ),
    },
    {
      key: "pagos",
      header: "Pagos",
      width: "w-[90px]",
      align: "right",
      render: (c: ClienteRow) => <span className="text-[13px] font-semibold text-ink">{formatInt(c.total_pagos)}</span>,
    },
    {
      key: "total",
      header: "Total",
      width: "w-[140px]",
      align: "right",
      render: (c: ClienteRow) => <span className="text-[13px] font-semibold text-ink">{formatCOP(c.monto_total)}</span>,
    },
  ];
  const actionColumn: Column<ClienteRow> | null = puedeRegistrar
    ? {
        key: "acciones",
        header: "Acciones",
        width: "w-[150px]",
        render: (c: ClienteRow) => (
          <span className="flex items-center gap-[8px]">
            <button type="button" onClick={() => abrirEditar(c)} className="text-[11px] font-semibold text-ink hover:underline">
              Editar
            </button>
            <button type="button" onClick={() => void eliminar(c)} className="text-[11px] font-semibold text-warn hover:underline">
              Eliminar
            </button>
          </span>
        ),
      }
    : null;

  const columns: Column<ClienteRow>[] = actionColumn ? [...baseColumns, actionColumn] : baseColumns;

  return (
    <>
      <div className="flex flex-wrap items-center gap-[12px]">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar cliente" fluid />
        {puedeRegistrar ? (
          <Button variant="primary" icon="plus" height={38} onClick={abrirNuevo}>
            Nuevo cliente
          </Button>
        ) : null}
      </div>

      {list.loading ? (
        <LoadingBlock variant="table" />
      ) : list.error ? (
        <ErrorBlock message={list.error} onRetry={() => void list.reload()} />
      ) : rows.length === 0 ? (
        <p className="py-[20px] text-center text-[12px] text-muted">Sin clientes todavía.</p>
      ) : (
        <DataTable columns={columns} rows={rows} rowKey={(c) => c.id} />
      )}

      <Modal
        open={showModal}
        title={editando ? "Editar cliente" : "Nuevo cliente"}
        description="Asocia comprobantes a un cliente para conciliar por tercero."
        onClose={() => setShowModal(false)}
        footer={
          <>
            <Button variant="filter" height={36} onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button variant="primary" height={36} onClick={() => void guardar()} disabled={saving}>
              {saving ? "Guardando…" : editando ? "Guardar" : "Crear"}
            </Button>
          </>
        }
      >
        {error ? <p className="text-[12px] text-warn">{error}</p> : null}
        <div className="flex flex-col gap-[14px]">
          <label className="flex flex-col gap-[6px]">
            <span className="text-[11px] font-medium text-ink">Nombre</span>
            <input className={inputClass} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Tienda La Esquina" />
          </label>
          <label className="flex flex-col gap-[6px]">
            <span className="text-[11px] font-medium text-ink">Contacto</span>
            <input className={inputClass} value={contacto} onChange={(e) => setContacto(e.target.value)} placeholder="Teléfono o correo" />
          </label>
          <label className="flex flex-col gap-[6px]">
            <span className="text-[11px] font-medium text-ink">Notas</span>
            <input className={inputClass} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" />
          </label>
        </div>
      </Modal>
    </>
  );
}
