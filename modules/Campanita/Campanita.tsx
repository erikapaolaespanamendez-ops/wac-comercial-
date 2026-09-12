import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { fetchPerfil } from "../../data/usuarios";
import LlamadaJitsi from "../ChatInterno/LlamadaJitsi";
import { escucharEventos, type Evento } from "../../data/avisarEvento";
import { fetchSeguimiento, miLista } from "../../data/seguimiento";
import { intervaloVisible } from "../../lib/intervaloVisible";

type TipoNotif = "mensaje" | "llamada" | "video";
// Un aviso puede venir del "chat" o de un "evento" del sistema.
type Notif = {
  id: string;
  fuente: "chat" | "evento";
  autor: string;            // línea principal (autor del chat, o título del evento)
  tipo: TipoNotif;
  texto: string;
  canalId?: string;
  created_at: string;
  icono?: string;           // emoji propio del evento (si no, usa el del tipo)
  modulo?: string;          // 👈 NUEVO: a qué vista llevar al tocar "Abrir"
  refId?: string;           // 👈 NUEVO: id del registro (por si después se abre directo)
};

// Misma "llave" que usa el chat para armar los canales por correo.
function slug(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

// Emoji según el tipo de evento del sistema.
function iconoDeEvento(tipo: string): string {
  switch (tipo) {
    case "cliente": return "🧑‍💼";
    case "llamada": return "📞";
    case "reunion": return "🎥";
    case "colaborador": return "👥";
    case "grupo": return "💬";
    case "mensaje": return "💬";
    default: return "🔔";
  }
}

export default function Campanita({
  onIr,
  onAbrirChat,
  onIrModulo, // 👈 NUEVO: App nos dice cómo cambiar de módulo
}: {
  onIr?: () => void;
  onAbrirChat?: (nombre: string) => void;
  onIrModulo?: (modulo: string, refId?: string) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [sinVer, setSinVer] = useState(0);
  const [vencidos, setVencidos] = useState(0);            // 👈 NUEVO (C3): mis clientes vencidos hoy
  const rolRef = useRef<string | null>(null);             // 👈 NUEVO (C3): mi rol, para filtrar mi lista
  const [abierta, setAbierta] = useState(false);
  const [enLlamada, setEnLlamada] = useState<{ sala: string; soloAudio: boolean } | null>(null);
  const misCanales = useRef<Set<string>>(new Set());
  const ultimoVisto = useRef<string | null>(null); // último mensaje de chat ya revisado
  const ultimoEvento = useRef<string | null>(null); // último evento ya revisado
  const correoRef = useRef<string>("");            // mi correo de la sesión (llave robusta)

  // Detecta quién soy (igual que App.tsx), sin que App tenga que pasarme nada
  useEffect(() => {
    let activo = true;
    supabase.auth.getSession().then(async ({ data }) => {
      const email = data.session?.user?.email;
      if (!email) return;
      correoRef.current = email.trim().toLowerCase();
      const perfil = await fetchPerfil(email).catch(() => null);
      if (activo) setNombre(perfil?.nombre || email.split("@")[0]);
      rolRef.current = perfil?.rol ?? null;     // 👈 NUEVO (C3)
      if (activo) cargarVencidos();             // 👈 NUEVO (C3)
    });
    return () => { activo = false; };
  }, []);

  // 👇 NUEVO (C3): cuenta mis clientes vencidos hoy (según mi rol y los plazos del catálogo).
  async function cargarVencidos() {
    try {
      const todo = await fetchSeguimiento();
      const mios = miLista(todo, rolRef.current);
      setVencidos(mios.filter((x) => x.estado === "vencido").length);
    } catch { /* si falla, no rompe la campana */ }
  }

  // Revisa los vencidos cada 5 minutos.
  useEffect(() => {
    // 15 min: el conteo de vencidos cambia por día, no por minuto, y cada
    // ejecución dispara nueve consultas. Antes eran 5 min por pestaña.
    const parar = intervaloVisible(() => cargarVencidos(), 15 * 60 * 1000);
    return () => parar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Agrega avisos sin duplicar y sube el contador. Lo usamos para los eventos.
  function agregar(nuevos: Notif[], cuantos: number) {
    if (nuevos.length === 0) return;
    setNotifs((prev) => {
      const yaEstan = new Set(prev.map((n) => n.id));
      const limpios = nuevos.filter((a) => !yaEstan.has(a.id));
      if (limpios.length === 0) return prev;
      return [...limpios.reverse(), ...prev].slice(0, 30);
    });
    setSinVer((n) => n + cuantos);
  }

  async function cargarMisCanales() {
    if (!nombre) return;
    const yo = nombre.trim().toLowerCase(); // nombre flexible (sin mayúsculas/espacios)
    const set = new Set<string>();

    // Mis "slugs" de correo = la llave robusta que usa el chat.
    const slugs = new Set<string>();
    if (correoRef.current) slugs.add(slug(correoRef.current));
    try {
      const { data: col } = await supabase.from("colaboradores").select("correo").eq("nombre", nombre).limit(1);
      if (col && col[0]?.correo) slugs.add(slug(String(col[0].correo)));
    } catch {}

    // Canales directos (1 a 1): primero por NOMBRE (flexible), luego por CORREO (robusto).
    const { data: dms } = await supabase.from("chat_canales").select("id,area,dm_a,dm_b").eq("tipo", "directo");
    (dms || []).forEach((c: any) => {
      const a = (c.dm_a || "").trim().toLowerCase();
      const b = (c.dm_b || "").trim().toLowerCase();
      if (a === yo || b === yo) { set.add(c.id); return; }
      const area = String(c.area || "");
      if (area.startsWith("dm_")) {
        const partes = area.slice(3).split("__"); // [slugCorreoA, slugCorreoB]
        if (partes.some((p) => slugs.has(p))) set.add(c.id);
      }
    });

    // Grupos donde soy miembro (por nombre flexible).
    const { data: mem } = await supabase.from("chat_miembros").select("canal_id,nombre");
    (mem || []).forEach((m: any) => {
      if ((m.nombre || "").trim().toLowerCase() === yo) set.add(m.canal_id);
    });

    misCanales.current = set;
  }

  // RELEE LA BASE cada rato (no usa "tiempo real") => funciona en TODOS los aparatos.
  async function revisarMensajes() {
    if (!nombre) return;
    const ids = [...misCanales.current];
    if (ids.length === 0) return;

    // Primer pase: solo marca DESDE DÓNDE empezar (no avisa de lo viejo).
    if (ultimoVisto.current === null) {
      const { data } = await supabase.from("chat_mensajes").select("created_at")
        .in("canal_id", ids).order("created_at", { ascending: false }).limit(1);
      ultimoVisto.current = (data && data[0]?.created_at) || new Date().toISOString();
      return;
    }

    // Trae SOLO lo nuevo desde la última revisión.
    const { data } = await supabase.from("chat_mensajes").select("*")
      .in("canal_id", ids).gt("created_at", ultimoVisto.current)
      .order("created_at", { ascending: true }).limit(30);

    if (!data || data.length === 0) return;
    ultimoVisto.current = data[data.length - 1].created_at;

    // Quita los míos (no me aviso a mí mismo).
    const nuevos = data.filter((m: any) => m.autor_nombre !== nombre);
    if (nuevos.length === 0) return;

    const avisos: Notif[] = nuevos.map((m: any) => {
      const texto: string = m.texto || "";
      let tipo: TipoNotif = "mensaje";
      if (texto.startsWith("📞 Llamada")) tipo = "llamada";
      else if (texto.startsWith("🎥 Videollamada")) tipo = "video";
      const preview = tipo === "mensaje" ? (texto || (m.archivo_url ? "📎 Archivo" : "Mensaje")) : texto;
      return { id: m.id, fuente: "chat" as const, autor: m.autor_nombre || "Alguien", tipo, texto: preview, canalId: m.canal_id, created_at: m.created_at };
    });

    setNotifs((prev) => {
      const yaEstan = new Set(prev.map((n) => n.id));
      const limpios = avisos.filter((a) => !yaEstan.has(a.id));
      if (limpios.length === 0) return prev;
      return [...limpios.reverse(), ...prev].slice(0, 30); // los más nuevos arriba
    });
    setSinVer((n) => n + nuevos.length);
  }

  // ============ EVENTOS DEL SISTEMA (todos ven todo, salvo los dirigidos) ============
  function eventoANotif(e: Evento): Notif {
    return {
      id: e.id, fuente: "evento", autor: e.titulo, // el título va en la línea principal
      tipo: "mensaje", texto: e.detalle || "",
      created_at: e.created_at, icono: e.icono || iconoDeEvento(e.tipo),
      modulo: e.modulo || undefined, // 👈 NUEVO: guardamos a dónde llevar
      refId: e.ref_id || undefined,  // 👈 NUEVO
    };
  }

  async function revisarEventos() {
    if (!nombre) return;
    // Primer pase: solo marca DESDE DÓNDE empezar (no avisa de lo viejo).
    if (ultimoEvento.current === null) {
      const { data } = await supabase.from("eventos").select("created_at")
        .order("created_at", { ascending: false }).limit(1);
      ultimoEvento.current = (data && data[0]?.created_at) || new Date().toISOString();
      return;
    }
    const { data } = await supabase.from("eventos").select("*")
      .gt("created_at", ultimoEvento.current)
      .order("created_at", { ascending: true }).limit(30);
    if (!data || data.length === 0) return;
    ultimoEvento.current = data[data.length - 1].created_at;
    const nuevos = (data as Evento[]).filter((e) => {
      if ((e.autor || "") === nombre) return false;                 // no me aviso de lo mío
      const para = (e.meta?.paraEmail || "").toString().trim().toLowerCase();
      if (para && para !== correoRef.current) return false;         // dirigido a otra persona
      return true;
    });
    if (nuevos.length === 0) return;
    agregar(nuevos.map(eventoANotif), nuevos.length);
  }

  useEffect(() => {
    if (!nombre) return;
    ultimoVisto.current = null;  // empezar limpio para esta persona
    ultimoEvento.current = null;
    let vivo = true;

    (async () => {
      await cargarMisCanales();
      if (vivo) { revisarMensajes(); revisarEventos(); } // fija los puntos de partida
    })();

    // Los tres ciclos se DETIENEN cuando la pestaña no está al frente y se
    // reanudan (con refresco inmediato) al volver. Antes corrían siempre, aun
    // de madrugada sin nadie trabajando.
    // "Mis canales" cambia muy poco: se pasa de 60 s a 5 min; son 3 consultas
    // por vuelta (colaboradores + chat_canales + chat_miembros).
    const parCanales = intervaloVisible(cargarMisCanales, 5 * 60 * 1000);
    const parMsj = intervaloVisible(revisarMensajes, 30000);  // mensajes: 30 s
    const parEv = intervaloVisible(revisarEventos, 30000);    // eventos: 30 s

    // EN VIVO de los eventos (broadcast): aparece al instante para quien esté conectado.
    const dejarDeOir = escucharEventos((e) => {
      if ((e.autor || "") === nombre) return;
      const para = (e.meta?.paraEmail || "").toString().trim().toLowerCase();
      if (para && para !== correoRef.current) return;               // dirigido a otra persona
      agregar([eventoANotif(e)], 1);
    });

    return () => {
      vivo = false;
      parCanales(); parMsj(); parEv();
      dejarDeOir();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nombre]);

  function abrir() {
    setAbierta((v) => !v);
    setSinVer(0);
  }
  function hora(iso: string) {
    try { return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
  }
  function unirse(n: Notif) {
    if (!n.canalId) return;
    setAbierta(false);
    setEnLlamada({ sala: `JurisConecta-${n.canalId}`, soloAudio: n.tipo === "llamada" });
  }

  // Ícono y etiqueta según el tipo de aviso
  function icono(t: TipoNotif) { return t === "mensaje" ? "💬" : t === "llamada" ? "📞" : "🎥"; }
  function etiqueta(n: Notif) {
    if (n.fuente === "chat" && n.tipo === "llamada") return "Llamada";
    if (n.fuente === "chat" && n.tipo === "video") return "Videollamada";
    return n.texto;
  }

  return (
    <>
      <div className="relative">
        <button
          onClick={abrir}
          title="Notificaciones"
          aria-label="Notificaciones"
          className="relative flex h-9 w-9 items-center justify-center rounded-full text-humo transition hover:bg-nube hover:text-tinta"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {(sinVer + vencidos) > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {(sinVer + vencidos) > 9 ? "9+" : (sinVer + vencidos)}
            </span>
          )}
        </button>

        {abierta && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setAbierta(false)} />
            <div className="absolute right-0 top-11 z-50 w-72 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-black/10 bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-black/5 px-4 py-2.5">
                <span className="text-sm font-bold text-tinta">🔔 Notificaciones</span>
                {notifs.length > 0 && (
                  <button onClick={() => setNotifs([])} className="text-[11px] font-medium text-humo hover:text-tinta">Limpiar</button>
                )}
              </div>
              {/* 👇 NUEVO (C3): aviso de clientes vencidos → abre Mi lista del día */}
              {vencidos > 0 && onIrModulo && (
                <button
                  onClick={() => { setAbierta(false); onIrModulo("milista"); }}
                  className="flex w-full items-center gap-2.5 border-b border-black/5 bg-amber-50 px-3 py-2.5 text-left hover:bg-amber-100"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-lg">📋</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-amber-800">{vencidos} cliente{vencidos === 1 ? "" : "s"} vencido{vencidos === 1 ? "" : "s"} hoy</p>
                    <p className="truncate text-[11px] text-amber-700">Toca para ver tu lista del día</p>
                  </div>
                  <span className="shrink-0 rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white">Abrir</span>
                </button>
              )}
              <div className="max-h-80 overflow-y-auto">
                {notifs.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-humo">Sin notificaciones.</p>
                ) : (
                  notifs.map((n) => (
                    <div key={n.id} className="flex items-center gap-2.5 border-b border-black/5 px-3 py-2.5 last:border-0">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-soft text-lg">{n.icono || icono(n.tipo)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-tinta">{n.autor}</p>
                        <p className="truncate text-[11px] text-humo">{etiqueta(n)} · {hora(n.created_at)}</p>
                      </div>
                      {n.fuente === "chat" && n.tipo === "mensaje" && onAbrirChat && (
                        <button onClick={() => { setAbierta(false); onAbrirChat(n.autor); }} className="shrink-0 rounded-lg bg-teal px-2.5 py-1 text-xs font-semibold text-white hover:bg-teal-dark">Abrir</button>
                      )}
                      {n.fuente === "chat" && (n.tipo === "llamada" || n.tipo === "video") && (
                        <button onClick={() => unirse(n)} className="shrink-0 rounded-lg bg-teal px-2.5 py-1 text-xs font-semibold text-white hover:bg-teal-dark">Unirse</button>
                      )}
                      {/* 👇 NUEVO: avisos del sistema con su botón para ir al módulo */}
                      {n.fuente === "evento" && n.modulo && onIrModulo && (
                        <button onClick={() => { setAbierta(false); onIrModulo(n.modulo!, n.refId); }} className="shrink-0 rounded-lg bg-teal px-2.5 py-1 text-xs font-semibold text-white hover:bg-teal-dark">Abrir</button>
                      )}
                    </div>
                  ))
                )}
              </div>
              {onIr && (
                <button onClick={() => { setAbierta(false); onIr(); }} className="w-full border-t border-black/5 px-4 py-2.5 text-center text-xs font-medium text-teal-dark hover:bg-nube">
                  Ver registro de llamadas
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {enLlamada && (
        <LlamadaJitsi sala={enLlamada.sala} nombre={nombre || "Invitado"} soloAudio={enLlamada.soloAudio} onCerrar={() => setEnLlamada(null)} />
      )}
    </>
  );
}
