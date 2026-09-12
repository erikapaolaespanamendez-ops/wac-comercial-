import { useEffect, useMemo, useState } from "react";
import { fetchLlamadas, AREAS, type Llamada } from "../../data/llamadas";
import KpisAtencion from "./KpisAtencion";
import KpisDevoluciones from "./KpisDevoluciones";
import KpisProspectos from "./KpisProspectos";

const AREA_EMOJI: Record<string, string> = {
  juridico: "⚖️", comercial: "💼", contabilidad: "💰", administracion: "💰",
  atencion: "🎧", tecnologia: "💻", direccion: "⭐",
};

type Periodo = "hoy" | "7" | "30" | "todo";
const PERIODOS: { clave: Periodo; nombre: string }[] = [
  { clave: "hoy", nombre: "Hoy" },
  { clave: "7", nombre: "7 días" },
  { clave: "30", nombre: "30 días" },
  { clave: "todo", nombre: "Todo" },
];

function dentroDe(fechaIso: string, periodo: Periodo): boolean {
  if (periodo === "todo") return true;
  const f = new Date(fechaIso);
  const ahora = new Date();
  if (periodo === "hoy") return f.toDateString() === ahora.toDateString();
  const dias = periodo === "7" ? 7 : 30;
  const limite = new Date(ahora.getTime() - dias * 24 * 60 * 60 * 1000);
  return f >= limite;
}
function nombreArea(clave: string): string {
  return AREAS.find((a) => a.clave === clave)?.nombre || clave;
}

function Card({ icono, etiqueta, valor, sub, color }: { icono: string; etiqueta: string; valor: string | number; sub?: string; color?: string }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-1.5">
        <span className="text-base">{icono}</span>
        <span className="text-[11px] font-medium uppercase tracking-wide text-humo">{etiqueta}</span>
      </div>
      <div className="mt-1 font-display text-2xl font-extrabold" style={{ color: color || "#1A2233" }}>{valor}</div>
      {sub && <div className="text-[11px] text-humo">{sub}</div>}
    </div>
  );
}

export default function Kpis() {
  const [llamadas, setLlamadas] = useState<Llamada[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [periodo, setPeriodo] = useState<Periodo>("30");
  const [tab, setTab] = useState<"llamadas" | "atencion" | "devoluciones" | "comercial">("llamadas");

  useEffect(() => {
    fetchLlamadas().then(setLlamadas).catch(() => setError(true)).finally(() => setCargando(false));
  }, []);

  const d = useMemo(() => {
    const ls = llamadas.filter((l) => dentroDe(l.fecha, periodo));
    const total = ls.length;
    const entrantes = ls.filter((l) => l.tipo === "entrante").length;
    const salientes = ls.filter((l) => l.tipo === "saliente").length;
    const perdidas = ls.filter((l) => l.resultado === "No contestó").length;
    const resueltas = ls.filter((l) => l.resultado === "Resuelta al 1er contacto").length;
    const urgentes = ls.filter((l) => l.urgente).length;
    const pendientes = ls.filter((l) => l.devolver).length;
    const hoy0 = new Date(); hoy0.setHours(0, 0, 0, 0);
    const vencidas = ls.filter((l) => l.devolver && l.fechaCompromiso && new Date(l.fechaCompromiso) < hoy0).length;
    const enTiempo = Math.max(0, pendientes - vencidas);
    const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

    const porArea = AREAS.map((a) => ({ clave: a.clave, nombre: a.nombre, n: ls.filter((l) => l.area === a.clave).length }))
      .filter((a) => a.n > 0).sort((x, y) => y.n - x.n);
    const maxArea = Math.max(1, ...porArea.map((a) => a.n));

    const dias: { etiqueta: string; n: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const dd = new Date(); dd.setHours(0, 0, 0, 0); dd.setDate(dd.getDate() - i);
      const sig = new Date(dd.getTime() + 24 * 60 * 60 * 1000);
      const n = llamadas.filter((l) => { const f = new Date(l.fecha); return f >= dd && f < sig; }).length;
      dias.push({ etiqueta: dd.toLocaleDateString("es-MX", { weekday: "short" }), n });
    }
    const maxDia = Math.max(1, ...dias.map((x) => x.n));

    return { total, entrantes, salientes, perdidas, resueltas, urgentes, pendientes, vencidas, enTiempo, pct, porArea, maxArea, dias, maxDia };
  }, [llamadas, periodo]);

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-3 flex flex-wrap gap-1.5">
        <button onClick={() => setTab("llamadas")} className={tab === "llamadas" ? "rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white" : "rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-humo hover:bg-teal-soft"}>📞 Llamadas</button>
        <button onClick={() => setTab("atencion")} className={tab === "atencion" ? "rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white" : "rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-humo hover:bg-teal-soft"}>📊 Atención</button>
        <button onClick={() => setTab("devoluciones")} className={tab === "devoluciones" ? "rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white" : "rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-humo hover:bg-teal-soft"}>💰 Devoluciones</button>
        <button onClick={() => setTab("comercial")} className={tab === "comercial" ? "rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white" : "rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-humo hover:bg-teal-soft"}>📣 Comercial</button>
      </div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-xl font-extrabold text-tinta">{tab === "llamadas" ? "Indicadores de Llamadas" : tab === "atencion" ? "KPIs de Atención" : tab === "devoluciones" ? "Devoluciones" : "Comercial · Prospectos"}</h1>
        {tab === "llamadas" && (
          <div className="flex flex-wrap gap-1.5">
            {PERIODOS.map((p) => (
              <button
                key={p.clave}
                onClick={() => setPeriodo(p.clave)}
                className={periodo === p.clave
                  ? "rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white"
                  : "rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-humo hover:bg-teal-soft"}
              >
                {p.nombre}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === "atencion" && <KpisAtencion />}

      {tab === "devoluciones" && <KpisDevoluciones />}

      {tab === "comercial" && <KpisProspectos />}

      {tab === "llamadas" && (cargando ? (
        <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-16 text-center text-humo">Cargando indicadores…</div>
      ) : error ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-16 text-center text-amber-800">No se pudo cargar la información.</div>
      ) : (
        <div className="space-y-6">
          {/* Tarjetas */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Card icono="📞" etiqueta="Total" valor={d.total} color="#1E50A0" />
            <Card icono="↙" etiqueta="Entrantes" valor={d.entrantes} sub={`↗ ${d.salientes} salientes`} color="#009B94" />
            <Card icono="📵" etiqueta="Perdidas" valor={d.perdidas} sub={`${d.pct(d.perdidas)}% del total`} color="#E11D48" />
            <Card icono="✅" etiqueta="1er contacto" valor={d.resueltas} sub={`${d.pct(d.resueltas)}% resueltas`} color="#16A34A" />
            <Card icono="⏰" etiqueta="Pendientes" valor={d.pendientes} sub={d.vencidas ? `🔴 ${d.vencidas} vencidas` : "0 vencidas"} color="#C9A227" />
            <Card icono="⭐" etiqueta="Urgentes" valor={d.urgentes} color="#E11D48" />
          </div>

          {/* Cumplimiento de devoluciones */}
          <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
            <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-teal-dark">Cumplimiento de devoluciones</h2>
            {d.pendientes === 0 ? (
              <p className="text-sm text-humo">No hay llamadas pendientes de devolver en este periodo. ✅</p>
            ) : (
              <>
                <div className="flex h-4 w-full overflow-hidden rounded-full bg-nube">
                  <div className="h-4 bg-emerald-500" style={{ width: `${Math.round((d.enTiempo / d.pendientes) * 100)}%` }} />
                  <div className="h-4 bg-rose-500" style={{ width: `${Math.round((d.vencidas / d.pendientes) * 100)}%` }} />
                </div>
                <div className="mt-2 flex flex-wrap gap-4 text-xs">
                  <span className="text-emerald-700">● En tiempo: <b>{d.enTiempo}</b></span>
                  <span className="text-rose-600">● Vencidas: <b>{d.vencidas}</b></span>
                  <span className="text-humo">Total pendientes: <b>{d.pendientes}</b></span>
                </div>
              </>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Por área */}
            <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
              <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-teal-dark">Llamadas por área</h2>
              {d.porArea.length === 0 ? (
                <p className="text-sm text-humo">Sin datos en este periodo.</p>
              ) : (
                <div className="space-y-2.5">
                  {d.porArea.map((a) => (
                    <div key={a.clave} className="flex items-center gap-2">
                      <span className="w-28 shrink-0 truncate text-xs text-tinta">{(AREA_EMOJI[a.clave] || "📞")} {nombreArea(a.clave)}</span>
                      <div className="h-3 flex-1 rounded-full bg-nube">
                        <div className="h-3 rounded-full bg-teal" style={{ width: `${Math.round((a.n / d.maxArea) * 100)}%` }} />
                      </div>
                      <span className="w-7 text-right text-xs font-semibold text-tinta">{a.n}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Últimos 7 días */}
            <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
              <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-teal-dark">Últimos 7 días</h2>
              <div className="flex items-end gap-2" style={{ height: 120 }}>
                {d.dias.map((x, i) => (
                  <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                    <span className="text-[10px] font-semibold text-tinta">{x.n}</span>
                    <div className="w-full rounded-t bg-aqua" style={{ height: `${Math.round((x.n / d.maxDia) * 100)}%`, minHeight: 3 }} />
                  </div>
                ))}
              </div>
              <div className="mt-1 flex gap-2">
                {d.dias.map((x, i) => (
                  <div key={i} className="flex-1 text-center text-[10px] capitalize text-humo">{x.etiqueta}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
