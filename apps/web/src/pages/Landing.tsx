import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Icon } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";

/* NAVBAR — misma estructura que TrellLandingNav. Tema Chink claro. */

const NAV_LINKS = [
  { label: "Producto", href: "#producto" },
  { label: "Operación", href: "#operacion" },
  { label: "Planes", href: "#planes" },
  { label: "Opiniones", href: "#opiniones" },
];

function ChinkLandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-[1000] transition-all duration-300 ${
          scrolled ? "border-b border-edge/60 bg-canvas/90 backdrop-blur-xl" : "border-b border-transparent bg-transparent"
        }`}
      >
        <div className="relative mx-auto flex h-16 w-full max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-10">
          <Link to="/" className="flex shrink-0 items-center" aria-label="Chink inicio">
            <Logo className="h-[26px] w-auto" />
          </Link>
          <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex" aria-label="Main">
            {NAV_LINKS.map((link) => (
              <a key={link.label} href={link.href} className="rounded-full px-4 py-2 text-[14px] font-medium tracking-[-0.01em] text-muted transition-colors hover:bg-ink/5 hover:text-ink">
                {link.label}
              </a>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-3">
            <div className="hidden sm:block">
              <Link to="/login" className="rounded-full px-4 py-2 text-[14px] font-medium text-muted transition-colors hover:bg-ink/5 hover:text-ink">
                Entrar
              </Link>
            </div>
            <div className="hidden sm:block">
              <Link to="/registro" className="trell-btn-primary">Crear cuenta</Link>
            </div>
            <button type="button" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex size-9 cursor-pointer items-center justify-center rounded-full text-ink transition-colors hover:bg-ink/5 md:hidden">
              {open ? <span aria-hidden className="text-[18px] leading-none">✕</span> : <Icon name="menu" size={20} />}
            </button>
          </div>
        </div>
      </header>
      <div aria-hidden={!open} className={`fixed inset-0 z-[900] flex flex-col bg-canvas transition-opacity duration-300 md:hidden ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}>
        <nav aria-label="Mobile" className="flex flex-1 flex-col justify-center gap-2 px-8">
          {NAV_LINKS.map((link) => (
            <a key={link.label} href={link.href} onClick={() => setOpen(false)} className="rounded-2xl px-4 py-4 text-2xl font-medium tracking-[-0.02em] text-ink transition-colors hover:bg-ink/5">
              {link.label}
            </a>
          ))}
        </nav>
        <div className="space-y-4 px-8 pb-10">
          <Link to="/registro" onClick={() => setOpen(false)} className="trell-btn-primary w-full">Crear cuenta</Link>
          <Link to="/login" onClick={() => setOpen(false)} className="flex w-full items-center justify-center rounded-lg border border-edge bg-surface px-4 py-3 text-[14px] font-semibold text-ink">
            Entrar
          </Link>
        </div>
      </div>
      <span aria-hidden ref={(el) => {
        if (!el || (el as HTMLElement).dataset.bound) return;
        (el as HTMLElement).dataset.bound = "1";
        const root = el.closest("[data-landing-scroll]") as HTMLElement | null;
        root?.addEventListener("scroll", (e) => setScrolled((e.target as HTMLElement).scrollTop > 32), { passive: true });
      }} />
    </>
  );
}

/* Visuales tema Chink + Icon */

function ShotCatalogo() {
  return (
    <div className="mx-auto w-full bg-surface p-4">
      {(
        [
          ["Tornillo M8 × 40", "TRN-M8-040 · 412 u."],
          ["Tuerca autoblocante", "TRC-AUT-08 · 18 u."],
          ["Arandela plana zinc", "ARN-PLA-12 · 1.024 u."],
        ] as [string, string][]
      ).map(([n, s]) => (
        <div key={n} className="flex items-center gap-3 border-b border-edge py-3 last:border-0">
          <span className="flex size-9 items-center justify-center rounded-lg bg-subtle"><Icon name="package" size={18} /></span>
          <span className="min-w-0"><span className="block truncate text-[13px] font-medium text-ink">{n}</span><span className="block font-mono text-[11px] text-muted">{s}</span></span>
          <span className="ml-auto rounded-[5px] bg-subtle px-2 py-1 text-[11px] font-semibold text-ink">✓</span>
        </div>
      ))}
    </div>
  );
}

function ShotMovimientos() {
  return (
    <div className="mx-auto w-full bg-coal p-4 font-mono text-[12px] leading-6 text-cream">
      {["+120 u. ENTRADA · Lucía · 09:42", "−36 u. SALIDA · Diego · 11:15", "→ 48 u. Norte → Principal · 12:03", "± Ajuste inventario · Ana · 16:20"].map((l) => (
        <p key={l} className="border-b border-cream/10 py-2 last:border-0"><span className="text-accent">✓</span> {l}</p>
      ))}
    </div>
  );
}

function ShotNube() {
  const bars = [38, 62, 45, 80, 55, 92, 70, 58];
  return (
    <div className="mx-auto w-full bg-surface p-6 text-center">
      <p className="font-mono text-[11px] tracking-widest text-muted uppercase">Reporte · Octubre</p>
      <p className="mt-2 font-outfit text-[28px] font-semibold text-ink">2.486 u.</p>
      <div className="mt-4 flex h-[90px] items-end gap-2">
        {bars.map((h, i) => (
          <div key={i} className="flex flex-1 flex-col justify-end gap-1">
            <div className="rounded bg-ink/80" style={{ height: `${h * 0.6}px` }} />
            <div className="rounded bg-accent" style={{ height: `${h * 0.3}px` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ShotEquipo() {
  return (
    <div className="mx-auto w-full bg-surface p-4">
      {( [["Lucía", "Administradora"], ["Diego", "Gestor"], ["Ana", "Operador"]] as [string, string][] ).map(([n, r]) => (
        <div key={n} className="flex items-center justify-between border-b border-edge py-2.5 last:border-0">
          <span className="flex items-center gap-2 text-[13px] font-medium text-ink"><Icon name="nav-equipo" size={16} /> {n}</span>
          <span className="rounded-full bg-subtle px-2.5 py-1 text-[11px] text-muted">{r}</span>
        </div>
      ))}
    </div>
  );
}

/* Fila EXACTA Codex: text 1col + visual 2col, con order alterno.
 * Clases copiadas de tu snippet (grid-cols-12, col-span-full,
 * md:grid-cols-3, md:col-span-2, order-1/order-2, prose). */
function CodexRow({ flip, title, desc, visual }: { flip?: boolean; title: string; desc: string; visual: React.ReactNode }) {
  return (
    <div className="col-span-full grid grid-cols-1 gap-6 md:grid-cols-3 md:items-stretch md:gap-x-8">
      <div className={`order-1 md:flex md:flex-col md:justify-end ${flip ? "md:order-2" : ""}`}>
        <div className="prose max-w-none text-pretty">
          <h3 className="font-outfit text-[22px] leading-[1.3] font-semibold tracking-[-0.01em] text-ink">{title}</h3>
          <p className="mt-3 text-[14px] leading-[1.65] text-muted">{desc}</p>
        </div>
      </div>
      <div className={`order-2 md:col-span-2 ${flip ? "md:order-1" : ""}`}>
        <div className="relative w-full overflow-hidden">
          <div className="relative w-full">
            <div className="size-full">
              <div className="group relative size-full overflow-hidden rounded-md border border-edge bg-surface transition-colors">
                {visual}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChinkFooterCta() {
  const cols = [
    { title: "Producto", links: [{ label: "Catálogo", href: "#producto" }, { label: "Operación", href: "#operacion" }, { label: "Planes", href: "#planes" }] },
    { title: "Cuenta", links: [{ label: "Crear cuenta", href: "/registro" }, { label: "Entrar", href: "/login" }, { label: "Activar invitación", href: "/activar" }] },
    { title: "App", links: [{ label: "Inicio", href: "/inicio" }, { label: "Inventario", href: "/inventario" }, { label: "Reportes", href: "/reportes" }] },
  ];
  return (
    <section className="relative overflow-hidden bg-canvas pt-16 sm:pt-24">
      <div className="relative mx-auto flex w-full max-w-[1440px] flex-col items-center px-5 text-center sm:px-8">
        <h2 className="max-w-xl font-outfit text-4xl leading-[1.08] font-medium tracking-[-0.04em] text-balance text-ink sm:text-[56px]">Empieza a contar cada unidad hoy.</h2>
        <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-muted">Crea tu espacio privado en segundos y registra tu primer movimiento en minutos. Gratis para empezar.</p>
        <Link to="/registro" className="trell-btn-primary mt-9">Crear cuenta gratis →</Link>
      </div>
      <div className="relative mx-auto grid w-full max-w-[1440px] gap-12 px-5 pt-20 sm:px-8 lg:grid-cols-[1.2fr_2fr] lg:pt-28">
        <div>
          <Logo className="h-[30px] w-auto" />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">Gestión de inventario multi-almacén. Cada referencia, cada unidad.</p>
        </div>
        <nav className="grid grid-cols-2 gap-8 sm:grid-cols-3" aria-label="Footer">
          {cols.map((col) => (
            <div key={col.title}>
              <p className="text-sm font-semibold text-muted">{col.title}</p>
              <ul className="mt-4 flex flex-col gap-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {link.href.startsWith("/") ? (
                      <Link to={link.href} className="text-sm text-muted transition-colors hover:text-ink">{link.label}</Link>
                    ) : (
                      <a href={link.href} className="text-sm text-muted transition-colors hover:text-ink">{link.label}</a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <div aria-hidden className="relative z-10 mt-8 flex items-start justify-center gap-[1.5vw] [mask-image:linear-gradient(180deg,transparent,black_35%)]">
        {[0, 1, 2, 3, 4].map((copy) => (
          <span key={copy} className="h-[17vw] w-auto shrink-0 font-outfit text-[17vw] leading-none font-bold tracking-tight whitespace-nowrap text-ink/[0.07] select-none">CHINK</span>
        ))}
      </div>
      <div className="relative mx-auto flex w-full max-w-[1440px] flex-col items-center justify-between gap-4 px-5 pt-8 pb-16 sm:flex-row sm:px-8 sm:pb-24">
        <small className="text-xs font-normal tracking-wide text-muted">© {new Date().getFullYear()} Chink</small>
        <div className="flex items-center gap-2 text-[13px] text-muted">
          <Link to="/login" className="transition-colors hover:text-ink">Entrar</Link>
          <span aria-hidden>·</span>
          <Link to="/registro" className="transition-colors hover:text-ink">Crear cuenta</Link>
        </div>
      </div>
    </section>
  );
}

export default function Landing() {
  const { user, loading } = useAuth();
  if (!loading && user) return <Navigate to={user.status === "PENDING" ? "/activar" : "/inicio"} replace />;

  return (
    <div data-landing-scroll className="h-dvh overflow-y-auto bg-canvas font-dm text-ink antialiased">
      <ChinkLandingNav />

      {/* HERO — header centrado Codex + shot */}
      <section className="group/component-group @container pt-16" data-layout="1-column-grid">
        <div className="@container grid w-full grid-cols-12 gap-x-2 px-5 pt-20 sm:px-8 md:gap-x-4 lg:gap-x-6">
          <div className="col-span-full grid w-full grid-cols-1 items-stretch gap-12">
            <div data-section-header="true" className="grid grid-cols-12">
              <div className="col-span-full md:col-span-10 md:col-start-2 lg:col-span-8 lg:col-start-3">
                <div className="relative flex flex-col items-center text-center">
                  <Icon name="chink-mark" className="h-[40px] w-auto" title="Chink" />
                  <h1 className="mt-6 max-w-[22ch] font-outfit text-[40px] leading-[1.05] font-semibold tracking-[-0.03em] text-balance sm:text-[60px]">
                    Todo tu inventario, bajo control
                  </h1>
                  <div className="mt-6 grid w-full grid-cols-12">
                    <p className="col-span-full max-w-[52ch] justify-self-center text-[15px] leading-relaxed text-balance text-muted">
                      Catálogo, movimientos con trazabilidad, multi-almacén y reportes listos para enviar por correo.
                    </p>
                  </div>
                  <div className="mt-7 flex min-h-6 flex-row flex-wrap items-center justify-center gap-3">
                    <Link to="/registro" className="trell-btn-primary">Crear cuenta gratis</Link>
                    <Link to="/login" className="inline-flex h-10 items-center justify-center rounded-lg border border-edge bg-surface px-6 text-sm font-semibold text-ink transition-colors hover:bg-subtle">
                      Entrar a mi espacio
                    </Link>
                  </div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-12">
              <div className="col-span-full lg:col-span-10 lg:col-start-2">
                <div className="relative w-full overflow-hidden">
                  <div className="overflow-hidden rounded-t-2xl border border-b-0 border-edge bg-surface p-1">
                    <div className="grid gap-3 p-4 sm:grid-cols-4">
                      {(
                        [
                          ["STOCK TOTAL", "2.486 u.", "8 productos"],
                          ["DISPONIBLE", "2.360 u.", "94,9% del stock"],
                          ["RESERVADO", "126 u.", "En curso"],
                          ["STOCK BAJO", "3 refs", "Requieren atención"],
                        ] as [string, string, string][]
                      ).map(([k, v, s]) => (
                        <div key={k} className="rounded-lg border border-edge bg-canvas px-3 py-3 text-left">
                          <p className="font-mono text-[10px] tracking-widest text-muted">{k}</p>
                          <p className="mt-1 font-outfit text-[18px] font-semibold text-ink">{v}</p>
                          <p className="text-[11px] text-muted">{s}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* EMPEZAR */}
      <section id="planes" className="group/component-group @container scroll-mt-20 border-t border-edge" data-layout="1-column-grid">
        <div className="@container grid w-full grid-cols-12 gap-x-2 px-5 py-16 sm:px-8 md:gap-x-4 lg:gap-x-6">
          <div className="col-span-full grid w-full grid-cols-1 items-stretch gap-12">
            <div data-section-header="true" className="grid grid-cols-12">
              <div className="col-span-full md:col-span-10 md:col-start-2 lg:col-span-8 lg:col-start-3">
                <div className="relative flex flex-col items-center text-center">
                  <h2 className="max-w-[20ch] font-outfit text-[32px] leading-[1.1] font-semibold tracking-[-0.02em] text-balance sm:text-[40px]">Empezar</h2>
                  <div className="mt-6 grid w-full grid-cols-12">
                    <p className="col-span-full justify-self-center text-[14px] leading-relaxed text-balance text-muted">Tu espacio privado está incluido desde el primer día. Invita a tu equipo cuando quieras.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-12">
              <div className="col-span-full grid grid-cols-1 gap-5 sm:grid-cols-3">
                {[
                  { n: "Personal", d: "Tu espacio privado en segundos.", p: "Gratis", per: "tu espacio", cta: "Crear cuenta", to: "/registro" },
                  { n: "Equipo", d: "Roles y espacios para operar.", p: "Por invitación", per: "tu equipo", cta: "Invitar equipo", to: "/registro" },
                  { n: "Operación", d: "Fotos, PDF y correo en tu VPS.", p: "Autogestionado", per: "control total", cta: "Entrar", to: "/login" },
                ].map((pl) => (
                  <div key={pl.n} className="flex flex-col gap-4 rounded-xl border border-edge bg-surface p-6">
                    <p className="font-outfit text-[16px] font-semibold text-ink">{pl.n}</p>
                    <p className="min-h-[40px] text-[13px] leading-snug text-muted">{pl.d}</p>
                    <p className="font-outfit text-[24px] font-semibold text-ink">{pl.p} <span className="text-[13px] font-normal text-muted">/ {pl.per}</span></p>
                    <Link to={pl.to} className="trell-btn-primary mt-auto w-full">{pl.cta} →</Link>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* LA MEJOR FORMA — 4 filas exactas Codex */}
      <section id="producto" className="group/component-group @container scroll-mt-20 border-t border-edge bg-subtle/40" data-layout="1-column-grid">
        <div className="@container grid w-full grid-cols-12 gap-x-2 px-5 py-16 sm:px-8 md:gap-x-4 lg:gap-x-6 sm:py-20">
          <div className="col-span-full grid w-full grid-cols-1 items-stretch gap-12 md:gap-16">
            <div data-section-header="true" className="grid grid-cols-12">
              <div className="col-span-full md:col-span-10 md:col-start-2 lg:col-span-8 lg:col-start-3">
                <div className="relative flex flex-col items-center text-center">
                  <h2 className="max-w-[24ch] font-outfit text-[30px] leading-[1.1] font-semibold tracking-[-0.02em] text-balance sm:text-[40px]">
                    La mejor forma de trabajar con tu stock
                  </h2>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-12">
              <div className="col-span-full grid w-full grid-cols-1 items-stretch gap-12">
                <CodexRow title="Diseñado para el catálogo real" desc="Fotos directas a R2, SKU, mínimos y archivo. Deja atrás el Excel: el buscador con filtros y la edición masiva te dejan el catálogo limpio en minutos." visual={<ShotCatalogo />} />
                <CodexRow flip title="Diseñado para movimientos multi-almacén" desc="Registra, transfiere o ajusta con validación de stock negativo. Todo queda con hora, responsable y documento, y lo revisas en un solo lugar." visual={<ShotMovimientos />} />
                <CodexRow title="Sigue avanzando aunque cierres el portátil" desc="El resumen semanal, el PDF fila por fila y los avisos de mínimo siguen trabajando por ti. Inicia una exportación y retoma donde lo dejaste." visual={<ShotNube />} />
                <CodexRow flip title="Escala la operación con confianza" desc="Invita por correo con clave temporal, activa en /activar y opera con roles de consulta a admin. Mantén los cambios en marcha mientras tu equipo trabaja más rápido." visual={<ShotEquipo />} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* OPERACIÓN */}
      <section id="operacion" className="group/component-group @container scroll-mt-20 border-t border-edge" data-layout="1-column-grid">
        <div className="@container grid w-full grid-cols-12 gap-x-2 px-5 py-16 sm:px-8 md:gap-x-4 lg:gap-x-6">
          <div className="col-span-full grid w-full grid-cols-1 items-stretch gap-8">
            <div data-section-header="true" className="grid grid-cols-12">
              <div className="col-span-full md:col-span-10 md:col-start-2 lg:col-span-8 lg:col-start-3">
                <div className="relative flex flex-col items-center text-center">
                  <h2 className="max-w-[26ch] font-outfit text-[28px] leading-tight font-semibold tracking-[-0.02em] text-balance sm:text-[36px]">
                    Lleva Chink directamente a tus flujos de trabajo
                  </h2>
                  <div className="mt-6 grid w-full grid-cols-12">
                    <p className="col-span-full justify-self-center text-[14px] leading-relaxed text-balance text-muted">Conecta fotos, correo y reportes sin salir de la app. Dale a tu operación el contexto que necesita.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-row flex-wrap items-center justify-center gap-3">
              {(["package", "mail", "download", "shield-check", "smartphone", "warehouse-box"] as const).map((ic) => (
                <span key={ic} className="flex size-12 items-center justify-center rounded-full border border-edge bg-surface"><Icon name={ic} size={20} /></span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* EL MISMO EN TODOS LADOS — 4 columnas exactas Codex */}
      <section className="group/component-group @container border-t border-edge bg-subtle/40" data-layout="4-column-grid">
        <div className="@container grid w-full grid-cols-12 gap-x-2 px-5 py-16 sm:px-8 md:gap-x-4 lg:gap-x-6">
          <div className="col-span-full grid w-full grid-cols-1 items-stretch gap-8">
            <div data-section-header="true" className="grid grid-cols-12">
              <div className="col-span-full md:col-span-10 md:col-start-2 lg:col-span-8 lg:col-start-3">
                <div className="relative flex flex-col items-center text-center">
                  <h2 className="font-outfit text-[28px] font-semibold tracking-[-0.02em] text-balance sm:text-[36px]">El mismo inventario en todos lados</h2>
                  <div className="mt-6 grid w-full grid-cols-12">
                    <p className="col-span-full justify-self-center text-[14px] text-balance text-muted">Web, móvil, PDF y correo conectados a la misma fuente de verdad.</p>
                  </div>
                  <div className="mt-6 flex min-h-6 justify-center">
                    <Link to="/registro" className="inline-flex h-10 items-center justify-center rounded-full bg-coal px-5 text-sm font-semibold text-cream transition-opacity hover:opacity-90">Crear cuenta →</Link>
                  </div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-12">
              <div className="col-span-full grid w-full grid-cols-1 items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {(
                  [
                    ["nav-inicio", "Chink en Web", "Catálogo, movimientos y reportes en tu espacio.", "/inicio"],
                    ["smartphone", "Chink en móvil", "PWA instalable con dock y hoja inferior.", "/inicio"],
                    ["download", "Reportes PDF", "Inventario y movimientos fila por fila.", "/reportes"],
                    ["mail", "Correo", "Invitaciones, avisos y reportes adjuntos.", "/equipo"],
                  ] as [string, string, string, string][]
                ).map(([ic, t, d, to]) => (
                  <div key={t} className="group/cta-card flex flex-col gap-4 rounded-xl border border-edge bg-surface p-2">
                    <div className="rounded-lg bg-subtle p-8 text-center"><Icon name={ic} size={30} className="mx-auto" /></div>
                    <div className="flex flex-1 flex-col justify-between gap-8 px-3 pb-3">
                      <div className="flex flex-col gap-2">
                        <h3 className="font-outfit text-[17px] font-semibold text-ink">{t}</h3>
                        <p className="text-[13px] leading-relaxed text-muted">{d}</p>
                      </div>
                      <Link to={to} className="trell-btn-primary w-full !py-2.5 text-[13px]">Abrir →</Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* OPINIONES — 6 cards exactas Codex */}
      <section id="opiniones" className="group/component-group @container scroll-mt-20 border-t border-edge" data-layout="1-column-grid">
        <div className="@container grid w-full grid-cols-12 gap-x-2 px-5 py-16 sm:px-8 md:gap-x-4 lg:gap-x-6">
          <div className="col-span-full grid w-full grid-cols-1 items-stretch gap-8">
            <div data-section-header="true" className="grid grid-cols-12">
              <div className="col-span-full md:col-span-10 md:col-start-2 lg:col-span-8 lg:col-start-3">
                <div className="relative flex flex-col items-center text-center">
                  <h2 className="font-outfit text-[28px] font-semibold tracking-[-0.02em] text-balance sm:text-[36px]">Lo que opinan los equipos</h2>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-12">
              <div className="col-span-full grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                {(
                  [
                    ["Pasamos del Excel al stock en vivo en una tarde. El mínimo nos avisa antes de romper.", "L", "Lucía", "Administradora"],
                    ["Los movimientos con responsable acabaron con el “¿quién sacó esto?”. Trazabilidad total.", "D", "Diego", "Gestor"],
                    ["El PDF por correo para el cierre de mes nos ahorra horas. Va directo a gerencia.", "M", "Marta", "Consulta"],
                    ["Multi-almacén por fin en una sola vista. Principal, Norte y Sur sin cambiar de hoja.", "A", "Ana", "Operadora"],
                    ["Invitar por correo con clave temporal es rapidísimo. El equipo se activa solo.", "J", "Jorge", "Gestor"],
                    ["La PWA en el móvil va a sangre con el dock. Contar en el pasillo y listo.", "S", "Sofía", "Consulta"],
                  ] as [string, string, string, string][]
                ).map(([q, initial, name, role]) => (
                  <div key={name} className="flex h-full flex-col justify-between gap-6 rounded-xl border border-edge bg-surface p-8">
                    <div className="flex flex-col gap-6">
                      <div className="relative size-16">
                        <span className="flex size-16 items-center justify-center rounded-md bg-subtle font-outfit text-xl font-bold text-ink">{initial}</span>
                      </div>
                      <p className="text-[14px] leading-[1.7] text-ink">“{q}”</p>
                    </div>
                    <p className="text-[13px] text-muted"><span className="font-semibold text-ink">{name}</span> · {role}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <ChinkFooterCta />
    </div>
  );
}
