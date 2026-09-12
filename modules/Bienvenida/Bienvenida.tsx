import { useEffect, useMemo, useState } from "react";
import MiAgenda from "./MiAgenda";
import MiListaDelDia from "../MiLista/MiListaDelDia";
import MiCalendario from "./MiCalendario";
import { type Cliente } from "../../data/clientes";
import RedactarPrueba from "../Correo/RedactarPrueba";
import { fetchColaboradores, type Colaborador } from "../../data/colaboradores";
import { fetchLlamadas, type Llamada } from "../../data/llamadas";
import { escucharEventos, type Evento } from "../../data/avisarEvento";
import { supabase } from "../../lib/supabase";
import { fetchPerfil } from "../../data/usuarios";
import { iniciarPermisos } from "../../data/permisos";
import SolicitudesClientesJF from "./SolicitudesClientesJF";
import { fetchSolicitudesPendientesJF } from "../../data/solicitudesJF";
import { intervaloVisible } from "../../lib/intervaloVisible";

type Identidad = { nombre: string; area: string | null; correo?: string | null } | null;
type Conteo = { asignadas: number; enEspera: number; urgentes: number; resueltasHoy: number };

function norm(s: string | null | undefined): string { return (s || "").trim().toLowerCase(); }
function saludoPorHora(): string {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}
function esHoy(iso: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return !isNaN(d.getTime()) && d.toDateString() === new Date().toDateString();
}
function llamadasDe(nombre: string | null | undefined, llamadas: Llamada[]): Llamada[] {
  const n = norm(nombre);
  if (!n) return [];
  return llamadas.filter((l) => norm(l.responsable) === n);
}
function contar(nombre: string | null | undefined, llamadas: Llamada[]): Conteo {
  const mias = llamadasDe(nombre, llamadas);
  return {
    asignadas: mias.length,
    enEspera: mias.filter((l) => l.devolver && !l.devuelta).length,
    urgentes: mias.filter((l) => l.urgente && !l.devuelta).length,
    resueltasHoy: mias.filter((l) => (l.devuelta || /resuelta/i.test(l.resultado)) && esHoy(l.fecha)).length,
  };
}

function iconoDeEvento(tipo: string): string {
  switch (tipo) {
    case "llamada": return "📞";
    case "cliente": return "🧑";
    case "colaborador": return "👥";
    case "grupo": return "👥";
    case "reunion": return "📅";
    case "mensaje": return "💬";
    default: return "🔔";
  }
}
function tiempoRel(iso: string): string {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return "ahora";
  const min = Math.floor(s / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ayer";
  if (d < 7) return `hace ${d} d`;
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}

function FotoCirculo({ nombre, foto, size = 84 }: { nombre: string; foto?: string | null; size?: number }) {
  if (foto) return <img src={foto} alt={nombre} className="shrink-0 rounded-full object-cover ring-2 ring-white shadow" style={{ width: size, height: size }} />;
  const inicial = (nombre || "?").charAt(0).toUpperCase();
  return (
    <div className="shrink-0 rounded-full bg-teal-soft flex items-center justify-center font-display font-extrabold text-teal-dark ring-2 ring-white shadow" style={{ width: size, height: size, fontSize: size * 0.42 }}>{inicial}</div>
  );
}
function Contador({ numero, etiqueta, icono, color, onClick }: { numero: number; etiqueta: string; icono: string; color: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-start gap-1 rounded-2xl border border-black/5 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-4">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl text-lg" style={{ backgroundColor: color + "1A" }}>{icono}</span>
      <span className="font-display text-3xl font-extrabold leading-none" style={{ color }}>{numero}</span>
      <span className="text-xs font-medium text-humo">{etiqueta}</span>
    </button>
  );
}
function DatoBlanco({ icono, etiqueta, valor }: { icono: string; etiqueta: string; valor?: string | null }) {
  if (!valor) return null;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="shrink-0 text-base">{icono}</span>
      <span className="shrink-0 text-white/70">{etiqueta}:</span>
      <span className="truncate font-medium text-white">{valor}</span>
    </div>
  );
}
function Dato({ icono, etiqueta, valor }: { icono: string; etiqueta: string; valor?: string | null }) {
  if (!valor) return null;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="shrink-0 text-base">{icono}</span>
      <span className="shrink-0 text-humo">{etiqueta}:</span>
      <span className="truncate font-medium text-tinta">{valor}</span>
    </div>
  );
}
function Chip({ n, texto, color }: { n: number; texto: string; color: string }) {
  if (n <= 0) return null;
  return (
    <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ backgroundColor: color + "1A", color }}>{n} {texto}</span>
  );
}
function PersonaFila({ persona, llamadas, onAuditar }: { persona: Colaborador; llamadas: Llamada[]; onAuditar: () => void }) {
  const c = contar(persona.nombre, llamadas);
  return (
    <button onClick={onAuditar} className="flex w-full items-center gap-3 rounded-xl border border-black/5 bg-white p-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <FotoCirculo nombre={persona.nombre} foto={persona.foto_url} size={44} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-tinta">{persona.nombre}</p>
        <p className="truncate text-xs text-humo">{persona.puesto || "—"}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
        <Chip n={c.enEspera} texto="espera" color="#EA580C" />
        <Chip n={c.urgentes} texto="urg" color="#DC2626" />
        {c.enEspera === 0 && c.urgentes === 0 && <span className="text-[11px] font-medium text-emerald-600">al día</span>}
      </div>
    </button>
  );
}
function AuditModal({ persona, llamadas, onCerrar }: { persona: Colaborador; llamadas: Llamada[]; onCerrar: () => void }) {
  const c = contar(persona.nombre, llamadas);
  const pendientes = llamadasDe(persona.nombre, llamadas)
    .filter((l) => (l.devolver && !l.devuelta) || (l.urgente && !l.devuelta))
    .sort((a, b) => Number(b.urgente) - Number(a.urgente));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCerrar}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <FotoCirculo nombre={persona.nombre} foto={persona.foto_url} size={64} />
          <div className="min-w-0">
            <h3 className="truncate font-display text-lg font-extrabold text-tinta">{persona.nombre}</h3>
            <p className="truncate text-sm text-humo">{persona.puesto || "—"}{persona.area ? ` · ${persona.area}` : ""}</p>
          </div>
        </div>

        <div className="mt-3 space-y-1 rounded-xl bg-nube p-3">
          <Dato icono="☎️" etiqueta="Ext" valor={persona.extension} />
          <Dato icono="📞" etiqueta="Tel" valor={persona.telefono} />
          <Dato icono="💬" etiqueta="WhatsApp" valor={persona.whatsapp} />
          <Dato icono="✉️" etiqueta="Correo" valor={persona.correo} />
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2 text-center">
          {[
            { n: c.asignadas, t: "Asignadas", col: "#1E50A0" },
            { n: c.enEspera, t: "En espera", col: "#EA580C" },
            { n: c.urgentes, t: "Urgentes", col: "#DC2626" },
            { n: c.resueltasHoy, t: "Hoy", col: "#16A34A" },
          ].map((x) => (
            <div key={x.t} className="rounded-xl border border-black/5 bg-white py-2 shadow-sm">
              <p className="font-display text-2xl font-extrabold leading-none" style={{ color: x.col }}>{x.n}</p>
              <p className="mt-0.5 text-[10px] font-medium text-humo">{x.t}</p>
            </div>
          ))}
        </div>

        <div className="mt-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-teal-dark">Pendientes ({pendientes.length})</p>
          {pendientes.length === 0 ? (
            <p className="rounded-xl bg-nube px-3 py-2 text-sm text-humo">Sin pendientes. Va al día. 🎉</p>
          ) : (
            <div className="space-y-1.5">
              {pendientes.map((l) => (
                <div key={l.id} className="rounded-xl border border-black/5 bg-white p-2.5 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-tinta">{l.clienteNombre || l.telefono || "Número desconocido"}</span>
                    <div className="flex shrink-0 items-center gap-1">
                      {l.urgente && !l.devuelta && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600">URGENTE</span>}
                      {l.folio && <span className="text-[10px] text-humo">{l.folio}</span>}
                    </div>
                  </div>
                  <p className="truncate text-xs text-humo">{[l.motivo, l.area].filter(Boolean).join(" · ") || "—"}{l.fechaCompromiso ? ` · compromiso: ${l.fechaCompromiso}` : ""}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <button onClick={onCerrar} className="mt-4 w-full rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Cerrar</button>
      </div>
    </div>
  );
}

export default function Bienvenida({ onIr, onAbrirSeguimiento, identidad }: { onIr: (v: "llamadas" | "directorio" | "clientes" | "chat" | "milista") => void; onAbrirSeguimiento?: (cliente: Cliente) => void; identidad?: Identidad }) {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [llamadas, setLlamadas] = useState<Llamada[]>([]);
  const [cargando, setCargando] = useState(true);
  const [auditando, setAuditando] = useState<Colaborador | null>(null);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [rol, setRol] = useState<string | null>(null);
  // Secciones cerradas del escritorio. Arrancan cerradas las MÁS LARGAS
  // (personal a cargo y seguimiento por áreas) para que la pantalla aterrice
  // cortita y no se vea "un chorrote para abajo". Se abren con un toque.
  const [cerradas, setCerradas] = useState<Set<string>>(() => new Set(["miequipo", "segareas"]));
  const toggleSec = (k: string) =>
    setCerradas((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });
  const abierta = (k: string) => !cerradas.has(k);

  // Pestañas del inicio (en vez de una sola columna larga).
  const [tab, setTab] = useState<"dia" | "llamadas" | "calendario" | "avisos" | "solicitudes" | "equipo">("dia");
  const [solPendientes, setSolPendientes] = useState(0);
  useEffect(() => {
    let activo = true;
    const cargar = () => fetchSolicitudesPendientesJF().then((l) => { if (activo) setSolPendientes(l.length); });
    cargar();
    const t = intervaloVisible(cargar, 5 * 60 * 1000);
    return () => { activo = false; t(); };
  }, []);
  const TabBtn = ({ k, icono, label, badge }: { k: typeof tab; icono: string; label: string; badge?: number }) => (
    <button onClick={() => setTab(k)}
      className={"flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition " +
        (tab === k ? "border-teal font-semibold text-tinta" : "border-transparent text-humo hover:text-tinta")}>
      <span>{icono}</span>{label}
      {!!badge && <span className="ml-0.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{badge}</span>}
    </button>
  );

  useEffect(() => {
    let activo = true;
    iniciarPermisos(); // 👈 Fase 2: carga los permisos guardados una sola vez (al entrar)
    Promise.all([fetchColaboradores(), fetchLlamadas().catch(() => [] as Llamada[])]).then(([cols, lls]) => {
      if (!activo) return;
      setColaboradores(cols); setLlamadas(lls); setCargando(false);
    });
    return () => { activo = false; };
  }, []);

  // Centro de avisos: historial + en vivo
  useEffect(() => {
    let vivo = true;
    supabase.from("eventos").select("*").order("created_at", { ascending: false }).limit(30)
      .then(({ data }) => { if (vivo && data) setEventos(data as Evento[]); });
    const dejar = escucharEventos((e) => {
      setEventos((prev) => (prev.some((x) => x.id === e.id) ? prev : [e, ...prev]).slice(0, 50));
    });
    return () => { vivo = false; dejar(); };
  }, []);

  const irAEvento = (e: Evento) => {
    const m = (e.modulo || "").toLowerCase();
    if (m === "llamadas" || m === "directorio" || m === "clientes" || m === "chat") onIr(m);
  };

  // Rol del usuario (para la jerarquía de citas/seguimientos)
  useEffect(() => {
    const co = norm(identidad?.correo);
    if (!co) return;
    fetchPerfil(co).then((p) => setRol(p?.rol ?? null)).catch(() => setRol(null));
  }, [identidad?.correo]);

  const yo = useMemo<Colaborador | null>(() => {
    const correo = norm(identidad?.correo);
    const nombre = norm(identidad?.nombre);
    return (correo ? colaboradores.find((x) => norm(x.correo) === correo) : undefined) || colaboradores.find((x) => norm(x.nombre) === nombre) || null;
  }, [colaboradores, identidad?.correo, identidad?.nombre]);

  const nombreMostrar = yo?.nombre || identidad?.nombre || "Colaborador";
  const primerNombre = nombreMostrar.split(" ")[0];
  const c = useMemo(() => contar(yo?.nombre || identidad?.nombre, llamadas), [llamadas, yo?.nombre, identidad?.nombre]);

  const miArea = yo?.area || identidad?.area || null;
  const miEquipo = useMemo(() => {
    if (!miArea) return [] as Colaborador[];
    const miNombre = norm(yo?.nombre || identidad?.nombre);
    return colaboradores.filter((x) => x.activo && norm(x.area) === norm(miArea) && norm(x.nombre) !== miNombre);
  }, [colaboradores, miArea, yo?.nombre, identidad?.nombre]);

  const porArea = useMemo(() => {
    const map = new Map<string, Colaborador[]>();
    for (const col of colaboradores) {
      if (!col.activo) continue;
      const a = col.area || "Sin área";
      const arr = map.get(a) || [];
      arr.push(col);
      map.set(a, arr);
    }
    return [...map.entries()].map(([area, gente]) => {
      const tot = gente.reduce<Conteo>((acc, p) => {
        const k = contar(p.nombre, llamadas);
        return { asignadas: acc.asignadas + k.asignadas, enEspera: acc.enEspera + k.enEspera, urgentes: acc.urgentes + k.urgentes, resueltasHoy: acc.resueltasHoy + k.resueltasHoy };
      }, { asignadas: 0, enEspera: 0, urgentes: 0, resueltasHoy: 0 });
      return { area, gente, tot };
    });
  }, [colaboradores, llamadas]);

  // ÁMBITO (quién ve qué citas/seguimientos en Calendario y Agenda):
  //  - DGE / Super_Admin / RAC  → TODOS (null)
  //  - DGC / DIL / GAD (director) → él + su área (subalternos)
  //  - cualquier otro             → solo él
  const ambito = useMemo<{ emails: string[] | null; nombres: string[] | null }>(() => {
    const todos = rol === "DGE" || rol === "Super_Admin" || rol === "RAC";
    if (todos) return { emails: null, nombres: null };
    const dirArea = !!rol && ["DGC", "DIL", "GAD"].includes(rol);
    const baseG = dirArea ? [yo, ...miEquipo] : (yo ? [yo] : []);
    const emails = Array.from(new Set([identidad?.correo, ...baseG.map((g) => g?.correo)].filter(Boolean) as string[]));
    const nombres = Array.from(new Set([identidad?.nombre, ...baseG.map((g) => g?.nombre)].filter(Boolean) as string[]));
    return { emails, nombres };
  }, [rol, yo, miEquipo, identidad?.correo, identidad?.nombre]);

  const hayEquipo = miEquipo.length > 0 || porArea.length > 0;

  return (
   <div className="w-full px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
      {/* Saludo */}
      <div className="mb-3 sm:mb-5">
        <h1 className="font-display text-2xl font-extrabold text-tinta sm:text-3xl">{saludoPorHora()}, {primerNombre} 👋</h1>
       <p className="mt-1 text-sm text-humo">Tu escritorio · DIIPA · Inmuebles Accesibles</p>
        <RedactarPrueba correo={identidad?.correo || ""} nombre={nombreMostrar} />
      </div>

      {/* Ficha técnica */}
      <div className="mb-4 overflow-hidden rounded-3xl border border-black/5 bg-gradient-to-br from-teal to-teal-dark p-4 text-white shadow-sm sm:mb-6 sm:p-6">
        <div className="flex items-center gap-4">
          <FotoCirculo nombre={nombreMostrar} foto={yo?.foto_url} size={96} />
          <div className="min-w-0">
            <h2 className="truncate font-display text-xl font-extrabold">{nombreMostrar}</h2>
            <p className="truncate text-sm text-white/85">{yo?.puesto || "—"}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {yo?.area && (<span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold">{yo.area}</span>)}
              {yo?.rol_sistema && (<span className="rounded-full bg-dorado/90 px-2.5 py-0.5 text-xs font-semibold text-tinta">{yo.rol_sistema}</span>)}
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2 rounded-2xl bg-white/10 p-3 sm:mt-5 sm:grid-cols-2 sm:p-4">
          {yo ? (
            <>
              <DatoBlanco icono="☎️" etiqueta="Ext" valor={yo.extension} />
              <DatoBlanco icono="📞" etiqueta="Tel" valor={yo.telefono} />
              <DatoBlanco icono="💬" etiqueta="WhatsApp" valor={yo.whatsapp} />
              <DatoBlanco icono="✉️" etiqueta="Correo" valor={yo.correo} />
              <DatoBlanco icono="📱" etiqueta="Núm. oficial" valor={yo.numero_oficial} />
            </>
          ) : (
            <p className="text-sm text-white/85">{cargando ? "Cargando tu ficha…" : "No encontré tu ficha en el Directorio. Pídele a Configuración que registre tu correo."}</p>
          )}
        </div>
      </div>

      {/* Pestañas del inicio */}
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-black/10">
        <TabBtn k="dia" icono="📋" label="Mi día" />
        <TabBtn k="llamadas" icono="📞" label="Llamadas" />
        <TabBtn k="calendario" icono="📅" label="Calendario" />
        <TabBtn k="avisos" icono="🔔" label="Avisos" />
        <TabBtn k="solicitudes" icono="⚖️" label="Solicitudes" badge={solPendientes} />
        {hayEquipo && <TabBtn k="equipo" icono="👥" label="Equipo" />}
      </div>

      {/* MI DÍA: lista del día + agenda */}
      {tab === "dia" && (
        <div className="space-y-5">
          <MiListaDelDia compacto onIrModulo={(cliente) => (cliente ? onAbrirSeguimiento?.(cliente) : onIr("milista"))} />
          <MiAgenda correo={identidad?.correo || ""} nombre={yo?.nombre || identidad?.nombre || ""} emails={ambito.emails} nombres={ambito.nombres} onIr={onIr} />
        </div>
      )}

      {/* LLAMADAS */}
      {tab === "llamadas" && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
          <Contador numero={c.asignadas} etiqueta="Asignadas a mí" icono="📋" color="#1E50A0" onClick={() => onIr("llamadas")} />
          <Contador numero={c.enEspera} etiqueta="En espera de resolución" icono="⏳" color="#EA580C" onClick={() => onIr("llamadas")} />
          <Contador numero={c.urgentes} etiqueta="Urgentes" icono="⚠️" color="#DC2626" onClick={() => onIr("llamadas")} />
          <Contador numero={c.resueltasHoy} etiqueta="Resueltas hoy" icono="✅" color="#16A34A" onClick={() => onIr("llamadas")} />
        </div>
      )}

      {/* CALENDARIO */}
      {tab === "calendario" && <MiCalendario emails={ambito.emails} nombres={ambito.nombres} miCorreo={identidad?.correo} miNombre={yo?.nombre || identidad?.nombre} />}

      {/* AVISOS (en vivo) */}
      {tab === "avisos" && (eventos.length === 0 ? (
        <p className="rounded-2xl border border-black/5 bg-white p-4 text-sm text-humo shadow-sm">Sin avisos por ahora.</p>
      ) : (
        <div className="max-h-[28rem] space-y-1.5 overflow-y-auto rounded-2xl border border-black/5 bg-white p-2 shadow-sm">
          {eventos.map((e) => (
            <button key={e.id} onClick={() => irAEvento(e)} className="flex w-full items-start gap-3 rounded-xl p-2.5 text-left transition hover:bg-nube">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-soft text-base">{e.icono || iconoDeEvento(e.tipo)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-tinta">{e.titulo}</p>
                {e.detalle && <p className="truncate text-xs text-humo">{e.detalle}</p>}
              </div>
              <span className="shrink-0 text-[10px] text-humo">{tiempoRel(e.created_at)}</span>
            </button>
          ))}
        </div>
      ))}

      {/* SOLICITUDES: tareas de JusticiaFácil cuyo cliente no se encontró aquí */}
      {tab === "solicitudes" && (
        <SolicitudesClientesJF quien={yo?.nombre || identidad?.nombre || identidad?.correo || "Alguien"} onCambio={() => fetchSolicitudesPendientesJF().then((l) => setSolPendientes(l.length))} />
      )}

      {/* EQUIPO: personal a cargo + seguimiento por áreas */}
      {tab === "equipo" && hayEquipo && (
        <div className="space-y-6">
          {miEquipo.length > 0 && (
            <section>
              <p className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-teal-dark">Mi personal a cargo · {miArea}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {miEquipo.map((p) => (<PersonaFila key={p.id} persona={p} llamadas={llamadas} onAuditar={() => setAuditando(p)} />))}
              </div>
            </section>
          )}
          {porArea.length > 0 && (
            <section>
              <p className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-teal-dark">Seguimiento por áreas</p>
              <div className="grid gap-3 lg:grid-cols-2">
                {porArea.map(({ area, gente, tot }) => {
                  const ak = "area:" + area;
                  const areaAbierta = abierta(ak);
                  return (
                    <div key={area} className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
                      <button onClick={() => toggleSec(ak)} className="mb-2 flex w-full items-center justify-between gap-2 text-left">
                        <h4 className="flex min-w-0 items-center gap-1.5 truncate font-display font-bold text-tinta">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={"h-3.5 w-3.5 shrink-0 text-humo transition-transform " + (areaAbierta ? "rotate-90" : "")}>
                            <polyline points="9 6 15 12 9 18" />
                          </svg>
                          <span className="truncate">{area} <span className="text-xs font-medium text-humo">· {gente.length}</span></span>
                        </h4>
                        <div className="flex shrink-0 flex-wrap items-center gap-1">
                          <Chip n={tot.enEspera} texto="espera" color="#EA580C" />
                          <Chip n={tot.urgentes} texto="urg" color="#DC2626" />
                          {tot.enEspera === 0 && tot.urgentes === 0 && <span className="text-[11px] font-medium text-emerald-600">al día</span>}
                        </div>
                      </button>
                      {areaAbierta && (
                        <div className="space-y-1.5">
                          {gente.map((p) => (<PersonaFila key={p.id} persona={p} llamadas={llamadas} onAuditar={() => setAuditando(p)} />))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 text-center text-xs text-humo">Toca a una persona para auditar sus pendientes.</p>
            </section>
          )}
        </div>
      )}

      {auditando && <AuditModal persona={auditando} llamadas={llamadas} onCerrar={() => setAuditando(null)} />}
    </div>
  );
}
