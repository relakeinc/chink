import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAsync, ErrorBlock, LoadingBlock } from "@/lib/useAsync";
import { formatInt, formatPercent, formatUnits } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";
import KpiStrip, { KpiValue, PageFooter, PageHeader } from "@/components/ui/KpiStrip";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/inputs";
import { Badge, Button, Card, LinkAction, ProgressBar } from "@/components/ui/primitives";
import { ProductThumb } from "@/components/ui/ProductThumb";
import { Icon } from "@/components/ui/Icon";
import { useNotice } from "@/lib/toast";
import MovementModal from "@/components/forms/MovementModal";
import WarehouseModal from "@/components/forms/WarehouseModal";

type LocationRow = {
  id: string;
  sku: string;
  product: string;
  icon: string;
  imageUrl: string | null;
  status: string;
  total: number;
  quantities: number[];
};

export default function Almacenes() {
  const [page, setPage] = useState(1);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const navigate = useNavigate();
  const { showNotice } = useNotice();

  const warehouses = useAsync(() => api.getWarehouses(), []);
  const locations = useAsync(() => api.getLocations(), []);
  const summary = useAsync(() => api.getWarehousesSummary(), []);

  const sites = warehouses.data?.data ?? [];
  const rows: LocationRow[] = locations.data?.data ?? [];
  const columnsMeta = locations.data?.warehouses ?? [];

  const kpis = summary.data
    ? [
        { label: "ALMACENES ACTIVOS", value: <KpiValue value={summary.data.active} format={formatInt} />, context: "Todas las ubicaciones" },
        { label: "EXISTENCIAS TOTALES", value: <KpiValue value={summary.data.stock} format={formatUnits} /> },
        { label: "CAPACIDAD TOTAL", value: <KpiValue value={summary.data.capacity} format={formatUnits} /> },
        {
          label: "OCUPACIÓN GLOBAL",
          value: formatPercent(summary.data.occupancy * 100, 0),
          context: `${formatUnits(summary.data.free)} libres`,
        },
      ]
    : [];

  function exportCsv() {
    downloadCsv(
      "existencias-por-almacen.csv",
      ["SKU", "Producto", ...columnsMeta.map((w) => w.name), "Stock total", "Estado"],
      rows.map((r) => [r.sku, r.product, ...r.quantities.map(String), String(r.total), r.status]),
    );
    showNotice("Distribución exportada.");
  }

  const columns: Column<LocationRow>[] = [
    {
      key: "product",
      header: "Producto / SKU",
      width: "flex-1 min-w-px",
      render: (r) => (
        <span className="flex items-center gap-[11px]">
          <ProductThumb imageUrl={r.imageUrl} icon={r.icon} name={r.product} size={30} />
          <span className="flex min-w-px flex-col gap-[2px] leading-[1.4]">
            <span className="text-[13px] text-ink">{r.product}</span>
            <span className="text-[10px] text-muted">{r.sku}</span>
          </span>
        </span>
      ),
    },
    ...columnsMeta.map((warehouse, index) => ({
      key: warehouse.code,
      header: warehouse.name,
      width: "w-[210px]",
      align: "right" as const,
      render: (r: LocationRow) => <span className="text-[13px] text-ink">{formatUnits(r.quantities[index] ?? 0)}</span>,
    })),
    {
      key: "total",
      header: "Stock total",
      width: "w-[160px]",
      align: "right",
      render: (r) => <span className="text-[13px] font-semibold text-ink">{formatUnits(r.total)}</span>,
    },
    {
      key: "status",
      header: "Estado",
      width: "w-[130px]",
      render: (r) => <Badge tone={r.status === "Stock bajo" ? "warn" : "success"}>{r.status}</Badge>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Almacenes"
        description="Cada ubicación, conectada. Controla el espacio y las existencias."
        actions={
          <>
            <Button variant="dark" icon="transfer" onClick={() => setShowTransfer(true)}>
              Transferir stock
            </Button>
            <Button variant="primary" icon="plus-warehouse" onClick={() => setShowAdd(true)}>
              Añadir almacén
            </Button>
          </>
        }
      />

      {summary.error ? <ErrorBlock message={summary.error} onRetry={() => void summary.reload()} /> : summary.loading ? <LoadingBlock variant="kpi" /> : <KpiStrip items={kpis} />}

      {warehouses.error ? (
        <ErrorBlock message={warehouses.error} onRetry={() => void warehouses.reload()} />
      ) : warehouses.loading ? (
        <LoadingBlock />
      ) : (
        <div className="grid grid-cols-1 gap-[20px] md:grid-cols-2 xl:grid-cols-3">
          {sites.map((warehouse) => (
            <Card key={warehouse.id} className="flex min-h-[263px] flex-col gap-[16px] p-[20px]">
              <div className="flex items-center gap-[12px]">
                <span className="flex size-[36px] shrink-0 items-center justify-center rounded-[6px] bg-subtle">
                  <Icon name="warehouse-box" size={20} />
                </span>
                <span className="flex min-w-px flex-1 flex-col gap-[3px]">
                  <span className="font-outfit text-[17px] leading-[1.4] font-semibold text-ink">{warehouse.name}</span>
                  <span className="text-[10px] leading-[1.4] text-muted">
                    {warehouse.code} · {warehouse.location} · {warehouse.address}
                  </span>
                </span>
                <Badge tone={warehouse.active ? "success" : "neutral"}>{warehouse.active ? "Activo" : "Inactivo"}</Badge>
              </div>

              <div className="flex items-baseline justify-between">
                <span className="font-outfit text-[26px] leading-[1.4] font-semibold text-ink">{formatUnits(warehouse.stock)}</span>
                <span className="text-[11px] leading-[1.4] text-muted">{formatPercent(warehouse.ratio * 100)} de ocupación</span>
              </div>

              <div className="flex flex-col gap-[7px]">
                <ProgressBar ratio={warehouse.ratio} />
                <span className="text-[10px] leading-[1.4] text-muted">
                  Capacidad de {formatUnits(warehouse.capacity)} · {warehouse.productCount} productos
                </span>
              </div>

              <div className="flex items-center gap-[24px] text-[12px]">
                <span className="text-ink">{formatUnits(warehouse.available)} disponibles</span>
                <span className="text-muted">{formatUnits(warehouse.reserved)} reservadas</span>
              </div>

              <div className="flex items-center justify-between border-t border-[rgba(51,56,48,0.2)] pt-[12px] text-[11px]">
                <span className="text-muted">Responsable: {warehouse.owner}</span>
                <LinkAction onClick={() => navigate(`/movimientos?almacen=${warehouse.code}`)}>Ver almacén</LinkAction>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="flex h-[54px] items-center justify-between px-[20px]">
          <h2 className="font-outfit text-[17px] leading-[1.4] font-semibold text-ink">Existencias por ubicación</h2>
          <div className="flex items-center gap-[10px] text-[11px]">
            <span className="text-muted">Stock físico · Incluye unidades reservadas</span>
            <button type="button" onClick={exportCsv} className="font-semibold text-ink hover:underline">
              Exportar distribución ↓
            </button>
          </div>
        </div>

        {locations.error ? (
          <ErrorBlock message={locations.error} onRetry={() => void locations.reload()} />
        ) : locations.loading ? (
          <LoadingBlock variant="table" className="m-[16px]" />
        ) : (
          <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} rowHeight={38} />
        )}

        <div className="flex items-center justify-between px-[20px] py-[16px]">
          <span className="text-[11px] leading-[1.4] text-muted">
            {rows.length} productos · Total consolidado: {formatUnits(summary.data?.stock ?? 0)} · Sin duplicar transferencias
          </span>
          <Pagination page={page} totalPages={1} onChange={setPage} />
        </div>
      </Card>

      <PageFooter left="Última actualización: 15 oct 2026 · 10:42" right="Datos de ejemplo · COP" />
      <MovementModal
        open={showTransfer}
        onClose={() => setShowTransfer(false)}
        initialType="TRANSFER"
        onDone={async () => {
          await Promise.all([warehouses.reload(), locations.reload(), summary.reload()]);
        }}
      />
      <WarehouseModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onDone={async () => {
          await Promise.all([warehouses.reload(), summary.reload()]);
        }}
      />
    </>
  );
}