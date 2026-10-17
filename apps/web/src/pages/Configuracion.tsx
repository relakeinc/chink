import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import type { SettingsData } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useAsync, ErrorBlock, LoadingBlock } from "@/lib/useAsync";
import { formatUnits } from "@/lib/format";
import { WORKSPACE_MARKS, notifyWorkspaceUpdated, workspaceMark } from "@/lib/workspace";
import { PageFooter, PageHeader } from "@/components/ui/KpiStrip";
import Tabs from "@/components/ui/Tabs";
import { FilterSelect } from "@/components/ui/inputs";
import { Button, Card, Toggle } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { useNotice } from "@/lib/toast";

const VIEW_TABS = [
  { id: "preferencias", label: "Preferencias" },
  { id: "notificaciones", label: "Notificaciones" },
  { id: "seguridad", label: "Seguridad" },
];

const SECTIONS = [
  {
    title: "Espacio de trabajo",
    description: "Nombre, identidad y datos que aparecen en el conmutador y en los reportes exportados.",
    fields: ["spaceName", "spaceMark", "legalName", "contactEmail", "taxId"] as const,
  },
  {
    title: "Idioma y región",
    description: "Formato común para fechas, horas e importes de todo el equipo.",
    fields: ["language", "currency", "timezone", "dateFormat"] as const,
  },
  {
    title: "Preferencias de inventario",
    description: "Valores predeterminados para nuevos productos y movimientos.",
    fields: ["unit", "defaultWarehouseId", "movementPrefix", "defaultMinStock"] as const,
  },
];

const LABELS: Record<string, string> = {
  spaceName: "Nombre del espacio",
  spaceMark: "Icono del espacio",
  legalName: "Razón social",
  contactEmail: "Correo de contacto",
  taxId: "Identificación fiscal",
  language: "Idioma",
  currency: "Moneda",
  timezone: "Zona horaria",
  dateFormat: "Formato de fecha",
  unit: "Unidad de medida",
  defaultWarehouseId: "Almacén predeterminado",
  movementPrefix: "Prefijo de movimientos",
  defaultMinStock: "Mínimo de stock predeterminado",
};

const HELPERS: Record<string, string> = {
  spaceMark: "Al crear el espacio se asigna uno al azar. Puedes cambiarlo aquí.",
  movementPrefix: "Numeración correlativa automática.",
  defaultMinStock: "Solo para nuevos productos. Los mínimos actuales no cambian.",
};

const CONTROL_RULES: { id: keyof SettingsData; title: string; description: string }[] = [
  { id: "allowNegativeStock", title: "Permitir stock negativo", description: "Registrar salidas aunque no haya unidades disponibles." },
  { id: "requireAdjustmentReason", title: "Exigir motivo en los ajustes", description: "Solicitar una justificación para mantener la trazabilidad." },
  { id: "lowStockAlerts", title: "Alertas de stock bajo", description: "Avisar cuando un producto esté por debajo de su mínimo." },
  { id: "reserveBeforePicking", title: "Reservar antes de preparar", description: "Separar el stock comprometido del disponible." },
];

type NotifyId = "notifyLowStock" | "notifyMovements" | "notifyWeeklyReport";

const NOTIFY_RULES: { id: NotifyId; title: string; description: string }[] = [
  { id: "notifyLowStock", title: "Stock bajo", description: "Avisar cuando un producto caiga por debajo de su mínimo." },
  { id: "notifyMovements", title: "Movimientos", description: "Avisar al registrar entradas, salidas y transferencias." },
  { id: "notifyWeeklyReport", title: "Resumen semanal", description: "Recibir el cierre de la semana cada lunes." },
];

const fieldClass =
  "h-[38px] w-full rounded-[6px] border border-[rgba(51,56,48,0.2)] bg-subtle px-[12px] text-[12px] leading-[1.4] text-ink outline-none focus:border-ink";

export default function Configuracion() {
  const [view, setView] = useState("preferencias");
  const [values, setValues] = useState<Partial<SettingsData>>({});
  const [saving, setSaving] = useState(false);
  const { notice, showNotice } = useNotice();

  const settings = useAsync(() => api.getSettings(), []);
  // Debe declararse ANTES de cualquier return temprano: si un hook se ejecuta
  // solo en algunas renderizaciones, React lanza "Rendered more hooks than
  // during the previous render".
  const summary = useSummary();
  const [params, setParams] = useSearchParams();
  const workspaceRef = useRef<HTMLElement>(null);
  const original = settings.data?.data ?? null;
  const options = settings.data?.options ?? {};
  const warehouseOptions = settings.data?.warehouses ?? [];

  // Sincroniza el formulario con lo que devuelve la API.
  useEffect(() => {
    if (original) setValues(original);
  }, [original]);

  // Enlace profundo desde el conmutador del sidebar (?seccion=espacio):
  // baja a la sección y limpia el parámetro para no repetirlo al recargar.
  useEffect(() => {
    if (params.get("seccion") !== "espacio" || !original) return;
    workspaceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setParams({}, { replace: true });
  }, [params, original, setParams]);

  const dirty = original ? JSON.stringify(values) !== JSON.stringify(original) : false;

  async function save() {
    setSaving(true);
    try {
      await api.updateSettings(values);
      await settings.reload();
      // El sidebar y quien escuche se enteran sin recargar la página.
      notifyWorkspaceUpdated();
      showNotice("Preferencias actualizadas.");
    } catch (cause) {
      showNotice(cause instanceof Error ? cause.message : "No se pudieron guardar las preferencias");
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    if (!original) return;
    setValues(original);
    showNotice("Cambios descartados.");
  }

  if (settings.error) return <ErrorBlock message={settings.error} onRetry={() => void settings.reload()} />;
  if (settings.loading || !original) return <LoadingBlock variant="card" />;

  return (
    <>
      <PageHeader
        title="Configuración"
        description="Tu negocio, tus reglas. Ajusta las preferencias de tu espacio de trabajo."
        actions={
          <>
            <Button variant="dark" onClick={discard}>
              Descartar
            </Button>
            <Button variant="primary" icon="check-15" onClick={() => void save()} disabled={!dirty || saving}>
              {saving ? "Guardando…" : "Guardar cambios"}
            </Button>
          </>
        }
      />

      <Card className="flex flex-col overflow-hidden">
        <Tabs items={VIEW_TABS} active={view} onChange={setView} />

        {view === "preferencias" ? (
        <div className="flex flex-col gap-[32px] p-[24px] xl:flex-row">
          {/* Columna izquierda: formulario */}
          <div className="flex w-full min-w-0 flex-col gap-[24px] xl:w-[1070px] xl:shrink-0">
            {SECTIONS.map((section, index) => (
              <section
                key={section.title}
                ref={index === 0 ? workspaceRef : undefined}
                className={`flex scroll-mt-[16px] flex-col gap-[16px] ${index > 0 ? "border-t border-[rgba(51,56,48,0.2)] pt-[20px]" : ""}`}
              >
                <div>
                  <h2 className="font-outfit text-[17px] leading-[1.4] font-semibold text-ink">{section.title}</h2>
                  <p className="mt-[4px] text-[11px] leading-[1.4] text-muted">{section.description}</p>
                </div>

                <div className="grid grid-cols-1 gap-x-[20px] gap-y-[16px] md:grid-cols-2">
                  {section.fields.map((field) => {
                    const optionList: { value: string; label: string }[] =
                      field === "defaultWarehouseId" ? warehouseOptions : (options[field] ?? []).map((option) => ({ value: option, label: option }));
                    const isSelect = field === "defaultWarehouseId" || Boolean(options[field]);
                    const value = String(values[field] ?? "");

                      return (
                        <div key={field} className="flex flex-col gap-[7px]">
                          <span className="text-[11px] font-medium text-ink">{LABELS[field]}</span>
                          {field === "spaceMark" ? (
                            <span className="flex flex-wrap gap-[8px]" role="group" aria-label="Icono del espacio">
                              {WORKSPACE_MARKS.map((mark) => {
                                const active = workspaceMark(String(values.spaceMark ?? "")) === mark.id;
                                return (
                                  <button
                                    key={mark.id}
                                    type="button"
                                    aria-label={`Icono ${mark.id}`}
                                    aria-pressed={active}
                                    title={mark.id}
                                    onClick={() => setValues((prev) => ({ ...prev, spaceMark: mark.id, spaceColor: mark.color }))}
                                    className={`flex size-[44px] shrink-0 items-center justify-center rounded-[8px] border bg-canvas transition-transform hover:scale-105 ${
                                      active ? "border-ink ring-2 ring-ink/30" : "border-[rgba(51,56,48,0.2)]"
                                    }`}
                                  >
                                    <Icon name={mark.id} size={30} />
                                  </button>
                                );
                              })}
                            </span>
                          ) : isSelect ? (
                          <FilterSelect
                            label={LABELS[field] ?? field}
                            tone="light"
                            allowClear={false}
                            options={optionList}
                            value={value}
                            onChange={(next) => setValues((prev) => ({ ...prev, [field]: next }))}
                          />
                        ) : (
                          <input
                            value={value}
                            onChange={(event) => setValues((prev) => ({ ...prev, [field]: event.target.value }))}
                            className={fieldClass}
                          />
                        )}
                        {HELPERS[field] ? <span className="text-[10px] leading-[1.4] text-muted">{HELPERS[field]}</span> : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          {/* Columna derecha: reglas y estado */}
          <div className="flex min-w-0 flex-1 flex-col gap-[24px]">
            <div className="flex flex-col gap-[8px] rounded-[8px] bg-surface p-[20px]">
              <h2 className="font-outfit text-[17px] leading-[1.4] font-semibold text-ink">Control del inventario</h2>
              {CONTROL_RULES.map((rule, index) => (
                <div key={String(rule.id)} className={`flex items-center gap-[20px] py-[12px] ${index < CONTROL_RULES.length - 1 ? "border-b border-[rgba(51,56,48,0.2)]" : ""}`}>
                  <span className="flex min-w-px flex-1 flex-col gap-[4px]">
                    <span className="text-[12px] font-medium text-ink">{rule.title}</span>
                    <span className="text-[11px] leading-[1.4] text-muted">{rule.description}</span>
                  </span>
                  <Toggle
                    on={Boolean(values[rule.id])}
                    onChange={(next) => setValues((prev) => ({ ...prev, [rule.id]: next }))}
                    label={rule.title}
                  />
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-[14px] rounded-[8px] border border-[rgba(51,56,48,0.2)] p-[20px]">
              <h2 className="flex items-center gap-[8px] text-[13px] font-semibold text-ink">
                <Icon name="info" size={16} />
                Cómo se calcula tu stock
              </h2>
              <p className="text-[12px] leading-[1.4] text-muted">
                Stock total = disponible + reservado. Las transferencias cambian la ubicación, no el total del inventario.
              </p>
              <span className="h-px w-full bg-[rgba(51,56,48,0.2)]" />
              <div className="flex items-baseline justify-between text-[12px]">
                <span className="text-ink">
                  {formatUnits(summary.available)} + {formatUnits(summary.reserved)}
                </span>
                <span className="font-semibold text-ink">= {formatUnits(summary.totalStock)}</span>
              </div>
            </div>

            <div className="flex items-center gap-[10px] rounded-[8px] bg-success-bg p-[16px]">
              <Icon name="check-circle" size={18} />
              <span className="flex flex-col gap-[4px]">
                <span className="text-[12px] font-semibold text-accent">{dirty ? "Cambios sin guardar" : "Preferencias actualizadas"}</span>
                <span className="text-[10px] leading-[1.4] text-accent-text">
                  {dirty ? "Pulsa «Guardar cambios» para aplicarlos." : `Sin cambios pendientes · ${original.updatedBy ?? "—"}`}
                </span>
              </span>
            </div>
          </div>
        </div>
        ) : view === "notificaciones" ? (
          <div className="p-[24px]">
            <NotificationsPanel
              values={values}
              dirty={dirty}
              onToggle={(id, next) => setValues((prev) => ({ ...prev, [id]: next }))}
            />
          </div>
        ) : (
          <div className="p-[24px]">
            <SecurityPanel />
          </div>
        )}
      </Card>

      <PageFooter left={`Última actualización: ${new Date(original.updatedAt).toLocaleString("es-CO")}`} right="Datos de ejemplo · COP" />
      {/* Aire inferior: el pie no debe quedar pegado al borde del panel. */}
      <div className="h-[24px]" />
    </>
  );
}

/** Pestaña de avisos: interruptores que se guardan con el botón global. */
function NotificationsPanel({
  values,
  dirty,
  onToggle,
}: {
  values: Partial<SettingsData>;
  dirty: boolean;
  onToggle: (id: NotifyId, next: boolean) => void;
}) {
  return (
    <div className="flex max-w-[760px] flex-col gap-[16px]">
      <div className="flex flex-col gap-[8px] rounded-[8px] bg-surface p-[20px]">
        <h2 className="font-outfit text-[17px] leading-[1.4] font-semibold text-ink">Avisos del espacio</h2>
        <p className="text-[11px] leading-[1.4] text-muted">Elige qué avisos recibe el equipo. Se aplican al pulsar «Guardar cambios».</p>
        {NOTIFY_RULES.map((rule, index) => (
          <div key={rule.id} className={`flex items-center gap-[20px] py-[12px] ${index < NOTIFY_RULES.length - 1 ? "border-b border-[rgba(51,56,48,0.2)]" : ""}`}>
            <span className="flex min-w-px flex-1 flex-col gap-[4px]">
              <span className="text-[12px] font-medium text-ink">{rule.title}</span>
              <span className="text-[11px] leading-[1.4] text-muted">{rule.description}</span>
            </span>
            <Toggle on={Boolean(values[rule.id])} onChange={(next) => onToggle(rule.id, next)} label={rule.title} />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-[10px] rounded-[8px] bg-success-bg p-[16px]">
        <Icon name="check-circle" size={18} />
        <span className="flex flex-col gap-[4px]">
          <span className="text-[12px] font-semibold text-accent">{dirty ? "Cambios sin guardar" : "Preferencias actualizadas"}</span>
          <span className="text-[10px] leading-[1.4] text-accent-text">
            {dirty ? "Pulsa «Guardar cambios» para aplicarlos." : "Sin cambios pendientes."}
          </span>
        </span>
      </div>
    </div>
  );
}

/** Pestaña de seguridad: cambio de contraseña y sesión actual. */
function SecurityPanel() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { showNotice } = useNotice();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setError(null);
    if (next.length < 8) {
      setError("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (next !== repeat) {
      setError("La confirmación no coincide con la nueva contraseña.");
      return;
    }
    setSaving(true);
    try {
      await api.changePassword({ currentPassword: current, newPassword: next });
      setCurrent("");
      setNext("");
      setRepeat("");
      showNotice("Contraseña actualizada.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo actualizar la contraseña");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid max-w-[900px] grid-cols-1 gap-[20px] md:grid-cols-2">
      <div className="flex flex-col gap-[14px] rounded-[8px] bg-surface p-[20px]">
        <div>
          <h2 className="font-outfit text-[17px] leading-[1.4] font-semibold text-ink">Cambiar contraseña</h2>
          <p className="mt-[4px] text-[11px] leading-[1.4] text-muted">Mínimo 8 caracteres y distinta de la actual.</p>
        </div>
        {error ? <p className="text-[12px] text-warn">{error}</p> : null}
        <div className="flex flex-col gap-[7px]">
          <span className="text-[11px] font-medium text-ink">Contraseña actual</span>
          <input type="password" value={current} onChange={(event) => setCurrent(event.target.value)} className={fieldClass} autoComplete="current-password" />
        </div>
        <div className="flex flex-col gap-[7px]">
          <span className="text-[11px] font-medium text-ink">Nueva contraseña</span>
          <input type="password" value={next} onChange={(event) => setNext(event.target.value)} className={fieldClass} autoComplete="new-password" />
        </div>
        <div className="flex flex-col gap-[7px]">
          <span className="text-[11px] font-medium text-ink">Repetir nueva contraseña</span>
          <input type="password" value={repeat} onChange={(event) => setRepeat(event.target.value)} className={fieldClass} autoComplete="new-password" />
        </div>
        <div className="flex justify-end">
          <Button variant="primary" height={36} onClick={() => void submit()} disabled={saving || !current || !next || !repeat}>
            {saving ? "Guardando…" : "Actualizar contraseña"}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-[14px] rounded-[8px] border border-[rgba(51,56,48,0.2)] p-[20px]">
        <h2 className="font-outfit text-[17px] leading-[1.4] font-semibold text-ink">Tu sesión</h2>
        <div className="flex items-center gap-[10px]">
          <span className="flex size-[38px] items-center justify-center rounded-full bg-surface text-[11px] font-semibold text-ink">
            {user?.initials ?? "—"}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[13px] font-medium text-ink">{user?.name ?? ""}</span>
            <span className="truncate text-[11px] text-muted">{user?.email ?? ""} · {user?.role ?? ""}</span>
          </span>
        </div>
        <p className="text-[11px] leading-[1.5] text-muted">
          Al cerrar sesión se invalida el token de este navegador. El resto de sesiones no se ven afectadas.
        </p>
        <div className="flex justify-end">
          <Button
            variant="dark"
            height={36}
            onClick={() => {
              logout();
              navigate("/login", { replace: true });
            }}
          >
            Cerrar sesión
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Lee el resumen de inventario para la fórmula de la tarjeta de criterios. */
function useSummary() {
  const { data } = useAsync(() => api.getSummary(), []);
  return { totalStock: data?.totalStock ?? 0, available: data?.available ?? 0, reserved: data?.reserved ?? 0 };
}