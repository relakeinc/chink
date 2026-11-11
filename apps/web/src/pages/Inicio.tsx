import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import type { MovementRow } from "@/lib/api";
import { useAsync, ErrorBlock, LoadingBlock } from "@/lib/useAsync";
import { formatPercent, formatUnits } from "@/lib/format";
import KpiStrip, { KpiValue, PageFooter, PageHeader } from "@/components/ui/KpiStrip";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { Button, Card, LinkAction, ProgressBar, SectionHeader } from "@/components/ui/primitives";
import { ProductThumb } from "@/components/ui/ProductThumb";
import BarChart from "@/components/ui/BarChart";
import { useNotice } from "@/lib/toast";
import DateRangePicker from "@/components/ui/DateRangePicker";
import type { DateRange } from "@/components/ui/DateRangePicker";
import MovementModal from "@/components/forms/MovementModal";

export default function Inicio() {
  const [range, setRange] = useState<DateRange>({ from: null, to: null });
  const [showMovement, setShowMovement] = useState(false);
  const navigate = useNavigate();
  const { showNotice } = useNotice();

  const summary = useAsync(() => api.getSummary(), []);
  const weekly = useAsync(() => api.getWeekly({ from: range.from ?? undefined, to: range.to ?? undefined }), [range.from, range.to]);
  const movements = useAsync(() => api.getMovements({ pageSize: 4 }), []);
  const lowStock = useAsync(() => api.getLowStock(), []);
  const warehouses = useAsync(() => api.getWarehouses(), []);

  const s = summary.data;
  const kpis = s
    ? [
        { label: "STOCK TOTAL", value: <KpiValue value={s.totalStock} format={formatUnits} />, context: `${s.counts.all} productos` },
        {
          label: "DISPONIBLE",
          value: <KpiValue value={s.available} format={formatUnits} />,
          context: `${formatPercent((s.available / (s.totalStock || 1)) * 100)} del stock`,
        },
        { label: "RESERVADO", value: <KpiValue value={s.reserved} format={formatUnits} /> },
        { label: "STOCK BAJO", value: `${s.counts.lowStock} productos`, context: "Requieren atención" },
      ]
    : [];

  const recent: MovementRow[] = movements.data?.data ?? [];
  const sites = warehouses.data?.data ?? [];
  const chartMax = Math.max(400, ...(weekly.data?.data ?? []).flatMap((d) => [d.entries, d.exits]));

  const columns: Column<MovementRow>[] = [
    {
      key: "movement",
      header: "Movimiento / Producto",
      width: "flex-1 min-w-px",
      render: (m) => (
        <span className="flex items-center gap-[11px]">
          <ProductThumb imageUrl={m.imageUrl} name={m.product} />
          <span className="flex min-w-px flex-col gap-[3px] leading-[1.4]">
            <span className="text-[13px] text-ink">{m.product}</span>
            <span className="text-[10px] text-muted">
              {m.ref} · {m.sku}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: "type",
      header: "Tipo",
      width: "w-[130px]",
      render: (m) => (
        <span
          className={`inline-flex rounded-[5px] px-[8px] py-[4px] text-[10px] font-medium ${
            m.type === "Entrada" ? "bg-success-bg text-accent-text" : "bg-subtle text-muted"
          }`}
        >
          {m.type}
        </span>
      ),
    },
    {
      key: "quantity",
      header: "Cantidad",
      width: "w-[90px]",
      align: "right",
      render: (m) => (
        <span className="text-[13px] font-semibold text-ink">
          {m.quantity > 0 ? `+${formatUnits(m.quantity)}` : `−${formatUnits(Math.abs(m.quantity))}`}
        </span>
      ),
    },
    { key: "owner", header: "Responsable", width: "w-[130px]", render: (m) => <span className="text-[13px] text-ink">{m.owner}</span> },
    { key: "time", header: "Hora", width: "w-[70px]", render: (m) => <span className="text-[13px] text-ink">{m.time}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Inicio"
        description="Todo en su sitio. El pulso de tu inventario, de un vistazo."
        actions={
          <>
            <DateRangePicker value={range} onChange={setRange} />
            <Button variant="primary" icon="plus" onClick={() => setShowMovement(true)}>
              Registrar movimiento
            </Button>
          </>
        }
      />

      {summary.loading ? <LoadingBlock variant="kpi" /> : <KpiStrip items={kpis} />}

      <div className="flex flex-col gap-[20px]">
        <div className="flex flex-col gap-[20px] xl:flex-row">
          <Card className="flex w-full min-w-0 flex-col gap-[20px] p-[20px] xl:w-[1090px] xl:shrink-0">
            <SectionHeader title="Movimientos recientes" subtitle="Entradas y salidas confirmadas" action={<LinkAction onClick={() => navigate("/reportes")}>Ver reportes</LinkAction>} />
            {weekly.loading ? <LoadingBlock variant="text" /> : <BarChart data={weekly.data?.data ?? []} max={chartMax} />}
          </Card>

          <Card className="flex w-full min-w-0 flex-col gap-[20px] p-[20px] xl:flex-1">
            <SectionHeader title="Stock bajo" subtitle={`${lowStock.data?.data.length ?? 0} referencias por debajo del mínimo`} action={<LinkAction onClick={() => navigate("/inventario")}>Ver inventario</LinkAction>} />
            <div className="flex flex-col">
              {(lowStock.data?.data ?? []).map((alert, index, list) => (
                <div
                  key={alert.sku}
                  className={`flex items-center gap-[12px] pb-[12px] ${index < list.length - 1 ? "border-b border-edge" : ""}`}
                >
                  <ProductThumb imageUrl={alert.imageUrl} name={alert.name} />
                  <span className="flex min-w-px flex-1 flex-col gap-[4px]">
                    <span className="text-[13px] font-medium leading-[1.4] text-ink">{alert.name}</span>
                    <span className="text-[10px] leading-[1.4] text-muted">
                      {alert.sku} · Mínimo {alert.minStock} u.
                    </span>
                  </span>
                  <span className="shrink-0 rounded-[5px] bg-warn-badge px-[8px] py-[4px] text-[10px] font-medium text-warn-alert">
                    {formatUnits(alert.stock)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-[20px] xl:flex-row">
          <Card className="flex w-full min-w-0 flex-col overflow-hidden xl:w-[1090px] xl:shrink-0">
            <div className="flex h-[66px] items-center justify-between px-[20px]">
              <h2 className="font-outfit text-[17px] leading-[1.4] font-semibold text-ink">Actividad reciente</h2>
              <LinkAction onClick={() => navigate("/movimientos")}>Ver movimientos</LinkAction>
            </div>
            {movements.error ? (
              <ErrorBlock message={movements.error} onRetry={() => void movements.reload()} />
            ) : movements.loading ? (
              <LoadingBlock />
            ) : (
              <DataTable columns={columns} rows={recent} rowKey={(m) => m.id} rowHeight={60} />
            )}
            <div className="px-[20px] py-[12px] text-[11px] leading-[1.4] text-muted">
              Hoy · {recent.length} movimientos registrados · Todos confirmados
            </div>
          </Card>

          <Card className="flex w-full min-w-0 flex-col gap-[20px] p-[20px] xl:flex-1">
            <SectionHeader title="Tus almacenes" subtitle={`${formatUnits(s?.totalStock ?? 0)} repartidas en ${sites.length} ubicaciones`} action={<LinkAction onClick={() => navigate("/almacenes")}>Ver almacenes</LinkAction>} />
            <div className="flex flex-col gap-[10px]">
              {sites.map((warehouse) => (
                <div key={warehouse.id} className="flex flex-col gap-[10px]">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[13px] font-medium text-ink">{warehouse.name}</span>
                    <span className="text-[11px] text-muted">{formatPercent(warehouse.ratio * 100)}</span>
                  </div>
                  <ProgressBar ratio={warehouse.ratio} />
                  <span className="text-[10px] leading-[1.4] text-muted">
                    {formatUnits(warehouse.stock)} de {formatUnits(warehouse.capacity)}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-[8px]">
              <span className="size-[6px] rounded-[3px] bg-online" />
              <span className="text-[11px] leading-[1.4] text-muted">Todas las ubicaciones operativas</span>
            </div>
          </Card>
        </div>
      </div>

      <PageFooter left={`Actualizado: ${new Date().toLocaleString("es-CO")}`} right="COP" />
      <MovementModal
        open={showMovement}
        onClose={() => setShowMovement(false)}
        onDone={async () => {
          await Promise.all([weekly.reload(), movements.reload(), lowStock.reload()]);
        }}
      />
    </>
  );
}
