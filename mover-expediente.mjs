import crypto from "crypto";

// =====================================================================
//  MOVER EXPEDIENTE (Fase D.2)
//  Cambia una carpeta de etapa en Drive:  Sucursal → NuevaEtapa → (carpeta)
//  No crea otra carpeta ni pierde lo de adentro: solo le cambia el "padre".
// =====================================================================

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function obtenerAccessToken(clientEmail, privateKey) {
  const ahora = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    iat: ahora,
    exp: ahora + 3600,
  };
  const sinFirma = base64url(JSON.stringify(header)) + "." + base64url(JSON.stringify(claim));
  const firma = crypto
    .createSign("RSA-SHA256")
    .update(sinFirma)
    .sign(privateKey)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  const jwt = sinFirma + "." + firma;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:
      "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=" +
      encodeURIComponent(jwt),
  });
  const data = await resp.json();
  if (!data.access_token) {
    throw new Error("No se obtuvo access_token de Google: " + JSON.stringify(data));
  }
  return data.access_token;
}

// Busca una carpeta por nombre dentro de un padre; si no existe, la crea.
async function buscarOCrearCarpeta(accessToken, nombre, parentId) {
  const seguro = String(nombre).replace(/'/g, "\\'");
  const q = `name='${seguro}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  const rb = await fetch(
    "https://www.googleapis.com/drive/v3/files?q=" + encodeURIComponent(q) +
      "&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true",
    { headers: { Authorization: "Bearer " + accessToken } }
  );
  const db = await rb.json();
  if (db.files && db.files.length > 0) return db.files[0].id;

  const rc = await fetch(
    "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id",
    {
      method: "POST",
      headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: nombre,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId],
      }),
    }
  );
  const dc = await rc.json();
  return dc.id || parentId;
}

// Recorre una ruta (Sucursal → Etapa) creando lo que falte; devuelve el id del último nivel.
async function carpetaDeRuta(accessToken, raizId, ruta) {
  let parentId = raizId;
  for (const nombre of ruta) {
    if (!nombre) continue;
    try {
      parentId = await buscarOCrearCarpeta(accessToken, String(nombre), parentId);
    } catch {
      break;
    }
  }
  return parentId;
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Metodo no permitido" }) };
  }

  try {
    const { carpetaId, sucursal, etapa } = JSON.parse(event.body || "{}");
    if (!carpetaId) {
      return { statusCode: 400, body: JSON.stringify({ error: "Falta el id de la carpeta a mover" }) };
    }
    if (!etapa) {
      return { statusCode: 400, body: JSON.stringify({ error: "Falta la etapa destino" }) };
    }

    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    const credBruto = process.env.GOOGLE_SERVICE_ACCOUNT;
    if (!folderId || !credBruto) {
      return { statusCode: 500, body: JSON.stringify({ error: "Faltan variables de entorno en Netlify" }) };
    }

    const cred = JSON.parse(credBruto);
    let privateKey = cred.private_key || "";
    if (privateKey.includes("\\n")) privateKey = privateKey.replace(/\\n/g, "\n");

    const accessToken = await obtenerAccessToken(cred.client_email, privateKey);

    // Carpeta destino:  ROOT → Sucursal → NuevaEtapa
    const suc = String(sucursal || "").trim() || "Sin sucursal";
    const destinoId = await carpetaDeRuta(accessToken, folderId, [suc, String(etapa)]);

    // ¿Dónde está parada ahorita? (sus padres actuales)
    const rg = await fetch(
      "https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(carpetaId) +
        "?fields=id,parents&supportsAllDrives=true",
      { headers: { Authorization: "Bearer " + accessToken } }
    );
    const info = await rg.json();
    const padresActuales = Array.isArray(info.parents) ? info.parents : [];

    // Si ya está en el destino, no hay nada que mover.
    if (padresActuales.length === 1 && padresActuales[0] === destinoId) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, movido: false, parent: destinoId, etapa }) };
    }

    // Quitamos los padres viejos (menos el destino, por si ya estaba) y agregamos el destino.
    const quitar = padresActuales.filter((p) => p !== destinoId);

    let url =
      "https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(carpetaId) +
      "?addParents=" + encodeURIComponent(destinoId) +
      "&supportsAllDrives=true&fields=id,parents";
    if (quitar.length > 0) {
      url += "&removeParents=" + encodeURIComponent(quitar.join(","));
    }

    const rp = await fetch(url, {
      method: "PATCH",
      headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const dp = await rp.json();
    if (!rp.ok) {
      return { statusCode: 500, body: JSON.stringify({ error: "Drive rechazo el movimiento", detalle: dp }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, movido: true, parent: destinoId, etapa }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: String((e && e.message) || e) }) };
  }
}
