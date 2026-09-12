import { supabase } from "../lib/supabase";
import { avisarMensajeEnVivo, escucharMensajes } from "./chatRealtime";
import { avisarPush } from "./avisarPush";
import { avisarEvento } from "./avisarEvento"; // 👈 NUEVO
import { intervaloVisible } from "../lib/intervaloVisible";

// ===== Tipos =====
export type Canal = {
  id: string;
  nombre: string;
  area: string;
  color: string;
  emoji: string;
  foto_url: string | null;
  tipo: string;
  dm_a: string | null;
  dm_b: string | null;
  orden: number;
};

export type Mensaje = {
  id: string;
  canal_id: string;
  autor_nombre: string;
  autor_area: string | null;
  texto: string | null;
  archivo_url: string | null;
  archivo_tipo: string | null;
  archivo_nombre: string | null;
  created_at: string;
  eliminado?: boolean;
};

export type Perfil = { nombre: string; foto_url: string | null; area: string | null };
export type Miembro = { id: string; canal_id: string; nombre: string };
export type UltimoMsg = {
  canal_id: string;
  texto: string | null;
  archivo_tipo: string | null;
  autor_nombre: string;
  created_at: string;
};

function slug(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

// 👇 NUEVO: quién está usando la app (para decir quién creó el grupo).
function quienSoy(): string {
  try {
    const y = JSON.parse(localStorage.getItem("chat_yo") || "null");
    return y?.nombre || "Alguien";
  } catch { return "Alguien"; }
}

// ===== Filtro de groserías =====
const GROSERIAS = [
  "pendejo", "pendeja", "puto", "puta", "mierda", "cabron", "cabrón",
  "chinga", "chingada", "verga", "culero", "pinche", "imbecil", "imbécil",
];

export function limpiarGroserias(texto: string): string {
  let limpio = texto;
  for (const palabra of GROSERIAS) {
    const regex = new RegExp(`\\b${palabra}\\w*\\b`, "gi");
    limpio = limpio.replace(regex, (m) => "*".repeat(m.length));
  }
  return limpio;
}

// ===== Grupos / Canales =====
export async function fetchCanales(): Promise<Canal[]> {
  const { data, error } = await supabase.from("chat_canales").select("*").order("orden", { ascending: true });
  if (error) { console.error("No se pudieron traer los grupos:", error.message); return []; }
  return (data || []) as Canal[];
}

export async function crearCanal(p: { nombre: string; emoji: string; color: string }): Promise<Canal | null> {
  const area = `${slug(p.nombre) || "grupo"}_${Math.random().toString(36).slice(2, 6)}`;
  const { data, error } = await supabase
    .from("chat_canales")
    .insert({ nombre: p.nombre, area, emoji: p.emoji || "💬", color: p.color || "#64748B", orden: 100, tipo: "grupo" })
    .select().single();
  if (error) { console.error("No se pudo crear el grupo:", error.message); return null; }
  const grupo = data as Canal; // 👈 NUEVO

  // 👇 NUEVO: avisa a TODOS que se creó un grupo de chat.
  const yo = quienSoy();
  avisarEvento({
    tipo: "grupo",
    accion: "creado",
    titulo: `💬 Nuevo grupo: ${grupo.nombre}`,
    detalle: yo === "Alguien" ? "Se creó un grupo de chat" : `Lo creó ${yo}`,
    autor: yo,
    modulo: "chat",
    refId: String(grupo.id),
  });

  return grupo; // 👈 NUEVO
}

// Convierte un identificador (nombre, login o correo) en el CORREO canónico
// que está en la tabla colaboradores. Así la "llave" del chat directo siempre
// sale del correo, parejo de los dos lados.
async function correoCanonico(idStr: string): Promise<string> {
  const x = (idStr || "").trim();
  if (!x) return "";
  if (x.includes("@")) return x.toLowerCase();
  const porNombre = await supabase.from("colaboradores").select("correo").eq("nombre", x).limit(1);
  if (porNombre.data && porNombre.data[0]?.correo) return String(porNombre.data[0].correo).toLowerCase();
  const porPrefijo = await supabase.from("colaboradores").select("correo").ilike("correo", `${x}@%`).limit(1);
  if (porPrefijo.data && porPrefijo.data[0]?.correo) return String(porPrefijo.data[0].correo).toLowerCase();
  return x.toLowerCase();
}

// Buscar o crear el chat DIRECTO (1 a 1). Acepta 2 datos (yoNombre, otroNombre)
// o 4 (yoCorreo, yoNombre, otroCorreo, otroNombre). La función resuelve el
// correo canónico de cada quien y arma la llave con esos correos, así ambos
// lados caen SIEMPRE en el mismo canal.
export async function buscarOCrearDirecto(
  arg1: string,
  arg2: string,
  arg3?: string,
  arg4?: string
): Promise<Canal | null> {
  let yoId: string, yoNombre: string, otroId: string, otroNombre: string;
  if (arg3 === undefined) {
    yoId = arg1; yoNombre = arg1; otroId = arg2; otroNombre = arg2;
  } else {
    yoId = arg1 || arg2; yoNombre = arg2;
    otroId = arg3 || (arg4 || ""); otroNombre = arg4 || "";
  }

  const correoA = await correoCanonico(yoId);
  const correoB = await correoCanonico(otroId);
  const key = "dm_" + [correoA, correoB].map(slug).sort().join("__");

  const { data: existente } = await supabase.from("chat_canales").select("*").eq("area", key).maybeSingle();
  if (existente) return existente as Canal;

  const par = [yoNombre, otroNombre].sort();
  const { data: nuevo, error } = await supabase
    .from("chat_canales")
    .insert({ nombre: otroNombre, area: key, emoji: "👤", color: "#1E50A0", orden: 0, tipo: "directo", dm_a: par[0], dm_b: par[1] })
    .select().single();
  if (error || !nuevo) { console.error("No se pudo crear el chat directo:", error?.message); return null; }
  return nuevo as Canal;
}

export async function subirFotoCanal(file: File): Promise<string | null> {
  const ext = file.name.split(".").pop() || "jpg";
  const ruta = `grupos/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("chat-archivos").upload(ruta, file, { cacheControl: "3600", upsert: false });
  if (error) { console.error("No se pudo subir la foto del grupo:", error.message); return null; }
  const { data } = supabase.storage.from("chat-archivos").getPublicUrl(ruta);
  return data.publicUrl;
}

export async function actualizarFotoCanal(canalId: string, fotoUrl: string): Promise<boolean> {
  const { error } = await supabase.from("chat_canales").update({ foto_url: fotoUrl }).eq("id", canalId);
  if (error) { console.error("No se pudo guardar la foto del grupo:", error.message); return false; }
  return true;
}

export async function fetchUltimosMensajes(): Promise<Record<string, UltimoMsg>> {
  const { data, error } = await supabase.from("chat_ultimo_mensaje").select("*");
  if (error) { console.error("No se pudieron traer los últimos mensajes:", error.message); return {}; }
  const mapa: Record<string, UltimoMsg> = {};
  for (const r of (data || []) as UltimoMsg[]) mapa[r.canal_id] = r;
  return mapa;
}

// ===== Integrantes =====
export async function fetchMiembros(canalId: string): Promise<Miembro[]> {
  const { data, error } = await supabase.from("chat_miembros").select("*").eq("canal_id", canalId).order("nombre", { ascending: true });
  if (error) { console.error("No se pudieron traer los integrantes:", error.message); return []; }
  return (data || []) as Miembro[];
}

export async function agregarMiembro(canalId: string, nombre: string): Promise<boolean> {
  const { error } = await supabase.from("chat_miembros").insert({ canal_id: canalId, nombre });
  if (error) { console.error("No se pudo agregar el integrante:", error.message); return false; }
  return true;
}

export async function quitarMiembro(canalId: string, nombre: string): Promise<boolean> {
  const { error } = await supabase.from("chat_miembros").delete().eq("canal_id", canalId).eq("nombre", nombre);
  if (error) { console.error("No se pudo quitar el integrante:", error.message); return false; }
  return true;
}

// ===== Perfiles =====
export async function fetchPerfiles(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from("chat_perfiles").select("nombre, foto_url");
  if (error) { console.error("No se pudieron traer los perfiles:", error.message); return {}; }
  const mapa: Record<string, string> = {};
  for (const p of data || []) { if (p.foto_url) mapa[p.nombre] = p.foto_url; }
  return mapa;
}

export async function subirAvatar(file: File): Promise<string | null> {
  const ext = file.name.split(".").pop() || "jpg";
  const ruta = `avatares/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("chat-archivos").upload(ruta, file, { cacheControl: "3600", upsert: false });
  if (error) { console.error("No se pudo subir la foto:", error.message); return null; }
  const { data } = supabase.storage.from("chat-archivos").getPublicUrl(ruta);
  return data.publicUrl;
}

export async function guardarPerfil(p: { nombre: string; fotoUrl: string; area?: string | null }): Promise<boolean> {
  const { error } = await supabase.from("chat_perfiles").upsert(
    { nombre: p.nombre, foto_url: p.fotoUrl, area: p.area ?? null, updated_at: new Date().toISOString() },
    { onConflict: "nombre" }
  );
  if (error) { console.error("No se pudo guardar el perfil:", error.message); return false; }
  return true;
}

// ===== Mensajes =====
export async function fetchMensajes(canalId: string): Promise<Mensaje[]> {
  const { data, error } = await supabase.from("chat_mensajes").select("*").eq("canal_id", canalId).order("created_at", { ascending: true });
  if (error) { console.error("No se pudieron traer los mensajes:", error.message); return []; }
  // Esconde los que están en la papelera (eliminado = true).
  return ((data || []) as Mensaje[]).filter((m) => !m.eliminado);
}

// Manda el mensaje a la papelera (valor=true) o lo restaura (valor=false). NO borra de la base.
export async function eliminarMensaje(id: string, valor: boolean): Promise<boolean> {
  const { error } = await supabase.from("chat_mensajes").update({ eliminado: valor }).eq("id", id);
  return !error;
}

// Borrado DEFINITIVO del mensaje: sí lo saca de la base. No se puede deshacer.
export async function borrarMensajeDefinitivo(id: string): Promise<boolean> {
  const { error } = await supabase.from("chat_mensajes").delete().eq("id", id);
  return !error;
}

// Trae los mensajes que están en la papelera (para la pantalla de Papelera).
export async function fetchMensajesEliminados(): Promise<Mensaje[]> {
  const { data, error } = await supabase.from("chat_mensajes").select("*").eq("eliminado", true).order("created_at", { ascending: false }).limit(100);
  if (error) { console.error("No se pudieron traer los mensajes eliminados:", error.message); return []; }
  return (data || []) as Mensaje[];
}

export async function subirArchivo(file: File): Promise<{ url: string; tipo: string; nombre: string } | null> {
  const ext = file.name.split(".").pop() || "bin";
  const ruta = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("chat-archivos").upload(ruta, file, { cacheControl: "3600", upsert: false });
  if (error) { console.error("No se pudo subir el archivo:", error.message); return null; }
  const { data } = supabase.storage.from("chat-archivos").getPublicUrl(ruta);
  let tipo = "archivo";
  if (file.type.startsWith("image/")) tipo = "imagen";
  else if (file.type === "application/pdf") tipo = "pdf";
  return { url: data.publicUrl, tipo, nombre: file.name };
}

export async function enviarMensaje(p: {
  canalId: string;
  canalNombre?: string;
  autorNombre: string;
  autorArea?: string | null;
  texto?: string;
  archivoUrl?: string | null;
  archivoTipo?: string | null;
  archivoNombre?: string | null;
}): Promise<Mensaje | null> {
  const textoLimpio = limpiarGroserias((p.texto || "").trim());
  if (!textoLimpio && !p.archivoUrl) return null;
  const { data, error } = await supabase
    .from("chat_mensajes")
    .insert({
      canal_id: p.canalId,
      autor_nombre: p.autorNombre,
      autor_area: p.autorArea ?? null,
      texto: textoLimpio || null,
      archivo_url: p.archivoUrl ?? null,
      archivo_tipo: p.archivoTipo ?? null,
      archivo_nombre: p.archivoNombre ?? null,
    })
    .select().single();
  if (error) { console.error("No se pudo enviar el mensaje:", error.message); return null; }
  const mensaje = data as Mensaje;
  avisarMensajeEnVivo(mensaje);
  // Dispara la notificación Web Push a los destinatarios (fire-and-forget).
  avisarPush({
    canalId: p.canalId,
    autor: p.autorNombre,
    texto: textoLimpio,
    canalNombre: p.canalNombre,
  });
  return mensaje;
}

export function suscribirCanal(canalId: string, onNuevo: (m: Mensaje) => void) {
  const desuscribir = escucharMensajes((m) => { if (m.canal_id === canalId) onNuevo(m); });

  // ==========================================================================
  //  El canal se entera EN VIVO por realtime (escucharMensajes, arriba).
  //  Antes había además un encuestado cada 3 segundos que traía TODOS los
  //  mensajes del canal sin límite: 101,655 llamadas y 205 segundos de base
  //  en 82 días, para nada, porque realtime ya los entregaba.
  //
  //  Se deja sólo una RED DE SEGURIDAD cada 60 s por si realtime se cae o el
  //  aparato pierde la conexión: pide únicamente lo NUEVO desde el último
  //  mensaje conocido, con tope de 50, y no corre con la pestaña oculta.
  // ==========================================================================
  let ultimaFecha: string | null = null;
  let activo = true;

  async function revisar() {
    if (!activo) return;
    let q = supabase
      .from("chat_mensajes")
      .select("*")
      .eq("canal_id", canalId)
      .order("created_at", { ascending: true })
      .limit(50);
    if (ultimaFecha !== null) q = q.gt("created_at", ultimaFecha);

    const { data } = await q;
    if (!activo || !data || data.length === 0) return;

    const arr = data as Mensaje[];
    if (ultimaFecha !== null) {
      for (const m of arr) onNuevo(m); // ya vienen filtrados por fecha
    }
    ultimaFecha = arr[arr.length - 1].created_at;
  }

  revisar(); // primer pase: fija el punto de partida
  const parar = intervaloVisible(revisar, 60000);

  return () => { activo = false; parar(); desuscribir(); };
}
