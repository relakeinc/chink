/** Cliente HTTP de la API. Añade el token de sesión y normaliza los errores. */
const BASE_URL = import.meta.env.VITE_API_URL ?? "";
const TOKEN_KEY = "chink-saas-token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type Primitive = string | number | boolean | null | undefined;
export type QueryParams = Record<string, Primitive>;

function withQuery(path: string, params?: QueryParams): string {
  if (!params) return path;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

async function request<T>(path: string, options: { method?: string; body?: unknown; params?: QueryParams } = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(`${BASE_URL}${withQuery(path, options.params)}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });

  if (response.status === 401) {
    setToken(null);
    throw new ApiError("Tu sesión expiró. Vuelve a iniciar sesión.", 401);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? `Error ${response.status}`, response.status);
  }

  return (await response.json()) as T;
}

/* --------------------------------------------------------------- Tipos */

export type ProductStatus = "IN_STOCK" | "LOW_STOCK";

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  stock: number;
  reserved: number;
  available: number;
  unitCost: number;
  totalValue: number;
  status: ProductStatus;
  icon: string;
  imageKey: string | null;
  imageUrl: string | null;
  minStock: number;
  warehouse: string | null;
}

export interface InventorySummary {
  totalStock: number;
  available: number;
  reserved: number;
  totalValue: number;
  counts: { all: number; lowStock: number; archived: number };
  categories: string[];
  warehouses: { id: string; name: string; code: string }[];
}

export interface ListMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  initials: string;
  role: string;
  status: string;
}

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  location: string;
  address: string;
  active: boolean;
  stock: number;
  available: number;
  reserved: number;
  capacity: number;
  ratio: number;
  productCount: number;
  owner: string;
}

export interface MovementRow {
  id: string;
  ref: string;
  date: string;
  time: string;
  type: "Entrada" | "Salida" | "Transferencia" | "Ajuste";
  product: string;
  sku: string;
  imageUrl: string | null;
  quantity: number;
  route: string;
  owner: string;
  status: "Confirmado" | "Pendiente";
}

export interface MovementSummary {
  entries: { units: number; count: number };
  exits: { units: number; count: number };
  transfers: { units: number; count: number };
  adjustments: { units: number; count: number };
  net: number;
  balance: number;
}

export interface Member {
  id: string;
  name: string;
  isYou: boolean;
  email: string;
  initials: string;
  role: string;
  warehouses: string;
  lastAccess: string;
  status: "Activo" | "Pendiente";
  action: string;
}

export interface RoleMatrix {
  roles: { id: string; name: string; header: string }[];
  permissions: { id: string; label: string; grants: Record<string, boolean> }[];
}

export interface SettingsData {
  spaceName: string;
  spaceColor: string;
  spaceMark: string;
  /** Tema visual del espacio: claro, halloween o automático por fechas. */
  theme: "light" | "halloween" | "auto";
  legalName: string;
  contactEmail: string;
  taxId: string;
  language: string;
  currency: string;
  timezone: string;
  dateFormat: string;
  unit: string;
  defaultWarehouseId: string | null;
  defaultWarehouseLabel: string | null;
  movementPrefix: string;
  defaultMinStock: number;
  allowNegativeStock: boolean;
  requireAdjustmentReason: boolean;
  lowStockAlerts: boolean;
  reserveBeforePicking: boolean;
  notifyLowStock: boolean;
  notifyMovements: boolean;
  notifyWeeklyReport: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

export interface CategoryRow {
  name: string;
  units: number;
  products: number;
  percent: number;
  bar: string;
}

export interface ReportSummary {
  closing: number;
  cutoff: string | null;
  entries: number;
  exits: number;
  net: number;
  netPercent: number;
  opening: number;
  adjustments: number;
  lowStock: number;
  lowStockUnits: { stock: number | null };
  totalProducts: number;
}

export interface ExportableReport {
  name: string;
  scope: string;
  cutoff: string;
  content: string;
  format: string;
}

export interface BarPoint {
  day: string;
  entries: number;
  exits: number;
}

/* ------------------------------------------------------------ Endpoints */

export const api = {
  /* Auth */
  login: (email: string, password: string) =>
    request<{ token: string; user: SessionUser; permissions: string[]; mustActivate: boolean }>("/api/auth/login", {
      method: "POST",
      body: { email, password },
    }),
  me: () => request<{ user: SessionUser; permissions: string[] }>("/api/auth/me"),
  register: (body: { name: string; email: string; password: string }) =>
    request<{ token: string; user: SessionUser; permissions: string[]; mustActivate: boolean }>("/api/auth/register", {
      method: "POST",
      body,
    }),
  activate: (body: { currentPassword: string; newPassword: string }) =>
    request<{ token: string; user: SessionUser; permissions: string[] }>("/api/auth/activate", { method: "PATCH", body }),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    request<{ data: { updated: boolean } }>("/api/auth/password", { method: "PATCH", body }),

  /* Inventario */
  getSummary: () => request<InventorySummary>("/api/inventory/summary"),
  getProducts: (params?: QueryParams) => request<{ data: Product[]; meta: ListMeta }>("/api/inventory/products", { params }),
  createProduct: (body: unknown) => request<{ data: Product }>("/api/inventory/products", { method: "POST", body }),
  updateProduct: (id: string, body: unknown) => request<{ data: Product }>(`/api/inventory/products/${id}`, { method: "PATCH", body }),
  createProductImageUploadUrls: (body: { productIds: string[]; contentType: string; size: number }) =>
    request<{ data: { productId: string; key: string; uploadUrl: string; publicUrl: string; expiresIn: number }[] }>(
      "/api/inventory/product-images/upload-urls",
      { method: "POST", body },
    ),
  updateProductImages: (items: { id: string; imageKey: string | null }[]) =>
    request<{ data: Product[] }>("/api/inventory/products/images", { method: "PATCH", body: { items } }),
  getProductImageStatus: () =>
    request<{ data: { configured: boolean; bucket: string | null; publicBaseUrl: string | null } }>(
      "/api/inventory/product-images/status",
    ),

  /* Movimientos */
  getMovements: (params?: QueryParams) =>
    request<{
      data: MovementRow[];
      meta: ListMeta & { counts: Record<string, number>; net: number };
    }>("/api/movements", { params }),
  getMovementsSummary: (params?: QueryParams) => request<MovementSummary>("/api/movements/summary", { params }),
  getWeekly: (params?: QueryParams) => request<{ data: BarPoint[] }>("/api/movements/weekly", { params }),
  createMovement: (body: {
    type: "ENTRY" | "EXIT" | "TRANSFER" | "ADJUSTMENT";
    productId: string;
    quantity: number;
    direction?: "in" | "out";
    originId?: string | null;
    destinationId?: string | null;
    note?: string;
  }) =>
    request<{ data: { id: string; ref: string; type: string; product: string; sku: string; quantity: number; owner: string; status: string }; stockDelta: number; crossedLowStock: { product: string; sku: string; stock: number; minStock: number } | null }>(
      "/api/movements",
      { method: "POST", body },
    ),

  /* Almacenes */
  getWarehouses: () => request<{ data: Warehouse[] }>("/api/warehouses"),
  createWarehouse: (body: { code: string; name: string; location: string; address?: string; capacity: number }) =>
    request<{ data: { id: string; code: string; name: string; location: string; address: string; capacity: number } }>("/api/warehouses", {
      method: "POST",
      body,
    }),
  getLocations: () =>
    request<{
      warehouses: { id: string; code: string; name: string }[];
      data: { id: string; sku: string; product: string; icon: string; imageUrl: string | null; status: string; total: number; quantities: number[] }[];
    }>("/api/warehouses/locations"),
  getWarehousesSummary: () =>
    request<{ active: number; stock: number; capacity: number; occupancy: number; free: number }>("/api/warehouses/summary"),

  /* Equipo */
  getMembers: (params?: QueryParams) =>
    request<{ data: Member[]; meta: { active: number; pending: number; roles: number; warehouses: number } }>("/api/team/members", { params }),
  getPermissions: () => request<RoleMatrix>("/api/team/permissions"),
  updateMemberRole: (id: string, roleId: string) =>
    request<{ data: { id: string; roleId: string } }>(`/api/team/members/${id}`, { method: "PATCH", body: { roleId } }),
  updatePermissions: (body: { roleId: string; permissionId: string; allowed: boolean }) =>
    request<{ data: { roleId: string; permissionId: string; allowed: boolean } }>("/api/team/permissions", {
      method: "PATCH",
      body,
    }),
  inviteMember: (body: { email: string; name: string; roleId: string; warehouseIds?: string[] }) =>
    request<{
      data: { id: string; email: string; role: string; temporaryPassword: string | null; alreadyMember?: boolean; emailSent: boolean };
    }>("/api/team/invitations", {
      method: "POST",
      body,
    }),
  resendInvitation: (id: string) =>
    request<{ data: { id: string; email: string; temporaryPassword: string; emailSent: boolean } }>(`/api/team/invitations/${id}/resend`, {
      method: "POST",
    }),
  sendReportEmail: (body: { name: string; email: string }) =>
    request<{ data: { id: string; email: string; name: string } }>("/api/reports/email", { method: "POST", body }),

  /* Reportes */
  getReportSummary: () => request<ReportSummary>("/api/reports/summary"),
  getCategories: () => request<{ total: number; data: CategoryRow[] }>("/api/reports/categories"),
  getExports: () => request<{ data: ExportableReport[] }>("/api/reports/exports"),
  getLowStock: () =>
    request<{ data: { name: string; sku: string; minStock: number; stock: number; imageUrl: string | null }[] }>("/api/reports/low-stock"),

  /* Configuración */
  getSettings: () =>
    request<{
      data: SettingsData;
      options: Record<string, string[]>;
      warehouses: { value: string; label: string }[];
    }>("/api/settings"),
  updateSettings: (body: Partial<SettingsData>) =>
    request<{ data: SettingsData }>("/api/settings", { method: "PATCH", body }),
};

/** Sube bytes directamente al bucket con una URL firmada de corta duración. */
export async function uploadToPresignedUrl(uploadUrl: string, file: File): Promise<void> {
  const response = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
  if (!response.ok) throw new Error(`No se pudo subir la imagen al bucket (${response.status}).`);
}