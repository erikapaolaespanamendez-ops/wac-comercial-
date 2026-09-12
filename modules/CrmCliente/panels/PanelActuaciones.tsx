// Pestaña "Actuaciones" del expediente: juicio (exhorto/amparo) + actuaciones
// jurídicas y boletines semanales.
// (Extraído de CrmCliente.tsx para dividir los módulos por archivo.)
import { useState, useEffect } from "react";
import { type Cliente } from "../../../data/clientes";
import { puedeAccion } from "../../../data/roles";
import { fetchJuicio, guardarJuicio, JUICIO_VACIO, TIPOS_JUICIO, type JuicioCliente } from "../../../data/juicioCliente";
import { fetchActuaciones, agregarActuacion, borrarActuacion, type Actuacion, type TipoActuacion } from "../../../data/actuaciones";
import { generarExpediente } from "../../../data/expediente";
import { subirArchivoDrive } from "../../../data/expedienteDocs";
import { useMiRol, fechaCorta, SegmentoSiNo } from "../_compartido";
import VistaPreviaDoc from "../VistaPreviaDoc";

function leerBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] || "");
    r.onerror = () => rej(new Error("No se pudo leer " + file.name));
    r.readAsDataURL(file);
  });
}

function BloqueJuicio({ cliente }: { cliente: Cliente }) {
  const miRol = useMiRol();
  const [j, setJ] = useState<JuicioCliente>(JUICIO_VACIO);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetchJuicio(String(cliente.id))
      .then((r) => { if (vivo) { setJ(r || JUICIO_VACIO); setCargando(false); } })
      .catch(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [cliente.id]);

  function set<K extends keyof JuicioCliente>(k: K, v: JuicioCliente[K]) {
    setJ((p) => ({ ...p, [k]: v }));
    setMsg(null);
  }

  async function guardar() {
    if (!puedeAccion(miRol, "gestionar_juicio")) { alert("No tienes permiso para esto."); return; }
    setGuardando(true); setMsg(null);
    const ok = await guardarJuicio(String(cliente.id), j);
    setGuardando(false);
    setMsg(ok ? "✓ Datos del juicio guardados." : "No se pudieron guardar. Reintenta.");
  }

  const inputCls = "mt-0.5 w-full rounded-lg border border-black/10 px-2.5 py-1.5 text-sm outline-none focus:border-teal";
  const lblCls = "block text-[13px] font-semibold text-humo";

  return (
    <div className="rounded-2xl border border-teal/20 bg-white p-3.5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="text-base">📑</span>
        <h3 className="font-display text-sm font-extrabold text-tinta">Datos del juicio</h3>
      </div>

      {/* Reflejado de la ficha (solo lectura) */}
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl bg-nube/50 px-3 py-2">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-humo">Dirección de la garantía</p>
          <p className="text-[13px] text-tinta">{cliente.direccionGarantia || "—"}</p>
        </div>
        <div className="rounded-xl bg-nube/50 px-3 py-2">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-humo">Número de crédito</p>
          <p className="text-[13px] text-tinta">{cliente.creditoSiga || "—"}</p>
        </div>
        <div className="rounded-xl bg-nube/50 px-3 py-2">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-humo">Área · Sucursal</p>
          <p className="text-[13px] text-tinta">{cliente.area || "—"}{cliente.sucursal ? ` · ${cliente.sucursal}` : ""}</p>
        </div>
      </div>
      <p className="mt-1 text-[12px] text-humo">Estos tres se reflejan desde la ficha del cliente.</p>

      {cargando ? (
        <p className="mt-3 text-[13px] text-humo">Cargando datos del juicio…</p>
      ) : (
        <>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            <label className={lblCls}>Número de expediente
              <input value={j.numExpediente} onChange={(e) => set("numExpediente", e.target.value)} className={inputCls} placeholder="Ej. 82/2026" />
            </label>
            <label className={lblCls}>Juzgado
              <input value={j.juzgado} onChange={(e) => set("juzgado", e.target.value)} className={inputCls} placeholder="Ej. Juzgado Primero Civil" />
            </label>
            <label className={lblCls}>Jurisdicción
              <input value={j.jurisdiccion} onChange={(e) => set("jurisdiccion", e.target.value)} className={inputCls} placeholder="Ej. Tlajomulco, Jalisco" />
            </label>
            <label className={lblCls}>Ciudad
              <input value={j.ciudad} onChange={(e) => set("ciudad", e.target.value)} className={inputCls} placeholder="Ciudad del juzgado / garantía" />
            </label>
            <label className={lblCls + " sm:col-span-2"}>Tipo de juicio
              <select value={j.tipoJuicio} onChange={(e) => set("tipoJuicio", e.target.value)} className={inputCls}>
                <option value="">— Selecciona —</option>
                {TIPOS_JUICIO.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          </div>

          {/* Exhorto */}
          <div className="mt-3 rounded-xl border border-black/10 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-tinta">¿Existe exhorto?</span>
              <SegmentoSiNo valor={j.exhorto} onCambio={(v: boolean) => set("exhorto", v)} />
            </div>
            {j.exhorto && (
              <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
                <label className={lblCls}>Número de exhorto
                  <input value={j.exhortoNumero} onChange={(e) => set("exhortoNumero", e.target.value)} className={inputCls} />
                </label>
                <label className={lblCls}>Juzgado del exhorto
                  <input value={j.exhortoJuzgado} onChange={(e) => set("exhortoJuzgado", e.target.value)} className={inputCls} />
                </label>
              </div>
            )}
          </div>

          {/* Amparo / apelación */}
          <div className="mt-2 rounded-xl border border-black/10 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-tinta">¿Tiene amparo o apelación?</span>
              <SegmentoSiNo valor={j.amparo} onCambio={(v: boolean) => set("amparo", v)} />
            </div>
            {j.amparo && (
              <label className={lblCls + " mt-2 block"}>Número de toca o radicado
                <input value={j.amparoNumero} onChange={(e) => set("amparoNumero", e.target.value)} className={inputCls} />
              </label>
            )}
          </div>

          {msg && <p className={"mt-2 rounded-lg px-3 py-1.5 text-[13px] " + (msg.startsWith("✓") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>{msg}</p>}

          <button onClick={guardar} disabled={guardando} className="mt-3 w-full rounded-lg bg-teal px-3 py-2 text-sm font-semibold text-white hover:bg-teal-dark disabled:opacity-50">{guardando ? "Guardando…" : "Guardar datos del juicio"}</button>
        </>
      )}
    </div>
  );
}

export default function PanelActuaciones({ cliente }: { cliente: Cliente }) {
  const miRol = useMiRol();
  const puedeAct = puedeAccion(miRol, "gestionar_actuaciones");
  const [lista, setLista] = useState<Actuacion[] | null>(null);
  const [error, setError] = useState(false);
  const yo = (() => { try { return JSON.parse(localStorage.getItem("chat_yo") || "null"); } catch { return null; } })();
  const autor: string | null = yo?.nombre || null;

  useEffect(() => {
    let vivo = true;
    fetchActuaciones(String(cliente.id))
      .then((r) => { if (vivo) setLista(r); })
      .catch(() => { if (vivo) setError(true); });
    return () => { vivo = false; };
  }, [cliente.id]);

  async function agregar(tipo: TipoActuacion, fecha: string, titulo: string, detalle: string, respaldo?: { url: string; nombre: string } | null) {
    const r = await agregarActuacion({ clienteId: String(cliente.id), tipo, fecha, titulo, detalle, autor, respaldo });
    if (r) setLista((prev) => [r, ...(prev || [])]);
  }
  async function borrar(id: string) {
    const ok = await borrarActuacion(id);
    if (ok) setLista((prev) => (prev || []).filter((x) => x.id !== id));
  }

  if (error) return <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-10 text-center text-amber-800">No se pudo cargar el seguimiento jurídico.</div>;
  if (lista === null) return <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-10 text-center text-humo">Cargando seguimiento…</div>;

  const boletines = lista.filter((x) => x.tipo === "boletin");
  const actuaciones = lista.filter((x) => x.tipo === "actuacion");

  return (
    <div className="space-y-4">
      <BloqueJuicio cliente={cliente} />
      <SeccionActuacion
        tipo="boletin" icono="📰" titulo="Boletines judiciales (semanal)"
        ayuda="Revisión semanal del Boletín del juzgado: si hubo o no movimiento y qué dice."
        placeholder="Ej. Sin movimiento esta semana / Acuerdo publicado…"
        items={boletines} puede={puedeAct} onAgregar={agregar} onBorrar={borrar} />
      <TablaActuaciones cliente={cliente} items={actuaciones} puede={puedeAct} onAgregar={agregar} onBorrar={borrar} />
    </div>
  );
}

// Tabla estilo Excel para las actuaciones del expediente (con documento de respaldo opcional).
function TablaActuaciones({ cliente, items, puede, onAgregar, onBorrar }: {
  cliente: Cliente; items: Actuacion[]; puede: boolean;
  onAgregar: (tipo: TipoActuacion, fecha: string, titulo: string, detalle: string, respaldo?: { url: string; nombre: string } | null) => Promise<void>;
  onBorrar: (id: string) => Promise<void>;
}) {
  const hoy = new Date().toISOString().slice(0, 10);
  const [fecha, setFecha] = useState(hoy);
  const [titu, setTitu] = useState("");
  const [detalle, setDetalle] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [paso, setPaso] = useState("");

  async function agregarFila() {
    if (!titu.trim()) return;
    setGuardando(true);
    let respaldo: { url: string; nombre: string } | null = null;
    try {
      if (archivo) {
        setPaso("Subiendo respaldo…");
        let carpetaId = (cliente.carpetaDriveId || "").trim();
        if (!carpetaId) {
          const exp = await generarExpediente(cliente);
          if (!exp.ok || !exp.carpetaId) throw new Error("No se pudo abrir la carpeta de Drive.");
          carpetaId = exp.carpetaId;
        }
        const base64 = await leerBase64(archivo);
        const up = await subirArchivoDrive({ carpetaId, nombre: archivo.name, base64, subcarpeta: "Actuaciones", mime: archivo.type, publico: true });
        if (!up.ok || !up.link) throw new Error("Falló la subida del respaldo.");
        respaldo = { url: up.link, nombre: up.nombre || archivo.name };
      }
      await onAgregar("actuacion", fecha, titu.trim(), detalle.trim(), respaldo);
      setTitu(""); setDetalle(""); setArchivo(null); setFecha(hoy);
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo agregar.");
    } finally {
      setGuardando(false); setPaso("");
    }
  }

  const cellCls = "border border-black/10 px-2 py-1 align-top text-[13px]";
  const inCls = "w-full rounded-md border border-black/10 px-2 py-1 text-[13px] outline-none focus:border-teal";

  return (
    <div className="rounded-2xl border border-black/5 bg-white p-3.5 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-base">⚖️</span>
        <h3 className="font-display text-sm font-extrabold text-tinta">Actuaciones jurídicas</h3>
        <span className="rounded-full bg-nube px-2 py-0.5 text-[13px] font-semibold text-humo">{items.length}</span>
      </div>
      <p className="mb-2 text-[13px] text-humo">Movimientos del expediente, en tabla. El documento de respaldo es opcional.</p>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-nube/60 text-left text-[12px] font-semibold text-humo">
              <th className={cellCls} style={{ width: 110 }}>Fecha</th>
              <th className={cellCls}>Actuación</th>
              <th className={cellCls}>Detalle</th>
              <th className={cellCls} style={{ width: 120 }}>Respaldo</th>
              {puede && <th className={cellCls} style={{ width: 40 }}></th>}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td className={cellCls + " text-center text-humo"} colSpan={puede ? 5 : 4}>Aún no hay actuaciones.</td></tr>
            )}
            {items.map((it) => (
              <tr key={it.id}>
                <td className={cellCls + " whitespace-nowrap text-tinta"}>{fechaCorta(it.fecha)}</td>
                <td className={cellCls + " text-tinta"}>
                  <span className="font-semibold">{it.titulo}</span>
                  {it.autor && <span className="block text-[11px] text-humo">{it.autor}</span>}
                </td>
                <td className={cellCls + " whitespace-pre-wrap text-tinta"}>{it.detalle || "—"}</td>
                <td className={cellCls}>
                  {it.respaldo?.url
                    ? <VistaPreviaDoc url={it.respaldo.url} nombre={it.respaldo.nombre} etiqueta="👁️ Ver" />
                    : <span className="text-[12px] text-humo">—</span>}
                </td>
                {puede && <td className={cellCls + " text-center"}><button onClick={() => onBorrar(it.id)} className="rounded px-1 text-humo hover:text-red-600" aria-label="Borrar">🗑️</button></td>}
              </tr>
            ))}

            {puede && (
              <tr className="bg-teal-soft/20">
                <td className={cellCls}><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inCls} /></td>
                <td className={cellCls}><input value={titu} onChange={(e) => setTitu(e.target.value)} placeholder="Ej. Se presentó promoción…" className={inCls} /></td>
                <td className={cellCls}><input value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="Detalle (opcional)" className={inCls} /></td>
                <td className={cellCls}>
                  <input type="file" onChange={(e) => setArchivo(e.target.files?.[0] || null)} className="w-full text-[11px] file:mr-1 file:rounded file:border-0 file:bg-teal-soft file:px-1.5 file:py-0.5 file:text-[11px] file:font-semibold file:text-teal-dark" />
                  {archivo && <span className="mt-0.5 block truncate text-[10px] text-humo">{archivo.name}</span>}
                </td>
                <td className={cellCls + " text-center"}>
                  <button onClick={agregarFila} disabled={guardando || !titu.trim()} className="rounded-md bg-teal px-2 py-1 text-[12px] font-semibold text-white hover:bg-teal-dark disabled:opacity-50" aria-label="Agregar">➕</button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {paso && <p className="mt-1.5 text-[12px] text-teal-dark">{paso}</p>}
    </div>
  );
}

function SeccionActuacion({ tipo, icono, titulo, ayuda, placeholder, items, puede, onAgregar, onBorrar }: {
  tipo: TipoActuacion; icono: string; titulo: string; ayuda: string; placeholder: string;
  items: Actuacion[]; puede: boolean;
  onAgregar: (tipo: TipoActuacion, fecha: string, titulo: string, detalle: string) => Promise<void>;
  onBorrar: (id: string) => Promise<void>;
}) {
  const hoy = new Date().toISOString().slice(0, 10);
  const [fecha, setFecha] = useState(hoy);
  const [titu, setTitu] = useState("");
  const [detalle, setDetalle] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (!titu.trim()) return;
    setGuardando(true);
    await onAgregar(tipo, fecha, titu.trim(), detalle.trim());
    setGuardando(false);
    setTitu(""); setDetalle(""); setFecha(hoy); setAbierto(false);
  }

  return (
    <div className="rounded-2xl border border-black/5 bg-white p-3.5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-base">{icono}</span>
          <h3 className="font-display text-sm font-extrabold text-tinta">{titulo}</h3>
          <span className="rounded-full bg-nube px-2 py-0.5 text-[13px] font-semibold text-humo">{items.length}</span>
        </div>
        {puede && <button onClick={() => setAbierto((v) => !v)} className="shrink-0 rounded-lg bg-teal px-2.5 py-1 text-[13px] font-semibold text-white hover:bg-teal-dark">{abierto ? "Cancelar" : "➕ Agregar"}</button>}
      </div>
      <p className="mt-1 text-[13px] text-humo">{ayuda}</p>

      {abierto && (
        <div className="mt-3 space-y-2 rounded-xl bg-nube/40 p-3">
          <label className="block text-[13px] font-semibold text-humo">Fecha
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
              className="mt-0.5 block rounded-lg border border-black/10 px-2 py-1 text-sm outline-none focus:border-teal" />
          </label>
          <input value={titu} onChange={(e) => setTitu(e.target.value)} placeholder={placeholder}
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-teal" />
          <textarea value={detalle} onChange={(e) => setDetalle(e.target.value)} rows={3} placeholder="Detalle (opcional)"
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-teal" />
          <button onClick={guardar} disabled={guardando || !titu.trim()}
            className="w-full rounded-lg bg-teal px-3 py-2 text-sm font-semibold text-white hover:bg-teal-dark disabled:opacity-50">{guardando ? "Guardando…" : "Guardar"}</button>
        </div>
      )}

      <div className="mt-3 space-y-2">
        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-black/10 px-3 py-4 text-center text-[13px] text-humo">Aún no hay registros.</p>
        ) : items.map((it) => (
          <div key={it.id} className="rounded-xl border border-black/5 bg-humo/5 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-tinta">{it.titulo}</p>
                <p className="text-[13px] text-humo">{fechaCorta(it.fecha)}{it.autor ? ` · ${it.autor}` : ""}</p>
              </div>
              {puede && <button onClick={() => onBorrar(it.id)} className="shrink-0 rounded-lg px-2 py-1 text-[13px] text-humo hover:bg-red-50 hover:text-red-600" aria-label="Borrar">🗑️</button>}
            </div>
            {it.detalle && <p className="mt-1 whitespace-pre-wrap text-[13px] text-tinta">{it.detalle}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
