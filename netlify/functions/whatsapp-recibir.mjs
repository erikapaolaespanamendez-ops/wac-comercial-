// netlify/functions/whatsapp-recibir.mjs
// =====================================================================
//  FASE 1 — RECIBIR WhatsApp de los clientes.
//
//  Twilio le pega a esta función cuando un cliente manda un WhatsApp al
//  número de la empresa (o al SANDBOX mientras probamos). Guardamos el
//  mensaje en `whatsapp_mensajes` y, si podemos, lo enlazamos con el cliente.
//
//  NO contestamos automáticamente: regresamos un <Response/> vacío.
//
//  🔧 MODO PRUEBA: abrir en el navegador
//     https://jurisconecta.netlify.app/.netlify/functions/whatsapp-recibir?test=1
//     mete un renglón de prueba SIN Twilio y te dice si funcionó.
// =====================================================================

const SUPA_URL = process.env.SUPABASE_URL;
// La llave de servicio puede estar con cualquiera de estos dos nombres en Netlify.
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_KEY || "";

// Busca al CLIENTE por su teléfono (últimos 10 dígitos, mismo criterio que entrante.mjs)
async function buscarClientePorTel(telDigits) {
  if (!SUPA_URL || !SUPA_KEY) return null;
  const ult10 = (telDigits || "").slice(-10);
  if (ult10.length < 10) return null;
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/clientes?select=*`, {
      headers: { "apikey": SUPA_KEY, "Authorization": "Bearer " + SUPA_KEY },
    });
    const arr = await r.json();
    if (!Array.isArray(arr)) return null;
    for (const c of arr) {
      for (const v of Object.values(c)) {
        if (typeof v !== "string") continue;
        const clean = v.replace(/[\s\-()+]/g, "");
        if (/^\d{10,13}$/.test(clean) && clean.slice(-10) === ult10) return c;
      }
    }
  } catch {}
  return null;
}

// Inserta un renglón y DEVUELVE el resultado (status + cuerpo) para diagnóstico.
async function guardarMensaje(fila) {
  if (!SUPA_URL || !SUPA_KEY) {
    return { ok: false, status: 0, body: "FALTAN VARIABLES DE ENTORNO (SUPABASE_URL / SUPABASE_SERVICE_KEY)" };
  }
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/whatsapp_mensajes`, {
      method: "POST",
      headers: {
        "apikey": SUPA_KEY,
        "Authorization": "Bearer " + SUPA_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
      },
      body: JSON.stringify(fila),
    });
    const body = await r.text();
    return { ok: r.ok, status: r.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: String(e) };
  }
}

export default async (req) => {
  // ── MODO PRUEBA (?test=1): inserta un renglón sin Twilio y reporta el resultado ──
  let url;
  try { url = new URL(req.url); } catch { url = null; }
  if (url && url.searchParams.get("test") === "1") {
    const res = await guardarMensaje({
      telefono: "0000000000",
      direccion: "entrante",
      texto: "PRUEBA DESDE NAVEGADOR",
      twilio_sid: "test-" + Date.now(),
      estado: "prueba",
    });
    const txt =
      `MODO PRUEBA\n` +
      `Variables de entorno: SUPABASE_URL=${SUPA_URL ? "OK" : "FALTA"}, SERVICE_ROLE=${process.env.SUPABASE_SERVICE_ROLE ? "OK" : "FALTA"}, SERVICE_KEY=${process.env.SUPABASE_SERVICE_KEY ? "OK" : "FALTA"}\n` +
      `Resultado insert -> status=${res.status} ok=${res.ok}\n` +
      `Respuesta de Supabase: ${res.body || "(vacía = éxito)"}\n` +
      `Si status=201, revisa la tabla whatsapp_mensajes: debe estar el renglón "PRUEBA DESDE NAVEGADOR".`;
    return new Response(txt, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  // ── FLUJO NORMAL: WhatsApp entrante desde Twilio ──
  let p;
  try { p = new URLSearchParams(await req.text()); } catch { p = new URLSearchParams(); }

  const fromRaw = p.get("From") || "";
  const telefono = fromRaw.replace(/\D/g, "");
  const texto = p.get("Body") || "";
  const twilioSid = p.get("MessageSid") || p.get("SmsSid") || "";
  const perfilNombre = p.get("ProfileName") || null;
  const numMedia = parseInt(p.get("NumMedia") || "0", 10);
  const mediaUrl = numMedia > 0 ? (p.get("MediaUrl0") || null) : null;

  if (telefono && twilioSid) {
    const cliente = await buscarClientePorTel(telefono);
    await guardarMensaje({
      telefono,
      direccion: "entrante",
      texto: texto || null,
      cliente_id: cliente?.id || null,
      cliente_nombre: cliente ? (cliente.nombre || null) : null,
      perfil_nombre: perfilNombre,
      autor: null,
      twilio_sid: twilioSid,
      estado: "recibido",
      media_url: mediaUrl,
    });
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
  return new Response(xml, { status: 200, headers: { "Content-Type": "text/xml" } });
};
