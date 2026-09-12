import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { supabase } from "../../lib/supabase";
import {
  fetchCanales, fetchMensajes, enviarMensaje, subirArchivo, crearCanal, suscribirCanal,
  fetchUltimosMensajes, fetchMiembros, agregarMiembro, quitarMiembro, subirFotoCanal, actualizarFotoCanal,
  buscarOCrearDirecto, eliminarMensaje,
  type Canal, type Mensaje, type Miembro, type UltimoMsg,
} from "../../data/chat";
import { fetchColaboradores, type Colaborador } from "../../data/colaboradores";
import { escucharMensajes } from "../../data/chatRealtime";
import { fetchLecturas, marcarLeidoServidor, marcarNoLeidoServidor, fetchConteosNoLeidos, type Lectura } from "../../data/lecturasChat";
import { fetchPreferencias, setPreferencia, type PrefMapa } from "../../data/chatPrefs";
import EmojiPicker from "./EmojiPicker";
import GrabadorVoz from "./GrabadorVoz";
import LlamadaGrupo from "./LlamadaChat";
import MarcadorTelefono from "../PruebaLlamada/PruebaLlamada";
import LineaTwilio from "./LineaTwilio";
import { intervaloVisible } from "../../lib/intervaloVisible";
const AREA_COLORES: Record<string, string> = {
  mesa_directiva: "#0C2E66", anuncios: "#DC2626", juridico: "#7C3AED",
  comercial: "#16A34A", contabilidad: "#1E50A0", atencion: "#EA580C",
  tecnologia: "#64748B", direccion: "#C9A227",
};
const EMOJIS_OPC = ["💬", "📁", "📌", "🔔", "⭐", "🏢", "🤝", "📊", "🛠️", "🎯", "📋", "🚨"];
const COLORES_OPC = ["#1E50A0", "#009B94", "#C9A227", "#7C3AED", "#16A34A", "#EA580C", "#DC2626", "#0C2E66", "#64748B"];

function horaCorta(iso: string): string {
  try { return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

function Avatar({ nombre, foto, size = 28 }: { nombre: string; foto?: string; size?: number }) {
  const inicial = (nombre || "?").charAt(0).toUpperCase();
  if (foto) return <img src={foto} alt={nombre} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  return <div className="shrink-0 rounded-full bg-slate-300 flex items-center justify-center font-bold text-slate-600" style={{ width: size, height: size, fontSize: size * 0.4 }}>{inicial}</div>;
}

function GroupAvatar({ canal, size = 40 }: { canal: Canal; size?: number }) {
  if (canal.foto_url) return <img src={canal.foto_url} alt={canal.nombre} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  return (
    <div className="shrink-0 rounded-full flex items-center justify-center" style={{ width: size, height: size, backgroundColor: canal.color + "22" }}>
      <span style={{ fontSize: size * 0.5 }}>{canal.emoji}</span>
    </div>
  );
}

export default function ChatInterno({ target, identidad }: { target?: { nombre: string; nonce: number } | null; identidad?: { nombre: string; area: string | null; correo?: string | null } | null }) {
  const [canales, setCanales] = useState<Canal[]>([]);
  const [canalActivo, setCanalActivo] = useState<Canal | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [yo, setYo] = useState<{ nombre: string; area: string; correo: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [fotos, setFotos] = useState<Record<string, string>>({});
  const [ultimos, setUltimos] = useState<Record<string, UltimoMsg>>({});
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [infoAbierta, setInfoAbierta] = useState(false);
  const [subiendoFotoGrupo, setSubiendoFotoGrupo] = useState(false);
  const [nuevoMiembro, setNuevoMiembro] = useState("");
  const [abrirCrear, setAbrirCrear] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoEmoji, setNuevoEmoji] = useState("💬");
  const [nuevoColor, setNuevoColor] = useState("#1E50A0");
  const [creando, setCreando] = useState(false);
  const [abrirDirecto, setAbrirDirecto] = useState(false);
  const [prefs, setPrefs] = useState<PrefMapa>({});
  const [accionesChat, setAccionesChat] = useState<Canal | null>(null);
  const [contacto, setContacto] = useState<{ nombre: string; col: Colaborador | null } | null>(null);
  const [mostrarArch, setMostrarArch] = useState(false);
  const [movilChat, setMovilChat] = useState(false);
  const [reenviar, setReenviar] = useState<Mensaje | null>(null);
  const [menuMas, setMenuMas] = useState(false);
  const [emojiAbierto, setEmojiAbierto] = useState(false);
  const [llamada, setLlamada] = useState<{ sala: string; soloAudio: boolean } | null>(null);
  const [marcador, setMarcador] = useState(false);
  const [esAdmin, setEsAdmin] = useState(false);
  const [misGrupos, setMisGrupos] = useState<Set<string>>(new Set());
  const [filtro, setFiltro] = useState<"todos" | "no_leidos" | "favoritos" | "grupos" | "directos">("todos");
  const [filtroMenu, setFiltroMenu] = useState(false);
  const [lecturas, setLecturas] = useState<Lectura[]>([]);
  const [conteos, setConteos] = useState<Record<string, number>>({});
  const finRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const camRef = useRef<HTMLInputElement | null>(null);
  const fotoGrupoRef = useRef<HTMLInputElement | null>(null);
  // Espejo SIEMPRE actualizado del chat abierto. Sirve para que el refresco
  // automático (cada 15 s) sepa cuál chat está abierto de verdad y no "reviva"
  // su bolita verde de no leídos por usar un valor viejo.
  const canalActivoRef = useRef<Canal | null>(null);
  useEffect(() => { canalActivoRef.current = canalActivo; }, [canalActivo]);

  // ===== Reglas de visibilidad de canales =====
  function esPublico(c: Canal): boolean {
    return (c.nombre || "").trim().toLowerCase() === "anuncios";
  }
  function puedeVerGrupo(c: Canal): boolean {
    return esAdmin || esPublico(c) || misGrupos.has(c.id);
  }
  function cargarMisGrupos(nombre: string) {
    supabase.from("chat_miembros").select("canal_id").eq("nombre", nombre).then(({ data }) => {
      setMisGrupos(new Set((data || []).map((r: any) => r.canal_id as string)));
    });
  }

  function marcarLeido(canalId: string) {
    try {
      const cur = JSON.parse(localStorage.getItem("chat_visto") || "{}");
      cur[canalId] = new Date().toISOString();
      localStorage.setItem("chat_visto", JSON.stringify(cur));
    } catch { /* sin problema */ }
  }

  useEffect(() => {
    const guardado = localStorage.getItem("chat_yo");
    if (guardado) { try { const o = JSON.parse(guardado); if (o && o.correo) setYo(o); } catch {} }
    fetchCanales().then(setCanales);
    fetchColaboradores().then((cols) => {
      setColaboradores(cols);
      const m: Record<string, string> = {};
      for (const c of cols) if (c.foto_url) m[c.nombre] = c.foto_url;
      setFotos(m);
    });
    fetchUltimosMensajes().then(setUltimos);
  }, []);

  useEffect(() => {
    if (!identidad?.nombre && !identidad?.correo) return;
    const metaCorreo = (identidad?.correo || "").trim().toLowerCase();
    const metaNombre = (identidad?.nombre || "").trim().toLowerCase();
    const col =
      (metaCorreo ? colaboradores.find((c) => (c.correo || "").trim().toLowerCase() === metaCorreo) : undefined) ||
      colaboradores.find((c) => c.nombre.trim().toLowerCase() === metaNombre) ||
      null;
    const persona = col
      ? { nombre: col.nombre, area: col.area || "", correo: (col.correo || "").trim().toLowerCase() }
      : { nombre: identidad?.nombre || "", area: identidad?.area || "", correo: metaCorreo };
    setYo(persona);
    setEsAdmin(col?.rol_sistema === "super_admin" || col?.rol_sistema === "admin");
    try { localStorage.setItem("chat_yo", JSON.stringify(persona)); } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identidad?.nombre, colaboradores]);

  useEffect(() => {
    if (!yo?.nombre) { setMisGrupos(new Set()); return; }
    cargarMisGrupos(yo.nombre);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yo?.nombre]);

  // NO abrimos ningún chat solos al entrar (así las bolitas de "no leídos" se
  // quedan a la vista hasta que TÚ toques un chat, igual que WhatsApp). Lo único
  // que hace este efecto es cerrar el chat abierto si dejó de ser visible para ti.
  useEffect(() => {
    if (!yo) return;
    if (canalActivo && canalActivo.tipo !== "directo" && !puedeVerGrupo(canalActivo)) {
      setCanalActivo(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yo, esAdmin, misGrupos, canales]);

  useEffect(() => {
    if (yo?.nombre) fetchPreferencias(yo.nombre).then(setPrefs);
    else setPrefs({});
  }, [yo?.nombre]);

  useEffect(() => {
    if (!canalActivo) return;
    let activo = true;
    fetchMensajes(canalActivo.id).then((ms) => { if (activo) setMensajes(ms); });
    fetchMiembros(canalActivo.id).then((mm) => { if (activo) setMiembros(mm); });
    const stop = suscribirCanal(canalActivo.id, (nuevo) => {
      setMensajes((prev) => (prev.some((m) => m.id === nuevo.id) ? prev : [...prev, nuevo]));
      setUltimos((prev) => ({ ...prev, [nuevo.canal_id]: { canal_id: nuevo.canal_id, texto: nuevo.texto, archivo_tipo: nuevo.archivo_tipo, autor_nombre: nuevo.autor_nombre, created_at: nuevo.created_at } }));
    });
    return () => { activo = false; stop(); };
  }, [canalActivo]);

  useEffect(() => { finRef.current?.scrollIntoView({ behavior: "smooth" }); }, [mensajes]);

  // Marca como leído el chat abierto (local + servidor) y pone su contador en 0.
  useEffect(() => {
    if (!canalActivo) return;
    marcarLeido(canalActivo.id);
    if (yo) {
      const hasta = ultimos[canalActivo.id]?.created_at || new Date().toISOString();
      marcarLeidoServidor(canalActivo.id, yo.nombre, hasta);
      setConteos((p) => ({ ...p, [canalActivo.id]: 0 }));
      fetchLecturas().then(setLecturas);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canalActivo?.id, ultimos[canalActivo?.id || ""]?.created_at, yo?.nombre]);

  // Carga inicial + refresco periódico de lecturas y no-leídos (para palomitas y contadores).
  useEffect(() => {
    if (!yo) return;
    let vivo = true;
    const cargar = () => {
      fetchLecturas().then((l) => { if (vivo) setLecturas(l); });
      fetchConteosNoLeidos(yo.nombre).then((c) => {
        if (!vivo) return;
        const act = canalActivoRef.current; // chat abierto REAL en este momento
        setConteos(act ? { ...c, [act.id]: 0 } : c);
      });
    };
    cargar();
    const t = intervaloVisible(cargar, 60000);
    return () => { vivo = false; t(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yo?.nombre]);

  // Bolita EN VIVO: cuando llega un mensaje de otra persona a un chat que NO
  // tienes abierto, sube su contador al instante (sin esperar el refresco).
  useEffect(() => {
    if (!yo?.nombre) return;
    const miNombre = yo.nombre.trim().toLowerCase();
    const stop = escucharMensajes((m) => {
      if ((m.autor_nombre || "").trim().toLowerCase() === miNombre) return; // es mío
      if (canalActivoRef.current?.id === m.canal_id) return;                // lo estoy viendo
      setConteos((p) => ({ ...p, [m.canal_id]: (p[m.canal_id] || 0) + 1 }));
    });
    return () => { stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yo?.nombre]);

  useEffect(() => {
    if (!target?.nombre || !yo) return;
    abrirDirectoCon(target.nombre);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.nonce, yo]);

  function otroDe(c: Canal): string {
    if (!yo) return c.nombre;
    return c.dm_a === yo.nombre ? (c.dm_b || c.nombre) : (c.dm_a || c.nombre);
  }

  async function abrirDirectoCon(nombre: string) {
    if (!yo) { alert("No se detectó tu usuario. Recarga la página."); return; }
    if (nombre === yo.nombre) return;
    // Busca el correo de la otra persona en el Directorio (colaboradores).
    const meta = (nombre || "").trim().toLowerCase();
    const col = colaboradores.find((c) => (c.nombre || "").trim().toLowerCase() === meta);
    const otroCorreo = (col?.correo || "").trim().toLowerCase();
    const canal = await buscarOCrearDirecto(yo.correo, yo.nombre, otroCorreo, nombre);
    if (canal) {
      setCanales((prev) => (prev.some((c) => c.id === canal.id) ? prev : [...prev, canal]));
      setCanalActivo(canal);
      setMovilChat(true);
    } else alert("No se pudo abrir el chat directo.");
  }

  function preview(canalId: string): { texto: string; hora: string } | null {
    const u = ultimos[canalId];
    if (!u) return null;
    let t = u.texto || "";
    if (!t) {
      if (u.archivo_tipo === "imagen") t = "📷 Foto";
      else if (u.archivo_tipo === "pdf") t = "📄 PDF";
      else if ((u.archivo_tipo as string) === "audio") t = "🎤 Nota de voz";
      else if (u.archivo_tipo === "archivo") t = "📎 Archivo";
    }
    return { texto: t, hora: horaCorta(u.created_at) };
  }

  function agregarLocal(r: Mensaje) {
    setMensajes((prev) => (prev.some((m) => m.id === r.id) ? prev : [...prev, r]));
  }

  async function reenviarA(destino: Canal) {
    if (!reenviar || !yo) return;
    const m = reenviar;
    const r = await enviarMensaje({
      canalId: destino.id,
      autorNombre: yo.nombre,
      autorArea: yo.area,
      texto: m.texto || "",
      archivoUrl: m.archivo_url || undefined,
      archivoTipo: (m.archivo_tipo || undefined) as any,
      archivoNombre: m.archivo_nombre || undefined,
    });
    setReenviar(null);
    if (r) { setCanalActivo(destino); setMovilChat(true); }
    else alert("No se pudo reenviar.");
  }

  async function onAudioGrabado(blob: Blob) {
    if (!canalActivo || !yo) return;
    if (blob.size > 10 * 1024 * 1024) { alert("La nota de voz es muy larga."); return; }
    setSubiendo(true);
    const file = new File([blob], `nota-voz-${Date.now()}.webm`, { type: blob.type || "audio/webm" });
    const subido = await subirArchivo(file);
    if (subido) {
      const r = await enviarMensaje({ canalId: canalActivo.id, autorNombre: yo.nombre, autorArea: yo.area, texto: "", archivoUrl: subido.url, archivoTipo: "audio" as any, archivoNombre: "Nota de voz" });
      if (r) agregarLocal(r);
    } else alert("No se pudo enviar la nota de voz.");
    setSubiendo(false);
  }

  async function llamar(video: boolean) {
    if (!canalActivo || !yo) return;
    const sala = `JurisConecta-${canalActivo.id}`;
    const etiqueta = video ? "🎥 Videollamada" : "📞 Llamada de voz";
    const r = await enviarMensaje({ canalId: canalActivo.id, autorNombre: yo.nombre, autorArea: yo.area, texto: etiqueta });
    if (r) agregarLocal(r);
    setLlamada({ sala, soloAudio: !video });
  }

  function correo() {
    if (!canalActivo) return;
    if (canalActivo.tipo !== "directo") { alert("El correo es para chats directos (una sola persona)."); return; }
    const otro = otroDe(canalActivo);
    const col = colaboradores.find((c) => c.nombre === otro);
    if (!col?.correo) { alert("No tengo el correo de esta persona en el Directorio."); return; }
    window.open(`mailto:${col.correo}`, "_blank");
  }

  async function mandar() {
    if (!canalActivo || !yo || !texto.trim() || enviando) return;
    setEnviando(true);
    const r = await enviarMensaje({ canalId: canalActivo.id, autorNombre: yo.nombre, autorArea: yo.area, texto });
    setEnviando(false);
    if (r) { setTexto(""); agregarLocal(r); }
  }

  // 🗑️ Manda un mensaje a la papelera (no lo borra de la base) y lo quita de la vista.
  async function borrarMsj(m: Mensaje) {
    if (!confirm("¿Mandar este mensaje a la papelera?")) return;
    const ok = await eliminarMensaje(m.id, true);
    if (ok) setMensajes((prev) => prev.filter((x) => x.id !== m.id));
    else alert("No se pudo mandar a la papelera.");
  }

  // 🔵 Marca un chat como NO leído (vuelve a salir su bolita).
  async function marcarNoLeido(c: Canal) {
    if (!yo) return;
    if (canalActivo?.id === c.id) setCanalActivo(null); // si está abierto, ciérralo para que se vea
    await marcarNoLeidoServidor(c.id, yo.nombre);
    setConteos((p) => ({ ...p, [c.id]: Math.max(1, p[c.id] || 0) }));
  }

  async function onArchivo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !canalActivo || !yo) return;
    if (file.size > 10 * 1024 * 1024) { alert("El archivo es muy grande (máximo 10 MB)."); return; }
    setSubiendo(true);
    const subido = await subirArchivo(file);
    if (subido) {
      const r = await enviarMensaje({ canalId: canalActivo.id, autorNombre: yo.nombre, autorArea: yo.area, texto, archivoUrl: subido.url, archivoTipo: subido.tipo, archivoNombre: subido.nombre });
      if (r) { setTexto(""); agregarLocal(r); }
    } else alert("No se pudo subir el archivo.");
    setSubiendo(false);
  }

  async function onFotoGrupo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !canalActivo) return;
    if (file.size > 5 * 1024 * 1024) { alert("La foto es muy grande (máximo 5 MB)."); return; }
    setSubiendoFotoGrupo(true);
    const url = await subirFotoCanal(file);
    if (url) {
      await actualizarFotoCanal(canalActivo.id, url);
      const act = { ...canalActivo, foto_url: url };
      setCanalActivo(act);
      setCanales((prev) => prev.map((c) => (c.id === act.id ? act : c)));
    } else alert("No se pudo subir la foto.");
    setSubiendoFotoGrupo(false);
  }

  async function agregar() {
    if (!nuevoMiembro || !canalActivo) return;
    const ok = await agregarMiembro(canalActivo.id, nuevoMiembro);
    if (ok) { setNuevoMiembro(""); fetchMiembros(canalActivo.id).then(setMiembros); if (yo) cargarMisGrupos(yo.nombre); }
    else alert("No se pudo agregar.");
  }
  async function quitar(nombre: string) {
    if (!canalActivo) return;
    const ok = await quitarMiembro(canalActivo.id, nombre);
    if (ok) { fetchMiembros(canalActivo.id).then(setMiembros); if (yo) cargarMisGrupos(yo.nombre); }
  }

  async function crearGrupo() {
    if (!nuevoNombre.trim() || creando) return;
    setCreando(true);
    const nuevo = await crearCanal({ nombre: nuevoNombre.trim(), emoji: nuevoEmoji, color: nuevoColor });
    setCreando(false);
    if (nuevo) {
      if (yo) { await agregarMiembro(nuevo.id, yo.nombre); setMisGrupos((s) => { const n = new Set(s); n.add(nuevo.id); return n; }); }
      setCanales((prev) => [...prev, nuevo]);
      setCanalActivo(nuevo);
      setAbrirCrear(false);
      setNuevoNombre(""); setNuevoEmoji("💬"); setNuevoColor("#1E50A0");
    } else alert("No se pudo crear el grupo.");
  }

  const esFav = (c: Canal) => !!prefs[c.id]?.favorito;
  const esArch = (c: Canal) => !!prefs[c.id]?.archivado;
  const esNoLeido = (c: Canal) => (conteos[c.id] || 0) > 0;

  // Estado de entrega/lectura de un mensaje MÍO en el canal abierto.
  const claveU = (s: string) => (s || "").trim().toLowerCase();
  function estadoMensaje(m: Mensaje): "enviado" | "entregado" | "leido" {
    if (!canalActivo || !yo) return "enviado";
    const otros = canalActivo.tipo === "directo"
      ? [otroDe(canalActivo)]
      : miembros.map((x) => x.nombre).filter((n) => claveU(n) !== claveU(yo.nombre));
    if (otros.length === 0) return "enviado";
    const t = new Date(m.created_at).getTime();
    const leyo = (nombre: string) => {
      const l = lecturas.find((x) => x.canalId === canalActivo.id && x.usuario === claveU(nombre));
      return !!l && new Date(l.leidoHasta).getTime() >= t;
    };
    const tieneLectura = (nombre: string) => lecturas.some((x) => x.canalId === canalActivo.id && x.usuario === claveU(nombre));
    if (otros.every(leyo)) return "leido";
    if (otros.some(tieneLectura)) return "entregado";
    return "enviado";
  }

  async function toggleFavorito(c: Canal) {
    if (!yo) { alert("No se detectó tu usuario."); return; }
    const nuevo = !esFav(c);
    setPrefs((p) => ({ ...p, [c.id]: { favorito: nuevo, archivado: p[c.id]?.archivado || false } }));
    await setPreferencia(yo.nombre, c.id, { favorito: nuevo });
  }
  async function toggleArchivar(c: Canal) {
    if (!yo) { alert("No se detectó tu usuario."); return; }
    const nuevo = !esArch(c);
    setPrefs((p) => ({ ...p, [c.id]: { favorito: p[c.id]?.favorito || false, archivado: nuevo } }));
    await setPreferencia(yo.nombre, c.id, { archivado: nuevo });
  }
  function abrirInfo(c: Canal) {
    if (c.tipo === "directo") {
      const otro = otroDe(c);
      const col = colaboradores.find((x) => x.nombre === otro) || null;
      setContacto({ nombre: otro, col });
    } else {
      setCanalActivo(c);
      setInfoAbierta(true);
    }
  }

  const visiblesGrupos = canales.filter((c) => c.tipo !== "directo" && puedeVerGrupo(c));
  const visiblesDirectos = canales.filter((c) => c.tipo === "directo" && yo && (c.dm_a === yo.nombre || c.dm_b === yo.nombre));
  const todosVisibles = [...visiblesGrupos, ...visiblesDirectos];
  const archivados = todosVisibles.filter((c) => esArch(c));
  const noArchivados = todosVisibles.filter((c) => !esArch(c));
  const noLeidosLista = noArchivados.filter(esNoLeido);
  const listaFiltrada = (
    filtro === "favoritos" ? noArchivados.filter(esFav) :
    filtro === "grupos" ? noArchivados.filter((c) => c.tipo !== "directo") :
    filtro === "directos" ? noArchivados.filter((c) => c.tipo === "directo") :
    filtro === "no_leidos" ? noLeidosLista :
    noArchivados
  ).slice().sort((a, b) => (ultimos[b.id]?.created_at || "").localeCompare(ultimos[a.id]?.created_at || ""));
  const chipsPrincipales: { id: typeof filtro; label: string; count?: number }[] = [
    { id: "todos", label: "Todos" },
    { id: "no_leidos", label: "No leídos", count: noLeidosLista.length },
    { id: "favoritos", label: "Favoritos", count: noArchivados.filter(esFav).length },
  ];
  const chipsOverflow: { id: typeof filtro; label: string; count?: number }[] = [
    { id: "grupos", label: "Grupos", count: noArchivados.filter((c) => c.tipo !== "directo").length },
    { id: "directos", label: "Directos", count: noArchivados.filter((c) => c.tipo === "directo").length },
  ];
  const overflowActivo = chipsOverflow.find((c) => c.id === filtro);
  const esDirecto = canalActivo?.tipo === "directo";

  const fila = (c: Canal) => {
    const directo = c.tipo === "directo";
    const nombre = directo ? otroDe(c) : c.nombre;
    const sel = canalActivo?.id === c.id;
    const pv = preview(c.id);
    const fav = esFav(c);
    const noLeido = esNoLeido(c) && !sel;
    return (
      <div key={c.id} className="relative">
        <button onClick={() => { setCanalActivo(c); setMovilChat(true); }} className={`w-full text-left px-2.5 py-1.5 pr-8 flex items-center gap-2.5 transition ${sel ? "bg-white" : "hover:bg-white/70"}`} style={{ borderLeft: `3px solid ${sel ? (directo ? "#1E50A0" : c.color) : "transparent"}` }}>
          {directo ? <Avatar nombre={nombre} foto={fotos[nombre]} size={60} /> : <GroupAvatar canal={c} size={60} />}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <span className={`truncate text-[16px] ${noLeido ? "font-bold text-slate-900" : sel ? "font-semibold text-slate-800" : "text-slate-700"}`}>{fav && <span className="text-amber-500">★ </span>}{nombre}</span>
              {pv && <span className="shrink-0 text-[13px] text-slate-400">{pv.hora}</span>}
            </div>
            <div className="flex items-center justify-between gap-1">
              <p className={`truncate text-[14px] ${noLeido ? "text-slate-600 font-medium" : "text-slate-400"}`}>{pv ? pv.texto : "Sin mensajes aún"}</p>
              {noLeido && <span className="ml-1 inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[11px] font-bold leading-none text-white">{(conteos[c.id] || 0) > 99 ? "99+" : conteos[c.id]}</span>}
            </div>
          </div>
        </button>
        <button onClick={(e) => { e.stopPropagation(); setAccionesChat(c); }} title="Acciones" className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md px-1 py-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600">⋮</button>
      </div>
    );
  };

  return (
    <>
      <div className="flex h-[calc(100dvh-6.5rem)] min-h-[440px] md:h-[calc(100vh-6.5rem)] rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-sm">
        <aside className={"w-full md:w-64 shrink-0 border-r border-slate-200 bg-slate-50 flex-col " + (movilChat ? "hidden md:flex" : "flex")}>
          <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-slate-200">
            {chipsPrincipales.map((ch) => {
              const activo = filtro === ch.id;
              return (
                <button key={ch.id} onClick={() => setFiltro(ch.id)} className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${activo ? "bg-teal text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                  {ch.label}{ch.count ? ` ${ch.count}` : ""}
                </button>
              );
            })}
            <div className="relative ml-auto shrink-0">
              <button
                onClick={() => setFiltroMenu((v) => !v)}
                aria-label="Más filtros"
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition ${overflowActivo ? "bg-teal text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                {overflowActivo && <span>{overflowActivo.label}</span>}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M6 9l6 6 6-6" /></svg>
              </button>
              {filtroMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setFiltroMenu(false)} />
                  <div className="absolute right-0 top-9 z-20 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                    {chipsOverflow.map((ch) => (
                      <button
                        key={ch.id}
                        onClick={() => { setFiltro(ch.id); setFiltroMenu(false); }}
                        className={`flex w-full items-center justify-between px-3 py-2 text-sm transition ${filtro === ch.id ? "bg-teal-soft font-semibold text-teal-dark" : "text-slate-600 hover:bg-slate-50"}`}
                      >
                        <span>{ch.label}</span>
                        {ch.count ? <span className="text-xs text-slate-400">{ch.count}</span> : null}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {!yo && <p className="px-4 py-3 text-xs text-slate-400">Cargando…</p>}
            {yo && listaFiltrada.length === 0 && <p className="px-4 py-3 text-xs text-slate-400">No hay chats en este filtro.</p>}
            {listaFiltrada.map(fila)}

            {archivados.length > 0 && (
              <>
                <button onClick={() => setMostrarArch((v) => !v)} className="w-full px-4 pt-3 pb-1 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700">
                  🗄️ Archivados ({archivados.length}) {mostrarArch ? "▾" : "▸"}
                </button>
                {mostrarArch && archivados.map(fila)}
              </>
            )}
          </div>

          <div className="border-t border-slate-200 p-2 space-y-2">
            <button onClick={() => setAbrirDirecto(true)} className="w-full rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-500 hover:bg-white hover:text-teal-dark">+ Mensaje directo</button>
            <button onClick={() => setAbrirCrear(true)} className="w-full rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-500 hover:bg-white hover:text-teal-dark">+ Crear grupo</button>
          </div>
        </aside>

        <section className={"flex-1 flex-col min-w-0 " + (movilChat ? "flex" : "hidden md:flex")}>
          <header className="px-3 sm:px-4 py-2 border-b border-slate-200 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <button onClick={() => setMovilChat(false)} title="Volver" aria-label="Volver a la lista" className="md:hidden shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M15 18l-6-6 6-6" /></svg>
              </button>
              <button onClick={() => canalActivo && !esDirecto && setInfoAbierta(true)} className="flex items-center gap-2 text-left min-w-0">
                {canalActivo && (esDirecto
                  ? <Avatar nombre={otroDe(canalActivo)} foto={fotos[otroDe(canalActivo)]} size={50} />
                  : <GroupAvatar canal={canalActivo} size={50} />)}
                <div className="min-w-0">
                  <h2 className="truncate font-semibold text-slate-800 leading-tight">{canalActivo ? (esDirecto ? otroDe(canalActivo) : canalActivo.nombre) : "Selecciona un chat"}</h2>
                  <p className="truncate text-[11px] text-slate-400">{esDirecto ? "Chat directo" : `${miembros.length} integrante(s) · toca para ver info`}</p>
                </div>
              </button>
            </div>
            {yo ? (
              <div className="flex shrink-0 items-center gap-2 text-sm">
                <Avatar nombre={yo.nombre} foto={fotos[yo.nombre]} size={36} />
                <span className="hidden text-slate-600 sm:inline">{yo.nombre.split(" ")[0]}</span>
              </div>
            ) : (
              <span className="shrink-0 text-xs text-slate-400">…</span>
            )}
          </header>

          <div className="flex-1 overflow-y-auto px-2.5 sm:px-3 py-2 space-y-1 bg-slate-50">
            {mensajes.length === 0 && <p className="text-center text-sm text-slate-400 mt-8">{esDirecto ? "Escríbele para empezar la conversación. 👋" : "No hay mensajes en este grupo todavía. ¡Sé el primero! 👋"}</p>}
            {mensajes.map((m) => {
              const mio = yo?.nombre === m.autor_nombre;
              const color = AREA_COLORES[m.autor_area || ""] || "#64748B";
              return (
                <div key={m.id} className={`flex items-end gap-1.5 ${mio ? "justify-end" : "justify-start"}`}>
                  {!mio && <Avatar nombre={m.autor_nombre} foto={fotos[m.autor_nombre]} size={48} />}
                  <div className={`max-w-[82%] sm:max-w-[64%] rounded-xl px-3 py-2 text-[16px] leading-snug shadow-sm ${mio ? "bg-teal text-white" : "bg-white border border-slate-200 text-slate-800"}`}>
                    {!mio && !esDirecto && <p className="text-xs font-semibold mb-0.5" style={{ color }}>{m.autor_nombre}</p>}
                    {m.archivo_url && m.archivo_tipo === "imagen" && (
                      <button onClick={() => window.open(m.archivo_url!, "_blank")} className="block mb-1"><img src={m.archivo_url} alt={m.archivo_nombre || "imagen"} className="rounded-lg max-h-52 max-w-[220px] w-auto object-cover" /></button>
                    )}
                    {m.archivo_url && (m.archivo_tipo as string) === "audio" && (
                      <audio controls src={m.archivo_url} className="mb-1 w-52 max-w-full" />
                    )}
                    {m.archivo_url && (m.archivo_tipo === "pdf" || m.archivo_tipo === "archivo") && (
                      <button onClick={() => window.open(m.archivo_url!, "_blank")} className={`flex items-center gap-2 mb-1 rounded-lg px-3 py-2 text-left ${mio ? "bg-white/20" : "bg-black/5"}`}>
                        <span>{m.archivo_tipo === "pdf" ? "📄" : "📎"}</span><span className="underline break-all">{m.archivo_nombre || "Archivo"}</span>
                      </button>
                    )}
                    {m.texto && <p className="whitespace-pre-wrap break-words">{m.texto}</p>}
                    {m.texto && (m.texto.startsWith("📞 Llamada") || m.texto.startsWith("🎥 Videollamada")) && canalActivo && (
                     <button onClick={() => setLlamada({ sala: `JurisConecta-${canalActivo.id}`, soloAudio: !(m.texto || "").startsWith("🎥") })} className={`mt-1 block rounded-lg px-3 py-1.5 text-xs font-semibold ${mio ? "bg-white/25 text-white" : "bg-teal text-white"}`}>Unirse a la llamada ▶</button>
                    )}
                    <p className={`text-[11.5px] mt-1 flex items-center justify-end gap-1 ${mio ? "text-white/70" : "text-slate-400"}`}>
                      <span>{horaCorta(m.created_at)}</span>
                      {mio && (() => {
                        const est = estadoMensaje(m);
                        const dos = est !== "enviado";
                        const color = est === "leido" ? "#4ade80" : "#7dd3fc";
                        return <span title={est === "leido" ? "Leído" : est === "entregado" ? "Entregado" : "Enviado"} style={{ color }} className="font-bold tracking-[-0.15em] pr-0.5">{dos ? "✓✓" : "✓"}</span>;
                      })()}
                    </p>
                  </div>
                  <button onClick={() => setReenviar(m)} title="Reenviar" aria-label="Reenviar" className="shrink-0 self-center rounded-full p-1 text-slate-300 hover:bg-slate-200 hover:text-slate-500">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M15 17l5-5-5-5" /><path d="M4 18v-2a4 4 0 0 1 4-4h12" /></svg>
                  </button>
                  {(mio || esAdmin) && (
                    <button onClick={() => borrarMsj(m)} title="Mandar a la papelera" aria-label="Borrar" className="shrink-0 self-center rounded-full p-1 text-slate-300 hover:bg-red-50 hover:text-red-500">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
                    </button>
                  )}
                </div>
              );
            })}
            <div ref={finRef} />
          </div>

          <div className="border-t border-slate-200 p-2 sm:p-3 flex items-end gap-2 bg-white">
            <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={onArchivo} />
            <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onArchivo} />

            <div className="relative shrink-0">
              <button onClick={() => setMenuMas((v) => !v)} disabled={!yo || subiendo} title="Más" aria-label="Más opciones" className="rounded-xl border border-slate-300 px-3 py-2 text-xl leading-none text-slate-500 disabled:opacity-50 hover:bg-slate-50">＋</button>
              {menuMas && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuMas(false)} />
                  <div className="absolute bottom-12 left-0 z-50 w-52 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 shadow-xl">
                    <button onClick={() => { setMenuMas(false); camRef.current?.click(); }} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"><span className="text-lg">📷</span> Cámara</button>
                    <button onClick={() => { setMenuMas(false); fileRef.current?.click(); }} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"><span className="text-lg">🖼️</span> Foto o PDF</button>
                    <button onClick={() => { setMenuMas(false); setEmojiAbierto(true); }} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"><span className="text-lg">😀</span> Emoji</button>
                    <div className="my-1 border-t border-slate-100" />
                    <button onClick={() => { setMenuMas(false); llamar(false); }} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"><span className="text-lg">📞</span> Llamar</button>
                    <button onClick={() => { setMenuMas(false); llamar(true); }} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"><span className="text-lg">🎥</span> Videollamada</button>
                    <button onClick={() => { setMenuMas(false); setMarcador(true); }} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-semibold text-emerald-600 hover:bg-emerald-50"><span className="text-lg">☎️</span> Llamar a teléfono</button>
                    <button onClick={() => { setMenuMas(false); correo(); }} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"><span className="text-lg">✉️</span> Correo</button>
                  </div>
                </>
              )}
            </div>

            <div className="relative flex-1">
              <textarea value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); mandar(); } }} placeholder={subiendo ? "Subiendo…" : yo ? "Escribe un mensaje…" : "Cargando tu usuario…"} disabled={!yo || subiendo} rows={1} className="w-full resize-none border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal/40 disabled:bg-slate-100" />
              <EmojiPicker abierto={emojiAbierto} onClose={() => setEmojiAbierto(false)} onPick={(e) => setTexto((t) => t + e)} />
            </div>

            <GrabadorVoz onAudio={onAudioGrabado} disabled={!yo || subiendo} />
            <button onClick={mandar} disabled={!yo || !texto.trim() || enviando || subiendo} className="bg-teal hover:bg-teal-dark text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50 transition shrink-0">{enviando ? "…" : "Enviar"}</button>
          </div>
        </section>
      </div>

      {reenviar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setReenviar(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-800 mb-1">Reenviar a…</h3>
            <p className="text-xs text-slate-400 mb-3 truncate">{reenviar.texto || ((reenviar.archivo_tipo as string) === "audio" ? "🎤 Nota de voz" : reenviar.archivo_tipo === "imagen" ? "📷 Foto" : reenviar.archivo_tipo === "pdf" ? "📄 PDF" : "📎 Archivo")}</p>
            <div className="space-y-1">
              {[...visiblesGrupos, ...visiblesDirectos].map((c) => {
                const directo = c.tipo === "directo";
                const nombre = directo ? otroDe(c) : c.nombre;
                return (
                  <button key={c.id} onClick={() => reenviarA(c)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-left">
                    {directo ? <Avatar nombre={nombre} foto={fotos[nombre]} size={40} /> : <GroupAvatar canal={c} size={40} />}
                    <span className="text-sm text-slate-700 truncate">{nombre}</span>
                  </button>
                );
              })}
            </div>
            <button onClick={() => setReenviar(null)} className="mt-4 w-full rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancelar</button>
          </div>
        </div>
      )}

      {accionesChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setAccionesChat(null)}>
          <div className="w-full max-w-xs rounded-2xl bg-white p-3 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="px-2 py-1.5 text-sm font-semibold text-slate-700 truncate">{accionesChat.tipo === "directo" ? otroDe(accionesChat) : accionesChat.nombre}</p>
            <button onClick={() => { toggleFavorito(accionesChat); setAccionesChat(null); }} className="w-full text-left rounded-lg px-3 py-2.5 text-sm hover:bg-slate-50">📌 {esFav(accionesChat) ? "Quitar de favoritos" : "Añadir a favoritos"}</button>
            <button onClick={() => { marcarNoLeido(accionesChat); setAccionesChat(null); }} className="w-full text-left rounded-lg px-3 py-2.5 text-sm hover:bg-slate-50">🔵 Marcar como no leído</button>
            <button onClick={() => { toggleArchivar(accionesChat); setAccionesChat(null); }} className="w-full text-left rounded-lg px-3 py-2.5 text-sm hover:bg-slate-50">🗄️ {esArch(accionesChat) ? "Desarchivar" : "Archivar"}</button>
            <button onClick={() => { abrirInfo(accionesChat); setAccionesChat(null); }} className="w-full text-left rounded-lg px-3 py-2.5 text-sm hover:bg-slate-50">ℹ️ Información</button>
            <button onClick={() => setAccionesChat(null)} className="mt-1 w-full rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-50">Cerrar</button>
          </div>
        </div>
      )}

      {contacto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setContacto(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col items-center gap-2">
              <Avatar nombre={contacto.nombre} foto={fotos[contacto.nombre]} size={72} />
              <h3 className="font-semibold text-slate-800">{contacto.nombre}</h3>
              {contacto.col?.puesto && <p className="text-sm text-slate-500">{contacto.col.puesto}</p>}
            </div>
            <div className="mt-4 space-y-1.5 text-sm">
              {contacto.col?.extension && <p className="text-slate-600">☎️ Ext {contacto.col.extension}</p>}
              {contacto.col?.telefono && <p className="text-slate-600">📞 {contacto.col.telefono}</p>}
              {contacto.col?.whatsapp && <p className="text-slate-600">💬 {contacto.col.whatsapp}</p>}
              {contacto.col?.correo && <p className="text-slate-600 break-all">✉️ {contacto.col.correo}</p>}
              {!contacto.col && <p className="text-slate-400">No hay datos extra de este contacto.</p>}
            </div>
            <button onClick={() => setContacto(null)} className="mt-4 w-full rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Cerrar</button>
          </div>
        </div>
      )}

      {abrirDirecto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setAbrirDirecto(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-800 mb-1">Nuevo mensaje directo</h3>
            {!yo && <p className="text-sm text-amber-600 mb-2">Cargando tu usuario…</p>}
            <div className="space-y-1 mt-2">
              {colaboradores.filter((c) => (!yo || c.nombre !== yo.nombre) && (c.tipo_personal ?? "interno") === "interno").map((c) => (
                <button key={c.id} onClick={() => { abrirDirectoCon(c.nombre); setAbrirDirecto(false); }} disabled={!yo} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-left disabled:opacity-50">
                  <Avatar nombre={c.nombre} foto={fotos[c.nombre]} size={40} />
                  <div className="min-w-0"><p className="text-sm text-slate-700 truncate">{c.nombre}</p><p className="text-xs text-slate-400 truncate">{c.puesto || c.area}</p></div>
                </button>
              ))}
            </div>
            <button onClick={() => setAbrirDirecto(false)} className="mt-4 w-full rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Cerrar</button>
          </div>
        </div>
      )}

      {infoAbierta && canalActivo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setInfoAbierta(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col items-center gap-2">
              <GroupAvatar canal={canalActivo} size={88} />
              <input ref={fotoGrupoRef} type="file" accept="image/*" className="hidden" onChange={onFotoGrupo} />
              <button onClick={() => fotoGrupoRef.current?.click()} disabled={subiendoFotoGrupo} className="rounded-lg border border-teal/30 px-3 py-1.5 text-xs font-semibold text-teal-dark hover:bg-teal-soft disabled:opacity-50">{subiendoFotoGrupo ? "Subiendo…" : "📷 Cambiar foto del grupo"}</button>
              <h3 className="mt-1 font-semibold text-slate-800">{canalActivo.emoji} {canalActivo.nombre}</h3>
            </div>
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Integrantes ({miembros.length})</p>
              <div className="space-y-1.5">
                {miembros.length === 0 && <p className="text-sm text-slate-400">Aún no hay integrantes.</p>}
                {miembros.map((mb) => (
                  <div key={mb.id} className="flex items-center gap-2">
                    <Avatar nombre={mb.nombre} foto={fotos[mb.nombre]} size={36} />
                    <span className="flex-1 text-sm text-slate-700">{mb.nombre}</span>
                    <button onClick={() => quitar(mb.nombre)} className="text-xs text-red-500 hover:underline">Quitar</button>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <select value={nuevoMiembro} onChange={(e) => setNuevoMiembro(e.target.value)} className="flex-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                  <option value="">+ Agregar integrante…</option>
                  {colaboradores.filter((c) => !miembros.some((mb) => mb.nombre === c.nombre) && (c.tipo_personal ?? "interno") === "interno").map((c) => (<option key={c.id} value={c.nombre}>{c.nombre}</option>))}
                </select>
                <button onClick={agregar} disabled={!nuevoMiembro} className="rounded-lg bg-teal px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-dark disabled:opacity-50">Agregar</button>
              </div>
            </div>
            <button onClick={() => setInfoAbierta(false)} className="mt-5 w-full rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Cerrar</button>
          </div>
        </div>
      )}

      {abrirCrear && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setAbrirCrear(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-800 mb-3">Crear grupo nuevo</h3>
            <label className="text-xs font-medium text-slate-500">Nombre</label>
            <input value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} placeholder="Ej. Cobranza" className="mt-1 mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <label className="text-xs font-medium text-slate-500">Emoji</label>
            <div className="mt-1 mb-3 flex flex-wrap gap-1">
              {EMOJIS_OPC.map((e) => (<button key={e} onClick={() => setNuevoEmoji(e)} className={`h-8 w-8 rounded-lg text-lg ${nuevoEmoji === e ? "bg-teal-soft ring-2 ring-teal" : "hover:bg-slate-100"}`}>{e}</button>))}
            </div>
            <label className="text-xs font-medium text-slate-500">Color</label>
            <div className="mt-1 mb-4 flex flex-wrap gap-1.5">
              {COLORES_OPC.map((c) => (<button key={c} onClick={() => setNuevoColor(c)} className={`h-7 w-7 rounded-full ${nuevoColor === c ? "ring-2 ring-offset-2 ring-slate-400" : ""}`} style={{ backgroundColor: c }} />))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setAbrirCrear(false)} className="flex-1 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={crearGrupo} disabled={!nuevoNombre.trim() || creando} className="flex-1 rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-dark disabled:opacity-50">{creando ? "Creando…" : "Crear grupo"}</button>
            </div>
          </div>
        </div>
      )}
      {llamada && (
        <LlamadaGrupo sala={llamada.sala} nombre={yo?.nombre || "Invitado"} soloAudio={llamada.soloAudio} onCerrar={() => setLlamada(null)} />
      )}
      {marcador && (
        <MarcadorTelefono
          telefonoInicial={esDirecto && canalActivo ? ((colaboradores.find((x) => x.nombre === otroDe(canalActivo))?.telefono) || (colaboradores.find((x) => x.nombre === otroDe(canalActivo))?.whatsapp) || "") : ""}
          nombreContacto={esDirecto && canalActivo ? otroDe(canalActivo) : ""}
          miCorreo={yo?.correo || ""}
          correoColega={esDirecto && canalActivo ? (colaboradores.find((x) => x.nombre === otroDe(canalActivo))?.correo || "") : ""}
          nombreLlamante={yo?.nombre || ""}
          onCerrar={() => setMarcador(false)}
        />
      )}
      <LineaTwilio correo={yo?.correo || ""} />
    </>
  );
}
