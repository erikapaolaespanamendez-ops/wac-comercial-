// =====================================================================
//  notificar.mjs  —  manda la NOTIFICACIÓN del sistema (Web Push)
// =====================================================================
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://xzvtgjtumvwftulqxiao.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6dnRnanR1bXZ3ZnR1bHF4aWFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0NDU0NzUsImV4cCI6MjA5NzAyMTQ3NX0.W1CwPHCop68e0z_lCiX85EaIUoaJPG3huy2OjlZlSy4";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const VAPID_PUBLIC = "BKrz13FnluofCoeJ-hmVBi1D02pkAITQHdmwDY93P4p98zbL3qCtSwCpQ1-R03KTrq87Jl2En87lWyQQSHd632Q";
const VAPID_PRIVATE = "gcTx6XcokCiDvhXZCMKmZQZHu33IcJ2nIHaq2A5Lf1E";
const VAPID_SUBJECT = "mailto:erikapaola@diipadesarrollos.com";

let vapidListo = false;
try {
  if (VAPID_PUBLIC && VAPID_PRIVATE) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
    vapidListo = true;
  }
} catch {
  vapidListo = false;
}

// Quita acentos/mayúsculas/espacios de más para comparar nombres con seguridad.
function norm(s) {
  return (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

// Resuelve nombre / login / correo al CORREO canónico. Busca en colaboradores
// Y en usuarios. Así "Erika Paola España", "erikapaola" y el correo coinciden.
// Ahora también empata por nombre PARCIAL ("Erika Paola España" → "...Méndez").
async function correoCanonico(idStr) {
  const x = (idStr || "").trim();
  if (!x) return "";
  if (x.includes("@")) return x.toLowerCase();
  // 1) nombre exacto en colaboradores
  let r = await supabase.from("colaboradores").select("correo").ilike("nombre", x).limit(1);
  if (r.data && r.data[0]?.correo) return String(r.data[0].correo).toLowerCase();
  // 2) nombre que EMPIEZA igual (maneja "Erika Paola España" vs "Erika Paola España Méndez")
  r = await supabase.from("colaboradores").select("correo").ilike("nombre", `${x}%`).limit(1);
  if (r.data && r.data[0]?.correo) return String(r.data[0].correo).toLowerCase();
  // 3) login = inicio del correo
  r = await supabase.from("colaboradores").select("correo").ilike("correo", `${x}@%`).limit(1);
  if (r.data && r.data[0]?.correo) return String(r.data[0].correo).toLowerCase();
  // 4) lo mismo en usuarios
  r = await supabase.from("usuarios").select("email").ilike("nombre", x).limit(1);
  if (r.data && r.data[0]?.email) return String(r.data[0].email).toLowerCase();
  r = await supabase.from("usuarios").select("email").ilike("nombre", `${x}%`).limit(1);
  if (r.data && r.data[0]?.email) return String(r.data[0].email).toLowerCase();
  r = await supabase.from("usuarios").select("email").ilike("email", `${x}@%`).limit(1);
  if (r.data && r.data[0]?.email) return String(r.data[0].email).toLowerCase();
  return norm(x);
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Método no permitido" };
  }
  if (!vapidListo) {
    return { statusCode: 200, body: "VAPID no configurado (faltan VAPID_PUBLIC/VAPID_PRIVATE)" };
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "JSON inválido" }; }

  const { canalId, autor, texto, canalNombre } = body;
  if (!canalId || !autor) return { statusCode: 400, body: "Faltan datos (canalId, autor)" };

  let destinatarios = [];
  try {
    const { data: canal } = await supabase
      .from("chat_canales").select("tipo, dm_a, dm_b").eq("id", canalId).maybeSingle();
    if (canal?.tipo === "directo") {
      destinatarios = [canal.dm_a, canal.dm_b].filter(Boolean);
    } else {
      const { data: miembros } = await supabase
        .from("chat_miembros").select("nombre").eq("canal_id", canalId);
      destinatarios = (miembros || []).map((m) => m.nombre);
    }
  } catch {
    return { statusCode: 500, body: "Error al buscar destinatarios" };
  }

  destinatarios = [...new Set(destinatarios.filter((n) => n && n !== autor))];
  if (destinatarios.length === 0) return { statusCode: 200, body: "Sin destinatarios" };

  // Correos Y nombres de los destinatarios (empatamos por cualquiera de los dos)
  const nombresDest = new Set((destinatarios || []).map(norm));
  const emailsDest = new Set();
  for (const n of destinatarios) emailsDest.add(await correoCanonico(n));

  const { data: todas } = await supabase.from("push_subs").select("*");
  const subs = [];
  for (const s of (todas || [])) {
    // 1º por CORREO guardado (lo más confiable). Si no hay, se resuelve por nombre.
    const correoSub = (s.correo || "").toString().toLowerCase().trim();
    const e = correoSub || await correoCanonico(s.nombre);
    if (emailsDest.has(e) || nombresDest.has(norm(s.nombre))) subs.push(s);
  }
  if (subs.length === 0) {
    const suscritos = (todas || []).map((s) => s.nombre).join(", ") || "(ninguno)";
    return { statusCode: 200, body: `Nadie suscrito. Busqué correos: [${[...emailsDest].join(", ")}] y nombres: [${[...nombresDest].join(", ")}]. Suscritos: [${suscritos}]` };
  }

  // ¿Es una LLAMADA? (los mensajes de llamada empiezan con 📞 o 🎥)
  const esLlamada = typeof texto === "string" && (texto.startsWith("📞") || texto.startsWith("🎥"));

  let titulo, cuerpo, url, tag;
  if (esLlamada) {
    const tipo = texto.startsWith("🎥") ? "videollamada" : "llamada";
    titulo = `📞 ${autor} te está llamando`;
    cuerpo = `Toca para entrar a la ${tipo}`;
    url = "/?llamada=JurisConecta-" + canalId + (tipo === "videollamada" ? "" : "&a=1");
    tag = "llamada-" + canalId;
  } else {
    titulo = canalNombre ? `${autor} · ${canalNombre}` : autor;
    cuerpo = (texto && texto.trim()) ? texto.slice(0, 120) : "📎 Te envió un archivo";
    url = "/?chat=" + canalId;
    tag = canalId;
  }

  const payload = JSON.stringify({
    title: titulo,
    body: cuerpo,
    canalId,
    url,
    tag,
    esLlamada,
  });

  let enviados = 0;
  await Promise.all(subs.map(async (s) => {
    const sub = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
    try {
      await webpush.sendNotification(sub, payload);
      enviados++;
    } catch (err) {
      if (err && (err.statusCode === 404 || err.statusCode === 410)) {
        await supabase.from("push_subs").delete().eq("endpoint", s.endpoint);
      }
    }
  }));

  return { statusCode: 200, body: `Avisos enviados: ${enviados}` };
}
