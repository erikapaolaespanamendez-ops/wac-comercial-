// netlify/functions/transferir.mjs
// Traspasa (transfiere) una llamada EN CURSO del conmutador a la extensión de
// otra persona, SIN colgarle al cliente: redirige la llamada del cliente al
// nuevo destino (suena el celular de esa persona y la app de su área).
const VOZ = 'voice="Polly.Mia"';
const ACCION = "https://jurisconecta.netlify.app/.netlify/functions/entrante";

// Escapa caracteres especiales para que el XML de TwiML no se rompa.
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;

// Busca a la persona por su extensión (mismo criterio que el conmutador).
async function buscarExtension(ext) {
  if (!SUPA_URL || !SUPA_KEY) return null;
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/colaboradores?extension=eq.${encodeURIComponent(ext)}&select=numero_oficial,area,nombre,activo`, {
      headers: { "apikey": SUPA_KEY, "Authorization": "Bearer " + SUPA_KEY },
    });
    const arr = await r.json();
    if (Array.isArray(arr) && arr.length) {
      const activos = arr.filter((x) => x.activo !== false);
      return activos[0] || arr[0];
    }
  } catch { /* ignore */ }
  return null;
}

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido" }), { status: 405 });
  }
  let d;
  try { d = await req.json(); } catch { d = {}; }
  const callSid = (d.callSid || "").trim();
  const ext = (d.ext || "").trim();
  const quien = (d.quien || "").trim();
  const tel = (d.tel || "").trim();
  if (!callSid || !ext) {
    return new Response(JSON.stringify({ error: "Falta la llamada o la extensión." }), { status: 400 });
  }

  const SID = process.env.TWILIO_ACCOUNT_SID;
  const TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const FROM = process.env.TWILIO_NUMBER;
  if (!SID || !TOKEN || !FROM) {
    return new Response(JSON.stringify({ error: "Faltan las llaves de Twilio en el servidor." }), { status: 500 });
  }

  const persona = await buscarExtension(ext);
  if (!persona || (!persona.numero_oficial && !persona.area)) {
    return new Response(JSON.stringify({ error: "No encontramos esa extensión." }), { status: 404 });
  }

  // Parámetros para que la app de quien RECIBE la transferencia también muestre
  // quién llama (nombre, teléfono, si es cliente y el CallSid).
  let params = "";
  if (tel) params += `<Parameter name="tel" value="${esc(tel)}"/>`;
  if (quien) params += `<Parameter name="quien" value="${esc(quien)}"/>`;
  params += `<Parameter name="cliente" value="${quien ? "1" : "0"}"/>`;
  params += `<Parameter name="sid" value="${esc(callSid)}"/>`;

  const cel = persona.numero_oficial ? `<Number>${esc(persona.numero_oficial)}</Number>` : "";
  const app = persona.area ? `<Client><Identity>${esc(persona.area)}</Identity>${params}</Client>` : "";

  // TwiML nuevo para el cliente: aviso + Dial al destino. El "action" apunta al
  // conmutador para reaprovechar su manejo (buzón si nadie contesta, registro).
  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response>` +
    `<Say ${VOZ}>Le transferimos con la persona indicada. En un momento le atienden.</Say>` +
    `<Dial callerId="${FROM}" timeout="25" action="${ACCION}" method="POST">${cel}${app}</Dial>` +
    `</Response>`;

  const cuerpo = new URLSearchParams({ Twiml: twiml });
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Calls/${encodeURIComponent(callSid)}.json`, {
      method: "POST",
      headers: {
        "Authorization": "Basic " + Buffer.from(`${SID}:${TOKEN}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: cuerpo.toString(),
    });
    const data = await r.json();
    if (!r.ok) {
      return new Response(JSON.stringify({ error: data.message || "Twilio rechazó la transferencia." }), { status: 400 });
    }
    return new Response(JSON.stringify({ ok: true, nombre: persona.nombre || "" }), { status: 200 });
  } catch {
    return new Response(JSON.stringify({ error: "No se pudo contactar a Twilio." }), { status: 500 });
  }
};
