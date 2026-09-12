// netlify/functions/llamar.mjs
export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido" }), { status: 405 });
  }
  let datos;
  try { datos = await req.json(); } catch { datos = {}; }
  const agente = (datos.agente || "").trim();
  const cliente = (datos.cliente || "").trim();
  if (!agente || !cliente) {
    return new Response(JSON.stringify({ error: "Faltan el número del agente o del cliente." }), { status: 400 });
  }
  const SID = process.env.TWILIO_ACCOUNT_SID;
  const TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const FROM = process.env.TWILIO_NUMBER;
  if (!SID || !TOKEN || !FROM) {
    return new Response(JSON.stringify({ error: "Faltan las llaves de Twilio en el servidor." }), { status: 500 });
  }
  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say language="es-MX">Conectando tu llamada</Say><Dial callerId="${FROM}">${cliente}</Dial></Response>`;
  const cuerpo = new URLSearchParams({
    To: agente,
    From: FROM,
    Twiml: twiml,
    StatusCallback: "https://jurisconecta.netlify.app/.netlify/functions/estado-llamada",
    StatusCallbackMethod: "POST",
  });
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Calls.json`, {
      method: "POST",
      headers: {
        "Authorization": "Basic " + Buffer.from(`${SID}:${TOKEN}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: cuerpo.toString(),
    });
    const data = await r.json();
    if (!r.ok) {
      return new Response(JSON.stringify({ error: data.message || "Twilio rechazó la llamada." }), { status: 400 });
    }

    // Guarda la llamada en la bitácora (si falla, la llamada igual se hace)
    const SUPA_URL = process.env.SUPABASE_URL;
    const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;
    if (SUPA_URL && SUPA_KEY) {
      try {
        await fetch(`${SUPA_URL}/rest/v1/llamadas`, {
          method: "POST",
          headers: {
            "apikey": SUPA_KEY,
            "Authorization": "Bearer " + SUPA_KEY,
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
          },
          body: JSON.stringify({
            tipo: "saliente",
            telefono: cliente.replace(/\D/g, "").slice(-10),
            resultado: "En curso",
            registrado_por: "Conmutador",
            nota: "Llamada desde el conmutador",
            call_sid: data.sid,
          }),
        });
      } catch {}
    }

    return new Response(JSON.stringify({ ok: true, sid: data.sid }), { status: 200 });
  } catch {
    return new Response(JSON.stringify({ error: "No se pudo contactar a Twilio." }), { status: 500 });
  }
};
