import { useEffect, useRef, useState } from "react";
import { ApiError, api } from "@/lib/api";
import type { Member } from "@/lib/api";
import { useAsync, ErrorBlock, LoadingBlock, useDebounced } from "@/lib/useAsync";
import { formatInt } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";
import KpiStrip, { KpiValue, PageFooter, PageHeader } from "@/components/ui/KpiStrip";
import Tabs from "@/components/ui/Tabs";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { FilterSelect, SearchInput, useCommandK } from "@/components/ui/inputs";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { useNotice } from "@/lib/toast";
import Modal from "@/components/ui/Modal";
import { InviteModal } from "@/components/forms/WarehouseModal";

export default function Equipo() {
  const [view, setView] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput, 300);
  const [role, setRole] = useState("");
  const [site, setSite] = useState("");
  const [status, setStatus] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [rolesHighlight, setRolesHighlight] = useState(false);
  const rolesRef = useRef<HTMLDivElement>(null);
  const { showNotice } = useNotice();
  const searchRef = useRef<HTMLInputElement>(null);
  useCommandK(searchRef);

  const members = useAsync(() => api.getMembers({ search: search || undefined, warehouse: site || undefined }), [search, site]);
  const matrix = useAsync(() => api.getPermissions(), []);
  const warehouses = useAsync(() => api.getWarehouses(), []);

  const all: Member[] = members.data?.data ?? [];
  const rows = all.filter((m) => {
    if (view === "active" && m.status !== "Activo") return false;
    if (view === "invited" && m.status !== "Pendiente") return false;
    if (role && m.role !== role) return false;
    if (status && m.status !== status) return false;
    return true;
  });

  const meta = members.data?.meta;
  const kpis = meta
    ? [
        { label: "MIEMBROS ACTIVOS", value: <KpiValue value={meta.active} format={formatInt} />, context: "Acceso al espacio" },
        { label: "INVITACIONES PENDIENTES", value: <KpiValue value={meta.pending} format={formatInt} /> },
        { label: "ROLES DEL EQUIPO", value: <KpiValue value={meta.roles} format={formatInt} /> },
        { label: "ALMACENES CON ACCESO", value: <KpiValue value={meta.warehouses} format={formatInt} />, context: "Permisos por ubicación" },
      ]
    : [];

  const tabs = [
    { id: "all", label: "Todos los miembros", count: all.length },
    { id: "active", label: "Activos", count: meta?.active ?? 0 },
    { id: "invited", label: "Invitaciones", count: meta?.pending ?? 0 },
  ];

  function exportCsv() {
    downloadCsv("equipo-chink.csv", ["Nombre", "Correo", "Rol", "Almacenes", "Último acceso", "Estado"], rows.map((m) => [m.name, m.email, m.role, m.warehouses, m.lastAccess, m.status]));
    showNotice("Directorio exportado.");
  }

  /** "Gestionar roles" lleva a la matriz de permisos y la resalta un instante. */
  function scrollToRoles() {
    rolesRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setRolesHighlight(true);
    window.setTimeout(() => setRolesHighlight(false), 1400);
  }

  /** Acción por fila: reenviar, ver el perfil propio o ir a la matriz. */
  async function memberAction(m: Member) {
    if (m.status === "Pendiente") {
      try {
        const res = await api.resendInvitation(m.id);
        await members.reload();
        showNotice(
          res.data.emailSent
            ? `Invitación reenviada a ${m.email}.`
            : `Invitación renovada, pero el correo no salió. Clave temporal: ${res.data.temporaryPassword}`,
          res.data.emailSent ? {} : { variant: "warning", icon: "warning" },
        );
      } catch (cause) {
        // La fila puede ir desfasada (p. ej. ya aceptó en otra sesión):
        // se recarga y se explica en vez de dejar un 400 críptico.
        await members.reload();
        const changed = cause instanceof ApiError && cause.status === 400;
        showNotice(
          changed ? "Su estado cambió. Lista actualizada, revisa su fila." : cause instanceof Error ? cause.message : "No se pudo reenviar la invitación",
          { variant: changed ? "info" : "error", icon: changed ? "info" : "cancel" },
        );
      }
      return;
    }
    if (m.isYou) {
      setShowProfile(true);
      return;
    }
    scrollToRoles();
  }

  /** Conmutador de la matriz: aplica al instante y revierte si falla. */
  async function toggleGrant(roleId: string, permissionId: string, allowed: boolean) {
    const prev = matrix.data;
    if (prev) {
      matrix.setData({
        ...prev,
        permissions: prev.permissions.map((p) => (p.id === permissionId ? { ...p, grants: { ...p.grants, [roleId]: allowed } } : p)),
      });
    }
    try {
      await api.updatePermissions({ roleId, permissionId, allowed });
    } catch (cause) {
      await matrix.reload();
      showNotice(cause instanceof Error ? cause.message : "No se pudo actualizar el permiso", { variant: "error", icon: "cancel" });
    }
  }

  const columns: Column<Member>[] = [
    {
      key: "name",
      header: "Nombre / Correo electrónico",
      width: "flex-1 min-w-px",
      render: (m) => (
        <span className="flex flex-col gap-[3px] leading-[1.4]">
          <span className="text-[13px] text-ink">
            {m.name}
            {m.isYou ? " · Tú" : ""}
          </span>
          <span className="text-[10px] text-muted">{m.email}</span>
        </span>
      ),
    },
    {
      key: "role",
      header: "Rol",
      width: "w-[180px]",
      render: (m) => (
        m.isYou ? (
          <Badge tone="neutral">{m.role}</Badge>
        ) : (
          <FilterSelect
            label={`Rol de ${m.name}`}
            tone="light"
            allowClear={false}
            width={180}
            value={m.role}
            options={(matrix.data?.roles ?? []).map((r) => ({ value: r.name, label: r.name }))}
            onChange={async (next) => {
              const role = matrix.data?.roles.find((r) => r.name === next);
              if (!role) return;
              // Optimista: la fila cambia al instante; si falla, se revierte.
              const prev = members.data;
              if (prev) {
                members.setData({ ...prev, data: prev.data.map((row) => (row.id === m.id ? { ...row, role: role.name } : row)) });
              }
              try {
                await api.updateMemberRole(m.id, role.id);
                showNotice(`${m.name} ahora es ${role.name}.`);
              } catch (cause) {
                await members.reload();
                showNotice(cause instanceof Error ? cause.message : "No se pudo actualizar el rol", {
                  variant: "error",
                  icon: "cancel",
                });
              }
            }}
          />
        )
      ),
    },
    { key: "warehouses", header: "Almacenes", width: "w-[270px]", render: (m) => <span className="text-[13px] text-ink">{m.warehouses}</span> },
    { key: "lastAccess", header: "Último acceso", width: "w-[190px]", render: (m) => <span className="text-[13px] text-ink">{m.lastAccess}</span> },
    { key: "status", header: "Estado", width: "w-[140px]", render: (m) => <Badge tone={m.status === "Activo" ? "success" : "alert"}>{m.status}</Badge> },
    {
      key: "actions",
      header: "Acciones",
      width: "w-[130px]",
      render: (m) => (
        <button type="button" onClick={() => void memberAction(m)} className="text-[13px] text-ink hover:underline">
          {m.action}
        </button>
      ),
    },
  ];

  const roles = matrix.data?.roles ?? [];
  const permissions = matrix.data?.permissions ?? [];
  const permissionColumns: Column<(typeof permissions)[number]>[] = [
    {
      key: "label",
      header: "Permiso",
      width: "flex-1 min-w-px",
      render: (p) => <span className="text-[13px] text-ink">{p.label}</span>,
    },
    ...roles.map((role) => ({
      key: role.id,
      header: role.header,
      width: "w-[230px]",
      render: (p: (typeof permissions)[number]) => {
        const granted = Boolean(p.grants[role.id]);
        return (
          <button
            type="button"
            role="switch"
            aria-checked={granted}
            aria-label={`${p.label} para ${role.name}`}
            onClick={() => void toggleGrant(role.id, p.id, !granted)}
            className={`flex items-center gap-[8px] rounded-[5px] px-[8px] py-[4px] text-[13px] transition-colors hover:bg-subtle ${
              granted ? "text-ink" : "text-muted-2"
            }`}
          >
            <span
              className={`flex size-[14px] shrink-0 items-center justify-center rounded-[3px] border ${
                granted ? "border-accent bg-accent" : "border-edge bg-subtle"
              }`}
            >
              {granted ? <Icon name="check" size={10} /> : null}
            </span>
            {granted ? "Permitido" : "—"}
          </button>
        );
      },
    })),
  ];

  return (
    <>
      <PageHeader
        title="Equipo"
        description="Las personas detrás del inventario. Cada rol, con el acceso adecuado."
        actions={
          <>
            <Button variant="dark" icon="shield-check" onClick={scrollToRoles}>
              Gestionar roles
            </Button>
            <Button variant="primary" icon="user-plus" onClick={() => setShowInvite(true)}>
              Invitar miembro
            </Button>
          </>
        }
      />

      {members.loading ? <LoadingBlock variant="kpi" /> : <KpiStrip items={kpis} />}

      <div className="flex flex-col gap-[20px]">
        <Card className="flex flex-col overflow-hidden">
          <Tabs items={tabs} active={view} onChange={setView} />

          <div className="flex flex-wrap items-center gap-[8px] p-[16px]">
            <SearchInput inputRef={searchRef} value={searchInput} onChange={setSearchInput} placeholder="Buscar por nombre o correo" />
            <FilterSelect
              label="Todos los roles"
              placeholder="Todos los roles"
              value={role}
              onChange={setRole}
              options={roles.map((r) => ({ value: r.name, label: r.name }))}
            />
            <FilterSelect
              label="Todos los almacenes"
              placeholder="Todos los almacenes"
              value={site}
              onChange={setSite}
              options={(warehouses.data?.data ?? []).map((w) => ({ value: w.code, label: w.name }))}
            />
            <FilterSelect
              label="Estado"
              placeholder="Estado"
              value={status}
              onChange={setStatus}
              options={[
                { value: "Activo", label: "Activo" },
                { value: "Pendiente", label: "Pendiente" },
              ]}
            />
            <div className="flex min-w-px flex-1 items-start justify-end">
              <Button variant="dark" icon="download" onClick={exportCsv}>
                Exportar
              </Button>
            </div>
          </div>

          {members.error ? (
            <ErrorBlock message={members.error} onRetry={() => void members.reload()} />
          ) : members.loading ? (
            <LoadingBlock />
          ) : (
            <DataTable columns={columns} rows={rows} rowKey={(m) => m.id} rowHeight={40} />
          )}

          <div className="flex items-center gap-[8px] px-[20px] py-[12px] text-[11px] leading-[1.4] text-muted">
            <Icon name="shield-check" size={14} />
            Solo la administración puede invitar miembros y modificar permisos. Las invitaciones caducan en 7 días.
          </div>
        </Card>

        <div
          ref={rolesRef}
          className={`flex flex-col overflow-hidden rounded-[10px] bg-canvas transition-shadow duration-500 ${
            rolesHighlight ? "shadow-[0_0_0_2px_#cdfa63]" : ""
          }`}
        >
          <div className="flex h-[56px] items-center justify-between px-[20px]">
            <h2 className="font-outfit text-[17px] leading-[1.4] font-semibold text-ink">Roles y permisos</h2>
            <span className="text-[11px] text-muted">Los permisos se aplican únicamente a los almacenes asignados a cada miembro.</span>
          </div>
          {matrix.loading ? (
            <LoadingBlock />
          ) : (
            <DataTable columns={permissionColumns} rows={matrix.data?.permissions ?? []} rowKey={(p) => p.id} rowHeight={32} />
          )}
          <p className="px-[20px] pt-[2px] text-[10px] leading-[1.4] text-muted">
            Administración: acceso completo. Los cambios de rol quedan registrados en el historial de actividad.
          </p>
        </div>
      </div>

      <PageFooter left="Última actualización: 15 oct 2026 · 10:42" right="Datos de ejemplo · COP" />
      <InviteModal
        open={showInvite}
        onClose={() => setShowInvite(false)}
        matrix={matrix.data}
        warehouseOptions={(warehouses.data?.data ?? []).map((w) => ({ value: w.id, label: w.name }))}
        onDone={async () => {
          await Promise.all([members.reload(), matrix.reload()]);
        }}
      />
      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </>
  );
}

/** Ficha del usuario actual con los datos reales de la sesión. */
function ProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [profile, setProfile] = useState<{ user: { name: string; email: string; initials: string; role: string; status: string }; permissions: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setProfile(null);
    setError(null);
    void api
      .me()
      .then(setProfile)
      .catch((cause) => setError(cause instanceof Error ? cause.message : "No se pudo cargar el perfil"));
  }, [open ]);

  return (
    <Modal open={open} title="Mi perfil" description="Datos de tu sesión actual." onClose={onClose}>
      {error ? <p className="text-[12px] text-warn">{error}</p> : null}
      {!profile && !error ? (
        <p className="text-[12px] text-muted">Cargando…</p>
      ) : profile ? (
        <div className="flex flex-col gap-[14px]">
          <div className="flex items-center gap-[12px]">
            <span className="flex size-[44px] items-center justify-center rounded-full bg-surface text-[13px] font-semibold text-ink">
              {profile.user.initials}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[14px] font-semibold text-ink">{profile.user.name}</span>
              <span className="truncate text-[11px] text-muted">{profile.user.email}</span>
            </span>
            <span className="ml-auto shrink-0 rounded-[5px] bg-subtle px-[8px] py-[4px] text-[10px] font-medium text-muted">
              {profile.user.role}
            </span>
          </div>
          <div className="flex flex-col gap-[6px] rounded-[8px] bg-surface p-[12px]">
            <span className="text-[11px] font-medium text-ink">Permisos activos ({profile.permissions.length})</span>
            <span className="text-[11px] leading-[1.5] text-muted">{profile.permissions.join(" · ") || "Sin permisos"}</span>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}