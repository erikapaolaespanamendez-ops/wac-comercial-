import { useEffect, useState } from "react";
import { fetchFases, crearFase, guardarFase, archivarFase, type Fase } from "../../data/fases";
import { ROLES } from "../../data/roles";

// Plantilla de una fase nueva (vacía).
const NUEVA_FASE: Fase = { id: "", nombre: "", resuelve: "", responsable: "", terminos: "", validaciones: "", orden: 99, activo: true };

function Etiqueta({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-humo">{children}</div>;
}

function Campo({ label, valor, onChange, area = false, ph = "" }: { label: string; valor: string; onChange: (v: string) => void; area?: boolean; ph?: string }) {
  return (
    <div>
      <Etiqueta>{label}</Etiqueta>
      {area ? (
        <textarea value={valor} onChange={(e) => onChange(e.target.value)} rows={2} placeholder={ph} className="w-full resize-none rounded-lg border border-black/10 px-2.5 py-1.5 text-sm outline-none focus:border-teal" />
      ) : (
        <input value={valor} onChange={(e) => onChange(e.target.value)} placeholder={ph} className="w-full rounded-lg border border-black/10 px-2.5 py-1.5 text-sm outline-none focus:border-teal" />
      )}
    </div>
  );
}

// ---- Editor (panel lateral) de una fase ----
function FaseEditor({ inicial, esNueva, onCerrar, onGuardado }: { inicial: Fase; esNueva?: boolean; onCerrar: () => void; onGuardado: () => void }) {
  const [f, setF] = useState<Fase>(inicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  function set<K extends keyof Fase>(k: K, v: Fase[K]) { setF((p) => ({ ...p, [k]: v })); }
  async function guardar() {
    if (!f.nombre.trim()) { setError("Ponle nombre a la fase."); return; }
    setGuardando(true); setError("");
    const r = esNueva
      ? await crearFase({ nombre: f.nombre.trim(), resuelve: f.resuelve, responsable: f.responsable, terminos: f.terminos, validaciones: f.validaciones, orden: f.orden })
      : await guardarFase(f);
    setGuardando(false);
    if (r.ok) onGuardado(); else setError(r.error || "No se pudo guardar.");
  }
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-tinta/40" onClick={onCerrar}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-nube shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/5 bg-white px-5 py-4">
          <h2 className="font-display text-lg font-extrabold text-tinta">{esNueva ? "Nueva fase" : "Editar fase"}</h2>
          <button onClick={onCerrar} className="rounded-lg px-2 py-1 text-humo hover:bg-nube" aria-label="Cerrar">✕</button>
        </div>
        <div className="space-y-3 p-5">
          <Campo label="Nombre de la fase" valor={f.nombre} onChange={(v) => set("nombre", v)} ph="Ej. Fase A · Originación" />
          <Campo label="¿Qué se resuelve en esta fase?" valor={f.resuelve} onChange={(v) => set("resuelve", v)} area ph="Qué problema o paso resuelve" />
          <div>
            <Etiqueta>Responsable de la fase</Etiqueta>
            <select value={f.responsable} onChange={(e) => set("responsable", e.target.value)} className="w-full rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-teal">
              <option value="">— Sin asignar —</option>
              {!ROLES.some((r) => r.codigo === f.responsable) && f.responsable && <option value={f.responsable}>{f.responsable} (actual)</option>}
              {ROLES.map((r) => <option key={r.codigo} value={r.codigo}>{r.codigo} · {r.nombre}</option>)}
            </select>
          </div>
          <Campo label="Términos y condiciones de la fase" valor={f.terminos} onChange={(v) => set("terminos", v)} area />
          <Campo label="Validaciones que ocupa la fase" valor={f.validaciones} onChange={(v) => set("validaciones", v)} area ph="Qué hay que validar para pasar la fase" />
          {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
          <div className="flex gap-2 pt-2">
            <button onClick={onCerrar} className="flex-1 rounded-xl border border-black/10 px-4 py-2.5 text-sm font-semibold text-humo hover:bg-nube">Cancelar</button>
            <button onClick={guardar} disabled={guardando} className="flex-1 rounded-xl bg-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-dark disabled:opacity-50">{guardando ? "Guardando…" : "Guardar"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Linea({ k, v }: { k: string; v: string }) {
  return <div><span className="font-semibold text-humo">{k}: </span><span className="text-tinta">{v}</span></div>;
}

export default function FasesSistema({ puedeEditar }: { puedeEditar: boolean }) {
  const [fases, setFases] = useState<Fase[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editar, setEditar] = useState<Fase | null>(null);
  const [crear, setCrear] = useState(false);

  function recargar() { setCargando(true); fetchFases().then(setFases).catch(() => {}).finally(() => setCargando(false)); }
  useEffect(() => { recargar(); }, []);

  const vivas = fases.filter((f) => f.activo !== false);
  async function archivar(f: Fase) { if (!confirm("¿Archivar la fase \"" + f.nombre + "\"?")) return; await archivarFase(f.id, false); recargar(); }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-sm text-humo">Las fases del proceso, con su responsable, términos y validaciones.</p>
        {puedeEditar && <button onClick={() => setCrear(true)} className="shrink-0 rounded-xl bg-teal px-3 py-2 text-sm font-semibold text-white hover:bg-teal-dark">➕ Nueva fase</button>}
      </div>

      {cargando ? (
        <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-16 text-center text-humo">Cargando fases…</div>
      ) : vivas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-16 text-center text-humo">Aún no hay fases. {puedeEditar ? "Crea la primera con ➕ Nueva fase." : ""}</div>
      ) : (
        <div className="space-y-3">
          {vivas.map((f) => (
            <div key={f.id} className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display text-base font-extrabold text-tinta">{f.nombre}</h3>
                {puedeEditar && (
                  <div className="flex shrink-0 gap-2">
                    <button onClick={() => setEditar(f)} className="rounded-lg border border-black/10 px-2.5 py-1 text-[12px] font-semibold text-tinta hover:bg-nube">✏️ Editar</button>
                    <button onClick={() => archivar(f)} className="rounded-lg border border-black/10 px-2.5 py-1 text-[12px] text-humo hover:bg-nube" aria-label="Archivar">🗄️</button>
                  </div>
                )}
              </div>
              <div className="mt-2 space-y-1.5 text-[13px]">
                {f.resuelve && <Linea k="Resuelve" v={f.resuelve} />}
                {f.responsable && <Linea k="Responsable" v={f.responsable} />}
                {f.terminos && <Linea k="Términos y condiciones" v={f.terminos} />}
                {f.validaciones && <Linea k="Validaciones" v={f.validaciones} />}
              </div>
            </div>
          ))}
        </div>
      )}

      {crear && <FaseEditor inicial={NUEVA_FASE} esNueva onCerrar={() => setCrear(false)} onGuardado={() => { setCrear(false); recargar(); }} />}
      {editar && <FaseEditor inicial={editar} onCerrar={() => setEditar(null)} onGuardado={() => { setEditar(null); recargar(); }} />}
    </div>
  );
}
