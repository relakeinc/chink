import { useState } from "react";
import { api } from "@/lib/api";
import { useAsync, ErrorBlock, LoadingBlock } from "@/lib/useAsync";
import { formatCOP } from "@/lib/format";
import { Card } from "@/components/ui/primitives";

function hoyLocal(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Cierre del día: suma lo verificado por banco y lo compara contra el saldo
 * real en cuenta. Ideal al final del día para verificar que cuadra.
 */
export default function CierreCaja() {
  const [fecha, setFecha] = useState(hoyLocal);
  const [saldo, setSaldo] = useState("");

  const cierre = useAsync(() => api.getCierre(fecha || undefined), [fecha]);
  const data = cierre.data;

  const saldoNum = Number(saldo.replace(/[^0-9.]/g, "")) || 0;
  const diferencia = data ? saldoNum - data.totalVerificado : 0;
  const haySaldo = saldo.trim() !== "";
  const cuadra = haySaldo && Math.abs(diferencia) < 0.5;

  return (
    <Card className="flex flex-col gap-[16px]">
      <div>
        <h2 className="font-outfit text-[17px] leading-[1.4] font-semibold text-ink">Cierre del día</h2>
        <p className="mt-[4px] text-[11px] leading-[1.4] text-muted">
          Suma los comprobantes verificados y compáralos con el dinero real en cuenta.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-[12px] sm:grid-cols-2">
        <label className="flex flex-col gap-[6px]">
          <span className="text-[11px] font-medium text-ink">Fecha</span>
          <input
            type="date"
            value={fecha}
            max={hoyLocal()}
            onChange={(e) => setFecha(e.target.value || hoyLocal())}
            className="h-[38px] rounded-[6px] border border-edge bg-subtle px-[12px] text-[12px] text-ink outline-none focus:border-ink"
          />
        </label>
        <label className="flex flex-col gap-[6px]">
          <span className="text-[11px] font-medium text-ink">Saldo real en cuenta ($)</span>
          <input
            value={saldo}
            onChange={(e) => setSaldo(e.target.value)}
            inputMode="numeric"
            placeholder="Ej: 1250000"
            className="h-[38px] rounded-[6px] border border-edge bg-subtle px-[12px] text-[12px] text-ink outline-none focus:border-ink"
          />
        </label>
      </div>

      {cierre.loading ? (
        <LoadingBlock variant="card" />
      ) : cierre.error || !data ? (
        <ErrorBlock message={cierre.error ?? "Sin datos"} onRetry={() => void cierre.reload()} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-[12px] sm:grid-cols-3">
            <div className="rounded-[8px] bg-subtle p-[16px]">
              <p className="text-[10px] leading-[1.4] text-muted">VERIFICADO ({data.countVerificado})</p>
              <p className="font-outfit text-[20px] font-semibold text-ink">{formatCOP(data.totalVerificado)}</p>
            </div>
            <div className="rounded-[8px] bg-subtle p-[16px]">
              <p className="text-[10px] leading-[1.4] text-muted">POR REVISAR ({data.countRevisar})</p>
              <p className="font-outfit text-[20px] font-semibold text-warn">{formatCOP(data.totalRevisar)}</p>
            </div>
            <div className="rounded-[8px] bg-subtle p-[16px]">
              <p className="text-[10px] leading-[1.4] text-muted">DIFERENCIA VS. SALDO</p>
              <p className={`font-outfit text-[20px] font-semibold ${!haySaldo ? "text-ink" : cuadra ? "text-ink" : "text-warn"}`}>
                {haySaldo ? `${diferencia >= 0 ? "+" : "−"}${formatCOP(Math.abs(diferencia))}` : "—"}
              </p>
              {haySaldo ? (
                <p className="mt-[4px] text-[11px] leading-[1.4] text-muted">{cuadra ? "✅ Cuadra perfecto" : "⚠️ No cuadra: revisa el detalle"}</p>
              ) : null}
            </div>
          </div>

          {data.porBanco.length > 0 ? (
            <div className="flex flex-col gap-[8px]">
              <p className="text-[12px] font-semibold text-ink">Por banco destino</p>
              {data.porBanco.map((b) => (
                <div key={b.banco} className="flex items-center justify-between rounded-[8px] border border-edge px-[12px] py-[10px]">
                  <span className="text-[12px] text-ink">
                    {b.banco} <span className="text-muted">· {b.cantidad}</span>
                  </span>
                  <span className="text-[13px] font-semibold text-ink">{formatCOP(b.total)}</span>
                </div>
              ))}
            </div>
          ) : null}

          {data.detalle.length > 0 ? (
            <details>
              <summary className="cursor-pointer text-[12px] font-semibold text-ink">
                Ver detalle ({data.detalle.length} comprobantes)
              </summary>
              <div className="mt-[8px] flex max-h-[260px] flex-col gap-[6px] overflow-y-auto">
                {data.detalle.map((d) => (
                  <div key={d.id} className="flex items-center justify-between rounded-[6px] bg-subtle px-[10px] py-[8px] text-[12px]">
                    <span className="min-w-0 truncate text-ink">
                      <span className="font-semibold">{d.cliente ?? d.para ?? "Sin nombre"}</span>{" "}
                      <span className="text-muted">{d.referencia ?? "s/ref"} · {d.banco_destino ?? "¿banco?"}</span>
                    </span>
                    <span className="shrink-0 font-semibold text-ink">{formatCOP(d.monto)}</span>
                  </div>
                ))}
              </div>
            </details>
          ) : (
            <p className="text-[12px] text-muted">Sin comprobantes ese día.</p>
          )}
        </>
      )}
    </Card>
  );
}
