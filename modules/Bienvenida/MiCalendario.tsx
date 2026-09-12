// ===================================================================
// Calendario  →  src/modules/Bienvenida/MiCalendario.tsx
// Vista de MES (estilo Google/Drive). Caen: citas, correos, llamadas,
// tareas y los SEGUIMIENTOS (el día que toca cada cliente).
// Jerarquía: emails/nombres = de quién se ven (null = TODOS).
// ===================================================================
import { useEffect, useMemo, useState } from "react";
import { fetchTareasVisibles, agregarTarea, type Tarea, type TipoTarea } from "../../data/tareas";
import { fetchSeguimiento } from "../../data/seguimiento";
import { fetchColaboradores, type Colaborador } from "../../data/colaboradores";
import { avisarEventoA } from "../../data/avisarEvento";
import { supabase } from "../../lib/supabase";
import { listarColaboradoresJF, plataformaDeArea } from "../../lib/justiciaFacil";

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const COLOR_TIPO: Record<TipoTarea, string> = {
  cita: "bg-teal-500",
  correo: "bg-amber-500",
  llamada: "bg-sky-500",
  tarea: "bg-emerald-500",
};
const ETIQUETA_TIPO: Record<TipoTarea, string> = { cita: "🗓 Cita", correo: "✉ Correo", llamada: "📞 Llamada", tarea: "✅ Tarea" };

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type EvSeg = { tipo: "seguimiento"; nombre: string; codigo: string; estado: string; quien: string };
type EvTarea = { tipo: "tarea"; tarea: Tarea };
type Ev = EvSeg | EvTarea;

export default function MiCalendario({ emails, nombres, miCorreo, miNombre }: { emails: string[] | null; nombres: string[] | null; miCorreo?: string | null; miNombre?: string | null }) {
  const [ref, setRef] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  const [sel, setSel] = useState<string | null>(() => ymd(new Date()));
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [segPorDia, setSegPorDia] = useState<Map<string, EvSeg[]>>(new Map());
  const [cargando, setCargando] = useState(true);
  const [pagPend, setPagPend] = useState(0);        // pendientes del día: 3 por página
  const POR_PEND = 3;
  useEffect(() => { setPagPend(0); }, [sel]);        // al cambiar de día, vuelve a la página 1
  const [recargaTick, setRecargaTick] = useState(0);  // se sube para forzar recargar tras crear una tarea

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      const ts = await fetchTareasVisibles(emails);
      const segMap = new Map<string, EvSeg[]>();
      try {
        const lista = await fetchSeguimiento();
        const setN = nombres ? new Set(nombres.map((n) => n.trim().toLowerCase())) : null;
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        for (const s of lista) {
          const asesor = (s.cliente.asesorAsignado || "").trim();
          if (setN && !setN.has(asesor.toLowerCase())) continue;
          if (s.diasLimite == null) continue;
          const restante = s.diasDesdeCiclo != null ? s.diasLimite - s.diasDesdeCiclo : 0;
          const due = new Date(hoy); due.setDate(due.getDate() + restante);
          const k = ymd(due);
          const arr = segMap.get(k) || [];
          arr.push({ tipo: "seguimiento", nombre: s.cliente.nombre, codigo: s.cliente.codigo, estado: s.estado, quien: asesor });
          segMap.set(k, arr);
        }
      } catch {}
      if (!vivo) return;
      setTareas(ts);
      setSegPorDia(segMap);
      setCargando(false);
    })();
    return () => { vivo = false; };
  }, [JSON.stringify(emails), JSON.stringify(nombres), recargaTick]);

  // ---- Nuevo (tarea/cita/llamada/correo) — botón "+ Nuevo" y clic en un día ----
  const [nuevo, setNuevo] = useState<{ fecha: string } | null>(null);

  const tareasPorDia = useMemo(() => {
    const m = new Map<string, Tarea[]>();
    for (const t of tareas) {
      if (!t.fecha) continue;
      const d = new Date(t.fecha);
      if (isNaN(d.getTime())) continue;
      const k = ymd(d);
      const arr = m.get(k) || [];
      arr.push(t);
      m.set(k, arr);
    }
    return m;
  }, [tareas]);

  const celdas = useMemo(() => {
    const primero = new Date(ref);
    const inicioSemana = primero.getDay();
    const arr: { fecha: Date; key: string; mesActual: boolean }[] = [];
    const start = new Date(primero);
    start.setDate(1 - inicioSemana);
    for (let i = 0; i < 42; i++) {
      const f = new Date(start);
      f.setDate(start.getDate() + i);
      arr.push({ fecha: f, key: ymd(f), mesActual: f.getMonth() === ref.getMonth() });
    }
    return arr;
  }, [ref]);

  const hoyKey = ymd(new Date());
  const muestraQuien = emails === null || (emails && emails.length > 1);
  const evDia = (k: string): Ev[] => [
    ...(segPorDia.get(k) || []),
    ...((tareasPorDia.get(k) || []).map((t) => ({ tipo: "tarea", tarea: t } as EvTarea))),
  ];
  const evSel = sel ? evDia(sel) : [];
  const totalPend = Math.max(1, Math.ceil(evSel.length / POR_PEND));
  const pagPendSeg = Math.min(pagPend, totalPend - 1);
  const desdePend = pagPendSeg * POR_PEND;
  const evSelPag = evSel.slice(desdePend, desdePend + POR_PEND);

  function cambiarMes(delta: number) { const d = new Date(ref); d.setMonth(d.getMonth() + delta); setRef(d); }
  function irHoy() { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); setRef(d); setSel(ymd(new Date())); }

  return (
    <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-base font-extrabold capitalize text-tinta">{MESES[ref.getMonth()]} {ref.getFullYear()}</h3>
        <div className="flex items-center gap-1">
          <button onClick={() => cambiarMes(-1)} className="rounded-lg border border-black/10 px-2 py-1 text-sm text-humo hover:bg-nube">‹</button>
          <button onClick={irHoy} className="rounded-lg border border-black/10 px-2.5 py-1 text-xs font-semibold text-teal-dark hover:bg-teal-soft">Hoy</button>
          <button onClick={() => cambiarMes(1)} className="rounded-lg border border-black/10 px-2 py-1 text-sm text-humo hover:bg-nube">›</button>
          <button onClick={() => setNuevo({ fecha: sel || ymd(new Date()) })} className="ml-1 rounded-lg bg-teal px-2.5 py-1 text-xs font-semibold text-white hover:bg-teal-dark">➕ Nuevo</button>
        </div>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-humo">
        {DIAS.map((d) => <div key={d}>{d}</div>)}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {celdas.map((c) => {
          const evs = evDia(c.key);
          const tipos = new Set<string>();
          for (const e of evs) tipos.add(e.tipo === "tarea" ? e.tarea.tipo : "seguimiento");
          const esHoy = c.key === hoyKey;
          const esSel = c.key === sel;
          return (
            <button key={c.key} onClick={() => setSel(c.key)}
              className={"flex min-h-[44px] flex-col items-center rounded-lg border p-1 text-xs transition " +
                (esSel ? "border-teal bg-teal-soft" : "border-transparent hover:bg-nube") +
                (c.mesActual ? "" : " opacity-40")}>
              <span className={"flex h-6 w-6 items-center justify-center rounded-full text-[12px] " +
                (esHoy ? "bg-teal font-bold text-white" : "font-medium text-tinta")}>{c.fecha.getDate()}</span>
              {evs.length > 0 && (
                <span className="mt-0.5 flex flex-wrap items-center justify-center gap-0.5">
                  {[...tipos].slice(0, 4).map((t) => (
                    <span key={t} className={"h-1.5 w-1.5 rounded-full " + (t === "seguimiento" ? "bg-red-500" : COLOR_TIPO[t as TipoTarea])} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-humo">
        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Seguimiento</span>
        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-teal-500" /> Cita</span>
        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-sky-500" /> Llamada</span>
        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Correo</span>
        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Tarea</span>
      </div>

      {sel && (
        <div className="mt-3 border-t border-black/5 pt-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-humo">
              {new Date(sel + "T12:00:00").toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}
            </p>
            <button onClick={() => setNuevo({ fecha: sel })} className="rounded-md border border-teal/30 px-2 py-0.5 text-[11px] font-semibold text-teal-dark hover:bg-teal-soft">➕ Agregar aquí</button>
          </div>
          {cargando ? (
            <p className="py-2 text-sm text-humo">Cargando…</p>
          ) : evSel.length === 0 ? (
            <p className="py-2 text-sm text-humo">Nada agendado este día.</p>
          ) : (
            <div className="space-y-1.5">
              {evSelPag.map((e, i) => e.tipo === "seguimiento" ? (
                <div key={"s" + (desdePend + i)} className="flex flex-wrap items-center gap-2 rounded-xl border border-black/5 bg-white px-2.5 py-2 text-[12.5px]">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  <span className="font-semibold text-tinta">Seguimiento: {e.nombre}</span>
                  <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">{e.codigo}</span>
                  {muestraQuien && e.quien && <span className="text-[10px] text-humo">· {e.quien}</span>}
                </div>
              ) : (
                <div key={"t" + (desdePend + i)} className="flex flex-wrap items-center gap-2 rounded-xl border border-black/5 bg-white px-2.5 py-2 text-[12.5px]">
                  <span className={"h-1.5 w-1.5 rounded-full " + COLOR_TIPO[e.tarea.tipo]} />
                  <span className="font-semibold text-tinta">{ETIQUETA_TIPO[e.tarea.tipo]}: {e.tarea.titulo}</span>
                  {e.tarea.aQuien && <span className="text-humo">· {e.tarea.aQuien}</span>}
                  {muestraQuien && e.tarea.autorNombre && <span className="text-[10px] text-humo">· de {e.tarea.autorNombre}</span>}
                </div>
              ))}
              {evSel.length > POR_PEND && (
                <div className="mt-1 flex items-center justify-center gap-2 text-[11px]">
                  <button disabled={pagPendSeg <= 0} onClick={() => setPagPend(pagPendSeg - 1)} className="rounded-md border border-black/10 px-2 py-0.5 font-semibold text-tinta hover:bg-nube disabled:opacity-40">← Anterior</button>
                  <span className="text-humo">{pagPendSeg + 1} / {totalPend}</span>
                  <button disabled={pagPendSeg >= totalPend - 1} onClick={() => setPagPend(pagPendSeg + 1)} className="rounded-md border border-black/10 px-2 py-0.5 font-semibold text-tinta hover:bg-nube disabled:opacity-40">Siguiente →</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {nuevo && (
        <ModalNuevaTarea
          fechaInicial={nuevo.fecha}
          miCorreo={miCorreo || null}
          miNombre={miNombre || null}
          onCerrar={() => setNuevo(null)}
          onCreado={() => { setNuevo(null); setRecargaTick((n) => n + 1); }}
        />
      )}
    </div>
  );
}

// ============================================================
// ModalNuevaTarea · crear tarea/cita/llamada/correo desde el
// Calendario, asignada a cualquier colaborador (tarea personal).
// ============================================================
type ClienteMini = { id: string; nombre: string };

function ModalNuevaTarea({ fechaInicial, miCorreo, miNombre, onCerrar, onCreado }: {
  fechaInicial: string; miCorreo: string | null; miNombre: string | null; onCerrar: () => void; onCreado: () => void;
}) {
  const [tipo, setTipo] = useState<TipoTarea>("tarea");
  const [titulo, setTitulo] = useState("");
  const [detalle, setDetalle] = useState("");
  const [fecha, setFecha] = useState(fechaInicial);
  const [colabs, setColabs] = useState<Colaborador[]>([]);
  const [asignar, setAsignar] = useState("");
  useEffect(() => {
    // JurisConecta primero: ahí vive el directorio completo de la empresa.
    // JusticiaFácil complementa con quien todavía no esté dado de alta allá.
    Promise.all([fetchColaboradores(), listarColaboradoresJF()]).then(([jc, jf]) => {
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
          });
        }
      }
      setColabs(Array.from(porCorreo.values()).sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "")));
      if (miCorreo) setAsignar(miCorreo); // por default, tarea personal (para mí mismo)
    });
  }, [miCorreo]);

  // Cliente opcional (para que quede ligado en su ficha).
  const [clienteTexto, setClienteTexto] = useState("");
  const [clienteSel, setClienteSel] = useState<ClienteMini | null>(null);
  const [sugerencias, setSugerencias] = useState<ClienteMini[]>([]);
  useEffect(() => {
    if (clienteSel && clienteTexto === clienteSel.nombre) { setSugerencias([]); return; }
    const q = clienteTexto.trim();
    if (q.length < 3) { setSugerencias([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from("clientes").select("id,nombre").eq("eliminado", false).ilike("nombre", `%${q}%`).limit(8);
      setSugerencias(data || []);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteTexto]);

  const [guardando, setGuardando] = useState(false);
  const crear = async () => {
    if (!titulo.trim() || !asignar || guardando) return;
    setGuardando(true);
    const c = colabs.find((x) => x.correo === asignar);
    const r = await agregarTarea({
      autorEmail: asignar,
      autorNombre: c?.nombre || undefined,
      tipo, titulo: titulo.trim(),
      detalle: detalle.trim() || undefined,
      fecha: fecha || null,
      aQuien: c?.nombre || undefined,
      clienteId: clienteSel?.id,
      clienteNombre: clienteSel?.nombre,
    });
    setGuardando(false);
    if (!r.ok) { alert("No se pudo crear: " + (r.error || "")); return; }
    if (asignar !== (miCorreo || "")) {
      avisarEventoA(asignar, {
        tipo: "tarea",
        titulo: `Nueva tarea: ${titulo.trim()}`,
        detalle: clienteSel ? `Cliente: ${clienteSel.nombre}` : (miNombre ? `De ${miNombre}` : undefined),
        modulo: "clientes",
        refId: clienteSel?.id,
        icono: ETIQUETA_TIPO[tipo]?.split(" ")[0] || "✅",
      });
    }
    onCreado();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={onCerrar}>
      <div className="my-10 w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <p className="font-display text-base font-bold text-tinta">Nuevo en la agenda</p>
          <button onClick={onCerrar} className="text-humo hover:text-tinta">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-medium text-humo">Título</label>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej. Llamar por RDC" autoFocus
              className="mt-0.5 h-9 w-full rounded-lg border border-black/10 px-3 text-sm outline-none focus:border-teal" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-humo">Tipo</label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {(["tarea", "llamada", "correo", "cita"] as TipoTarea[]).map((t) => (
                <button key={t} onClick={() => setTipo(t)}
                  className={"rounded-full px-3 py-1 text-xs font-medium " + (tipo === t ? "bg-teal-soft text-teal-dark ring-1 ring-teal" : "bg-nube text-humo")}>
                  {ETIQUETA_TIPO[t]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-humo">Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
              className="mt-0.5 h-9 w-full rounded-lg border border-black/10 px-3 text-sm outline-none focus:border-teal" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-humo">Detalle (opcional)</label>
            <textarea value={detalle} onChange={(e) => setDetalle(e.target.value)} rows={2}
              className="mt-0.5 w-full resize-none rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-teal" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-humo">Asignar a</label>
            <select value={asignar} onChange={(e) => setAsignar(e.target.value)}
              className="mt-0.5 h-9 w-full rounded-lg border border-black/10 px-3 text-sm outline-none focus:border-teal">
              <option value="">— Elegir —</option>
              {colabs.filter((c) => c.correo).map((c) => (
                <option key={c.correo!} value={c.correo!}>
                  {c.nombre}{c.correo === miCorreo ? " (yo)" : ""}{c.puesto ? ` · ${c.puesto}` : ""} — {plataformaDeArea(c.area)}
                </option>
              ))}
            </select>
          </div>
          <div className="relative">
            <label className="text-[11px] font-medium text-humo">Cliente (opcional)</label>
            <input value={clienteTexto} onChange={(e) => { setClienteTexto(e.target.value); setClienteSel(null); }} placeholder="Nombre del cliente…"
              className="mt-0.5 h-9 w-full rounded-lg border border-black/10 px-3 text-sm outline-none focus:border-teal" />
            {sugerencias.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-32 w-full overflow-y-auto rounded-lg border border-black/10 bg-white shadow-lg">
                {sugerencias.map((c) => (
                  <button key={c.id} onClick={() => { setClienteSel(c); setClienteTexto(c.nombre); setSugerencias([]); }} className="block w-full truncate px-3 py-1.5 text-left text-sm hover:bg-nube">{c.nombre}</button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end border-t border-black/5 pt-3">
          <button onClick={crear} disabled={!titulo.trim() || !asignar || guardando}
            className="rounded-lg bg-teal px-4 py-1.5 text-sm font-semibold text-white hover:bg-teal-dark disabled:opacity-50">
            {guardando ? "Guardando…" : "✓ Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
