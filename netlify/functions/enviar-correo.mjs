// Envía un correo con la API de Gmail, EN NOMBRE del asesor que inició sesión.
// Recibe el "permiso de Google" (accessToken) del propio asesor y solo lo
// reenvía a Gmail (así evitamos problemas del navegador y queda en SUS Enviados).
// No usa ninguna llave secreta: usa el permiso del propio usuario.
// Convierte el texto del correo a HTML seguro y le pega un pixel invisible.
// El pixel es una imagen 1x1: cuando el cliente abre el correo, su programa la
// descarga y eso queda registrado (apertura). Solo se usa si viene pixelUrl.
function htmlCuerpo(cuerpo, pixelUrl) {
  const esc = String(cuerpo || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.5">${esc}<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;width:1px;height:1px"></body></html>`;
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: "Método no permitido" }) };
  }
  try {
    // "adjuntos" es una LISTA opcional de { nombre, tipo, base64 }. Si viene con
    // archivos, el correo sale con todos pegados (multipart/mixed). Si no viene
    // ninguno, sale solo texto (igual que antes). "adjunto" (uno solo) se sigue
    // aceptando por compatibilidad con lo viejo.
    const { accessToken, from, to, asunto, cuerpo, adjunto, adjuntos, cc, pixelUrl } = JSON.parse(event.body || "{}");
    if (!accessToken) return { statusCode: 200, body: JSON.stringify({ ok: false, error: "Falta el permiso de Google. Vuelve a entrar con Google." }) };
    if (!to) return { statusCode: 200, body: JSON.stringify({ ok: false, error: "Falta el destinatario." }) };

    // Normalizamos a una sola lista de archivos válidos.
    let lista = [];
    if (Array.isArray(adjuntos)) lista = adjuntos.filter((a) => a && a.base64);
    else if (adjunto && adjunto.base64) lista = [adjunto];

    const asuntoEnc = "=?UTF-8?B?" + Buffer.from(asunto || "(sin asunto)", "utf-8").toString("base64") + "?=";
    const cuerpoB64 = Buffer.from(cuerpo || "", "utf-8").toString("base64");

    // Si viene pixelUrl, el cuerpo sale en HTML (con el pixel invisible) para
    // poder rastrear la apertura. Si no, sale en texto plano (igual que siempre).
    const bodyCT = pixelUrl ? 'text/html; charset="UTF-8"' : 'text/plain; charset="UTF-8"';
    const bodyB64 = pixelUrl ? Buffer.from(htmlCuerpo(cuerpo, pixelUrl), "utf-8").toString("base64") : cuerpoB64;

    let mime;
    if (lista.length > 0) {
      // Correo CON uno o varios archivos pegados.
      const limite = "lim_" + Date.now();
      const partes = [
        `From: ${from}`,
        `To: ${to}`,

        ...(cc ? [`Cc: ${cc}`] : []),
        `Subject: ${asuntoEnc}`,
        "MIME-Version: 1.0",
        `Content-Type: multipart/mixed; boundary="${limite}"`,
        "",
        `--${limite}`,
        `Content-Type: ${bodyCT}`,
        "Content-Transfer-Encoding: base64",
        "",
        bodyB64,
      ];
      // Una parte por cada archivo.
      for (const a of lista) {
        const nombreArch = String(a.nombre || "archivo").replace(/[\r\n"]/g, "_");
        const tipoArch = String(a.tipo || "application/octet-stream").replace(/[\r\n]/g, "");
        partes.push(
          `--${limite}`,
          `Content-Type: ${tipoArch}; name="${nombreArch}"`,
          "Content-Transfer-Encoding: base64",
          `Content-Disposition: attachment; filename="${nombreArch}"`,
          "",
          String(a.base64),
        );
      }
      partes.push(`--${limite}--`);
      mime = partes.join("\r\n");
    } else {
      // Correo solo texto (sin evidencia).
      mime = [
        `From: ${from}`,
        `To: ${to}`,

        ...(cc ? [`Cc: ${cc}`] : []),
        `Subject: ${asuntoEnc}`,
        "MIME-Version: 1.0",
        `Content-Type: ${bodyCT}`,
        "Content-Transfer-Encoding: base64",
        "",
        bodyB64,
      ].join("\r\n");
    }

    const raw = Buffer.from(mime, "utf-8").toString("base64")
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

    const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    });
    const data = await r.json();
    if (!r.ok) {
      return { statusCode: 200, body: JSON.stringify({ ok: false, error: data?.error?.message || "Gmail rechazó el envío." }) };
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true, id: data.id }) };
  } catch (e) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: (e && e.message) || "Error en el servidor de correo." }) };
  }
};
