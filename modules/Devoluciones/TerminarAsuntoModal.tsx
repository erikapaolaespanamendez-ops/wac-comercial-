// ===================================================================
// Terminar asunto  →  src/modules/Devoluciones/TerminarAsuntoModal.tsx
// Cierre DEFINITIVO de una devolución desde Control de Devoluciones.
//
// En un solo paso:
//   1. Registra el abono final (opcional — si ya está pagado, va en 0).
//   2. Define si la compensación APLICA o NO APLICA.
//      Si no aplica queda en $0 y no se cuenta para pagos.
//   3. Da el asunto por terminado: sale del calendario, de la bolsa
//      mensual y de cualquier cálculo de pagos.
//
// El asunto queda BLOQUEADO: ya no se puede editar el capital, ni
// agregar/mover/borrar abonos, ni eliminar el registro. El candado vive
// en la base (triggers + fn_dar_por_terminado), no aquí — aunque alguien
// manipule el front, Postgres lo rechaza.
//
// Solo SRAC, RAC, GAD y DGE pueden terminar un asunto.
// ===================================================================
import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { fetchPerfil } from "../../data/usuarios";

// Nombre de quien cierra — queda grabado en el expediente para siempre.
async function nombreDeQuienCierra(): Promise<string> {
  try {
    const { data } = await supabase.auth.getSession();
    const email = data.session?.user?.email || "";
    if (!email) return "Usuario del sistema";
    const pf = await fetchPerfil(email);
    return pf?.nombre || email;
  } catch { return "Usuario del sistema"; }
}

const ROLES_QUE_PUEDEN_TERMINAR = ["SRAC", "RAC", "GAD", "DGE"];

export function puedeTerminarAsunto(rol: string | null | undefined): boolean {
  return ROLES_QUE_PUEDEN_TERMINAR.includes(String(rol || "").trim().toUpperCase());
}

function money(n: number): string {
  return "$" + Math.round(n || 0).toLocaleString("es-MX");
}

type Props = {
  clienteId: string;
  nombreCliente: string;
  folio: string;
  capital: number;
  yaAbonado: number;
  rol: string | null;
  onCerrar: (ok?: boolean) => void;
};

export default function TerminarAsuntoModal({
  clienteId, nombreCliente, folio, capital, yaAbonado, rol, onCerrar,
}: Props) {
  const hoy = new Date().toISOString().slice(0, 10);
  const soloNum = (s: string) => String(s ?? "").replace(/[^0-9.]/g, "");
  const num = (s: string) => Number(soloNum(s)) || 0;

  const restanteAntes = Math.max(0, capital - yaAbonado);

  const [abonoMonto, setAbonoMonto] = useState(restanteAntes > 0 ? String(restanteAntes) : "");
  const [abonoFecha, setAbonoFecha] = useState(hoy);
  const [abonoNota, setAbonoNota] = useState("");
  const [aplicaComp, setAplicaComp] = useState<boolean | null>(null);
  const [compMonto, setCompMonto] = useState("");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState("");

  const totalTrasAbono = yaAbonado + num(abonoMonto);
  const restanteFinal = capital - totalTrasAbono;

  if (!puedeTerminarAsunto(rol)) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-5">
          <p className="text-[14px] font-semibold text-tinta">No tienes permiso</p>
          <p className="mt-2 text-[12.5px] text-humo">
            Dar un asunto por terminado es una acción definitiva. Solo la puede hacer
            la sub RAC, la RAC, el GAD o la DGE.
          </p>
          <button onClick={() => onCerrar(false)} className="mt-4 w-full rounded-lg bg-nube px-3 py-2 text-[12.5px] font-semibold text-tinta">
            Entendido
          </button>
        </div>
      </div>
    );
  }

  async function terminar() {
    if (aplicaComp === null) { setErr("Dinos si la compensación aplica o no aplica."); return; }
    if (aplicaComp && num(compMonto) <= 0) { setErr("Pon el monto de la compensación."); return; }
    if (restanteFinal > 0) {
      const ok = window.confirm(
        `Al cliente todavía le quedarían ${money(restanteFinal)} de capital.\n\n` +
        `¿Seguro que quieres dar el asunto por terminado? Esto no se puede deshacer.`
      );
      if (!ok) return;
    } else {
      const ok = window.confirm(
        `El asunto de ${nombreCliente} quedará TERMINADO de forma definitiva.\n\n` +
        `Sale del calendario y ya no se podrá editar nada: ni el capital, ni los abonos.\n\n` +
        `¿Continuamos?`
      );
      if (!ok) return;
    }

    setErr(""); setGuardando(true);
    try {
      const { data, error } = await supabase.rpc("fn_dar_por_terminado", {
        p_cliente_id: clienteId,
        p_usuario: await nombreDeQuienCierra(),
        p_rol: String(rol || "").trim().toUpperCase(),
        p_abono_monto: num(abonoMonto),
        p_abono_fecha: abonoFecha,
        p_abono_nota: abonoNota.trim() || null,
        p_compensacion_aplica: aplicaComp,
        p_compensacion_monto: aplicaComp ? num(compMonto) : 0,
        p_nota: nota.trim() || null,
      });
      if (error) throw new Error(error.message);
      void data;
      onCerrar(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo terminar el asunto.");
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-8 w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3">
          <h2 className="font-display text-[16px] font-extrabold text-tinta">🔒 Dar por terminado</h2>
          <p className="mt-0.5 text-[12.5px] text-humo">{nombreCliente} · {folio}</p>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2 rounded-xl border border-black/10 bg-nube/40 p-3 text-center">
          <div><p className="text-[10.5px] text-humo">Capital</p><p className="text-[13px] font-semibold text-tinta">{money(capital)}</p></div>
          <div><p className="text-[10.5px] text-humo">Ya se le dio</p><p className="text-[13px] font-semibold text-emerald-700">{money(yaAbonado)}</p></div>
          <div><p className="text-[10.5px] text-humo">Restante</p><p className="text-[13px] font-semibold text-amber-700">{money(restanteAntes)}</p></div>
        </div>

        {/* 1. Abono final */}
        <div className="mb-4 rounded-xl border border-black/10 p-3">
          <p className="mb-2 text-[12.5px] font-semibold text-tinta">1. Abono final</p>
          <p className="mb-2 text-[11.5px] text-humo">Si ya se le pagó todo y solo falta cerrar, déjalo en 0.</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[10.5px] text-humo">Monto</span>
              <input value={abonoMonto} onChange={(e) => setAbonoMonto(soloNum(e.target.value))} inputMode="decimal" placeholder="0"
                className="mt-0.5 w-full rounded-lg border border-black/10 px-2.5 py-1.5 text-[12.5px]" />
            </label>
            <label className="block">
              <span className="text-[10.5px] text-humo">Fecha</span>
              <input type="date" value={abonoFecha} onChange={(e) => setAbonoFecha(e.target.value)}
                className="mt-0.5 w-full rounded-lg border border-black/10 px-2.5 py-1.5 text-[12.5px]" />
            </label>
          </div>
          <input value={abonoNota} onChange={(e) => setAbonoNota(e.target.value)} placeholder="Nota del abono (opcional)"
            className="mt-2 w-full rounded-lg border border-black/10 px-2.5 py-1.5 text-[12.5px]" />
          {num(abonoMonto) > 0 && (
            <p className="mt-2 text-[11.5px] text-humo">
              Quedaría en {money(totalTrasAbono)} de {money(capital)}
              {restanteFinal > 0
                ? <span className="font-semibold text-amber-700"> — faltarían {money(restanteFinal)}</span>
                : <span className="font-semibold text-emerald-700"> — capital cubierto</span>}
            </p>
          )}
        </div>

        {/* 2. Compensación */}
        <div className="mb-4 rounded-xl border border-black/10 p-3">
          <p className="mb-2 text-[12.5px] font-semibold text-tinta">2. Compensación</p>
          <p className="mb-2 text-[11.5px] text-humo">
            Si el cierre fue por convenio y la compensación nunca se pactó, marca <strong>No aplica</strong>:
            queda en $0 y no se cuenta para pagos.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setAplicaComp(false)}
              className={"flex-1 rounded-lg px-3 py-2 text-[12px] font-semibold " + (aplicaComp === false ? "bg-tinta text-white" : "bg-nube text-tinta")}>
              No aplica
            </button>
            <button type="button" onClick={() => setAplicaComp(true)}
              className={"flex-1 rounded-lg px-3 py-2 text-[12px] font-semibold " + (aplicaComp === true ? "bg-teal text-white" : "bg-nube text-tinta")}>
              Sí aplica
            </button>
          </div>
          {aplicaComp === true && (
            <label className="mt-2 block">
              <span className="text-[10.5px] text-humo">Monto de la compensación</span>
              <input value={compMonto} onChange={(e) => setCompMonto(soloNum(e.target.value))} inputMode="decimal" placeholder="0"
                className="mt-0.5 w-full rounded-lg border border-black/10 px-2.5 py-1.5 text-[12.5px]" />
            </label>
          )}
          {aplicaComp === false && (
            <p className="mt-2 rounded-lg bg-nube/60 px-2.5 py-1.5 text-[11.5px] font-semibold text-tinta">
              Compensación: NO APLICA — $0
            </p>
          )}
        </div>

        {/* 3. Motivo */}
        <label className="mb-4 block">
          <span className="text-[12.5px] font-semibold text-tinta">3. Motivo del cierre</span>
          <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={3}
            placeholder="Ej.: Convenio penal cumplido en 8 abonos. Último pago 29-ago-2026."
            className="mt-1 w-full rounded-lg border border-black/10 px-2.5 py-1.5 text-[12.5px]" />
        </label>

        <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
          <p className="text-[11.5px] text-amber-900">
            <strong>Esto no se puede deshacer.</strong> El asunto sale del calendario y del cálculo de pagos,
            y queda bloqueado: nadie podrá editar el capital ni los abonos, ni siquiera tú.
          </p>
        </div>

        {err && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700">{err}</p>}

        <div className="flex gap-2">
          <button onClick={() => onCerrar(false)} disabled={guardando}
            className="flex-1 rounded-lg bg-nube px-3 py-2 text-[12.5px] font-semibold text-tinta disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={terminar} disabled={guardando || aplicaComp === null}
            className="flex-1 rounded-lg bg-tinta px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-black disabled:opacity-50">
            {guardando ? "Cerrando…" : "🔒 Dar por terminado"}
          </button>
        </div>
      </div>
    </div>
  );
}
