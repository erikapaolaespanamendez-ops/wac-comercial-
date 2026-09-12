import { useEffect, useMemo, useState } from "react";
import { fetchResumenDevoluciones, fetchTodosAbonos, type ResumenDevolucion } from "../../data/convenioDevolucion";
import { fetchClientes, type Cliente } from "../../data/clientes";
import { fetchCierresDevolucion, type CierreCaso } from "../../data/cierreCaso";

const money = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n || 0);

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function Card({ icono, etiqueta, valor, sub, color, compacto }: { icono: string; etiqueta: string; valor: string | number; sub?: string; color?: string; compacto?: boolean }) {
  if (compacto) {
    return (
      <div className="rounded-xl border border-black/5 bg-white p-2.5 shadow-sm">
        <div className="flex items-center gap-1">
          <span className="text-xs">{icono}</span>
          <span className="text-[9.5px] font-medium uppercase tracking-wide text-humo leading-tight">{etiqueta}</span>
        </div>
        <div className="mt-0.5 font-display text-base font-extrabold leading-tight sm:text-lg" style={{ color: color || "#1A2233" }}>{valor}</div>
        {sub && <div className="text-[9.5px] text-humo leading-tight">{sub}</div>}
      </div>
    );
  }
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

export default function KpisDevoluciones() {
  const [resumen, setResumen] = useState<ResumenDevolucion[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cierres, setCierres] = useState<CierreCaso[]>([]);
  const [abonos, setAbonos] = useState<{ clienteId: string; fecha: string; monto: number }[]>([]);
  const [anioFiltro, setAnioFiltro] = useState<number | "todos">("todos");
  const [mesFiltro, setMesFiltro] = useState<number | "todos">("todos");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    Promise.all([fetchResumenDevoluciones(), fetchClientes(), fetchCierresDevolucion(), fetchTodosAbonos()])
      .then(([r, c, ci, ab]) => { setResumen(r); setClientes(c); setCierres(ci); setAbonos(ab); })
      .catch(() => setError(true))
      .finally(() => setCargando(false));
  }, []);

  const nombrePorId = useMemo(() => {
    const m = new Map<string, { nombre: string; sucursal: string; folio: string }>();
    for (const c of clientes) m.set(String(c.id), { nombre: c.nombre, sucursal: c.sucursal, folio: c.folio });
    return m;
  }, [clientes]);

  // IDs de clientes vivos (no eliminados): para que la papelera no cuente en KPIs.
  const idsVivos = useMemo(() => new Set(clientes.filter((c) => !c.eliminado).map((c) => String(c.id))), [clientes]);
  // IDs de clientes ya terminados (caso cerrado): ya NO cuentan en "por devolver".
  const idsTerminados = useMemo(() => new Set(clientes.filter((c) => c.terminado).map((c) => String(c.id))), [clientes]);
  const resumenVivo = useMemo(() => resumen.filter((r) => idsVivos.has(String(r.clienteId)) && !idsTerminados.has(String(r.clienteId))), [resumen, idsVivos, idsTerminados]);
  const cierresVivos = useMemo(() => cierres.filter((c) => idsVivos.has(String(c.cliente_id))), [cierres, idsVivos]);

  const d = useMemo(() => {
    const total = resumenVivo.length;
    const concretadas = resumenVivo.filter((r) => r.concretada).length;
    const faltantes = total - concretadas;
    const comprometido = resumenVivo.reduce((s, r) => s + r.montoTotal, 0);
    const devuelto = resumenVivo.reduce((s, r) => s + r.abonado, 0);
    const porDevolver = resumenVivo.reduce((s, r) => s + r.saldo, 0);
    const pctConcretadas = total ? Math.round((concretadas / total) * 100) : 0;
    const pctDinero = comprometido ? Math.round((devuelto / comprometido) * 100) : 0;

    // Pendientes: con saldo, ordenadas por saldo mayor primero.
    const pendientes = resumenVivo.filter((r) => !r.concretada && r.saldo > 0)
      .sort((a, b) => b.saldo - a.saldo);
    return { total, concretadas, faltantes, comprometido, devuelto, porDevolver, pctConcretadas, pctDinero, pendientes };
  }, [resumenVivo]);

  // Casos cerrados como DEVOLUCIÓN (lo que se marca al terminar un caso).
  const cd = useMemo(() => {
    const casos = cierresVivos.length;
    const totalDevuelto = cierresVivos.reduce((s, c) => s + (Number(c.total) || 0), 0);
    const conComp = cierresVivos.filter((c) => c.con_compensacion === true).length;
    const sinComp = casos - conComp;
    return { casos, totalDevuelto, conComp, sinComp };
  }, [cierresVivos]);

  // Reflejo por CÓDIGO de cliente (monto = pagos del cliente).
  // Posibles devoluciones = R1, RV, R2C (negativos, no pasaron a Fase B).
  // Devoluciones RDC = tienen solicitud/abono. R2 y R3 son positivos: no suman.
  const pc = useMemo(() => {
    const sn = (s: string) => Number(String(s ?? "").replace(/[^0-9.]/g, "")) || 0;
    const pagos = (c: typeof clientes[number]) =>
      sn(c.montoApartado) + sn(c.valorFirma) + sn(c.pagoCesion) + sn(c.pagoEscritura) + sn(c.pagoGestoria) + sn(c.otrosPagos);
    const vivos = clientes.filter((c) => !c.eliminado && !c.terminado);
    const posiblesList = vivos.filter((c) => c.codigo === "R1" || c.codigo === "R1V" || c.codigo === "R2C");
    const rdcList = vivos.filter((c) => c.codigo === "RDC");
    return {
      posibles: posiblesList.length,
      posiblesMonto: posiblesList.reduce((s, c) => s + pagos(c), 0),
      rdc: rdcList.length,
      rdcMonto: rdcList.reduce((s, c) => s + pagos(c), 0),
    };
  }, [clientes]);

  // Devuelto por periodo (año / mes): suma de abonos + casos cerrados por devolución en ese rango.
  const per = useMemo(() => {
    const enPeriodo = (iso: string | null | undefined) => {
      if (!iso) return false;
      const d = new Date(iso);
      if (isNaN(d.getTime())) return false;
      if (anioFiltro !== "todos" && d.getFullYear() !== anioFiltro) return false;
      if (mesFiltro !== "todos" && d.getMonth() + 1 !== mesFiltro) return false;
      return true;
    };
    const abVivos = abonos.filter((a) => idsVivos.has(String(a.clienteId)));
    const aniosSet = new Set<number>();
    for (const a of abVivos) { const y = new Date(a.fecha).getFullYear(); if (!isNaN(y)) aniosSet.add(y); }
    for (const c of cierresVivos) { const y = c.created_at ? new Date(c.created_at).getFullYear() : NaN; if (!isNaN(y)) aniosSet.add(y); }
    const anios = [...aniosSet].sort((a, b) => b - a);
    const abonosPeriodo = abVivos.filter((a) => enPeriodo(a.fecha));
    const cierresPeriodo = cierresVivos.filter((c) => enPeriodo(c.created_at));
    const devuelto = abonosPeriodo.reduce((s, a) => s + a.monto, 0) + cierresPeriodo.reduce((s, c) => s + (Number(c.total) || 0), 0);
    return { anios, devuelto, nAbonos: abonosPeriodo.length, nCierres: cierresPeriodo.length };
  }, [abonos, cierresVivos, idsVivos, anioFiltro, mesFiltro]);

  if (cargando)
    return <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-16 text-center text-humo">Cargando devoluciones…</div>;
  if (error)
    return <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-16 text-center text-amber-800">No se pudo cargar la información.</div>;
  if (d.total === 0 && cd.casos === 0 && pc.posibles === 0 && pc.rdc === 0)
    return (
      <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-16 text-center text-humo">
        Todavía no hay devoluciones registradas.<br />
        <span className="text-xs">Cuando se carguen convenios/abonos o se cierren casos como devolución, aquí aparecerá el avance.</span>
      </div>
    );

  return (
    <div className="space-y-4">
      {/* Devuelto por periodo (año / mes) */}
      <div className="rounded-2xl border border-black/5 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display text-xs font-bold uppercase tracking-wider text-teal-dark">Devuelto por periodo</p>
            <p className="mt-0.5 font-display text-2xl font-extrabold text-teal">{money(per.devuelto)}</p>
            <p className="text-[11px] text-humo">
              {anioFiltro === "todos" && mesFiltro === "todos" ? "Todo el histórico" : `${mesFiltro === "todos" ? "" : MESES[mesFiltro - 1] + " "}${anioFiltro === "todos" ? "(todos los años)" : anioFiltro}`}
              {" · "}{per.nAbonos} abonos{per.nCierres ? ` + ${per.nCierres} casos cerrados` : ""}
            </p>
          </div>
          <div className="flex items-end gap-2">
            <label className="flex flex-col text-[10px] font-semibold uppercase tracking-wide text-humo">Año
              <select value={anioFiltro} onChange={(e) => setAnioFiltro(e.target.value === "todos" ? "todos" : Number(e.target.value))}
                className="mt-0.5 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm font-medium text-tinta outline-none focus:border-teal">
                <option value="todos">Todos</option>
                {per.anios.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            <label className="flex flex-col text-[10px] font-semibold uppercase tracking-wide text-humo">Mes
              <select value={mesFiltro} onChange={(e) => setMesFiltro(e.target.value === "todos" ? "todos" : Number(e.target.value))}
                className="mt-0.5 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm font-medium text-tinta outline-none focus:border-teal">
                <option value="todos">Todos</option>
                {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </label>
            {(anioFiltro !== "todos" || mesFiltro !== "todos") && (
              <button onClick={() => { setAnioFiltro("todos"); setMesFiltro("todos"); }}
                className="rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs font-semibold text-humo hover:bg-nube">✕</button>
            )}
          </div>
        </div>
      </div>

      {/* Reflejo por código: posibles devoluciones (negativos) y RDC */}
      {(pc.posibles > 0 || pc.rdc > 0) && (
        <div>
          <p className="mb-1.5 font-display text-xs font-bold uppercase tracking-wider text-rose-700">Negativos por cambiar (por código)</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Card compacto icono="⚠️" etiqueta="Posibles devoluciones" valor={money(pc.posiblesMonto)} sub={`${pc.posibles} clientes · R1·RV·R2C`} color="#E11D48" />
            <Card compacto icono="💰" etiqueta="Devoluciones RDC (total)" valor={money(d.devuelto + cd.totalDevuelto)} sub={`${pc.rdc} clientes · devuelto + casos cerrados`} color="#1E50A0" />
          </div>
          <p className="mt-1 text-[10.5px] text-humo">Al pasar un cliente a <b>R3</b> (cambio) sale de aquí automáticamente. R2 y R3 son positivos: no suman.</p>
        </div>
      )}

      {d.total > 0 && (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Card compacto icono="📄" etiqueta="Convenios" valor={d.total} color="#1E50A0" />
        <Card compacto icono="✅" etiqueta="Concretadas" valor={d.concretadas} sub={`${d.pctConcretadas}% del total`} color="#16A34A" />
        <Card compacto icono="⏳" etiqueta="Faltantes" valor={d.faltantes} sub={`${100 - d.pctConcretadas}% en proceso`} color="#C9A227" />
        <Card compacto icono="🤝" etiqueta="Comprometido" valor={money(d.comprometido)} color="#1A2233" />
        <Card compacto icono="💵" etiqueta="Devuelto" valor={money(d.devuelto)} sub={`${d.pctDinero}% del monto`} color="#009B94" />
        <Card compacto icono="📌" etiqueta="Por devolver" valor={money(d.porDevolver)} color="#E11D48" />
      </div>
      )}

      {/* Casos cerrados como devolución — compactos, aquí arriba con los demás */}
      {cd.casos > 0 && (
        <div>
          <p className="mb-1.5 font-display text-xs font-bold uppercase tracking-wider text-teal-dark">Casos cerrados como devolución ({cd.casos})</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Card compacto icono="✅" etiqueta="Casos cerrados" valor={cd.casos} color="#0F6E56" />
            <Card compacto icono="💰" etiqueta="Total devuelto" valor={money(cd.totalDevuelto)} color="#1A2233" />
            <Card compacto icono="⏳" etiqueta="Con compensación" valor={cd.conComp} color="#009B94" />
            <Card compacto icono="•" etiqueta="Sin compensación" valor={cd.sinComp} color="#64748B" />
          </div>
        </div>
      )}

      {d.total > 0 && (<>

      {/* Barra concretadas vs faltantes */}
      <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-teal-dark">Devoluciones concretadas vs faltantes</h2>
        <div className="flex h-4 w-full overflow-hidden rounded-full bg-nube">
          <div className="h-4 bg-emerald-500" style={{ width: `${d.pctConcretadas}%` }} />
          <div className="h-4 bg-amber-400" style={{ width: `${100 - d.pctConcretadas}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-xs">
          <span className="text-emerald-700">● Concretadas: <b>{d.concretadas}</b> ({d.pctConcretadas}%)</span>
          <span className="text-amber-700">● Faltantes: <b>{d.faltantes}</b> ({100 - d.pctConcretadas}%)</span>
          <span className="text-humo">Total convenios: <b>{d.total}</b></span>
        </div>

        {/* Avance del dinero */}
        <h2 className="mb-2 mt-5 font-display text-sm font-bold uppercase tracking-wider text-teal-dark">Avance del dinero devuelto</h2>
        <div className="flex h-4 w-full overflow-hidden rounded-full bg-nube">
          <div className="h-4 bg-teal" style={{ width: `${d.pctDinero}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-xs">
          <span className="text-teal-dark">● Devuelto: <b>{money(d.devuelto)}</b> ({d.pctDinero}%)</span>
          <span className="text-rose-600">● Por devolver: <b>{money(d.porDevolver)}</b></span>
          <span className="text-humo">Comprometido: <b>{money(d.comprometido)}</b></span>
        </div>
      </div>

      {/* Lista de pendientes */}
      <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-teal-dark">
          Devoluciones en proceso ({d.pendientes.length})
        </h2>
        {d.pendientes.length === 0 ? (
          <p className="text-sm text-humo">Todas las devoluciones están concretadas. 🎉</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-humo">
                  <th className="py-1.5 pr-3 font-semibold">Cliente</th>
                  <th className="py-1.5 pr-3 font-semibold">Sucursal</th>
                  <th className="py-1.5 pr-3 text-right font-semibold">Comprometido</th>
                  <th className="py-1.5 pr-3 text-right font-semibold">Devuelto</th>
                  <th className="py-1.5 pr-3 text-right font-semibold">Saldo</th>
                  <th className="py-1.5 pr-3 font-semibold">Avance</th>
                  <th className="py-1.5 font-semibold">Último abono</th>
                </tr>
              </thead>
              <tbody>
                {d.pendientes.map((r) => {
                  const info = nombrePorId.get(r.clienteId);
                  const pct = r.montoTotal ? Math.round((r.abonado / r.montoTotal) * 100) : 0;
                  return (
                    <tr key={r.clienteId} className="border-t border-black/5">
                      <td className="py-1.5 pr-3 font-medium text-tinta">{info?.nombre || "—"}</td>
                      <td className="py-1.5 pr-3 text-humo">{info?.sucursal || "—"}</td>
                      <td className="py-1.5 pr-3 text-right text-tinta">{money(r.montoTotal)}</td>
                      <td className="py-1.5 pr-3 text-right text-emerald-700">{money(r.abonado)}</td>
                      <td className="py-1.5 pr-3 text-right font-semibold text-rose-600">{money(r.saldo)}</td>
                      <td className="py-1.5 pr-3">
                        <div className="flex items-center gap-1.5">
                          <div className="h-2 w-16 rounded-full bg-nube">
                            <div className="h-2 rounded-full bg-teal" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[10px] text-humo">{pct}%</span>
                        </div>
                      </td>
                      <td className="py-1.5 text-humo">{r.ultimaFecha || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>)}
    </div>
  );
}
