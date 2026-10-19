import { useRef, useState } from "react";
import { api } from "@/lib/api";
import type { PagoRow } from "@/lib/api";
import { useAsync, ErrorBlock, LoadingBlock, useDebounced } from "@/lib/useAsync";
import { formatCOP, formatInt } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";
import { useAuth } from "@/context/AuthContext";
import KpiStrip, { KpiValue, PageFooter, PageHeader } from "@/components/ui/KpiStrip";
import Tabs from "@/components/ui/Tabs";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { FilterSelect, Pagination, SearchInput, useCommandK } from "@/components/ui/inputs";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { useNotice } from "@/lib/toast";
import PagoModal from "@/components/forms/PagoModal";
import CierreCaja from "@/components/pagos/CierreCaja";
import ClientesPanel from "@/components/pagos/ClientesPanel";

const ESTADO_TONE: Record<string, "success" | "warn" | "neutral"> = {
  verificado: "success",
  revisar: "warn",
  ilegible: "warn",
  duplicado: "neutral",
};

const ESTADO_LABEL: Record<string, string> = {
  verificado: "Verificado",
  revisar: "Por revisar",
  ilegible: "Ilegible",
  duplicado: "Duplicado",
};

const ESTADOS = [
  { value: "verificado", label: "Verificados" },
  { value: "revisar", label: "Por revisar" },
  { value: "ilegible", label: "Ilegibles" },
  { value: "duplicado", label: "Duplicados" },
];

export default function Pagos() {
  const { can } = useAuth();
  const puedeRegistrar = can("register");
  const [seccion, setSeccion] = useState("pagos");
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput, 300);
  const [estado, setEstado] = useState("");
  const [banco, setBanco] = useState("");
  const [page, setPage] = useState(1);
  const [showPago, setShowPago] = useState(false);
  const [editPago, setEditPago] = useState<PagoRow | null>(null);
  const { showNotice } = useNotice();
  const searchRef = useRef<HTMLInputElement>(null);
  useCommandK(searchRef);

  const list = useAsync(
    () =>
      api.getPagos({
        q: search || undefined,
        estado: estado || undefined,
        banco: banco || undefined,
        page,
        pageSize: 25,
      }),
    [search, estado, banco, page],
  );
  const cierre = useAsync(() => api.getCierre(), []);

  const rows: PagoRow[] = list.data?.data ?? [];
  const total = list.data?.meta.total ?? 0;

  function exportCsv() {
    downloadCsv(
      "pagos-chink.csv",
      ["Fecha", "Monto", "Banco destino", "Desde", "Referencia", "Cliente", "Estado"],
      rows.map((p) => [p.fecha_pago ?? "", String(p.monto), p.banco_destino ?? "", p.fuente_fondos ?? "", p.referencia ?? "", p.cliente ?? "", ESTADO_LABEL[p.estado] ?? p.estado]),
    );
    showNotice("Comprobantes exportados.");
  }

  async function marcarVerificado(pago: PagoRow) {
    try {
      await api.updatePago(pago.id, { estado: "verificado" });
      showNotice("Pago marcado como verificado.");
    } catch (cause) {
      showNotice(cause instanceof Error ? cause.message : "No se pudo actualizar", { variant: "error" });
    }
  }

  async function eliminarPago(pago: PagoRow) {
    if (!window.confirm(`¿Eliminar el comprobante por ${formatCOP(pago.monto)} (${pago.referencia || "sin referencia"})?`)) return;
    try {
      await api.deletePago(pago.id);
      showNotice("Comprobante eliminado.");
    } catch (cause) {
      showNotice(cause instanceof Error ? cause.message : "No se pudo eliminar", { variant: "error" });
    }
  }

  const kpis = cierre.data
    ? [
        { label: "VERIFICADO HOY", value: <KpiValue value={cierre.data.totalVerificado} format={formatCOP} />, context: `${cierre.data.countVerificado} ${cierre.data.countVerificado === 1 ? "comprobante" : "comprobantes"}` },
        { label: "POR REVISAR", value: <KpiValue value={cierre.data.totalRevisar} format={formatCOP} />, context: `${cierre.data.countRevisar} ${cierre.data.countRevisar === 1 ? "comprobante" : "comprobantes"}` },
        {
          label: "BANCOS HOY",
          value: `${cierre.data.porBanco.length}`,
          context: cierre.data.porBanco[0] ? `${cierre.data.porBanco[0].banco} lidera` : "Sin movimiento",
        },
      ]
    : [];

  const columns: Column<PagoRow>[] = [
    {
      key: "fecha",
      header: "Fecha / Referencia",
      width: "w-[170px]",
      render: (p: PagoRow) => (
        <span className="flex flex-col gap-[3px]">
          <span className="text-[13px] font-semibold leading-[1.4] text-ink">{p.fecha_pago ?? "—"}</span>
          <span className="text-[10px] leading-[1.4] text-muted">{p.referencia || "Sin referencia"}</span>
        </span>
      ),
    },
    {
      key: "monto",
      header: "Monto",
      width: "w-[130px]",
      align: "right",
      render: (p: PagoRow) => <span className="text-[13px] font-semibold text-ink">{formatCOP(p.monto)}</span>,
    },
    {
      key: "banco",
      header: "Banco / Origen",
      width: "flex-1 min-w-px",
      render: (p: PagoRow) => (
        <span className="flex flex-col gap-[3px] leading-[1.4]">
          <span className="text-[13px] text-ink">{p.banco_destino ?? <span className="text-warn">Sin confirmar</span>}</span>
          <span className="text-[10px] text-muted">
            {[p.fuente_fondos ? `Desde: ${p.fuente_fondos}` : null, p.numero_destino, p.cliente].filter(Boolean).join(" · ") || "—"}
          </span>
        </span>
      ),
    },
    {
      key: "estado",
      header: "Estado",
      width: "w-[130px]",
      render: (p: PagoRow) => <Badge tone={ESTADO_TONE[p.estado] ?? "neutral"}>{ESTADO_LABEL[p.estado] ?? p.estado}</Badge>,
    },
    {
      key: "acciones",
      header: "Acciones",
      width: "w-[210px]",
      render: (p: PagoRow) => (
        <span className="flex items-center gap-[8px]">
          {p.imagen_url ? (
            <a href={p.imagen_url} target="_blank" rel="noreferrer" className="text-[11px] font-semibold text-ink hover:underline">
              Ver
            </a>
          ) : null}
          {puedeRegistrar && p.estado !== "verificado" ? (
            <button type="button" onClick={() => void marcarVerificado(p)} className="text-[11px] font-semibold text-ink hover:underline">
              Verificar
            </button>
          ) : null}
          {puedeRegistrar ? (
            <button type="button" onClick={() => setEditPago(p)} className="text-[11px] font-semibold text-ink hover:underline">
              Editar
            </button>
          ) : null}
          {puedeRegistrar ? (
            <button type="button" onClick={() => void eliminarPago(p)} className="text-[11px] font-semibold text-warn hover:underline">
              Eliminar
            </button>
          ) : null}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Pagos"
        description="Comprobantes del espacio: lo que entra, verificado contra el banco."
        actions={
          <>
            <Button variant="dark" icon="download" height={38} onClick={exportCsv}>
              Exportar
            </Button>
            {puedeRegistrar ? (
              <Button variant="primary" icon="plus" height={38} onClick={() => setShowPago(true)}>
                Registrar pago
              </Button>
            ) : null}
          </>
        }
      />

      <Card className="flex flex-col overflow-hidden">
        <Tabs
          items={[
            { id: "pagos", label: "Comprobantes" },
            { id: "clientes", label: "Clientes" },
            { id: "cierre", label: "Cierre del día" },
          ]}
          active={seccion}
          onChange={setSeccion}
        />

        {seccion === "pagos" ? (
          <div className="flex flex-col gap-[20px] p-[20px]">
            {cierre.loading ? null : cierre.error ? <ErrorBlock message={cierre.error} onRetry={() => void cierre.reload()} /> : <KpiStrip items={kpis} />}

            <div className="flex flex-wrap items-center gap-[12px]">
              <SearchInput value={searchInput} onChange={setSearchInput} placeholder="Buscar por referencia o banco" inputRef={searchRef} fluid />
              <FilterSelect label="Estado" placeholder="Todos los estados" options={ESTADOS.filter((e) => e.value !== "").map((e) => ({ value: e.value, label: e.label }))} value={estado} onChange={(v) => { setEstado(v); setPage(1); }} />
              <SearchInput value={banco} onChange={(v) => { setBanco(v); setPage(1); }} placeholder="Filtrar banco" width={180} />
            </div>

            {list.loading ? (
              <LoadingBlock variant="table" />
            ) : list.error ? (
              <ErrorBlock message={list.error} onRetry={() => void list.reload()} />
            ) : rows.length === 0 ? (
                <p className="py-[20px] text-center text-[12px] text-muted">Sin comprobantes todavía. Envía una foto al bot o registra uno manual.</p>
              ) : (
                <>
                  <DataTable columns={columns} rows={rows} rowKey={(p) => p.id} />
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted">
                    Mostrando {rows.length} de {formatInt(total)} comprobantes
                  </span>
                  <Pagination page={page} totalPages={list.data?.meta.totalPages ?? 1} onChange={setPage} />
                </div>
              </>
            )}
          </div>
        ) : null}

        {seccion === "clientes" ? (
          <div className="p-[20px]">
            <ClientesPanel />
          </div>
        ) : null}

        {seccion === "cierre" ? (
          <div className="p-[20px]">
            <CierreCaja />
          </div>
        ) : null}
      </Card>

      <PageFooter left="Comprobantes registrados por el bot o a mano" right="Montos en COP" />
      <div className="h-[24px]" />

      <PagoModal open={showPago} onClose={() => setShowPago(false)} />
      {editPago ? (
        <PagoModal open onClose={() => setEditPago(null)} initial={editPago} />
      ) : null}
    </>
  );
}
