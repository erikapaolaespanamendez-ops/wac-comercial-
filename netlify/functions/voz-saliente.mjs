// netlify/functions/voz-saliente.mjs
// Cuando el navegador llama, Twilio pega aqui. Esto le dice a quien timbrar.
//  - Siempre timbra al numero de telefono (To), si viene.
//  - Si ademas viene el correo de un colega, timbra TAMBIEN a su app (Client),
//    asi suena en el celular Y en la app a la vez. El primero que conteste, gana.
//  - La grabacion NO va aqui: la hace el navegador, no Twilio.

function escXml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function idTwilio(correo) {
  return String(correo || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "_");
}

export default async (req) => {
  let para = "";
  let correoColega = "";
  let nombreLlamante = "Colega";
  try {
    const p = new URLSearchParams(await req.text());
    para = (p.get("To") || p.get("para") || "").trim();
    correoColega = (p.get("correoColega") || "").trim();
    nombreLlamante = (p.get("nombreLlamante") || "Colega").trim();
  } catch {}

  const FROM = process.env.TWILIO_NUMBER;
  const idCliente = idTwilio(correoColega);

  if (!para && !idCliente) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say language="es-MX">No se recibió a quién marcar.</Say></Response>`;
    return new Response(xml, { status: 200, headers: { "Content-Type": "text/xml" } });
  }

  let piernas = "";
  if (para) piernas += `<Number>${escXml(para)}</Number>`;
  if (idCliente) piernas += `<Client><Identity>${escXml(idCliente)}</Identity><Parameter name="nombre" value="${escXml(nombreLlamante)}"/></Client>`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Dial answerOnBridge="true" callerId="${FROM}">${piernas}</Dial></Response>`;
  return new Response(xml, { status: 200, headers: { "Content-Type": "text/xml" } });
};
