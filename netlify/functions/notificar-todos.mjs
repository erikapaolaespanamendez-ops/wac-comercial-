// =====================================================================
//  notificar-todos.mjs  —  manda la notificación a TODOS (Web Push).
//  A diferencia de 'notificar.mjs' (que avisa solo a los del canal),
//  ESTE avisa a TODAS las suscripciones guardadas. Es el "todo a todos".
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

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Método no permitido" };
  if (!vapidListo) return { statusCode: 200, body: "VAPID no configurado" };

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "JSON inválido" }; }

  const { titulo, detalle, autor, modulo } = body;
  if (!titulo) return { statusCode: 400, body: "Falta 'titulo'" };

  // Trae TODAS las suscripciones (sin filtrar por canal): a todos.
  const { data: subs } = await supabase.from("push_subs").select("*");
  if (!subs || subs.length === 0) return { statusCode: 200, body: "Nadie suscrito" };

  const cuerpo = (detalle && detalle.trim())
    ? detalle.slice(0, 140)
    : (autor ? `por ${autor}` : "Nueva actividad en JurisConecta");

  const payload = JSON.stringify({
    title: String(titulo).slice(0, 80),
    body: cuerpo,
    url: modulo ? `/?ir=${modulo}` : "/",
    tag: "evento",
  });

  let enviados = 0;
  await Promise.all(subs.map(async (s) => {
    const sub = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
    try {
      await webpush.sendNotification(sub, payload);
      enviados++;
    } catch (err) {
      // Si la suscripción ya murió, la borramos para no volver a intentarla.
      if (err && (err.statusCode === 404 || err.statusCode === 410)) {
        await supabase.from("push_subs").delete().eq("endpoint", s.endpoint);
      }
    }
  }));

  return { statusCode: 200, body: `Avisos a todos enviados: ${enviados}` };
}
