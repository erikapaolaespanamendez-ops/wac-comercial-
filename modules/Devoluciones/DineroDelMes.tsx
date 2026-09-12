// Dinero del mes — la pantalla donde la DGE registra cuánto hay para
// devoluciones, ve el reparto propuesto, marca prioridades y congela la cola.
//
// Lo importante de esta pantalla no es repartir: es AVISAR ANTES DE INCUMPLIR.
// El recuadro rojo compara el dinero registrado contra las fechas máximas ya
// firmadas y dice cuántos convenios se pasan este mes. Por eso va arriba,
// pegado al monto: es cuando todavía se puede hacer algo.
import { useEffect, useState } from "react";
import {
  mesActual, estimadoPorVentas, obtenerBolsaMes, guardarBolsaMes,
  calcularRepartoMes, confirmarColaMes, reabrirColaMes,
  type BolsaMes, type RepartoMes, type RenglonCola,
} from "../../data/dineroDelMes";
import { P } from "../../data/parametrosDevolucion";

function money(n: number): string {
  return "$" + Math.round(n || 0).toLocaleString("es-MX");
}

function nombreMes(anioMes: string): string {
  const [a, m] = anioMes.split("-").map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString("es-MX", { month: "long", year: "numeric" });
}

export default function DineroDelMes({ miRol }: { miRol: string | null }) {
  const anioMes = mesActual();
  const puedeReabrir = miRol === "DGE" || miRol === "RAC" || miRol === "Super_Admin";

  const [bolsa, setBolsa] = useState<BolsaMes | null>(null);
  const [estimado, setEstimado] = useState(0);
  const [monto, setMonto] = useState("");
  const [origen, setOrigen] = useState("ventas");
  const [nota, setNota] = useState("");
  const [reparto, setReparto] = useState<RepartoMes | null>(null);
  const [prioridades, setPrioridades] = useState<Map<string, string>>(new Map());
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    const [b, est] = await Promise.all([obtenerBolsaMes(anioMes), estimadoPorVentas(anioMes)]);
    setBolsa(b);
    setEstimado(est);
    if (b) {
      setMonto(String(b.montoRegistrado));
      setOrigen(b.origen);
      setNota(b.nota || "");
      setReparto(await calcularRepartoMes(anioMes, b.montoRegistrado));
    }
    setCargando(false);
  }
  useEffect(() => { cargar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const montoNum = Number(String(monto).replace(/[^0-9.]/g, "")) || 0;

  async function registrar() {
    if (montoNum <= 0) { alert("Captura el monto disponible del mes."); return; }
    setGuardando(true);
    try {
      const ok = await guardarBolsaMes(anioMes, montoNum, origen, nota, miRol || "DGE");
      if (!ok) { alert("No se pudo guardar el monto."); return; }
      await cargar();
    } finally { setGuardando(false); }
  }

  function alternarPrioridad(r: RenglonCola) {
    const nuevo = new Map(prioridades);
    if (nuevo.has(r.clienteId)) { nuevo.delete(r.clienteId); setPrioridades(nuevo); return; }
    const usado = [...nuevo.keys()].reduce((s, id) => {
      const f = reparto?.fuera.find((x) => x.clienteId === id);
      return s + (f?.montoAsignado || 0);
    }, 0);
    if (reparto && usado + r.montoAsignado > reparto.topePrioridad) {
      alert(
        `No cabe en el tope de prioridad.\n\nTope del mes: ${money(reparto.topePrioridad)}\n` +
        `Ya comprometido: ${money(usado)}\nEste cliente pide: ${money(r.montoAsignado)}`
      );
      return;
    }
    const motivo = window.prompt("¿Por qué se adelanta a este cliente?\n\nQueda registrado con tu nombre.");
    if (!motivo || !motivo.trim()) return;
    nuevo.set(r.clienteId, motivo.trim());
    setPrioridades(nuevo);
  }

  async function confirmar() {
    if (!reparto) return;
    const renglones: RenglonCola[] = [
      ...reparto.asignadosM1, ...reparto.asignadosM2,
      ...reparto.fuera.filter((r) => prioridades.has(r.clienteId))
        .map((r) => ({ ...r, porPrioridad: true, motivoPrioridad: prioridades.get(r.clienteId) })),
    ];
    if (!confirm(`Se va a congelar la cola de ${nombreMes(anioMes)} con ${renglones.length} clientes.\n\nDespués solo RAC y DGE pueden reabrirla. ¿Continuamos?`)) return;
    setGuardando(true);
    try {
      const ok = await confirmarColaMes(anioMes, renglones, miRol || "DGE");
      if (!ok) { alert("No se pudo confirmar la cola."); return; }
      await cargar();
    } finally { setGuardando(false); }
  }

  if (cargando) return <p className="p-4 text-[13px] text-humo">Cargando…</p>;

  const p = P();
  const usadoPrioridad = [...prioridades.keys()].reduce((s, id) => {
    const f = reparto?.fuera.find((x) => x.clienteId === id);
    return s + (f?.montoAsignado || 0);
  }, 0);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-black/10 bg-white p-4">
        <p className="text-[15px] font-semibold text-tinta">Registrar dinero para devoluciones</p>
        <p className="mb-3 text-[12.5px] text-humo">
          {nombreMes(anioMes)} · el rango normal es de {money(p.montoMinMes)} a {money(p.montoMaxMes)} al mes
          {estimado > 0 && <> · por ventas serían {money(estimado)}</>}
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-humo">Monto</label>
            <input value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="240000"
              disabled={bolsa?.cerrado}
              className="w-full rounded-lg border border-black/10 px-2 py-1.5 text-[13px] disabled:bg-nube" />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-humo">Origen</label>
            <select value={origen} onChange={(e) => setOrigen(e.target.value)} disabled={bolsa?.cerrado}
              className="w-full rounded-lg border border-black/10 px-2 py-1.5 text-[13px] disabled:bg-nube">
              <option value="ventas">Ventas del mes</option>
              <option value="cobranza">Cobranza</option>
              <option value="aportacion">Aportación</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-humo">Nota</label>
            <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Opcional"
              disabled={bolsa?.cerrado}
              className="w-full rounded-lg border border-black/10 px-2 py-1.5 text-[13px] disabled:bg-nube" />
          </div>
        </div>
        {!bolsa?.cerrado && (
          <button onClick={registrar} disabled={guardando}
            className="mt-3 rounded-lg bg-teal px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-teal-dark disabled:opacity-50">
            {guardando ? "Guardando…" : bolsa ? "Actualizar monto" : "Registrar"}
          </button>
        )}
      </div>

      {reparto && reparto.enRiesgo.length > 0 && (
        <div className="rounded-xl bg-rose-50 p-4">
          <p className="text-[14px] font-semibold text-rose-800">
            Con {money(montoNum)} este mes, {reparto.enRiesgo.length} convenio(s) se pasan de su fecha máxima
          </p>
          <p className="text-[12.5px] text-rose-700">
            Turnos {reparto.enRiesgo.map((r) => r.turno).join(", ")}. Faltan {money(reparto.faltanteParaRiesgo)} para
            cumplirles, o hay que adelantarlos por prioridad.
          </p>
        </div>
      )}

      {reparto && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              { t: "Modalidad 1 · con compensación", disp: reparto.disponibleM1, lista: reparto.asignadosM1, sob: reparto.sobranteM1 },
              { t: "Modalidad 2 · sin compensación", disp: reparto.disponibleM2, lista: reparto.asignadosM2, sob: reparto.sobranteM2 },
            ]).map((col) => (
              <div key={col.t} className="rounded-xl border border-black/10 bg-white p-4">
                <p className="text-[13.5px] font-semibold text-tinta">{col.t}</p>
                <p className="mb-2 text-[12.5px] text-humo">{money(col.disp)} de la mitad</p>
                {col.lista.length === 0 && <p className="py-2 text-[12.5px] text-humo">Nadie alcanza este mes.</p>}
                {col.lista.map((r) => (
                  <div key={r.clienteId} className="flex justify-between gap-2 border-t border-black/5 py-1.5 text-[12.5px]">
                    <span className="text-tinta">
                      Turno {r.turno} · {r.nombre}
                      <span className="block text-[11.5px] text-humo">{r.concepto}</span>
                    </span>
                    <span className="whitespace-nowrap font-semibold text-tinta">{money(r.montoAsignado)}</span>
                  </div>
                ))}
                <p className="mt-2 border-t border-black/5 pt-2 text-[12.5px] text-humo">Sobran {money(col.sob)}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-black/10 bg-white p-4">
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <p className="text-[15px] font-semibold text-tinta">Prioridades</p>
              <span className="text-[12.5px] text-humo">
                {money(usadoPrioridad)} usados de {money(reparto.topePrioridad)} · tope {Math.round(p.pctTopePrioridad * 100)}%
              </span>
            </div>
            <p className="mb-2 text-[12.5px] text-humo">Quedaron fuera este mes</p>
            {reparto.fuera.slice(0, 12).map((r) => (
              <div key={r.clienteId} className="flex items-center justify-between gap-2 border-t border-black/5 py-2 text-[12.5px]">
                <span className="text-tinta">
                  Turno {r.turno} · {r.nombre}
                  <span className="block text-[11.5px] text-humo">
                    {r.fechaMaxima ? `fecha máxima: ${r.fechaMaxima}` : "sin fecha máxima"} · pide {money(r.montoAsignado)}
                  </span>
                </span>
                <button onClick={() => alternarPrioridad(r)} disabled={bolsa?.cerrado}
                  className={"shrink-0 rounded-lg border px-2 py-1 text-[11.5px] font-semibold disabled:opacity-50 " +
                    (prioridades.has(r.clienteId) ? "border-amber-400 bg-amber-100 text-amber-800" : "border-black/10 bg-white text-tinta hover:bg-nube")}>
                  {prioridades.has(r.clienteId) ? "Quitar prioridad" : "Marcar prioridad"}
                </button>
              </div>
            ))}
            {reparto.fuera.length > 12 && (
              <p className="mt-2 text-[12px] text-humo">y {reparto.fuera.length - 12} más en la fila.</p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] text-humo">
              {bolsa?.cerrado
                ? `Cola congelada${bolsa.cerradoPor ? ` por ${bolsa.cerradoPor}` : ""}. Solo RAC y DGE pueden reabrirla.`
                : "Al confirmar, la cola se congela. Solo RAC y DGE pueden reabrirla."}
            </p>
            {bolsa?.cerrado ? (
              puedeReabrir && (
                <button onClick={async () => { await reabrirColaMes(anioMes, miRol || "DGE"); await cargar(); }}
                  className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-[13px] font-semibold text-tinta hover:bg-nube">
                  Reabrir cola
                </button>
              )
            ) : (
              <button onClick={confirmar} disabled={guardando || montoNum <= 0}
                className="rounded-lg bg-teal px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-teal-dark disabled:opacity-50">
                Confirmar cola del mes
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
