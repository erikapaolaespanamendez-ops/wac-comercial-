// ===================================================================
// Mejora C — "Mi lista del día"
// Cada quien ve solo los clientes que le tocan HOY (según su rol y el
// plazo de cada código). Ordenado por prioridad. Los R3 ya terminados
// no aparecen. Cada renglón abre la ficha completa del cliente.
// ===================================================================
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { fetchPerfil } from "../../data/usuarios";
import { fetchSeguimiento, miLista, type ClienteSeguimiento } from "../../data/seguimiento";
import { CODIGO, type Cliente } from "../../data/clientes";
import CrmCliente from "../CrmCliente/CrmCliente";

const COLOR_CODIGO: Record<string, string> = {
  R2: "#A32D2D", R2C: "#A32D2D", RDC: "#BA7517", RD: "#BA7517", R1: "#A32D2D", R1V: "#BA7517", RV: "#1D9E75", R3: "#1D9E75", SVT: "#6B7280",
};

function useMiRol(): string | null {
  const [rol, setRol] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const email = data.session?.user?.email;
      if (email) fetchPerfil(email).then((pf) => setRol(pf?.rol ?? null)).catch(() => {});
    });
  }, []);
  return rol;
}

function etiquetaEstado(it: ClienteSeguimiento): string {
  if (it.falta === "ambos") return "falta llamada y correo";
  if (it.falta === "llamada") return "falta llamada";
  if (it.falta === "correo") return "falta correo";
  if (it.estado === "vencido") {
    const exceso = (it.diasDesdeCiclo ?? 0) - (it.diasLimite ?? 0);
    return exceso > 0 ? `vencido ${exceso} día${exceso === 1 ? "" : "s"}` : "vencido";
  }
  if (it.estado === "porvencer") return "por vencer";
  return "";
}

export default function MiListaDelDia({ compacto = false, onIrModulo }: { compacto?: boolean; onIrModulo?: (cliente?: Cliente) => void }) {
  const miRol = useMiRol();
  const [items, setItems] = useState<ClienteSeguimiento[] | null>(null);
  const [verTodos, setVerTodos] = useState(false);
  const [abierta, setAbierta] = useState<Cliente | null>(null);
  const [resumen, setResumen] = useState<ClienteSeguimiento | null>(null); // mini-banner del inicio
  const [cargando, setCargando] = useState(true);

  async function cargar() {
    setCargando(true);
    try {
      const todo = await fetchSeguimiento();
      setItems(miLista(todo, miRol));
    } catch {
      setItems([]);
    }
    setCargando(false);
  }
  useEffect(() => {
    if (miRol !== null) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [miRol]);

  const tope = compacto ? 5 : 8;
  const lista = items ?? [];
  const visibles = verTodos ? lista : lista.slice(0, tope);

  if (abierta) {
    return <CrmCliente cliente={abierta} onCerrar={() => { setAbierta(null); cargar(); }} />;
  }

  return (
    <div className={compacto ? "" : "mx-auto max-w-3xl px-3 py-4"}>
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-bold text-tinta">📋 Mi lista del día</h2>
        <span className="text-[12px] text-humo">{cargando ? "Cargando…" : `${lista.length} por atender`}</span>
      </div>

      {!cargando && lista.length === 0 && (
        <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-6 text-center text-[14px] text-emerald-800">
          🎉 ¡Vas al día! No tienes clientes pendientes hoy.
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2">
        {visibles.map((it) => {
          const col = COLOR_CODIGO[it.cliente.codigo] ?? "#6B7280";
          return (
            <button
              key={String(it.cliente.id)}
              onClick={() => (compacto ? setResumen(it) : setAbierta(it.cliente))}
              className="rounded-r-xl border border-black/10 bg-white px-3 py-2.5 text-left hover:bg-nube"
              style={{ borderLeft: `3px solid ${col}` }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[14px] font-semibold text-tinta">{it.cliente.nombre}</span>
                  <span className="ml-2 inline-block rounded-full px-2 py-0.5 text-[11px]" style={{ background: col + "22", color: col }}>
                    {it.cliente.codigo} · {CODIGO[it.cliente.codigo]}
                  </span>
                  {it.contingencia && <span className="ml-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">riesgo legal</span>}
                </div>
                <span className={"shrink-0 text-[11.5px] " + (it.estado === "vencido" ? "text-red-600" : "text-amber-600")}>{etiquetaEstado(it)}</span>
              </div>
              <p className="mt-1 text-[12px] font-semibold text-teal">{compacto ? "Ver resumen →" : "Abrir ficha →"}</p>
            </button>
          );
        })}
      </div>

      {!compacto && lista.length > tope && !verTodos && (
        <button onClick={() => setVerTodos(true)} className="mt-3 w-full rounded-xl border border-black/10 py-2 text-[13px] font-semibold text-teal hover:bg-nube">
          Ver más ({lista.length - tope} más)
        </button>
      )}
      {compacto && lista.length > tope && onIrModulo && (
        <button onClick={() => onIrModulo?.()} className="mt-3 w-full rounded-xl border border-black/10 py-2 text-[13px] font-semibold text-teal hover:bg-nube">
          Ver mi lista completa →
        </button>
      )}

      {/* Mini-banner flotante: resumen del cliente + ir al módulo (sin abrir toda la ficha aquí). */}
      {resumen && (() => {
        const col = COLOR_CODIGO[resumen.cliente.codigo] ?? "#6B7280";
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center" onClick={() => setResumen(null)}>
            <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()} style={{ borderTop: `4px solid ${col}` }}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-[16px] font-bold text-tinta">{resumen.cliente.nombre}</h3>
                <button onClick={() => setResumen(null)} className="shrink-0 rounded-md px-1.5 text-humo hover:bg-nube" aria-label="Cerrar">✕</button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="rounded-full px-2 py-0.5 text-[11px]" style={{ background: col + "22", color: col }}>{resumen.cliente.codigo} · {CODIGO[resumen.cliente.codigo]}</span>
                {resumen.contingencia && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">riesgo legal</span>}
                {etiquetaEstado(resumen) && <span className={"rounded-full px-2 py-0.5 text-[11px] " + (resumen.estado === "vencido" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700")}>{etiquetaEstado(resumen)}</span>}
              </div>
              {resumen.cliente.asesorAsignado && <p className="mt-2 text-[12px] text-humo">Asesor: <span className="font-semibold text-tinta">{resumen.cliente.asesorAsignado}</span></p>}
              <div className="mt-4 flex gap-2">
                <button onClick={() => { const c = resumen.cliente; setResumen(null); onIrModulo?.(c); }} className="flex-1 rounded-xl bg-teal py-2 text-[13px] font-semibold text-white hover:bg-teal-dark">Ir al módulo →</button>
                <button onClick={() => setResumen(null)} className="rounded-xl border border-black/10 px-4 py-2 text-[13px] font-semibold text-tinta hover:bg-nube">Cerrar</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
