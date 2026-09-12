// ===================================================================
// Mi Agenda  →  src/modules/Bienvenida/MiAgenda.tsx
// Panel del Escritorio: citas, correos, tareas y llamadas pendientes.
// Guardar usa correo/nombre (tú). VER usa emails/nombres (jerarquía):
//   - emails/nombres = lista a ver. null = TODOS (RAC / Dirección).
// ===================================================================
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchTareasVisibles, agregarTarea, marcarTarea, borrarTarea, type Tarea, type TipoTarea } from "../../data/tareas";
import { fetchSeguimiento } from "../../data/seguimiento";

const TIPOS: { key: TipoTarea; label: string; icono: string }[] = [
  { key: "cita",    label: "Cita",   icono: "🗓" },
  { key: "correo",  label: "Correo", icono: "✉" },
  { key: "llamada", label: "Llamada", icono: "📞" },
  { key: "tarea",   label: "Tarea",  icono: "✅" },
];

function fechaCorta(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// Sección que muestra máximo 5 y trae su propio « Anterior · Siguiente ».
function SeccionPag<T>({ icono, titulo, items, render }: { icono: string; titulo: string; items: T[]; render: (it: T, i: number) => ReactNode }) {
  const POR = 5;
  const [pag, setPag] = useState(0);
  const total = Math.max(1, Math.ceil(items.length / POR));
  const pagSegura = Math.min(pag, total - 1);
  const desde = pagSegura * POR;
  const slice = items.slice(desde, desde + POR);
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-humo">
        {icono} {titulo}{items.length > POR && <span className="text-humo/70"> · {items.length}</span>}
      </p>
      <div className="space-y-1.5">{slice.map(render)}</div>
      {items.length > POR && (
        <div className="mt-1.5 flex items-center justify-center gap-2 text-[11px]">
          <button disabled={pagSegura <= 0} onClick={() => setPag(pagSegura - 1)} className="rounded-md border border-black/10 px-2 py-0.5 font-semibold text-tinta hover:bg-nube disabled:opacity-40">← Anterior</button>
          <span className="text-humo">{pagSegura + 1} / {total}</span>
          <button disabled={pagSegura >= total - 1} onClick={() => setPag(pagSegura + 1)} className="rounded-md border border-black/10 px-2 py-0.5 font-semibold text-tinta hover:bg-nube disabled:opacity-40">Siguiente →</button>
        </div>
      )}
    </div>
  );
}

export default function MiAgenda({ correo, nombre, emails, nombres, onIr }: { correo: string; nombre: string; emails: string[] | null; nombres: string[] | null; onIr?: (v: "llamadas" | "directorio" | "clientes" | "chat") => void }) {
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [llamadasSeg, setLlamadasSeg] = useState<{ id: string; nombre: string; codigo: string; texto: string; quien: string }[]>([]);
  const [cargando, setCargando] = useState(true);
  const [abrir, setAbrir] = useState(false);

  // formulario
  const [tipo, setTipo] = useState<TipoTarea>("tarea");
  const [titulo, setTitulo] = useState("");
  const [fecha, setFecha] = useState("");
  const [aQuien, setAQuien] = useState("");
  const [guardando, setGuardando] = useState(false);

  const muestraQuien = emails === null || (emails != null && emails.length > 1);

  async function cargar() {
    setCargando(true);
    const ts = await fetchTareasVisibles(emails);
    setTareas(ts);
    try {
      const segs = await fetchSeguimiento();
      const setE = emails ? new Set(emails.map((e) => e.trim().toLowerCase())) : null;
      const pend = segs
        .filter((s) => {
          const correo = (s.cliente.asesorCorreo || "").trim().toLowerCase();
          const visible = setE ? setE.has(correo) : true;
          return visible && (s.estado === "vencido" || s.estado === "porvencer");
        })
        .map((s) => {
          const r = s.diasLimite != null && s.diasDesdeCiclo != null ? s.diasLimite - s.diasDesdeCiclo : null;
          const texto = s.estado === "vencido" ? (r != null && r < 0 ? `Vencido hace ${-r}d` : "Vencido") : (r != null ? `En ${r}d` : "Por vencer");
          return { id: s.cliente.id, nombre: s.cliente.nombre, codigo: s.cliente.codigo, texto, quien: (s.cliente.asesorAsignado || "").trim() };
        });
      setLlamadasSeg(pend);
    } catch { setLlamadasSeg([]); }
    setCargando(false);
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [JSON.stringify(emails), JSON.stringify(nombres)]);

  const porTipo = useMemo(() => {
    const m: Record<TipoTarea, Tarea[]> = { cita: [], correo: [], llamada: [], tarea: [] };
    for (const t of tareas) m[t.tipo].push(t);
    return m;
  }, [tareas]);

  // Llamadas pendientes = seguimiento + tareas tipo llamada (en una sola lista paginable).
  const llamadasTodas = useMemo(() => [
    ...llamadasSeg.map((l) => ({ k: "seg" as const, l })),
    ...porTipo.llamada.map((t) => ({ k: "tar" as const, t })),
  ], [llamadasSeg, porTipo.llamada]);

  async function guardar() {
    if (!titulo.trim()) return;
    setGuardando(true);
    const r = await agregarTarea({
      autorEmail: correo,
      autorNombre: nombre,
      tipo,
      titulo: titulo.trim(),
      fecha: fecha ? new Date(fecha).toISOString() : null,
      aQuien: aQuien.trim() || undefined,
    });
    setGuardando(false);
    if (r.ok) {
      setTitulo(""); setFecha(""); setAQuien(""); setAbrir(false);
      cargar();
    } else alert("No se pudo guardar: " + (r.error || ""));
  }

  async function hecha(id: string) { await marcarTarea(id, "hecha"); cargar(); }
  async function quitar(id: string) { await borrarTarea(id); cargar(); }

  const totalPend = tareas.length + llamadasSeg.length;

  function Quien({ t }: { t: Tarea }) {
    if (!muestraQuien || !t.autorNombre) return null;
    return <span className="text-[10px] text-humo"> · de {t.autorNombre}</span>;
  }

  function Item({ children, onHecha, onBorrar, irA }: { children: ReactNode; onHecha?: () => void; onBorrar?: () => void; irA?: () => void }) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-black/5 bg-white px-2.5 py-2">
        <div className="min-w-0 flex-1 text-[12.5px] text-tinta">{children}</div>
        {irA && <button onClick={irA} title="Ir al cliente" className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-teal hover:bg-teal-soft">Ir →</button>}
        {onHecha && <button onClick={onHecha} title="Marcar hecha" className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50">✓</button>}
        {onBorrar && <button onClick={onBorrar} title="Borrar" className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] text-humo hover:bg-nube">✕</button>}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-sm font-extrabold uppercase tracking-wide text-tinta">🗓 Mi Agenda</h3>
        <div className="flex items-center gap-2">
          {totalPend > 0 && <span className="rounded-full bg-teal-soft px-2 py-0.5 text-[11px] font-semibold text-teal-dark">{totalPend} pendiente{totalPend === 1 ? "" : "s"}</span>}
          <button onClick={() => setAbrir((v) => !v)} className="rounded-lg bg-teal px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-teal-dark">{abrir ? "Cerrar" : "+ Agregar"}</button>
        </div>
      </div>

      {/* Formulario para guardar (siempre como TÚ) */}
      {abrir && (
        <div className="mb-4 rounded-xl border border-black/10 bg-nube/40 p-3">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {TIPOS.map((t) => (
              <button key={t.key} onClick={() => setTipo(t.key)}
                className={"rounded-lg px-2.5 py-1 text-[11px] font-semibold " + (tipo === t.key ? "bg-teal text-white" : "bg-white text-humo border border-black/10 hover:bg-teal-soft")}>
                {t.icono} {t.label}
              </button>
            ))}
          </div>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={tipo === "llamada" ? "¿Sobre qué es la llamada?" : tipo === "correo" ? "Asunto del correo" : tipo === "cita" ? "¿De qué es la cita?" : "¿Qué hay que hacer?"}
            className="mb-2 w-full rounded-lg border border-black/10 bg-white px-2.5 py-2 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20" />
          {(tipo === "llamada" || tipo === "correo") && (
            <input value={aQuien} onChange={(e) => setAQuien(e.target.value)} placeholder="¿A quién?"
              className="mb-2 w-full rounded-lg border border-black/10 bg-white px-2.5 py-2 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20" />
          )}
          <div className="flex items-center gap-2">
            <input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)}
              className="flex-1 rounded-lg border border-black/10 bg-white px-2.5 py-2 text-sm outline-none focus:border-teal" />
            <button onClick={guardar} disabled={guardando || !titulo.trim()} className="rounded-lg bg-teal px-3 py-2 text-sm font-semibold text-white hover:bg-teal-dark disabled:opacity-50">{guardando ? "…" : "Guardar"}</button>
          </div>
        </div>
      )}

      {cargando ? (
        <p className="py-6 text-center text-sm text-humo">Cargando…</p>
      ) : totalPend === 0 ? (
        <p className="py-6 text-center text-sm text-humo">Nada pendiente por ahora. 🎉</p>
      ) : (
        <div className="space-y-4">
          {porTipo.cita.length > 0 && (
            <SeccionPag icono="🗓" titulo="Citas" items={porTipo.cita} render={(t) => (
              <Item key={t.id} onHecha={() => hecha(t.id)} onBorrar={() => quitar(t.id)}>
                <span className="font-semibold">{t.titulo}</span>{t.fecha && <span className="text-humo"> · {fechaCorta(t.fecha)}</span>}<Quien t={t} />
              </Item>
            )} />
          )}

          {porTipo.correo.length > 0 && (
            <SeccionPag icono="✉" titulo="Correos por enviar" items={porTipo.correo} render={(t) => (
              <Item key={t.id} onHecha={() => hecha(t.id)} onBorrar={() => quitar(t.id)}>
                <span className="font-semibold">{t.titulo}</span>{t.expediente && <span className="ml-1 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">📁 {t.expediente}</span>}{t.aQuien && <span className="text-humo"> · para {t.aQuien}</span>}<Quien t={t} />
              </Item>
            )} />
          )}

          {llamadasTodas.length > 0 && (
            <SeccionPag icono="📞" titulo="Llamadas pendientes" items={llamadasTodas} render={(x) =>
              x.k === "seg" ? (
                <Item key={"seg-" + x.l.id}>
                  <span className="font-semibold">{x.l.nombre}</span>
                  <span className="ml-1 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">{x.l.codigo}</span>
                  <span className="text-humo"> · {x.l.texto}</span>
                  {muestraQuien && x.l.quien && <span className="text-[10px] text-humo"> · {x.l.quien}</span>}
                </Item>
              ) : (
                <Item key={x.t.id} irA={x.t.clienteId && onIr ? () => onIr("clientes") : undefined} onHecha={() => hecha(x.t.id)} onBorrar={() => quitar(x.t.id)}>
                  <span className="font-semibold">{x.t.titulo}</span>{x.t.aQuien && <span className="text-humo"> · a {x.t.aQuien}</span>}<Quien t={x.t} />
                </Item>
              )
            } />
          )}

          {porTipo.tarea.length > 0 && (
            <SeccionPag icono="✅" titulo="Tareas" items={porTipo.tarea} render={(t) => (
              <Item key={t.id} irA={t.clienteId && onIr ? () => onIr("clientes") : undefined} onHecha={() => hecha(t.id)} onBorrar={() => quitar(t.id)}>
                <span className="font-semibold">{t.titulo}</span>{t.expediente && <span className="ml-1 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">📁 {t.expediente}</span>}{t.fecha && <span className="text-humo"> · {fechaCorta(t.fecha)}</span>}<Quien t={t} />
              </Item>
            )} />
          )}
        </div>
      )}
    </div>
  );
}
