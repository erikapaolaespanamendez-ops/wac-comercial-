// ===================================================================
// CATÁLOGO DE SEGUIMIENTO POR CÓDIGO  →  src/modules/Catalogo/Catalogo.tsx
// Estilo Excel: una fila por código, todas las columnas, y al final
// un botón de Acciones (⋮) con Editar y Archivar. Solo DGE/RAC editan.
// ===================================================================
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "../../lib/supabase";
import { fetchPerfil } from "../../data/usuarios";
import { puedeAccion, ROLES, GRUPOS_ROLES } from "../../data/roles";
import FasesSistema from "./FasesSistema";
import { fetchCatalogo, guardarCodigo, crearCodigo, archivarCodigo, type CatalogoCodigo, type AccionCodigo, type Etiqueta } from "../../data/catalogoCodigos";
import { fetchColaboradores } from "../../data/colaboradores";
import { fetchFases } from "../../data/fases";

// Color del código según el área (verde=Comercial, azul=Atención, ámbar=Jurídico)
function tonoDeCodigo(cod: string): string {
  if (cod === "SVT") return "bg-emerald-100 text-emerald-800";
  if (cod === "R2" || cod === "R2C") return "bg-amber-100 text-amber-800";
  return "bg-sky-100 text-sky-800";
}

function Chip({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${className}`}>{children}</span>;
}

// Opciones fijas (Parte 1)
const AREAS_CAT = ["Comercial", "Jurídico", "RAC", "Admin", "UFC", "Contabilidad", "Dirección", "Tecnología"];
const RITMOS_CAT = ["Diario", "Cada 3 días", "Semanal", "Cada 15 días", "Mensual", "Cada 2 meses", "Trimestral"];

// Campo desplegable (con opción "Otro" para escribir libre). Conserva el valor actual aunque no esté en la lista.
function CampoLista({ label, valor, onChange, opciones, permitirOtro = false }: { label: string; valor: string; onChange: (v: string) => void; opciones: string[]; permitirOtro?: boolean }) {
  const enLista = opciones.includes(valor);
  const [otro, setOtro] = useState(permitirOtro && !!valor && !enLista);
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-humo">{label}</div>
      {otro ? (
        <div className="flex gap-2">
          <input value={valor} onChange={(e) => onChange(e.target.value)} placeholder="Escribe…" className="w-full rounded-lg border border-black/10 px-2.5 py-1.5 text-sm outline-none focus:border-teal" />
          <button type="button" onClick={() => { setOtro(false); onChange(opciones[0] ?? ""); }} className="shrink-0 rounded-lg border border-black/10 px-2 text-[12px] text-humo hover:bg-nube">lista</button>
        </div>
      ) : (
        <select value={enLista ? valor : ""} onChange={(e) => { if (e.target.value === "__otro__") { setOtro(true); onChange(""); } else onChange(e.target.value); }} className="w-full rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-teal">
          <option value="">— Elige —</option>
          {!enLista && valor && <option value={valor}>{valor} (actual)</option>}
          {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
          {permitirOtro && <option value="__otro__">Otro (escribir)…</option>}
        </select>
      )}
    </div>
  );
}

// Selector de SALIDAS: palomea entre los códigos existentes (auto-alimentado). (Parte 2a)
function CampoSalidas({ valor, onChange, codigos, actual }: { valor: string; onChange: (v: string) => void; codigos: string[]; actual: string }) {
  const sel = valor.split(",").map((x) => x.trim()).filter(Boolean);
  const opciones = codigos.filter((c) => c !== actual);
  function toggle(cod: string) {
    const next = sel.includes(cod) ? sel.filter((x) => x !== cod) : [...sel, cod];
    onChange(next.join(", "));
  }
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-humo">Salidas (a qué códigos puede pasar)</div>
      {opciones.length === 0 ? (
        <p className="text-[12px] text-humo">No hay otros códigos todavía.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {opciones.map((c) => {
            const on = sel.includes(c);
            return <button key={c} type="button" onClick={() => toggle(c)} className={"rounded-lg border px-2.5 py-1 text-sm font-semibold " + (on ? "border-teal bg-teal-soft text-teal-dark ring-1 ring-teal" : "border-black/10 text-tinta hover:bg-nube")}>{c}{on ? " ✓" : ""}</button>;
          })}
        </div>
      )}
    </div>
  );
}

// Mini-formulario de Escalamiento (Parte 3a): arma el texto solo, sin escribir a mano.
function CampoEscalamiento({ quien, cuando, dias, texto, onChange }: { quien: string; cuando: string; dias: number | null; texto: string; onChange: (q: string, c: string, d: number | null, txt: string) => void }) {
  const q = quien || "Director del área";
  const c = cuando || "al_vencer";
  function emit(nq: string, nc: string, nd: number | null) {
    const t = nc === "al_vencer" ? "al vencer" : `a los ${nd ?? "?"} días de vencido`;
    onChange(nq, nc, nd, `Escala a ${nq} ${t}`);
  }
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-humo">Escalamiento</div>
      <div className="space-y-2 rounded-xl border border-black/10 bg-nube/40 p-2.5">
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-humo">Escala a</span>
          <select value={q} onChange={(e) => emit(e.target.value, c, dias)} className="rounded-lg border border-black/10 bg-white px-2 py-1 outline-none focus:border-teal">
            <option>Director del área</option>
            <option>Dirección (DGE)</option>
            {ROLES.map((r) => <option key={r.codigo} value={r.codigo}>{r.codigo}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-humo">cuándo:</span>
          <select value={c} onChange={(e) => emit(q, e.target.value, dias)} className="rounded-lg border border-black/10 bg-white px-2 py-1 outline-none focus:border-teal">
            <option value="al_vencer">Al vencer</option>
            <option value="dias">A los X días de vencido</option>
          </select>
          {c === "dias" && <input type="number" value={dias ?? ""} onChange={(e) => emit(q, c, e.target.value === "" ? null : Number(e.target.value))} className="w-16 rounded-lg border border-black/10 px-2 py-1 outline-none focus:border-teal" />}
        </div>
        <p className="text-[11px] text-humo">Queda: <strong className="text-tinta">{texto || "—"}</strong></p>
      </div>
    </div>
  );
}

// Campo de texto del formulario (a nivel de módulo para que no pierda el foco al escribir).
function CampoEdit({ label, valor, onChange, area = false }: { label: string; valor: string; onChange: (v: string) => void; area?: boolean }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-humo">{label}</div>
      {area ? (
        <textarea value={valor} onChange={(e) => onChange(e.target.value)} rows={2} className="w-full resize-none rounded-lg border border-black/10 px-2.5 py-1.5 text-sm outline-none focus:border-teal" />
      ) : (
        <input value={valor} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-black/10 px-2.5 py-1.5 text-sm outline-none focus:border-teal" />
      )}
    </div>
  );
}

// Campo de UN rol (menú). Muestra la(s) persona(s) de ese rol. Conserva el valor actual aunque no esté en la lista.
function CampoRol({ label, valor, onChange, personas }: { label: string; valor: string; onChange: (v: string) => void; personas: Record<string, string[]> }) {
  const conocido = ROLES.some((r) => r.codigo === valor);
  const peeps = personas[valor] || [];
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-humo">{label}</div>
      <select value={valor} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-teal">
        <option value="">— Sin asignar —</option>
        {!conocido && valor && <option value={valor}>{valor} (actual)</option>}
        {GRUPOS_ROLES.map((g) => {
          const rs = ROLES.filter((r) => r.grupo === g.clave);
          if (rs.length === 0) return null;
          return (
            <optgroup key={g.clave} label={`${g.emoji} ${g.nombre}`}>
              {rs.map((r) => {
                const pp = personas[r.codigo] || [];
                return <option key={r.codigo} value={r.codigo}>{r.codigo} · {r.nombre}{pp.length ? " — " + pp.join(", ") : ""}</option>;
              })}
            </optgroup>
          );
        })}
      </select>
      {valor && peeps.length > 0 && <div className="mt-1 text-[11px] font-semibold text-teal-dark">👤 {peeps.join(", ")}</div>}
      {valor && conocido && peeps.length === 0 && <div className="mt-1 text-[11px] text-humo">Sin colaborador asignado a este rol.</div>}
    </div>
  );
}

// Campo de VARIOS roles (multi-selección). Muestra la persona de cada rol. Guarda "ROL1, ROL2, ..." igual que antes.
function CampoApoyos({ valor, onChange, personas }: { valor: string; onChange: (v: string) => void; personas: Record<string, string[]> }) {
  const sel = new Set(valor.split(",").map((s) => s.trim()).filter(Boolean));
  const codigosRol = new Set(ROLES.map((r) => r.codigo));
  const extras = Array.from(sel).filter((t) => !codigosRol.has(t));
  function toggle(cod: string) {
    const n = new Set(sel);
    if (n.has(cod)) n.delete(cod); else n.add(cod);
    onChange(Array.from(n).join(", "));
  }
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-humo">Apoyos / copia (pica los que apliquen)</div>
      <div className="max-h-56 overflow-y-auto rounded-lg border border-black/10 bg-white p-1.5">
        {GRUPOS_ROLES.map((g) => {
          const rs = ROLES.filter((r) => r.grupo === g.clave);
          if (rs.length === 0) return null;
          return (
            <div key={g.clave} className="mb-1">
              <div className="px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-humo">{g.emoji} {g.nombre}</div>
              {rs.map((r) => {
                const on = sel.has(r.codigo);
                const peeps = personas[r.codigo] || [];
                return (
                  <button key={r.codigo} type="button" onClick={() => toggle(r.codigo)}
                    className={"flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[12px] " + (on ? "bg-teal-soft" : "hover:bg-nube")}>
                    <span className={"flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] " + (on ? "border-teal bg-teal text-white" : "border-black/20 text-transparent")}>✓</span>
                    <span className="font-semibold text-tinta">{r.codigo}</span>
                    <span className="truncate text-humo">· {r.nombre}</span>
                    {peeps.length > 0 && <span className="ml-auto shrink-0 truncate text-[11px] text-teal-dark">👤 {peeps.join(", ")}</span>}
                  </button>
                );
              })}
            </div>
          );
        })}
        {extras.length > 0 && (
          <div className="mt-1 border-t border-black/5 pt-1">
            <div className="px-1 text-[10px] font-semibold uppercase tracking-wide text-humo">Otros (ya guardados)</div>
            {extras.map((t) => (
              <button key={t} type="button" onClick={() => toggle(t)} className="flex w-full items-center gap-2 rounded-md bg-teal-soft px-1.5 py-1 text-left text-[12px]">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-teal bg-teal text-[10px] text-white">✓</span>
                <span className="font-semibold text-tinta">{t}</span>
                <span className="ml-auto text-[11px] text-humo">quitar ✕</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="mt-1 text-[10.5px] text-humo">Se guarda: <span className="font-semibold text-tinta">{valor || "—"}</span></div>
    </div>
  );
}

// ---- Editor de la lista de acciones (FASE D2) ----
function EditorAcciones({ valor, onChange }: { valor: AccionCodigo[] | null | undefined; onChange: (v: AccionCodigo[]) => void }) {
  const lista = valor ?? [];
  function set<K extends keyof AccionCodigo>(i: number, campo: K, v: AccionCodigo[K]) { onChange(lista.map((a, k) => (k === i ? { ...a, [campo]: v } : a))); }
  function agregar() { onChange([...lista, { nombre: "", evidencia: "ninguna", cuenta: false }]); }
  function quitar(i: number) { onChange(lista.filter((_, k) => k !== i)); }
  return (
    <div className="rounded-xl border border-black/10 bg-white p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-humo">Acciones para atender (agrega las tuyas)</div>
      {lista.length === 0 && <p className="mb-2 text-[12px] text-humo">Sin acciones extra. Agrega las que quieras (ej. Nota, Visita al juzgado).</p>}
      {lista.map((a, i) => (
        <div key={i} className="mb-2 rounded-lg border border-black/10 p-2">
          <div className="flex items-center gap-2">
            <input value={a.nombre} onChange={(e) => set(i, "nombre", e.target.value)} placeholder="Nombre de la acción" className="flex-1 rounded-lg border border-black/10 px-2.5 py-1.5 text-sm outline-none focus:border-teal" />
            <button onClick={() => quitar(i)} className="rounded-lg px-2 py-1.5 text-sm text-red-600 hover:bg-red-50" aria-label="Quitar">🗑️</button>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <select value={a.evidencia} onChange={(e) => set(i, "evidencia", e.target.value)} className="rounded-lg border border-black/10 bg-white px-2 py-1 text-[12px] outline-none focus:border-teal">
              <option value="ninguna">Sin evidencia</option>
              <option value="foto">📷 Foto</option>
              <option value="pdf">📄 PDF</option>
              <option value="doc">📝 Documento</option>
            </select>
            <label className="flex items-center gap-1.5 text-[12px] font-medium text-tinta">
              <input type="checkbox" checked={a.cuenta ?? false} onChange={(e) => set(i, "cuenta", e.target.checked)} />
              ✔ Cuenta para atendido
            </label>
          </div>
        </div>
      ))}
      <button onClick={agregar} className="mt-1 rounded-lg border border-teal/30 px-3 py-1.5 text-[12px] font-semibold text-teal-dark hover:bg-teal-soft">➕ Agregar acción</button>
    </div>
  );
}

// ---- Editor de etiquetas / indicadores (FASE G1) ----
const COLORES_ETI: Array<{ k: string; label: string; chip: string }> = [
  { k: "rojo", label: "Rojo", chip: "bg-red-100 text-red-700" },
  { k: "ambar", label: "Ámbar", chip: "bg-amber-100 text-amber-700" },
  { k: "verde", label: "Verde", chip: "bg-emerald-100 text-emerald-700" },
  { k: "azul", label: "Azul", chip: "bg-blue-100 text-blue-700" },
  { k: "violeta", label: "Violeta", chip: "bg-violet-100 text-violet-700" },
  { k: "gris", label: "Gris", chip: "bg-nube text-humo" },
];
const CUANDO_ETI: Array<{ k: string; label: string }> = [
  { k: "siempre", label: "Siempre" },
  { k: "vencido", label: "Cuando está vencido 🔴" },
  { k: "porvencer", label: "Cuando está por vencer 🟠" },
  { k: "falta_accion", label: "Cuando falta una acción" },
  { k: "contingencia", label: "Cuando tiene demanda" },
];
function chipDeColor(color: string) { return COLORES_ETI.find((c) => c.k === color)?.chip ?? "bg-nube text-humo"; }

function EditorEtiquetas({ valor, onChange }: { valor: Etiqueta[] | null | undefined; onChange: (v: Etiqueta[]) => void }) {
  const lista = valor ?? [];
  function set<K extends keyof Etiqueta>(i: number, campo: K, v: Etiqueta[K]) { onChange(lista.map((e, k) => (k === i ? { ...e, [campo]: v } : e))); }
  return (
    <div className="rounded-xl border border-black/10 bg-white p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-humo">Etiquetas / indicadores (aparecen en el cliente)</div>
      {lista.length === 0 && <p className="mb-2 text-[12px] text-humo">Sin etiquetas. Agrega una (ej. ⭐ VIP, 🔴 URGENTE).</p>}
      {lista.map((e, i) => (
        <div key={i} className="mb-2 rounded-lg border border-black/10 p-2">
          <div className="flex items-center gap-2">
            <span className={"rounded-full px-2 py-0.5 text-[11px] font-bold " + chipDeColor(e.color)}>{e.texto || "etiqueta"}</span>
            <input value={e.texto} onChange={(ev) => set(i, "texto", ev.target.value)} placeholder="Texto (ej. ⭐ VIP)" className="flex-1 rounded-lg border border-black/10 px-2.5 py-1.5 text-sm outline-none focus:border-teal" />
            <button onClick={() => onChange(lista.filter((_, k) => k !== i))} className="rounded-lg px-2 py-1.5 text-sm text-red-600 hover:bg-red-50" aria-label="Quitar">🗑️</button>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <select value={e.color} onChange={(ev) => set(i, "color", ev.target.value)} className="rounded-lg border border-black/10 bg-white px-2 py-1 text-[12px] outline-none focus:border-teal">
              {COLORES_ETI.map((c) => <option key={c.k} value={c.k}>{c.label}</option>)}
            </select>
            <select value={e.cuando} onChange={(ev) => set(i, "cuando", ev.target.value)} className="rounded-lg border border-black/10 bg-white px-2 py-1 text-[12px] outline-none focus:border-teal">
              {CUANDO_ETI.map((c) => <option key={c.k} value={c.k}>{c.label}</option>)}
            </select>
          </div>
        </div>
      ))}
      <button onClick={() => onChange([...lista, { texto: "", color: "azul", cuando: "siempre" }])} className="mt-1 rounded-lg border border-teal/30 px-3 py-1.5 text-[12px] font-semibold text-teal-dark hover:bg-teal-soft">➕ Agregar etiqueta</button>
    </div>
  );
}

// ---- Formulario de edición (modal lateral) ----
function Editor({ inicial, esNuevo, codigos, onCerrar, onGuardado }: { inicial: CatalogoCodigo; esNuevo?: boolean; codigos: string[]; onCerrar: () => void; onGuardado: (c: CatalogoCodigo) => void }) {
  const [f, setF] = useState<CatalogoCodigo>(inicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [personas, setPersonas] = useState<Record<string, string[]>>({});
  const [fasesLista, setFasesLista] = useState<string[]>([]);

  useEffect(() => {
    fetchColaboradores().then((cols) => {
      const m: Record<string, string[]> = {};
      for (const c of cols) {
        if (c.activo === false) continue;
        const rol = (c.rol_sistema || "").trim();
        if (!rol) continue;
        (m[rol] ||= []).push(c.nombre);
      }
      setPersonas(m);
    }).catch(() => {});
    fetchFases().then((fs) => setFasesLista(fs.filter((x) => x.activo !== false).map((x) => x.nombre))).catch(() => {});
  }, []);

  function set<K extends keyof CatalogoCodigo>(campo: K, valor: CatalogoCodigo[K]) {
    setF((prev) => ({ ...prev, [campo]: valor }));
  }

  async function guardar() {
    if (esNuevo && !f.codigo.trim()) { setError("Ponle un código (ej. R4)."); return; }
    setGuardando(true);
    setError("");
    const r = esNuevo ? await crearCodigo(f) : await guardarCodigo(f);
    setGuardando(false);
    if (r.ok) onGuardado(f);
    else setError(r.error || "No se pudo guardar.");
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-tinta/40" onClick={onCerrar}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-nube shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/5 bg-white px-5 py-4">
          <h2 className="font-display text-lg font-extrabold text-tinta">{esNuevo ? "Nuevo código" : `Editar ${f.codigo} · ${f.nombre}`}</h2>
          <button onClick={onCerrar} className="rounded-lg px-2 py-1 text-humo hover:bg-nube" aria-label="Cerrar">✕</button>
        </div>
        <div className="space-y-3 p-5">
          {esNuevo && (
            <div>
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-humo">Código (corto, ej. R4)</div>
              <input value={f.codigo} onChange={(e) => set("codigo", e.target.value.toUpperCase().replace(/\s/g, ""))} placeholder="R4" className="w-full rounded-lg border border-black/10 px-2.5 py-1.5 text-sm outline-none focus:border-teal" />
            </div>
          )}
          <CampoEdit label="Nombre" valor={f.nombre} onChange={(v) => set("nombre", v)} />
          <div>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-humo">A qué fase pertenece</div>
            <select value={f.fase ?? ""} onChange={(e) => set("fase", e.target.value)} className="w-full rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-teal">
              <option value="">— Sin fase —</option>
              {f.fase && !fasesLista.includes(f.fase) && <option value={f.fase}>{f.fase} (actual)</option>}
              {fasesLista.map((nombre) => <option key={nombre} value={nombre}>{nombre}</option>)}
            </select>
            {fasesLista.length === 0 && <p className="mt-1 text-[11px] text-humo">No hay fases todavía. Créalas en la pestaña "Fases del sistema".</p>}
          </div>
          <CampoLista label="Área dueña" valor={f.area_duena} onChange={(v) => set("area_duena", v)} opciones={AREAS_CAT} />
          <div className="grid grid-cols-2 gap-3">
            <CampoRol label="Responsable (rol)" valor={f.responsable_rol} onChange={(v) => set("responsable_rol", v)} personas={personas} />
            <CampoRol label="Alterno (rol)" valor={f.alterno_rol} onChange={(v) => set("alterno_rol", v)} personas={personas} />
          </div>
          <CampoRol label="Respaldo (si no hay persona)" valor={f.respaldo_rol} onChange={(v) => set("respaldo_rol", v)} personas={personas} />
          <CampoApoyos valor={f.apoyos} onChange={(v) => set("apoyos", v)} personas={personas} />
          <div className="grid grid-cols-2 gap-3">
            <CampoLista label="Ritmo" valor={f.ritmo} onChange={(v) => set("ritmo", v)} opciones={RITMOS_CAT} permitirOtro />
            <div>
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-humo">Días límite</div>
              <input type="number" value={f.dias_limite ?? ""} onChange={(e) => set("dias_limite", e.target.value === "" ? null : Number(e.target.value))} className="w-full rounded-lg border border-black/10 px-2.5 py-1.5 text-sm outline-none focus:border-teal" />
            </div>
          </div>
          <div>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-humo">Días de aviso (se pone 🟠 naranja N días antes del límite)</div>
            <input type="number" value={f.dias_aviso ?? ""} onChange={(e) => set("dias_aviso", e.target.value === "" ? null : Number(e.target.value))} placeholder="3" className="w-full rounded-lg border border-black/10 px-2.5 py-1.5 text-sm outline-none focus:border-teal" />
          </div>

          <div className="rounded-xl border border-black/10 bg-white p-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-humo">¿Qué cuenta como atendido?</div>
            <label className="flex items-center gap-2 text-sm text-tinta">
              <input type="checkbox" checked={f.requiere_llamada ?? true} onChange={(e) => set("requiere_llamada", e.target.checked)} />
              📞 Necesita llamada
            </label>
            <label className="mt-1 flex items-center gap-2 text-sm text-tinta">
              <input type="checkbox" checked={f.requiere_correo ?? false} onChange={(e) => set("requiere_correo", e.target.checked)} />
              ✉️ Necesita correo
            </label>
            <label className="mt-1 flex items-center gap-2 text-sm text-tinta">
              <input type="checkbox" checked={f.requiere_boletin ?? false} onChange={(e) => set("requiere_boletin", e.target.checked)} />
              ⚖️ Necesita boletín judicial (semanal)
            </label>
            <p className="mt-2 text-[11px] text-humo">El cliente cuenta como atendido cuando se hicieron las acciones marcadas. Si no marcas ninguna, cuenta cualquier contacto.</p>
          </div>

          <EditorAcciones valor={f.acciones} onChange={(v) => set("acciones", v)} />

          <EditorEtiquetas valor={f.etiquetas} onChange={(v) => set("etiquetas", v)} />

          <CampoEdit label="Siguiente acción" valor={f.siguiente_accion} onChange={(v) => set("siguiente_accion", v)} area />
          <CampoEscalamiento quien={f.escala_a ?? ""} cuando={f.escala_cuando ?? "al_vencer"} dias={f.escala_dias ?? null} texto={f.escalamiento} onChange={(q, c, d, txt) => { set("escala_a", q); set("escala_cuando", c); set("escala_dias", d); set("escalamiento", txt); }} />
          <CampoSalidas valor={f.salidas} onChange={(v) => set("salidas", v)} codigos={codigos} actual={f.codigo} />
          <label className="flex items-center gap-2 text-sm text-tinta">
            <input type="checkbox" checked={f.urgente} onChange={(e) => set("urgente", e.target.checked)} />
            Marcar como urgente (ritmo apretado, ej. R2C)
          </label>

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

const NUEVO_CODIGO: CatalogoCodigo = {
  codigo: "", nombre: "", area_duena: "", responsable_rol: "", alterno_rol: "",
  respaldo_rol: "", apoyos: "", ritmo: "", dias_limite: null, dias_aviso: null, siguiente_accion: "",
  completa_con: "", escalamiento: "", escala_a: "", escala_cuando: "al_vencer", escala_dias: null, salidas: "", urgente: false, orden: 99, fase: "",
  requiere_llamada: true, requiere_correo: false, requiere_boletin: false, acciones: [], etiquetas: [], activo: true,
};

export default function Catalogo() {
  const [items, setItems] = useState<CatalogoCodigo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [rol, setRol] = useState<string | null>(null);
  const [editando, setEditando] = useState<CatalogoCodigo | null>(null);
  const [creando, setCreando] = useState(false);
  const [acciones, setAcciones] = useState<CatalogoCodigo | null>(null);
  const [mostrarArch, setMostrarArch] = useState(false);

  // ¿Quién soy? (para saber si puedo editar / archivar)
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const email = data.session?.user?.email;
      if (!email) return;
      const perfil = await fetchPerfil(email).catch(() => null);
      setRol(perfil?.rol ?? null);
    });
  }, []);

  useEffect(() => {
    fetchCatalogo().then(setItems).catch(() => setError(true)).finally(() => setCargando(false));
  }, []);

  const puedeEditar = puedeAccion(rol, "catalogo_editar");
  const [vista, setVista] = useState<"codigos" | "fases">("codigos");
  const visibles = items.filter((c) => c.activo !== false);
  const archivados = items.filter((c) => c.activo === false);

  async function archivar(c: CatalogoCodigo, archivar: boolean) {
    const activo = !archivar;
    setItems((prev) => prev.map((x) => (x.codigo === c.codigo ? { ...x, activo } : x)));
    const r = await archivarCodigo(c.codigo, activo);
    if (!r.ok) setItems((prev) => prev.map((x) => (x.codigo === c.codigo ? { ...x, activo: !activo } : x))); // revierte si falla
  }

  const Th = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
    <th className={`whitespace-nowrap px-3 py-2.5 text-left font-bold ${className}`}>{children}</th>
  );
  const Td = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
    <td className={`px-3 py-2.5 align-top ${className}`}>{children}</td>
  );

  function CeldaRitmo({ c }: { c: CatalogoCodigo }) {
    if (c.urgente) return <Chip className="bg-red-100 text-red-700">⏱ {c.ritmo}</Chip>;
    return <span>{c.ritmo}{c.dias_limite ? ` (${c.dias_limite}d)` : ""}</span>;
  }

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-4 flex gap-2">
        <button onClick={() => setVista("codigos")} className={"rounded-full px-3 py-1.5 text-sm font-semibold transition " + (vista === "codigos" ? "bg-teal text-white" : "border border-black/10 bg-white text-humo hover:bg-nube")}>Códigos</button>
        <button onClick={() => setVista("fases")} className={"rounded-full px-3 py-1.5 text-sm font-semibold transition " + (vista === "fases" ? "bg-teal text-white" : "border border-black/10 bg-white text-humo hover:bg-nube")}>Fases del sistema</button>
      </div>

      {vista === "fases" ? (
        <FasesSistema puedeEditar={puedeEditar} />
      ) : (
      <>
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-sm text-humo">Reglas de seguimiento por código (estilo tabla). {puedeEditar ? "Usa ⋮ para editar o archivar." : "Solo lectura."}</p>
        {puedeEditar && (
          <button onClick={() => setCreando(true)} className="shrink-0 rounded-xl bg-teal px-3 py-2 text-sm font-semibold text-white hover:bg-teal-dark">➕ Nuevo código</button>
        )}
      </div>

      {cargando ? (
        <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-16 text-center text-humo">Cargando catálogo…</div>
      ) : error ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-16 text-center text-amber-800">No se pudo cargar el catálogo. Revisa la conexión.</div>
      ) : (
        <>
          {/* TABLA ESTILO EXCEL (se desliza de lado si no cabe) */}
          <div className="overflow-x-auto rounded-2xl border border-black/5 bg-white shadow-sm">
            <table className="w-full text-[12px]">
              <thead className="border-b border-black/5 bg-teal-soft uppercase tracking-wide text-teal-dark">
                <tr>
                  <Th>Código</Th>
                  <Th>Nombre</Th>
                  <Th>Área</Th>
                  <Th>Responsable</Th>
                  <Th>Alterno</Th>
                  <Th>Respaldo</Th>
                  <Th>Ritmo</Th>
                  <Th>Acción</Th>
                  <Th>Copia</Th>
                  <Th>Escala</Th>
                  <Th>Salidas</Th>
                  {puedeEditar && <Th className="text-center"> </Th>}
                </tr>
              </thead>
              <tbody>
                {visibles.map((c, i) => (
                  <tr key={c.codigo} className={`border-b border-black/5 ${i % 2 ? "bg-nube/40" : "bg-white"} hover:bg-teal-soft/40`}>
                    <Td><Chip className={tonoDeCodigo(c.codigo)}>{c.codigo}</Chip></Td>
                    <Td className="whitespace-nowrap font-semibold text-tinta">{c.nombre}</Td>
                    <Td className="whitespace-nowrap text-humo">{c.area_duena}</Td>
                    <Td className="whitespace-nowrap text-tinta">{c.responsable_rol || "—"}</Td>
                    <Td className="whitespace-nowrap text-humo">{c.alterno_rol || "—"}</Td>
                    <Td className="whitespace-nowrap text-humo">{c.respaldo_rol || "—"}</Td>
                    <Td className="whitespace-nowrap"><CeldaRitmo c={c} /></Td>
                    <Td className="min-w-[200px] text-humo">{c.siguiente_accion || "—"}</Td>
                    <Td className="whitespace-nowrap text-humo">{c.apoyos || "—"}</Td>
                    <Td className="whitespace-nowrap text-humo">{c.escalamiento || "—"}</Td>
                    <Td className="whitespace-nowrap">
                      <div className="flex flex-wrap gap-1">
                        {c.salidas.split(",").map((s) => s.trim()).filter(Boolean).map((s) => (
                          <Chip key={s} className="bg-nube text-humo">{s}</Chip>
                        ))}
                      </div>
                    </Td>
                    {puedeEditar && (
                      <Td className="text-center">
                        <button
                          onClick={() => setAcciones(c)}
                          aria-label="Acciones"
                          className="rounded-md px-2 py-0.5 text-lg leading-none text-humo hover:bg-nube"
                        >⋮</button>
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-[11px] text-humo">Respaldo: si el rol está vacío, la tarea cae en el director del área. Desliza la tabla de lado para ver todas las columnas.</p>

          {/* ARCHIVADOS (colapsable) */}
          {archivados.length > 0 && (
            <div className="mt-4">
              <button onClick={() => setMostrarArch((v) => !v)} className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-humo hover:text-tinta">
                🗄️ Archivados ({archivados.length}) {mostrarArch ? "▾" : "▸"}
              </button>
              {mostrarArch && (
                <div className="mt-2 overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
                  {archivados.map((c) => (
                    <div key={c.codigo} className="flex items-center justify-between gap-2 border-b border-black/5 px-3 py-2.5 last:border-b-0">
                      <div className="flex items-center gap-2.5">
                        <Chip className={tonoDeCodigo(c.codigo)}>{c.codigo}</Chip>
                        <span className="text-sm font-medium text-tinta">{c.nombre}</span>
                      </div>
                      {puedeEditar && (
                        <button onClick={() => archivar(c, false)} className="shrink-0 rounded-lg border border-teal/30 px-2.5 py-1 text-[11px] font-semibold text-teal-dark hover:bg-teal-soft">Desarchivar</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      </>
      )}

      {/* MENÚ DE ACCIONES (Editar / Archivar) */}
      {acciones && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-tinta/40 p-4" onClick={() => setAcciones(null)}>
          <div className="w-full max-w-xs rounded-2xl bg-white p-3 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="truncate px-2 py-1.5 text-sm font-semibold text-tinta">{acciones.codigo} · {acciones.nombre}</p>
            <button onClick={() => { setEditando(acciones); setAcciones(null); }} className="w-full rounded-lg px-3 py-2.5 text-left text-sm text-tinta hover:bg-nube">✏️ Editar</button>
            <button onClick={() => { archivar(acciones, true); setAcciones(null); }} className="w-full rounded-lg px-3 py-2.5 text-left text-sm text-tinta hover:bg-nube">🗄️ Archivar</button>
            <button onClick={() => setAcciones(null)} className="mt-1 w-full rounded-lg px-3 py-2 text-sm text-humo hover:bg-nube">Cerrar</button>
          </div>
        </div>
      )}

      {editando && (
        <Editor
          inicial={editando}
          codigos={items.map((i) => i.codigo)}
          onCerrar={() => setEditando(null)}
          onGuardado={(c) => { setItems((prev) => prev.map((x) => (x.codigo === c.codigo ? c : x))); setEditando(null); }}
        />
      )}

      {creando && (
        <Editor
          inicial={NUEVO_CODIGO}
          esNuevo
          codigos={items.map((i) => i.codigo)}
          onCerrar={() => setCreando(false)}
          onGuardado={(c) => { setItems((prev) => [...prev, c]); setCreando(false); }}
        />
      )}
    </div>
  );
}
