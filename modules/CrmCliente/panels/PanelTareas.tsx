// Pestaña "Tareas" del expediente: tareas/llamadas/citas asignadas al cliente.
// (Extraído de CrmCliente.tsx para dividir los módulos por archivo.)
import { useState, useEffect } from "react";
import { type Cliente } from "../../../data/clientes";
import { puedeAccion } from "../../../data/roles";
import { fetchTareasCliente, marcarTarea, agregarTarea, type Tarea, type EstadoTarea, type TipoTarea } from "../../../data/tareas";
import { avisarEventoA } from "../../../data/avisarEvento";
import { fetchColaboradores, type Colaborador } from "../../../data/colaboradores";
import { listarColaboradoresJF, plataformaDeArea } from "../../../lib/justiciaFacil";
import { useMiRol, fechaCorta, ICONO_TAREA } from "../_compartido";

export default function PanelTareas({ cliente }: { cliente: Cliente }) {
  const miRol = useMiRol();
  const [lista, setLista] = useState<Tarea[] | null>(null);
  const [error, setError] = useState(false);
  const [colab, setColab] = useState<Colaborador[]>([]);
  const [abrirForm, setAbrirForm] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [tipo, setTipo] = useState<TipoTarea>("tarea");
  const [titulo, setTitulo] = useState("");
  const [detalle, setDetalle] = useState("");
  const [fecha, setFecha] = useState("");
  const [asignar, setAsignar] = useState("");
  const [expediente, setExpediente] = useState("");

  function cargar() {
    fetchTareasCliente(String(cliente.id)).then((t) => setLista(t)).catch(() => setError(true));
  }
  useEffect(() => {
    let vivo = true;
    fetchTareasCliente(String(cliente.id)).then((t) => { if (vivo) setLista(t); }).catch(() => { if (vivo) setError(true); });
    Promise.all([fetchColaboradores(), listarColaboradoresJF()]).then(([jc, jf]) => {
      if (!vivo) return;
      const porCorreo = new Map<string, Colaborador>();
      for (const c of jc) if (c.correo) porCorreo.set(c.correo.trim().toLowerCase(), c);
      for (const c of jf) {
        const k = c.correo.trim().toLowerCase();
        if (!porCorreo.has(k)) {
          porCorreo.set(k, {
            id: "jf-" + k, nombre: c.nombre, puesto: c.rol || null, area: "juridico",
            extension: null, telefono: null, whatsapp: null, correo: c.correo, foto_url: null,
            numero_oficial: null, rol_sistema: null, rol_telefonia: null, activo: true, orden: 999,
            created_at: new Date().toISOString(),
          } as Colaborador);
        }
      }
      setColab(Array.from(porCorreo.values()).sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "")));
    }).catch(() => {});
    return () => { vivo = false; };
  }, [cliente.id]);

  async function toggle(t: Tarea) {
    if (!puedeAccion(miRol, "gestionar_tareas")) { alert("No tienes permiso para gestionar tareas."); return; }
    const nuevo: EstadoTarea = t.estado === "hecha" ? "pendiente" : "hecha";
    setLista((prev) => (prev ? prev.map((x) => (x.id === t.id ? { ...x, estado: nuevo } : x)) : prev));
    const r = await marcarTarea(t.id, nuevo);
    if (!r.ok) setLista((prev) => (prev ? prev.map((x) => (x.id === t.id ? { ...x, estado: t.estado } : x)) : prev));
  }

  async function crear() {
    if (!puedeAccion(miRol, "gestionar_tareas")) { alert("No tienes permiso para gestionar tareas."); return; }
    if (!titulo.trim() || !asignar || guardando) return;
    setGuardando(true);
    const c = colab.find((x) => x.correo === asignar);
    const r = await agregarTarea({
      autorEmail: asignar,
      autorNombre: c?.nombre || undefined,
      tipo, titulo: titulo.trim(),
      detalle: detalle.trim() || undefined,
      fecha: fecha || null,
      aQuien: c?.nombre || undefined,
      clienteId: String(cliente.id),
      clienteNombre: cliente.nombre,
      expediente: expediente.trim() || undefined,
    });
    setGuardando(false);
    if (r.ok) {
      // Campanita SOLO para la persona asignada.
      avisarEventoA(asignar, {
        tipo: "tarea",
        titulo: `Nueva tarea: ${titulo.trim()}`,
        detalle: `Cliente: ${cliente.nombre}`,
        modulo: "clientes",
        refId: String(cliente.id),
        icono: ICONO_TAREA[tipo] || "✅",
      });
      setTitulo(""); setDetalle(""); setFecha(""); setExpediente(""); setAbrirForm(false); cargar();
    }
    else alert("No se pudo crear la tarea: " + (r.error || ""));
  }

  if (error) return <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-10 text-center text-amber-800">No se pudieron cargar las tareas.</div>;

  const pend = (lista || []).filter((t) => t.estado !== "hecha").length;
  const total = (lista || []).length;
  return (
    <div className="space-y-3">
      {/* Barra superior */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-teal-soft px-2.5 py-0.5 font-semibold text-teal-dark">{total} tarea{total === 1 ? "" : "s"}</span>
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 font-semibold text-amber-700">{pend} pendiente{pend === 1 ? "" : "s"}</span>
        </div>
        {puedeAccion(miRol, "gestionar_tareas") && <button onClick={() => setAbrirForm((v) => !v)} className="rounded-lg bg-teal px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-teal-dark">{abrirForm ? "✕ Cancelar" : "➕ Nueva tarea"}</button>}
      </div>

      {/* Formulario crear / asignar */}
      {abrirForm && (
        <div className="space-y-2 rounded-2xl border border-black/5 bg-white p-3 shadow-sm">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoTarea)} className="rounded-lg border border-black/10 px-2 py-1.5 text-sm outline-none focus:border-teal">
              <option value="tarea">✅ Tarea</option>
              <option value="llamada">📞 Llamada</option>
              <option value="correo">✉️ Correo</option>
              <option value="cita">📅 Cita</option>
            </select>
            <select value={asignar} onChange={(e) => setAsignar(e.target.value)} className="rounded-lg border border-black/10 px-2 py-1.5 text-sm outline-none focus:border-teal">
              <option value="">Asignar a…</option>
              {colab.filter((c) => c.correo).map((c) => <option key={c.correo!} value={c.correo!}>{c.nombre} — {plataformaDeArea(c.area)}</option>)}
            </select>
          </div>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título de la tarea" className="w-full rounded-lg border border-black/10 px-2 py-1.5 text-sm outline-none focus:border-teal" />
          <input value={expediente} onChange={(e) => setExpediente(e.target.value)} placeholder="Expediente / garantía (ej. 812/2024 - Roncesvalles) — solo si el cliente tiene más de una" className="w-full rounded-lg border border-black/10 px-2 py-1.5 text-sm outline-none focus:border-teal" />
          <textarea value={detalle} onChange={(e) => setDetalle(e.target.value)} rows={2} placeholder="Detalle (opcional)" className="w-full resize-none rounded-lg border border-black/10 px-2 py-1.5 text-sm outline-none focus:border-teal" />
          <div className="flex items-center gap-2">
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="rounded-lg border border-black/10 px-2 py-1.5 text-sm outline-none focus:border-teal" />
            <button onClick={crear} disabled={!titulo.trim() || !asignar || guardando} className="ml-auto rounded-lg bg-teal px-4 py-1.5 text-sm font-semibold text-white hover:bg-teal-dark disabled:opacity-50">{guardando ? "Guardando…" : "Crear tarea"}</button>
          </div>
        </div>
      )}

      {/* Lista */}
      {lista === null ? (
        <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-10 text-center text-humo">Cargando tareas…</div>
      ) : lista.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-10 text-center text-humo">Este cliente no tiene tareas. Crea la primera. 👆</div>
      ) : (
        lista.map((t) => (
          <div key={t.id} className={"rounded-2xl border border-black/5 p-3.5 shadow-sm " + (t.estado === "hecha" ? "bg-nube/40" : "bg-white")}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={"text-sm font-semibold " + (t.estado === "hecha" ? "text-humo line-through" : "text-tinta")}>{ICONO_TAREA[t.tipo] || "✅"} {t.titulo}</span>
                  {t.expediente && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700">📁 {t.expediente}</span>}
                  {t.fecha && <span className="text-xs text-humo">📅 {fechaCorta(t.fecha)}</span>}
                  {t.estado === "hecha"
                    ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[13px] font-semibold text-emerald-700">Hecha</span>
                    : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[13px] font-semibold text-amber-700">Pendiente</span>}
                </div>
                {t.detalle && <p className="mt-1 whitespace-pre-wrap text-[14px] text-tinta">{t.detalle}</p>}
                {(t.autorNombre || t.aQuien) && <p className="mt-1 text-[13px] text-humo">{t.autorNombre ? "Para " + t.autorNombre : ""}</p>}
              </div>
              <button onClick={() => toggle(t)} className={"shrink-0 rounded-lg border px-2.5 py-1 text-[13px] font-semibold " + (t.estado === "hecha" ? "border-black/10 text-humo hover:bg-nube" : "border-teal/30 text-teal-dark hover:bg-teal-soft")}>
                {t.estado === "hecha" ? "↩ Reabrir" : "✓ Marcar hecha"}
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
