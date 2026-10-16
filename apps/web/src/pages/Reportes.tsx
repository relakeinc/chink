import { useState } from "react";
import { api } from "@/lib/api";
import type { ExportableReport } from "@/lib/api";
import { useAsync, ErrorBlock, LoadingBlock } from "@/lib/useAsync";
import { formatPercent, formatUnits } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";
import { printReport } from "@/lib/print";
import KpiStrip, { KpiValue, PageFooter, PageHeader } from "@/components/ui/KpiStrip";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { Button, Card, SectionHeader } from "@/components/ui/primitives";
import { FilterSelect } from "@/components/ui/inputs";
import Modal, { Field, inputClass } from "@/components/ui/Modal";
import BarChart from "@/components/ui/BarChart";
import { Icon } from "@/components/ui/Icon";
import { useNotice } from "@/lib/toast";
import DateRangePicker from "@/components/ui/DateRangePicker";
import type { DateRange } from "@/components/ui/DateRangePicker";

export default function Reportes() {
  const [format, setFormat] = useState("");
  const [range, setRange] = useState<DateRange>({ from: null, to: null });
  const [showEmail, setShowEmail] = useState(false);
  const { showNotice } = useNotice();

  const params = { from: range.from ?? undefined, to: range.to ?? undefined };
  const summary = useAsync(() => api.getReportSummary(), []);
  const categories = useAsync(() => api.getCategories(), []);
  const exports = useAsync(() => api.getExports(), []);
  const weekly = useAsync(() => api.getWeekly(params), [range.from, range.to]);

  const reports: ExportableReport[] = exports.data?.data ?? [];
  const filtered = format ? reports.filter((r) => r.format.includes(format)) : reports;

  const s = summary.data;
  const kpis = s
    ? [
        {
          label: "STOCK AL CIERRE",
          value: <KpiValue value={s.closing} format={formatUnits} />,
          context: s.cutoff ? `15 oct · ${s.cutoff.slice(11, 16)}` : undefined,
        },
        { label: "ENTRADAS DEL PERÍODO", value: <KpiValue value={s.entries} format={formatUnits} /> },
        { label: "SALIDAS DEL PERÍODO", value: <KpiValue value={s.exits} format={formatUnits} /> },
        { label: "VARIACIÓN NETA", value: `${s.net >= 0 ? "+" : "−"}${formatUnits(Math.abs(s.net))}`, context: `${formatPercent(s.netPercent)} vs. inicio` },
      ]
    : [];

  function exportSummary() {
    const rows = categories.data?.data ?? [];
    downloadCsv("resumen-inventario.csv", ["Categoría", "Unidades", "Productos", "% del total"], rows.map((c) => [c.name, String(c.units), String(c.products), `${formatPercent(c.percent)}`]));
    showNotice("Resumen exportado.");
  }

  const columns: Column<ExportableReport>[] = [
    {
      key: "report",
      header: "Reporte / Alcance",
      width: "flex-1 min-w-px",
      render: (r) => (
        <span className="flex flex-col gap-[3px] leading-[1.4]">
          <span className="text-[13px] text-ink">{r.name}</span>
          <span className="text-[10px] text-muted">{r.scope}</span>
        </span>
      ),
    },
    { key: "cutoff", header: "Fecha de corte", width: "w-[210px]", render: (r) => <span className="text-[13px] text-ink">{r.cutoff}</span> },
    { key: "content", header: "Contenido", width: "w-[250px]", render: (r) => <span className="text-[13px] text-ink">{r.content}</span> },
    {
      key: "format",
      header: "Formato",
      width: "w-[140px]",
      render: (r) => (
        <span className="inline-flex rounded-[5px] bg-subtle px-[8px] py-[4px] text-[10px] font-medium text-muted">{r.format}</span>
      ),
    },
    {
      key: "download",
      header: "Descargar",
      width: "w-[150px]",
      render: (r) => (
        <span className="flex gap-[12px] text-[13px] font-semibold text-ink">
          <button
            type="button"
            onClick={() => {
              downloadCsv(`${r.name.toLowerCase().replace(/\s+/g, "-")}.csv`, ["Reporte", "Alcance", "Fecha de corte", "Contenido"], [[r.name, r.scope, r.cutoff, r.content]]);
              showNotice(`${r.name} (CSV) descargado.`);
            }}
            className="hover:underline"
          >
            CSV ↓
          </button>
          <button
            type="button"
            onClick={() => {
              printReport(r.name, ["Reporte", "Alcance", "Fecha de corte", "Contenido"], [[r.name, r.scope, r.cutoff, r.content]]);
              showNotice("Abriendo el diálogo de impresión para guardar el PDF.");
            }}
            className="hover:underline"
          >
            PDF ↓
          </button>
        </span>
      ),
    },
  ];

  const chartMax = Math.max(400, ...(weekly.data?.data ?? []).flatMap((d) => [d.entries, d.exits]));

  return (
    <>
      <PageHeader
        title="Reportes"
        description="Del dato a la decisión. Entiende cómo se mueve tu inventario."
        actions={
          <>
            <DateRangePicker value={range} onChange={setRange} />
            <Button variant="dark" icon="mail" onClick={() => setShowEmail(true)}>
              Enviar por correo
            </Button>
            <Button variant="primary" icon="download" onClick={exportSummary}>
              Exportar resumen
            </Button>
          </>
        }
      />

      {summary.error ? <ErrorBlock message={summary.error} onRetry={() => void summary.reload()} /> : summary.loading ? <LoadingBlock variant="kpi" /> : <KpiStrip items={kpis} />}

      <div className="flex flex-col gap-[20px]">
        <div className="flex gap-[20px]">
          <Card className="flex w-[1090px] shrink-0 flex-col gap-[20px] p-[20px]">
            <SectionHeader title="Entradas y salidas" subtitle="9–15 octubre 2026 · Todos los almacenes" action={<span className="text-[11px] font-semibold text-ink">{reports.length ? "12 movimientos" : ""}</span>} />
            {weekly.loading ? <LoadingBlock variant="text" /> : <BarChart data={weekly.data?.data ?? []} max={chartMax} />}
            {s ? (
              <div className="flex justify-between border-t border-[rgba(51,56,48,0.2)] pt-[12px] text-[11px] leading-[1.4]">
                <span className="text-muted">
                  Inicio: {formatUnits(s.opening)} + {s.entries} entradas − {s.exits} salidas − {Math.abs(s.adjustments)} ajustes
                </span>
                <span className="font-semibold text-ink">Cierre: {formatUnits(s.closing)}</span>
              </div>
            ) : null}
          </Card>

          <Card className="flex min-w-0 flex-1 flex-col gap-[20px] p-[20px]">
            <SectionHeader title="Stock por categoría" subtitle={`Distribución de las ${formatUnits(categories.data?.total ?? 0).replace(" u.", "")} unidades actuales`} />
            <div className="flex flex-col gap-[8px]">
              {(categories.data?.data ?? []).map((category, index) => (
                <div key={category.name} className="anim-fade-up anim-delay flex flex-col gap-[8px]" style={{ "--anim-delay": `${index * 60}ms` } as React.CSSProperties}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[13px] font-medium text-ink">{category.name}</span>
                    <span className="text-[13px] font-semibold text-ink">{formatUnits(category.units)}</span>
                  </div>
                  <div className="h-[6px] w-full rounded-[3px] bg-line">
                    <div
                      className={`anim-grow-x anim-delay h-[6px] rounded-[3px] ${category.bar}`}
                      style={{
                        width: `${(category.units / (categories.data?.total || 1)) * 100}%`,
                        "--anim-delay": `${index * 80}ms`,
                      } as React.CSSProperties}
                    />
                  </div>
                  <div className="flex items-baseline justify-between text-[10px] leading-[1.4] text-muted">
                    <span>{category.products} productos</span>
                    <span>{formatPercent(category.percent)}</span>
                  </div>
                </div>
              ))}
            </div>

            {s ? (
              <div className="flex items-center gap-[12px] rounded-[6px] bg-surface p-[14px]">
                <Icon name="triangle-alert" size={16} />
                <span className="flex flex-col gap-[4px]">
                  <span className="text-[12px] font-semibold text-ink">
                    {s.lowStock} de {s.totalProducts} productos con stock bajo
                  </span>
                  <span className="text-[11px] leading-[1.4] text-muted">
                    {formatUnits(s.lowStockUnits.stock ?? 0)} en referencias que requieren reposición.
                  </span>
                </span>
              </div>
            ) : null}
          </Card>
        </div>

        <Card className="overflow-hidden">
          <div className="flex h-[58px] items-center justify-between px-[20px]">
            <h2 className="font-outfit text-[17px] leading-[1.4] font-semibold text-ink">Reportes exportables</h2>
            <span className="text-[11px] text-muted">Datos listos para compartir · CSV para análisis · PDF para lectura</span>
          </div>

          <div className="flex gap-[8px] px-[20px] pb-[8px]">
            {["", "CSV", "PDF"].map((option) => (
              <button
                key={option || "todos"}
                type="button"
                onClick={() => setFormat(option)}
                className={`rounded-[5px] px-[8px] py-[4px] text-[10px] font-medium ${format === option ? "bg-ink text-canvas" : "bg-subtle text-muted"}`}
              >
                {option || "Todos"}
              </button>
            ))}
          </div>

          {exports.loading ? <LoadingBlock /> : <DataTable columns={columns} rows={filtered} rowKey={(r) => r.name} rowHeight={50} />}

          <p className="px-[20px] pt-[5px] text-[10px] leading-[1.4] text-muted">
            Las transferencias no alteran el stock consolidado. Variación neta = entradas − salidas + ajustes.
          </p>
        </Card>
      </div>

      <PageFooter left="Última actualización: 15 oct 2026 · 10:42" right="Datos de ejemplo · COP" />
      <SendReportModal open={showEmail} reports={reports} onClose={() => setShowEmail(false)} />
    </>
  );
}

/** Envía uno de los reportes exportables por correo. */
function SendReportModal({ open, reports, onClose }: { open: boolean; reports: ExportableReport[]; onClose: () => void }) {
  const [name, setName] = useState(reports[0]?.name ?? "");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const { showNotice } = useNotice();

  async function submit() {
    setError(null);
    if (!name) {
      setError("Elige un reporte.");
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError("El correo no parece válido.");
      return;
    }
    setSending(true);
    try {
      const result = await api.sendReportEmail({ name, email: email.trim() });
      showNotice(`Reporte enviado a ${result.data.email}.`);
      setEmail("");
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo enviar el reporte");
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Enviar reporte por correo"
      description="Llega desde pz@reports.relake.co con el contenido actualizado."
      onClose={onClose}
      footer={
        <>
          <Button variant="filter" height={36} onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" height={36} onClick={() => void submit()} disabled={sending}>
            {sending ? "Enviando…" : "Enviar"}
          </Button>
        </>
      }
    >
      {error ? <p className="text-[12px] text-warn">{error}</p> : null}
      <Field label="Reporte">
        <FilterSelect
          label="Reporte"
          tone="light"
          allowClear={false}
          value={name}
          options={reports.map((r) => ({ value: r.name, label: r.name }))}
          onChange={setName}
        />
      </Field>
      <Field label="Correo destinatario">
        <input className={inputClass} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nombre@empresa.com" inputMode="email" />
      </Field>
    </Modal>
  );
}