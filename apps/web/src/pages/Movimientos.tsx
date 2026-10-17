import { useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import type { MovementRow } from "@/lib/api";
import { useAsync, ErrorBlock, LoadingBlock, useDebounced } from "@/lib/useAsync";
import DateRangePicker from "@/components/ui/DateRangePicker";
import type { DateRange } from "@/components/ui/DateRangePicker";
import { formatRange } from "@/components/ui/DateRangePicker";
import MovementModal from "@/components/forms/MovementModal";
import { formatInt, formatSignedUnits } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";
import KpiStrip, { KpiValue, PageFooter, PageHeader } from "@/components/ui/KpiStrip";
import Tabs from "@/components/ui/Tabs";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { ColumnMenu, FilterSelect, Pagination, SearchInput, useCommandK } from "@/components/ui/inputs";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { ProductThumb } from "@/components/ui/ProductThumb";
import { Icon } from "@/components/ui/Icon";
import { useNotice } from "@/lib/toast";

const TOGGLEABLE_COLUMNS = [
  { key: "type", label: "Tipo" },
  { key: "route", label: "Origen → Destino" },
  { key: "owner", label: "Responsable" },
];

export default function Movimientos() {
  const [params] = useSearchParams();
  const [view, setView] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput, 300);
  const [range, setRange] = useState<DateRange>({ from: null, to: null });
  // Enlace profundo desde Almacenes (?almacen=ALM-001): filtra al llegar.
  const [warehouse, setWarehouse] = useState(() => params.get("almacen") ?? "");
  const [owner, setOwner] = useState("");
  const [page, setPage] = useState(1);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [showMovement, setShowMovement] = useState(false);
  const { showNotice } = useNotice();
  const searchRef = useRef<HTMLInputElement>(null);
  useCommandK(searchRef);

  const warehouses = useAsync(() => api.getWarehouses(), []);

  const list = useAsync(
    () =>
      api.getMovements({
        view: view === "all" ? undefined : view.toUpperCase(),
        search,
        warehouse,
        owner,
        from: range.from ?? undefined,
        to: range.to ?? undefined,
        page,
        pageSize: 25,
      }),
    [view, search, warehouse, owner, range.from, range.to, page],
  );
  const summary = useAsync(() => api.getMovementsSummary({ from: range.from ?? undefined, to: range.to ?? undefined }), [range.from, range.to]);

  const rows: MovementRow[] = list.data?.data ?? [];
  const counts = list.data?.meta.counts ?? {};
  const balance = summary.data?.balance ?? 0;

  const tabs = [
    { id: "all", label: "Todos los movimientos", count: counts.all ?? 0 },
    { id: "entrada", label: "Entradas", count: counts.ENTRY ?? 0 },
    { id: "salida", label: "Salidas", count: counts.EXIT ?? 0 },
    { id: "transferencia", label: "Transferencias", count: counts.TRANSFER ?? 0 },
    { id: "ajuste", label: "Ajustes", count: counts.ADJUSTMENT ?? 0 },
  ];

  const kpis = summary.data
    ? [
        { label: "ENTRADAS", value: <KpiValue value={summary.data.entries.units} format={(v) => `${formatInt(Math.round(v))} u.`} />, context: `${summary.data.entries.count} movimientos` },
        { label: "SALIDAS", value: <KpiValue value={summary.data.exits.units} format={(v) => `${formatInt(Math.round(v))} u.`} />, context: `${summary.data.exits.count} movimientos` },
        { label: "TRANSFERENCIAS", value: <KpiValue value={summary.data.transfers.units} format={(v) => `${formatInt(Math.round(v))} u.`} />, context: `${summary.data.transfers.count} movimientos` },
        { label: "AJUSTE NETO", value: `${summary.data.net < 0 ? "−" : ""}${Math.abs(summary.data.net)} u.`, context: `${summary.data.adjustments.count} movimientos` },
      ]
    : [];

  function exportCsv() {
    downloadCsv(
      "movimientos-chink.csv",
      ["Referencia", "Fecha", "Hora", "Tipo", "Producto", "SKU", "Cantidad", "Origen → Destino", "Responsable", "Estado"],
      rows.map((m) => [m.ref, m.date, m.time, m.type, m.product, m.sku, String(m.quantity), m.route, m.owner, m.status]),
    );
    showNotice("Historial exportado.");
  }

  const columns: Column<MovementRow>[] = [
    {
      key: "ref",
      header: "Referencia / Fecha",
      width: "w-[158px]",
      render: (m) => (
        <span className="flex flex-col gap-[3px]">
          <span className="text-[13px] font-semibold leading-[1.4] text-ink">{m.ref}</span>
          <span className="text-[10px] leading-[1.4] text-muted">
            {m.date} · {m.time}
          </span>
        </span>
      ),
    },
    ...(hidden.has("type")
      ? []
      : [
          {
            key: "type",
            header: "Tipo",
            width: "w-[130px]",
            render: (m: MovementRow) => <Badge tone={m.type === "Entrada" ? "success" : "neutral"}>{m.type}</Badge>,
          },
        ]),
    {
      key: "product",
      header: "Producto / SKU",
      width: "flex-1 min-w-px",
      render: (m) => (
        <span className="flex items-center gap-[11px]">
          <ProductThumb imageUrl={m.imageUrl} name={m.product} />
          <span className="flex min-w-px flex-col gap-[2px] leading-[1.4]">
            <span className="text-[13px] text-ink">{m.product}</span>
            <span className="text-[10px] text-muted">{m.sku}</span>
          </span>
        </span>
      ),
    },
    {
      key: "quantity",
      header: "Cantidad",
      width: "w-[100px]",
      align: "right",
      render: (m) => <span className="text-[13px] font-semibold text-ink">{formatSignedUnits(m.quantity)}</span>,
    },
    ...(hidden.has("route")
      ? []
      : [{ key: "route", header: "Origen → Destino", width: "w-[260px]", render: (m: MovementRow) => <span className="text-[13px] text-ink">{m.route}</span> }]),
    ...(hidden.has("owner")
      ? []
      : [{ key: "owner", header: "Responsable", width: "w-[150px]", render: (m: MovementRow) => <span className="text-[13px] text-ink">{m.owner}</span> }]),
    {
      key: "status",
      header: "Estado",
      width: "w-[110px]",
      render: (m: MovementRow) => <Badge tone="success">{m.status}</Badge>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Movimientos"
        description="Cada entrada, cada salida. La trazabilidad de tu inventario."
        actions={
          <>
            <Button variant="dark" icon="download" onClick={exportCsv}>
              Exportar historial
            </Button>
            <Button variant="primary" icon="plus" onClick={() => setShowMovement(true)}>
              Registrar movimiento
            </Button>
          </>
        }
      />

      {summary.loading ? <LoadingBlock variant="kpi" /> : <KpiStrip items={kpis} />}

      <Card className="flex flex-col overflow-hidden">
        <Tabs items={tabs} active={view} onChange={(id) => { setView(id); setPage(1); }} />

        <div className="flex flex-wrap items-center gap-[8px] p-[16px]">
          <SearchInput
            inputRef={searchRef}
            value={searchInput}
            onChange={setSearchInput}
            placeholder="Buscar por producto, SKU o referencia"
          />
          <DateRangePicker value={range} onChange={(next) => { setRange(next); setPage(1); }} />
          <FilterSelect
            label="Todos los almacenes"
            placeholder="Todos los almacenes"
            value={warehouse}
            onChange={(value) => { setWarehouse(value); setPage(1); }}
            options={(warehouses.data?.data ?? []).map((w) => ({ value: w.code, label: w.name }))}
          />
          <FilterSelect
            label="Responsable"
            placeholder="Responsable"
            value={owner}
            onChange={(value) => { setOwner(value); setPage(1); }}
            options={[
              { value: "lucia@chink.es", label: "Lucía Martín" },
              { value: "diego@chink.es", label: "Diego Pérez" },
              { value: "ana@chink.es", label: "Ana López" },
              { value: "carlos@chink.es", label: "Carlos Ruiz" },
            ]}
          />

          <div className="relative flex min-w-px flex-1 items-start justify-end">
            <ColumnMenu
              items={TOGGLEABLE_COLUMNS.map((column) => ({ id: column.key, label: column.label }))}
              hiddenIds={hidden}
              onToggle={(id) =>
                setHidden((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
            />
          </div>
        </div>

        <div className="flex h-[34px] items-center justify-between bg-surface px-[20px] text-[11px] leading-[1.4]">
          <span className="text-muted">
            {list.data?.meta.total ?? 0} movimientos confirmados · {formatRange(range, "Historial completo")} · Ordenados del más reciente al más antiguo
          </span>
          <span className="font-medium text-ink">Balance de stock: {balance >= 0 ? "+" : "−"}{Math.abs(balance)} u.</span>
        </div>

        {list.error ? (
          <ErrorBlock message={list.error} onRetry={() => void list.reload()} />
        ) : list.loading ? (
          <LoadingBlock />
        ) : (
          <DataTable columns={columns} rows={rows} rowKey={(m) => m.id} rowHeight={40} />
        )}

        <div className="flex items-center justify-between px-[20px] py-[16px]">
          <span className="text-[11px] text-muted">
            Mostrando {rows.length} de {list.data?.meta.total ?? 0} movimientos · 9–15 octubre 2026
          </span>
          <Pagination page={page} totalPages={list.data?.meta.totalPages ?? 1} onChange={setPage} />
        </div>
      </Card>

      <PageFooter left="Última actualización: 15 oct 2026 · 10:42" right="Datos de ejemplo · COP" />
      <MovementModal
        open={showMovement}
        onClose={() => setShowMovement(false)}
        onDone={async () => {
          await Promise.all([list.reload(), summary.reload(), warehouses.reload()]);
        }}
      />
    </>
  );
}