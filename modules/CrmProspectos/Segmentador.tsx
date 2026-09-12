// CRM Prospectos · Tablero segmentador (Seg·C)
// Bolsas que se arman solas + sub-filtros por zona, presupuesto y tamaño.
import { useMemo, useState } from "react";
import { BOLSAS, bolsaDe, ZONAS, PRESUPUESTOS, TAMANOS_CASA, type Prospecto, type Bolsa } from "../../data/prospectos";

const COLOR_BOLSA: Record<string, { card: string; on: string }> = {
  blue: { card: "border-blue-200 bg-blue-50", on: "ring-2 ring-blue-400" },
  emerald: { card: "border-emerald-200 bg-emerald-50", on: "ring-2 ring-emerald-400" },
  amber: { card: "border-amber-200 bg-amber-50", on: "ring-2 ring-amber-400" },
  rose: { card: "border-rose-200 bg-rose-50", on: "ring-2 ring-rose-400" },
  slate: { card: "border-slate-200 bg-slate-50", on: "ring-2 ring-slate-400" },
};

export default function Segmentador({ lista, onAbrir }: { lista: Prospecto[]; onAbrir: (p: Prospecto) => void }) {
  const [bolsa, setBolsa] = useState<Bolsa | null>(null);
  const [zona, setZona] = useState("todas");
  const [presupuesto, setPresupuesto] = useState("todos");
  const [tamano, setTamano] = useState("todos");

  // Solo prospectos activos (no convertidos) para el segmentador.
  const activos = useMemo(() => lista.filter((p) => !p.convertido && p.fase !== "Perdido"), [lista]);

  const conteo = useMemo(() => {
    const m: Record<string, number> = {};
    for (const b of BOLSAS) m[b.clave] = 0;
    for (const p of activos) m[bolsaDe(p)]++;
    return m;
  }, [activos]);

  const enBolsa = useMemo(() => {
    if (!bolsa) return [];
    return activos.filter((p) => bolsaDe(p) === bolsa).filter((p) => {
      if (zona !== "todas" && p.zona !== zona) return false;
      if (presupuesto !== "todos" && p.presupuestoRango !== presupuesto) return false;
      if (tamano !== "todos" && p.tamanoCasa !== tamano) return false;
      return true;
    });
  }, [activos, bolsa, zona, presupuesto, tamano]);

  return (
    <div>
      {/* Bolsas */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {BOLSAS.map((b) => {
          const c = COLOR_BOLSA[b.color] || COLOR_BOLSA.slate;
          const activa = bolsa === b.clave;
          return (
            <button key={b.clave} onClick={() => { setBolsa(activa ? null : b.clave); setZona("todas"); setPresupuesto("todos"); setTamano("todos"); }}
              className={`rounded-2xl border px-3 py-3 text-left transition ${c.card} ${activa ? c.on : "hover:brightness-95"}`}>
              <div className="text-[12px] font-semibold leading-tight text-tinta">{b.etiqueta}</div>
              <div className="mt-1 font-display text-2xl font-extrabold text-tinta">{conteo[b.clave] || 0}</div>
            </button>
          );
        })}
      </div>

      {!bolsa ? (
        <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-12 text-center text-sm text-humo">
          Toca una bolsa para ver a sus prospectos, sub-filtrados por zona, presupuesto y tamaño.
        </div>
      ) : (
        <>
          {/* Sub-filtros */}
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <SelMini label="Zona" value={zona} set={setZona} ops={ZONAS} todos="todas" />
            <SelMini label="Presupuesto" value={presupuesto} set={setPresupuesto} ops={PRESUPUESTOS} todos="todos" />
            <SelMini label="Tamaño" value={tamano} set={setTamano} ops={TAMANOS_CASA} todos="todos" />
            <span className="ml-auto self-center text-[12px] font-semibold text-humo">{enBolsa.length} prospecto(s)</span>
          </div>

          {enBolsa.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-10 text-center text-sm text-humo">Ninguno coincide con el sub-filtro.</div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-black/5 bg-white shadow-sm">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-black/5 text-left text-[11px] font-semibold uppercase tracking-wide text-humo">
                    <th className="px-3 py-2.5">Folio · Prospecto</th>
                    <th className="px-3 py-2.5">Zona</th>
                    <th className="px-3 py-2.5">Presupuesto</th>
                    <th className="px-3 py-2.5">Tamaño</th>
                    <th className="px-3 py-2.5">Fase</th>
                    <th className="px-3 py-2.5">Asesor</th>
                  </tr>
                </thead>
                <tbody>
                  {enBolsa.map((p) => (
                    <tr key={p.id} className="border-b border-black/5 last:border-0 hover:bg-nube/40">
                      <td className="px-3 py-2.5">
                        <button onClick={() => onAbrir(p)} className="text-left">
                          <div className="font-semibold text-teal-dark hover:underline">{p.nombre}</div>
                          <div className="text-[11px] text-humo">{p.folio || ""}</div>
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-humo">{p.zona || "—"}{p.colonia ? ` · ${p.colonia}` : ""}</td>
                      <td className="px-3 py-2.5 text-humo">{p.presupuestoRango || "—"}</td>
                      <td className="px-3 py-2.5 text-humo">{p.tamanoCasa || "—"}</td>
                      <td className="px-3 py-2.5 text-humo">{p.fase}</td>
                      <td className="px-3 py-2.5 text-humo">{p.asesor || <span className="text-rose-500">sin asignar</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SelMini({ label, value, set, ops, todos }: { label: string; value: string; set: (v: string) => void; ops: readonly string[]; todos: string }) {
  return (
    <label className="flex flex-col text-[10px] font-semibold uppercase tracking-wide text-humo">{label}
      <select value={value} onChange={(e) => set(e.target.value)}
        className="mt-0.5 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm font-medium text-tinta outline-none focus:border-teal">
        <option value={todos}>Todas</option>
        {ops.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
