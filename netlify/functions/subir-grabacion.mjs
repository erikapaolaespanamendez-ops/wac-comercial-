import crypto from "crypto";

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

// 👇 NUEVO (Paso A): recorre una RUTA de carpetas (Area → tipo → expediente),
// creando cada nivel si no existe, y devuelve el id de la carpeta más profunda.
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
    const { archivo, nombre, tipo, area, ruta, carpetaId, subcarpeta, publico } = JSON.parse(event.body || "{}");
    if (!archivo) {
      return { statusCode: 400, body: JSON.stringify({ error: "Falta el archivo de audio" }) };
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

    // Carpeta destino:
    //  - "ruta": lista de carpetas anidadas (Area → tipo → expediente). NUEVO.
    //  - "area": una sola subcarpeta (compatibilidad con lo de antes).
    //  - nada:  la carpeta raíz.
    let listaRuta = [];
    if (Array.isArray(ruta)) listaRuta = ruta.filter(Boolean).map(String);
    else if (area) listaRuta = [String(area)];

    let parentId = folderId;
    if (carpetaId) {
      // NUEVO: subir DIRECTO a la carpeta de un cliente (su carpeta_drive_id),
      // opcionalmente dentro de una subcarpeta (ej. "Grabaciones de seguimiento").
      parentId = String(carpetaId);
      if (subcarpeta) {
        try { parentId = await buscarOCrearCarpeta(accessToken, String(subcarpeta), parentId); } catch {}
      }
    } else if (listaRuta.length > 0) {
      try {
        parentId = await carpetaDeRuta(accessToken, folderId, listaRuta);
      } catch {
        parentId = folderId;
      }
    }

    const limite = "limite_" + Date.now();
    const metadata = {
      name: nombre || "grabacion_" + Date.now() + ".webm",
      parents: [parentId],
    };
    const audioBuffer = Buffer.from(archivo, "base64");

    const cuerpoInicio =
      "--" + limite + "\r\n" +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(metadata) + "\r\n" +
      "--" + limite + "\r\n" +
      "Content-Type: " + (tipo || "audio/webm") + "\r\n\r\n";
    const cuerpoFin = "\r\n--" + limite + "--";

    const cuerpo = Buffer.concat([
      Buffer.from(cuerpoInicio, "utf8"),
      audioBuffer,
      Buffer.from(cuerpoFin, "utf8"),
    ]);

    const resp = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink,webContentLink,name",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + accessToken,
          "Content-Type": "multipart/related; boundary=" + limite,
        },
        body: cuerpo,
      }
    );

    const data = await resp.json();
    if (!resp.ok) {
      return { statusCode: 500, body: JSON.stringify({ error: "Drive rechazo la subida", detalle: data }) };
    }

    // 👇 NUEVO: si se pidió "publico", dejamos el archivo visible por enlace
    //    para poder mostrarlo embebido (ej. la foto de evidencia en el CRM).
    if (publico && data.id) {
      try {
        await fetch(
          "https://www.googleapis.com/drive/v3/files/" + data.id + "/permissions?supportsAllDrives=true",
          {
            method: "POST",
            headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
            body: JSON.stringify({ role: "reader", type: "anyone" }),
          }
        );
      } catch {}
    }

    // 👇 Google Drive NUNCA renderiza .html como página — por seguridad,
    // siempre muestra el código fuente en su vista previa (webViewLink),
    // sin importar el nombre o el mime. Para documentos .html (Solicitud,
    // Convenio), usamos webContentLink (descarga directa) en vez del link
    // de vista previa — así al menos abre/descarga el archivo real, en
    // lugar de mostrar código. Para el resto (fotos, evidencia), se queda
    // igual que siempre (webViewLink).
    const esHtml = (tipo || "").includes("html");
    const linkFinal = esHtml && data.webContentLink ? data.webContentLink : data.webViewLink;

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, id: data.id, link: linkFinal, nombre: data.name, carpeta: parentId }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: String((e && e.message) || e) }) };
  }
}
