// netlify/functions/estado-llamada.mjs
export default async (req) => {
  let params;
  try {
    const txt = await req.text();
    params = new URLSearchParams(txt);
  } catch {
    return new Response("", { status: 200 });
  }
  const callSid = params.get("CallSid");
  const status = params.get("CallStatus"); // completed, no-answer, busy, failed, canceled
  const duracion = parseInt(params.get("CallDuration") || "0", 10);
  if (!callSid) return new Response("", { status: 200 });

  const SUPA_URL = process.env.SUPABASE_URL;
  const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPA_URL || !SUPA_KEY) return new Response("", { status: 200 });

  const mapa = {
    completed: "Contestada",
    "no-answer": "No contestó",
    busy: "No contestó",
    failed: "No contestó",
    canceled: "No contestó",
  };
  const resultado = mapa[status] || "Pendiente (devolver llamada)";

  try {
    await fetch(`${SUPA_URL}/rest/v1/llamadas?call_sid=eq.${encodeURIComponent(callSid)}`, {
      method: "PATCH",
      headers: {
        "apikey": SUPA_KEY,
        "Authorization": "Bearer " + SUPA_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({ resultado, duracion: duracion || null }),
    });
  } catch {}

  return new Response("", { status: 200, headers: { "Content-Type": "text/xml" } });
};
