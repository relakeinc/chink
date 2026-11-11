import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, uploadToPresignedUrl } from "@/lib/api";
import type { InventorySummary, Product } from "@/lib/api";
import { useAsync, ErrorBlock, LoadingBlock, useDebounced } from "@/lib/useAsync";
import { formatCOP, formatInt, formatPercent, formatUnits } from "@/lib/format";
import KpiStrip, { KpiValue, PageFooter, PageHeader } from "@/components/ui/KpiStrip";
import Tabs from "@/components/ui/Tabs";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { ColumnMenu, FilterSelect, Pagination, SearchInput, useCommandK } from "@/components/ui/inputs";
import { Badge, Button } from "@/components/ui/primitives";
import { ProductThumb } from "@/components/ui/ProductThumb";
import { Icon } from "@/components/ui/Icon";
import Modal, { Field, inputClass } from "@/components/ui/Modal";
import MovementModal from "@/components/forms/MovementModal";
import { useNotice } from "@/lib/toast";

const VIEWS = [
  { id: "all", label: "Todos los productos" },
  { id: "low", label: "Stock bajo" },
  { id: "archived", label: "Archivados" },
] as const;

const OPTIONAL_COLUMNS = [
  { id: "unitCost", label: "Coste / ud." },
  { id: "totalValue", label: "Valor total" },
];

/** Aplica los mismos filtros que la API sobre el conjunto recibido. */

const PRODUCT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;

function validateProductImage(file: File): string | null {
  if (!PRODUCT_IMAGE_TYPES.includes(file.type)) return "Solo se permiten imágenes JPEG, PNG o WebP.";
  if (file.size <= 0 || file.size > MAX_PRODUCT_IMAGE_BYTES) return "La imagen debe pesar entre 1 byte y 5 MB.";
  return null;
}

function downloadCsv(filename: string, header: string[], lines: string[][]) {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const csv = [header.map(escape).join(","), ...lines.map((line) => line.map(escape).join(","))].join("\n");
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={(event) => {
        event.stopPropagation();
        onChange();
      }}
      className={`flex size-[14px] shrink-0 items-center justify-center rounded-[3px] border ${
        checked ? "border-accent bg-accent" : "border-edge bg-subtle"
      }`}
    >
      {checked ? <Icon name="check" size={10} /> : null}
    </button>
  );
}

export default function Inventario() {
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [rows, setRows] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const summaryRef = useRef<InventorySummary | null>(null);
  const [view, setView] = useState<string>("all");
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput, 300);
  const [category, setCategory] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("default");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [showImages, setShowImages] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const { showNotice } = useNotice();

  const searchRef = useRef<HTMLInputElement>(null);
  useCommandK(searchRef);

  const pageSize = 25;

  const load = useCallback(async () => {
    // Solo la primera carga muestra esqueleto; los filtros y la búsqueda
    // posteriores refrescan sin desmontar la tabla.
    if (!summaryRef.current) setLoading(true);
    setError(null);
    try {
      const [summaryData, listData] = await Promise.all([
        api.getSummary(),
        api.getProducts({ view, search, category, warehouse, status, sort, page, pageSize }),
      ]);
      summaryRef.current = summaryData;
      setSummary(summaryData);
      setRows(listData.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cargar el inventario");
    } finally {
      setLoading(false);
    }
  }, [view, search, category, warehouse, status, sort, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const kpis = useMemo(() => {
    if (!summary) return [];
    return [
      { label: "STOCK TOTAL", value: <KpiValue value={summary.totalStock} format={formatUnits} /> },
      { label: "DISPONIBLE", value: <KpiValue value={summary.available} format={formatUnits} /> },
      { label: "RESERVADO", value: <KpiValue value={summary.reserved} format={formatUnits} /> },
      { label: "VALOR TOTAL", value: <KpiValue value={summary.totalValue} format={formatCOP} duration={600} /> },
    ];
  }, [summary]);

  const tabs = useMemo(() => {
    if (!summary) return [];
    return [
      { id: "all", label: "Todos los productos", badge: { value: String(summary.counts.all), tone: "neutral" as const } },
      { id: "low", label: "Stock bajo", badge: { value: String(summary.counts.lowStock), tone: "alert" as const } },
      { id: "archived", label: "Archivados", badge: { value: String(summary.counts.archived), tone: "neutral" as const } },
    ];
  }, [summary]);

  // Guardas de carga/error: a partir de aquí `summary` y `rows` son definitivos.
  if (error) return <ErrorBlock message={error} onRetry={() => void load()} />;
  if (loading || !summary) return <LoadingBlock variant="kpi" />;

  const isSelected = (id: string) => selected.has(id);

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleColumn(id: string) {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Ajuste desde la barra masiva: exige un único producto seleccionado. */
  function adjustSelected() {
    if (selected.size !== 1) {
      showNotice("Selecciona un solo producto para ajustar su stock.", { variant: "info", icon: "info" });
      return;
    }
    setShowAdjust(true);
  }

  /** Hoja de etiquetas imprimible con los productos seleccionados. */
  function printLabels() {
    const picked = rows.filter((row) => selected.has(row.id));
    if (picked.length === 0) return;
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) {
      showNotice("El navegador bloqueó la ventana de impresión.", { variant: "warning", icon: "warning" });
      return;
    }
    const cards = picked
      .map(
        (row) => `
        <div class="label">
          <div class="name">${row.name}</div>
          <div class="sku">${row.sku} · ${row.category}</div>
          <div class="stock">Stock: ${row.stock} u. · Mínimo: ${row.minStock} u.</div>
        </div>`,
      )
      .join("");
    win.document.write(`<html><head><title>Etiquetas · Chink</title><style>
      body { font-family: sans-serif; display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; padding: 16px; }
      .label { border: 1.5px solid #242722; border-radius: 8px; padding: 12px; }
      .name { font-size: 15px; font-weight: 700; }
      .sku { font-size: 11px; color: #555; margin-top: 4px; }
      .stock { font-size: 12px; margin-top: 8px; font-weight: 600; }
    </style></head><body>${cards}</body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  function exportCsv() {
    downloadCsv(
      "inventario-chink.csv",
      ["SKU", "Producto", "Categoría", "Stock", "Reservado", "Coste/ud. (COP)", "Valor total (COP)", "Estado", "Almacén"],
      rows.map((row) => [
        row.sku,
        row.name,
        row.category,
        String(row.stock),
        String(row.reserved),
        row.unitCost.toFixed(2),
        row.totalValue.toFixed(2),
        row.status === "LOW_STOCK" ? "Stock bajo" : "En stock",
        row.warehouse ?? "",
      ]),
    );
    showNotice("Inventario exportado.");
  }

  function onImportCsv(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const text = String(reader.result ?? "");
      const parsed = text
        .split(/\r?\n/)
        .map((line) => line.split(";"))
        .filter((parts) => parts.length >= 6 && parts[0]?.trim());
      if (parsed.length === 0) {
        showNotice("El archivo no tiene filas con el formato esperado.", { variant: "warning", icon: "warning" });
        return;
      }
      let created = 0;
      for (const parts of parsed) {
        const [sku, name, category, stock, reserved, unitCost] = parts;
        try {
          await api.createProduct({
            sku: sku!.trim(),
            name: name!.trim(),
            category: category!.trim(),
            stock: Number(stock),
            reserved: Number(reserved),
            unitCost: Number(String(unitCost).replace(",", ".")),
          });
          created += 1;
        } catch {
          /* se omiten las filas que la API rechaza */
        }
      }
      showNotice(`Importación terminada: ${created} producto(s) creados.`, { variant: created > 0 ? "success" : "warning", icon: created > 0 ? "check_circle" : "warning" });
      await load();
    };
    reader.readAsText(file, "utf-8");
    event.target.value = "";
  }

  const columns: Column<Product>[] = [
    {
      key: "select",
      header: "",
      width: "w-[14px]",
      render: (row) => <Checkbox checked={isSelected(row.id)} onChange={() => toggleRow(row.id)} />,
    },
    {
      key: "product",
      header: "Producto / SKU",
      width: "flex-1 min-w-px",
      render: (row) => (
        <span className="flex items-center gap-[11px]">
          <ProductThumb imageUrl={row.imageUrl} icon={row.icon} name={row.name} />
          <span className="flex min-w-px flex-col gap-[2px] leading-[1.4]">
            <span className={`text-[13px] font-medium ${isSelected(row.id) ? "text-accent" : "text-ink"}`}>{row.name}</span>
            <span className={`text-[10px] ${isSelected(row.id) ? "text-accent-text" : "text-muted"}`}>{row.sku}</span>
          </span>
        </span>
      ),
    },
    {
      key: "category",
      header: "Categoría",
      width: "w-[105px]",
      render: (row) => (
        <span className={`text-[11px] ${isSelected(row.id) ? "text-accent-text" : "text-muted"}`}>{row.category}</span>
      ),
    },
    {
      key: "stock",
      header: "Stock ↕",
      width: "w-[64px]",
      align: "right",
      render: (row) => (
        <span
          className={`text-[13px] font-semibold ${
            row.status === "LOW_STOCK" ? "text-warn" : isSelected(row.id) ? "text-warn" : "text-ink"
          }`}
        >
          {formatInt(row.stock)}
        </span>
      ),
    },
    {
      key: "reserved",
      header: "Reservado",
      width: "w-[68px]",
      align: "right",
      render: (row) => (
        <span className={`text-[11px] ${isSelected(row.id) ? "text-accent-text" : "text-muted"}`}>{formatInt(row.reserved)}</span>
      ),
    },
    ...(hiddenColumns.has("unitCost")
      ? []
      : [
          {
            key: "unitCost",
            header: "Coste / ud.",
            width: "w-[92px]",
            align: "right" as const,
            render: (row: Product) => (
              <span className={`text-[11px] ${isSelected(row.id) ? "text-accent-text" : "text-muted-2"}`}>
                {formatCOP(row.unitCost)}
              </span>
            ),
          },
        ]),
    ...(hiddenColumns.has("totalValue")
      ? []
      : [
          {
            key: "totalValue",
            header: "Valor total",
            width: "w-[110px]",
            align: "right" as const,
            render: (row: Product) => (
              <span className={`text-[11px] ${isSelected(row.id) ? "text-accent-text" : "text-ink"}`}>
                {formatCOP(row.totalValue)}
              </span>
            ),
          },
        ]),
    {
      key: "status",
      header: "Estado",
      width: "w-[100px]",
      render: (row) => (
        <Badge tone={row.status === "LOW_STOCK" ? "warn" : "success"}>
          {row.status === "LOW_STOCK" ? "Stock bajo" : "En stock"}
        </Badge>
      ),
    },
  ];

  const selectedCount = selected.size;
  const selectedProducts = rows.filter((row) => selected.has(row.id));

  async function archiveSelected() {
    if (selectedProducts.length !== 1) return;
    if (!window.confirm("¿Archivar este producto?")) return;
    const product = selectedProducts[0];
    if (!product) return;
    await api.updateProduct(product.id, { archived: true });
    setSelected(new Set());
    showNotice("Producto archivado.");
    await load();
  }

  return (
    <>
      <PageHeader
        title="Inventario"
        description="Cada referencia, cada unidad. Una única fuente de verdad."
        actions={
          <>
            <label className="inline-flex">
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={onImportCsv} />
              <Button variant="dark" icon="upload">
                Importar
              </Button>
            </label>
            <Button variant="primary" icon="plus" onClick={() => setShowAdd(true)}>
              Añadir producto
            </Button>
          </>
        }
      />

      <KpiStrip items={kpis} tileLast />

      <section className="flex flex-col overflow-hidden rounded-[10px] bg-canvas">
        <Tabs items={tabs} active={view} onChange={setView} gap={22} />

        {/* Fila de búsqueda y filtros */}
        <div className="flex flex-wrap items-center gap-[8px] p-[16px]">
          <SearchInput
            inputRef={searchRef}
            value={searchInput}
            onChange={setSearchInput}
            placeholder="Buscar por nombre o SKU"
            width={272}
          />
          <FilterSelect
            label="Categoría"
            placeholder="Categoría"
            value={category}
            onChange={setCategory}
            options={summary.categories.map((c) => ({ value: c, label: c }))}
          />
          <FilterSelect
            label="Todos los almacenes"
            placeholder="Todos los almacenes"
            value={warehouse}
            onChange={setWarehouse}
            options={summary.warehouses.map((w) => ({ value: w.code, label: w.name }))}
          />
          <FilterSelect
            label="Estado"
            placeholder="Estado"
            value={status}
            onChange={setStatus}
            options={[
              { value: "IN_STOCK", label: "En stock" },
              { value: "LOW_STOCK", label: "Stock bajo" },
            ]}
          />

          <div className="relative flex min-w-px flex-1 items-start justify-end gap-[8px]">
            <ColumnMenu items={OPTIONAL_COLUMNS} hiddenIds={hiddenColumns} onToggle={toggleColumn} />
            <Button variant="dark" icon="download" onClick={exportCsv}>
              Exportar
            </Button>
          </div>
        </div>

        {/* Barra de selección */}
        {/*
          Barra de selección: se despliega de 0 a su alto con la técnica
          grid-rows 0fr → 1fr, que anima sin tocar `height` (y por tanto
          sin provocar layout en cada frame).
        */}
        <div
          className={`grid transition-[grid-template-rows] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            selectedCount > 0 ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
          aria-hidden={selectedCount === 0}
        >
          <div className={`overflow-hidden ${selectedCount === 0 ? "pointer-events-none" : ""}`}>
            <div className="flex items-center gap-[14px] bg-success-bg px-[20px] py-[9px]">
              <Checkbox checked onChange={() => setSelected(new Set())} />
              <span className="text-[11px] font-semibold leading-[1.4] text-accent">
                {selectedCount === 1 ? "1 producto seleccionado" : `${selectedCount} productos seleccionados`}
              </span>
              <span className="h-[14px] w-px bg-toolbar-line" />
              <button type="button" onClick={() => setShowImages(true)} className="text-[11px] text-accent-text transition-colors hover:text-accent">
                Cambiar imagen
              </button>
              <button type="button" onClick={adjustSelected} className="text-[11px] text-accent-text transition-colors hover:text-accent">
                Ajustar stock
              </button>
              {selectedCount === 1 ? <button type="button" onClick={() => setShowEdit(true)} className="text-[11px] text-accent-text transition-colors hover:text-accent">Editar</button> : null}
              {selectedCount === 1 ? <button type="button" onClick={() => void archiveSelected()} className="text-[11px] text-accent-text transition-colors hover:text-accent">Archivar</button> : null}
              <button type="button" onClick={printLabels} className="text-[11px] text-accent-text transition-colors hover:text-accent">
                Imprimir etiqueta
              </button>
              <div className="min-w-px flex-1" />
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-[11px] text-accent-text transition-colors hover:text-accent"
              >
                Deseleccionar
              </button>
            </div>
          </div>
        </div>

        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          isSelected={(row) => isSelected(row.id)}
          onRowClick={(row) => toggleRow(row.id)}
        />

        {/* Pie de tabla: 54 px de alto con padding vertical de 14 px */}
        <div className="flex items-center justify-between px-[20px] py-[14px]">
          <span className="text-[11px] leading-[1.4] text-muted">
            Mostrando {rows.length} de {summary.counts[view as keyof typeof summary.counts] ?? rows.length} productos
          </span>
          <Pagination page={page} totalPages={1} onChange={setPage} />
        </div>
      </section>

      <PageFooter
        left="Valoración a coste medio ponderado · Importes sin IVA"
        right={`COP · ${formatPercent(summary.totalStock > 0 ? (summary.available / summary.totalStock) * 100 : 0)} disponible`}
      />

      <AddProductModal open={showAdd} onClose={() => setShowAdd(false)} onCreated={load} />
      <EditProductImagesModal open={showImages} products={selectedProducts} onClose={() => setShowImages(false)} onUpdated={load} />
      <MovementModal
        open={showAdjust}
        initialType="ADJUSTMENT"
        initialProductId={selectedProducts[0]?.id ?? ""}
        onClose={() => setShowAdjust(false)}
        onDone={load}
      />
      {selectedProducts[0] ? <EditProductModal open={showEdit} product={selectedProducts[0]} onClose={() => setShowEdit(false)} onUpdated={async () => { setShowEdit(false); setSelected(new Set()); await load(); }} /> : null}
    </>
  );
}

function EditProductImagesModal({
  open,
  products,
  onClose,
  onUpdated,
}: {
  open: boolean;
  products: Product[];
  onClose: () => void;
  onUpdated: () => Promise<void>;
}) {
  const [sharedFile, setSharedFile] = useState<File | null>(null);
  const [sharedPreview, setSharedPreview] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, { file: File; preview: string }>>({});
  const [remove, setRemove] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { showNotice: notify } = useNotice();
  const sharedInputRef = useRef<HTMLInputElement>(null);
  const previewsRef = useRef<string[]>([]);
  const overrideInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Al cerrar se liberan las vistas previas y se limpia el borrador.
  useEffect(() => {
    if (open) return;
    for (const url of previewsRef.current) URL.revokeObjectURL(url);
    previewsRef.current = [];
    setSharedFile(null);
    setSharedPreview(null);
    setOverrides({});
    setRemove(new Set());
    setError(null);
  }, [open ]);

  useEffect(() => {
    const tracked = previewsRef.current;
    return () => {
      for (const url of tracked) URL.revokeObjectURL(url);
    };
  }, []);

  function rememberPreview(url: string) {
    previewsRef.current.push(url);
  }

  function pickShared(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const message = validateProductImage(file);
    if (message) {
      setError(message);
      event.target.value = "";
      return;
    }
    const url = URL.createObjectURL(file);
    rememberPreview(url);
    setSharedFile(file);
    setSharedPreview(url);
    setError(null);
    event.target.value = "";
  }

  function pickOverride(id: string, event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const message = validateProductImage(file);
    if (message) {
      setError(message);
      event.target.value = "";
      return;
    }
    const url = URL.createObjectURL(file);
    rememberPreview(url);
    setOverrides((prev) => ({ ...prev, [id]: { file, preview: url } }));
    setRemove((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setError(null);
    event.target.value = "";
  }

  function toggleRemove(id: string) {
    setRemove((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setOverrides((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  const plannedCount = products.filter((product) => remove.has(product.id) || overrides[product.id] || sharedFile).length;

  async function submit() {
    setError(null);
    if (products.length === 0) {
      setError("No hay productos seleccionados.");
      return;
    }
    if (!plannedCount) {
      setError("Elige una imagen común, una por producto o marca alguna para quitar.");
      return;
    }

    setSaving(true);
    try {
      const plan = products.flatMap((product) => {
        if (remove.has(product.id)) return [{ id: product.id, file: null as File | null, remove: true }];
        const override = overrides[product.id]?.file;
        if (override) return [{ id: product.id, file: override, remove: false }];
        if (sharedFile) return [{ id: product.id, file: sharedFile, remove: false }];
        return [];
      });

      const targets = new Map<string, { key: string; uploadUrl: string }>();
      const withFiles = plan.filter((item) => item.file);
      if (sharedFile) {
        const sharedTargets = withFiles.filter((item) => item.file === sharedFile).map((item) => item.id);
        if (sharedTargets.length > 0) {
          const response = await api.createProductImageUploadUrls({ productIds: sharedTargets, contentType: sharedFile.type, size: sharedFile.size });
          for (const item of response.data) targets.set(item.productId, { key: item.key, uploadUrl: item.uploadUrl });
        }
      }
      const singles = withFiles.filter((item) => !(sharedFile && item.file === sharedFile));
      const singleResults = await Promise.all(
        singles.map(async (item) => {
          const response = await api.createProductImageUploadUrls({ productIds: [item.id], contentType: item.file!.type, size: item.file!.size });
          const target = response.data[0];
          if (!target) throw new Error("La API no devolvió URL de subida.");
          return { id: item.id, target };
        }),
      );
      for (const result of singleResults) targets.set(result.id, { key: result.target.key, uploadUrl: result.target.uploadUrl });

      await Promise.all(
        withFiles.map(async (item) => {
          const target = targets.get(item.id);
          if (!target) throw new Error("Falta la URL de subida de un producto.");
          await uploadToPresignedUrl(target.uploadUrl, item.file!);
        }),
      );

      const items = plan.map((item) => ({ id: item.id, imageKey: item.remove ? null : (targets.get(item.id)?.key ?? null) }));
      if (items.some((item) => item.imageKey === undefined)) throw new Error("No se pudo preparar alguna imagen.");
      await api.updateProductImages(items as { id: string; imageKey: string | null }[]);

      notify(items.length === 1 ? "Imagen del producto actualizada." : `Imagen actualizada en ${items.length} productos.`);
      await onUpdated();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron actualizar las imágenes");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title={products.length === 1 ? "Editar imagen del producto" : `Editar imágenes (${products.length})`}
      description="Sube una imagen común para todos o una distinta por producto. Se guardan en el bucket R2."
      onClose={onClose}
      footer={
        <>
          <Button variant="filter" height={36} onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" height={36} onClick={() => void submit()} disabled={saving}>
            {saving ? "Guardando…" : "Guardar imágenes"}
          </Button>
        </>
      }
    >
      {error ? <p className="text-[12px] text-warn">{error}</p> : null}
      <div className="flex flex-col gap-[12px]">
        <div className="flex items-center gap-[12px] rounded-[8px] bg-surface p-[12px]">
          {sharedPreview ? (
            <img src={sharedPreview} alt="Vista previa común" className="size-[44px] shrink-0 rounded-[6px] bg-subtle object-cover" />
          ) : (
            <span className="flex size-[44px] shrink-0 items-center justify-center rounded-[6px] bg-subtle">
              <Icon name="upload" size={16} />
            </span>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
            <span className="text-[12px] font-semibold text-ink">Misma imagen para los {products.length} seleccionados</span>
            <span className="truncate text-[10px] text-muted">{sharedFile ? sharedFile.name : "Opcional. Tiene prioridad menor que la imagen por producto."}</span>
          </div>
          <input ref={sharedInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={pickShared} />
          <Button variant="filter" height={36} onClick={() => sharedInputRef.current?.click()}>
            {sharedFile ? "Cambiar" : "Elegir"}
          </Button>
          {sharedFile ? (
            <button type="button" onClick={() => { setSharedFile(null); setSharedPreview(null); }} className="text-[11px] text-muted transition-colors hover:text-ink">
              Quitar
            </button>
          ) : null}
        </div>

        <div className="flex max-h-[320px] flex-col gap-[8px] overflow-y-auto pr-[2px]">
          {products.map((product) => {
            const override = overrides[product.id];
            const marked = remove.has(product.id);
            const preview = override?.preview ?? (!marked ? product.imageUrl : null);
            return (
              <div key={product.id} className="flex items-center gap-[12px] rounded-[8px] border border-edge p-[10px]">
                {preview ? (
                  <img src={preview} alt={product.name} className="size-[40px] shrink-0 rounded-[6px] bg-subtle object-cover" />
                ) : (
                  <span className="flex size-[40px] shrink-0 items-center justify-center rounded-[6px] bg-subtle">
                    <Icon name={product.icon} size={18} />
                  </span>
                )}
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[12px] font-medium text-ink">{product.name}</span>
                  <span className="text-[10px] text-muted">{product.sku}</span>
                  {marked ? <span className="text-[10px] font-semibold text-warn">Se quitará la foto actual.</span> : null}
                  {override ? <span className="truncate text-[10px] text-muted">{override.file.name}</span> : null}
                </div>
                <input
                  ref={(node) => {
                    overrideInputRefs.current[product.id] = node;
                  }}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(event) => pickOverride(product.id, event)}
                />
                <Button variant="filter" height={36} onClick={() => overrideInputRefs.current[product.id]?.click()}>
                  Cambiar
                </Button>
                {product.imageUrl || override ? (
                  <button type="button" onClick={() => toggleRemove(product.id)} className="text-[11px] text-muted transition-colors hover:text-ink">
                    {marked ? "Deshacer" : "Quitar"}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

function AddProductModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => Promise<void> }) {
  const [form, setForm] = useState({ sku: "", name: "", category: "", stock: "0", reserved: "0", minStock: "0", unitCost: "0" });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { showNotice: notify } = useNotice();
  const fileRef = useRef<HTMLInputElement>(null);

  // Libera la URL temporal cuando cambia la imagen o se desmonta el modal.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function resetAll() {
    setForm({ sku: "", name: "", category: "", stock: "0", reserved: "0", minStock: "0", unitCost: "0" });
    setImageFile(null);
    setPreview(null);
    setError(null);
  }

  function pickImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const message = validateProductImage(file);
    if (message) {
      setError(message);
      event.target.value = "";
      return;
    }
    setImageFile(file);
    setPreview(URL.createObjectURL(file));
    setError(null);
    event.target.value = "";
  }

  async function submit() {
    setError(null);
    setSaving(true);
    try {
      const created = await api.createProduct({
        sku: form.sku.trim(),
        name: form.name.trim(),
        category: form.category.trim(),
        stock: Number(form.stock) || 0,
        reserved: Number(form.reserved) || 0,
        minStock: Number(form.minStock) || 0,
        unitCost: Number(String(form.unitCost).replace(",", ".")) || 0,
      });

      if (imageFile) {
        try {
          const [target] = (await api.createProductImageUploadUrls({ productIds: [created.data.id], contentType: imageFile.type, size: imageFile.size })).data;
          if (!target) throw new Error("La API no devolvió URL de subida.");
          await uploadToPresignedUrl(target.uploadUrl, imageFile);
          await api.updateProduct(created.data.id, { imageKey: target.key });
        } catch (uploadError) {
          notify(`Producto creado, pero la imagen no se subió: ${uploadError instanceof Error ? uploadError.message : "error desconocido"}`, {
            variant: "warning",
            icon: "warning",
          });
          resetAll();
          await onCreated();
          onClose();
          return;
        }
      }

      notify("Producto creado.");
      resetAll();
      await onCreated();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo crear el producto");
    } finally {
      setSaving(false);
    }
  }

  const update = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  return (
    <Modal
      open={open}
      title="Añadir producto"
      description="El valor total y el estado se calculan automáticamente."
      onClose={onClose}
      footer={
        <>
          <Button variant="filter" height={36} onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" height={36} onClick={() => void submit()} disabled={saving}>
            {saving ? "Guardando…" : "Crear producto"}
          </Button>
        </>
      }
    >
      {error ? <p className="text-[12px] text-warn">{error}</p> : null}
      <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2">
        <Field label="SKU">
          <input className={inputClass} value={form.sku} onChange={update("sku")} placeholder="EMB-004" />
        </Field>
        <Field label="Nombre">
          <input className={inputClass} value={form.name} onChange={update("name")} placeholder="Caja modular S" />
        </Field>
        <Field label="Categoría">
          <input className={inputClass} value={form.category} onChange={update("category")} placeholder="Embalaje" />
        </Field>
        <Field label="Coste por unidad (COP)">
          <input className={inputClass} value={form.unitCost} onChange={update("unitCost")} inputMode="decimal" />
        </Field>
        <Field label="Stock">
          <input className={inputClass} value={form.stock} onChange={update("stock")} inputMode="numeric" />
        </Field>
        <Field label="Reservado">
          <input className={inputClass} value={form.reserved} onChange={update("reserved")} inputMode="numeric" />
        </Field>
        <Field label="Stock mínimo">
          <input className={inputClass} value={form.minStock} onChange={update("minStock")} inputMode="numeric" />
        </Field>
        <div className="col-span-2 flex flex-col gap-[6px]">
          <span className="text-[11px] font-medium text-ink">Foto del producto (opcional)</span>
          <div className="flex items-center gap-[12px]">
            {preview ? (
              <img src={preview} alt="Vista previa de la foto" className="size-[44px] shrink-0 rounded-[6px] bg-subtle object-cover" />
            ) : (
              <span className="flex size-[44px] shrink-0 items-center justify-center rounded-[6px] bg-subtle">
                <Icon name="upload" size={16} />
              </span>
            )}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={pickImage} />
            <Button variant="filter" height={36} onClick={() => fileRef.current?.click()}>
              {imageFile ? "Cambiar imagen" : "Subir imagen"}
            </Button>
            {imageFile ? (
              <button type="button" onClick={() => { setImageFile(null); setPreview(null); }} className="text-[11px] text-muted transition-colors hover:text-ink">
                Quitar
              </button>
            ) : null}
          </div>
          <span className="text-[10px] leading-[1.4] text-muted">
            {imageFile ? `${imageFile.name} · ${(imageFile.size / 1024).toFixed(0)} KB` : "JPEG, PNG o WebP hasta 5 MB. Se guarda en el bucket R2."}
          </span>
        </div>
      </div>
    </Modal>
  );
}

function EditProductModal({ open, product, onClose, onUpdated }: { open: boolean; product: Product; onClose: () => void; onUpdated: () => Promise<void> }) {
  const [form, setForm] = useState({ name: product.name, category: product.category, unitCost: String(product.unitCost), minStock: String(product.minStock) });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showNotice } = useNotice();

  useEffect(() => {
    if (open) setForm({ name: product.name, category: product.category, unitCost: String(product.unitCost), minStock: String(product.minStock) });
  }, [open, product]);

  async function submit() {
    setSaving(true); setError(null);
    try {
      await api.updateProduct(product.id, { name: form.name.trim(), category: form.category.trim(), unitCost: Number(form.unitCost.replace(",", ".")), minStock: Number(form.minStock) || 0 });
      showNotice("Producto actualizado.");
      await onUpdated();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo actualizar el producto"); }
    finally { setSaving(false); }
  }

  return <Modal open={open} title="Editar producto" description="Actualiza los datos del producto. El stock se modifica mediante movimientos." onClose={onClose} footer={<><Button variant="filter" height={36} onClick={onClose}>Cancelar</Button><Button variant="primary" height={36} onClick={() => void submit()} disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</Button></>}>
    {error ? <p className="text-[12px] text-warn">{error}</p> : null}
    <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2">
      <Field label="Nombre"><input className={inputClass} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></Field>
      <Field label="Categoría"><input className={inputClass} value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} /></Field>
      <Field label="Coste por unidad (COP)"><input className={inputClass} value={form.unitCost} onChange={(e) => setForm((p) => ({ ...p, unitCost: e.target.value }))} inputMode="decimal" /></Field>
      <Field label="Stock mínimo"><input className={inputClass} value={form.minStock} onChange={(e) => setForm((p) => ({ ...p, minStock: e.target.value }))} inputMode="numeric" /></Field>
    </div>
  </Modal>;
}
