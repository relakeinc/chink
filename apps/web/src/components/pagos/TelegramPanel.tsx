import { useState } from "react";
import { api } from "@/lib/api";
import { useAsync, ErrorBlock, LoadingBlock } from "@/lib/useAsync";
import { useAuth } from "@/context/AuthContext";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/primitives";
import { useNotice } from "@/lib/toast";

interface TelegramChat {
  id: string;
  chatId: string;
  apodo: string | null;
  activo: boolean;
  ultimoUso: string | null;
  usuario: { id: string; nombre: string; email: string } | null;
}

/**
 * Vinculación con Telegram por código de un uso. Solo quien pueda registrar
 * (cajero/admin) genera códigos; el bot valida el rol en cada foto.
 */
export default function TelegramPanel() {
  const { can } = useAuth();
  const puedeRegistrar = can("register");
  const [codigo, setCodigo] = useState<string | null>(null);
  const [instrucciones, setInstrucciones] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const { showNotice } = useNotice();

  const estado = useAsync(() => api.getTelegramEstado(), []);
  const data = estado.data?.data;
  const chats: TelegramChat[] = data?.chats ?? [];

  async function generar() {
    setGenerando(true);
    try {
      const res = await api.generarCodigoTelegram();
      setCodigo(res.data.codigo);
      setInstrucciones(res.data.instrucciones);
    } catch (cause) {
      showNotice(cause instanceof Error ? cause.message : "No se pudo generar el código", { variant: "error" });
    } finally {
      setGenerando(false);
    }
  }

  async function desvincular(chatId: string) {
    if (!window.confirm("¿Desvincular este chat de Telegram?")) return;
    try {
      await api.desvincularChat(chatId);
      showNotice("Chat desvinculado.");
    } catch (cause) {
      showNotice(cause instanceof Error ? cause.message : "No se pudo desvincular", { variant: "error" });
    }
  }

  return (
    <div className="flex flex-col gap-[14px] rounded-[8px] border border-edge p-[20px]">
      <h2 className="flex items-center gap-[8px] text-[13px] font-semibold text-ink">
        <span className="flex size-[24px] items-center justify-center rounded-[6px] bg-[#229ED9]">
          <Icon name="telegram" size={15} />
        </span>
        Telegram del espacio
      </h2>

      {estado.loading ? (
        <LoadingBlock variant="card" />
      ) : estado.error || !data ? (
        <ErrorBlock message={estado.error ?? "Sin datos"} onRetry={() => void estado.reload()} />
      ) : (
        <>
          {!data.botConfigurado ? (
            <p className="rounded-[6px] bg-subtle px-[12px] py-[10px] text-[12px] leading-[1.5] text-muted">
              El bot aún no está configurado en el servidor (falta TELEGRAM_BOT_TOKEN). Los comprobantes por foto se activan al configurarlo.
            </p>
          ) : !data.puedeVincular ? (
            <p className="text-[12px] leading-[1.5] text-muted">
              Tu rol ({data.rol}) no permite vincular ni enviar comprobantes. Pide a un cajero o admin que vincule su Telegram.
            </p>
          ) : (
            <div className="flex flex-col gap-[10px]">
              <p className="text-[12px] leading-[1.5] text-muted">
                Genera un código y envíalo al bot como <span className="font-semibold text-ink">/vincular CODIGO</span>. Dura 10 minutos y solo sirve una vez.
              </p>
              <div className="flex flex-wrap items-center gap-[10px]">
                <Button variant="dark" height={36} onClick={() => void generar()} disabled={generando}>
                  {generando ? "Generando…" : codigo ? "Generar otro" : "Generar código"}
                </Button>
                {codigo ? (
                  <>
                    <span className="font-mono text-[28px] font-bold tracking-[6px] text-ink">{codigo}</span>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(codigo);
                        showNotice("Código copiado.");
                      }}
                      className="text-[12px] font-semibold text-ink hover:underline"
                    >
                      Copiar
                    </button>
                  </>
                ) : null}
              </div>
              {instrucciones ? <p className="text-[11px] leading-[1.5] text-muted">{instrucciones}</p> : null}
              <p className="text-[11px] leading-[1.5] text-muted">
                El bot valida tu rol en cada foto: los lectores no pueden registrar.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-[8px]">
            <p className="text-[12px] font-semibold text-ink">Chats vinculados ({chats.filter((c) => c.activo).length})</p>
            {chats.length === 0 ? (
              <p className="text-[12px] text-muted">Ningún chat vinculado todavía.</p>
            ) : (
              chats.map((chat) => (
                <div key={chat.id} className="flex items-center gap-[10px] rounded-[6px] bg-subtle px-[12px] py-[10px]">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[12px] font-semibold text-ink">
                      {chat.apodo || "Telegram"} {!chat.activo ? <span className="font-normal text-muted">(inactivo)</span> : null}
                    </span>
                    <span className="truncate text-[10px] text-muted">
                      {chat.usuario ? `${chat.usuario.nombre} · ` : ""}chat {chat.chatId}
                      {chat.ultimoUso ? ` · último uso ${new Date(chat.ultimoUso).toLocaleDateString("es-CO")}` : ""}
                    </span>
                  </span>
                  {puedeRegistrar && chat.activo ? (
                    <button type="button" onClick={() => void desvincular(chat.chatId)} className="shrink-0 text-[11px] font-semibold text-warn hover:underline">
                      Desvincular
                    </button>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
