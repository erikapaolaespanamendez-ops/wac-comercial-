// netlify/functions/entrante.mjs
const VOZ = 'voice="Polly.Mia"';

// numero = celular FIJO de respaldo del área · area = identidad de la "línea" en la app
const RUTAS = {
  "1": { numero: "+523337124705", area: "comercial", texto: "En DIIPA le ofrecemos soluciones jurídicas reales para adquirir, recuperar o regularizar un inmueble, con certeza legal y respaldo documentado. Un asesor le explicará, sin compromiso, cómo proteger e incrementar su patrimonio. Permanezca en la línea." },
  "2": { numero: "+523318817553", area: "atencion", texto: "Gracias por comunicarse. Su caso es importante y está protegido y documentado. En seguida le atiende su asesor." },
  "3": { numero: "+523223052926", area: "juridico", texto: "Le comunicamos con nuestro equipo jurídico. Recuerde que cada paso de su proceso queda por escrito y respaldado. En un momento le atendemos." },
  "4": { numero: "+526691890053", area: "contabilidad", texto: "Le comunicamos con Facturación. Tenga a la mano su número de expediente. Todo pago se respalda con su comprobante fiscal." },
  "5": { numero: "+526694167862", area: "atencion", texto: "Su tranquilidad es lo primero. En DIIPA las devoluciones se atienden con un convenio por escrito, y su espera se compensa: usted nunca pierde su lugar ni su dinero, y todo queda registrado en su expediente. En un momento le atiende un asesor." },
  "0": { numero: "+523223031090", area: "atencion", texto: "En un momento le comunicamos con una persona." },
};

// Qué ROL de teléfono recibe cada opción del menú (Fase 3).
// Si hay varias personas con el mismo rol, manda a la del área indicada.
const RUTA_ROL = {
  "1": { rol: "secretaria_general", area: "comercial" },
  "2": { rol: "telefonista_primer_contacto", area: "atencion" },
  "3": { rol: "secretaria", area: "juridico" },
  "4": { rol: "asistente_contable", area: "contabilidad" },
  "5": { rol: "telefonista_primer_contacto", area: "atencion" },
  "0": { rol: "telefonista_primer_contacto", area: "atencion" },
};

// Qué secretaria/telefonista FILTRA cada área (Fase 4).
// Regla: a un director no se le pasa directo; primero su secretaria.
const SECRETARIA_AREA = {
  comercial: "secretaria_general",
  direccion: "secretaria_general",
  juridico: "secretaria",
  contabilidad: "asistente_contable",
  atencion: "telefonista_primer_contacto",
  tecnologia: "secretaria",
};

// Guion corto POR ÁREA para cuando entran por marcado de extensión.
const GUION_AREA = {
  atencion: "Le comunicamos con Atención al Cliente, donde damos seguimiento a su expediente y resolvemos sus dudas. En un momento le atienden.",
  comercial: "Le comunicamos con el área Comercial, donde le informamos sobre nuestras garantías y servicios con certeza jurídica. Permanezca en la línea.",
  juridico: "Le comunicamos con el área Jurídica, que lleva su proceso por escrito y respaldado. En un momento le atienden.",
  contabilidad: "Le comunicamos con Facturación. Tenga a la mano su número de expediente. En un momento le atienden.",
  direccion: "Le comunicamos con Dirección. En un momento le atienden.",
  tecnologia: "Le comunicamos con el área de Tecnología. En un momento le atienden.",
};

const BIENVENIDA = "Le damos la bienvenida a DIIPA, especialistas en certeza jurídica y soluciones inmobiliarias. Aquí su patrimonio está en buenas manos: trabajamos con honestidad y todo por escrito. Su llamada puede ser grabada para calidad y para el seguimiento de su expediente.";
const MENU = "Escuche las opciones. Si desea adquirir una garantía con nosotros y conocer los beneficios, remodelaciones y gestiones que manejamos, marque 1. Si ya es cliente y desea seguimiento de su expediente, marque 2. Para temas jurídicos de su expediente, marque 3. Para facturación, marque 4. Para devoluciones, marque 5. Para hablar con una persona, marque 0.";
const EXT_INSTR = "O, si conoce la extensión de tres dígitos de la persona que busca, márquela ahora.";
const BUZON = "En este momento todos nuestros asesores están ocupados. Su llamada es importante: déjenos su nombre, teléfono y expediente después del tono, y le devolveremos la llamada a la brevedad.";
const FUERA = "En este momento nuestras oficinas están cerradas. Atendemos de lunes a viernes, de 9 a 14 y de 15 a 18 horas. Déjenos su nombre, teléfono y número de expediente después del tono y le devolveremos la llamada.";
const GRACIAS = "Gracias. Su mensaje quedó registrado y le devolveremos la llamada. Que tenga buen día.";
const NO_EXT = "No encontramos esa extensión.";

const ACCION = "https://jurisconecta.netlify.app/.netlify/functions/entrante";
const SEG_POR_PERSONA = 15; // segundos que suena cada persona antes de pasar al siguiente

function estaAbierto() {
  return true; // 🔧 TEMPORAL PARA PRUEBAS — borrar esta línea cuando termines de probar
  const ahora = new Date();
  const mx = new Date(ahora.toLocaleString("en-US", { timeZone: "America/Mexico_City" }));
  const dia = mx.getDay();
  const h = mx.getHours();
  if (dia === 0 || dia === 6) return false;
  if (h >= 9 && h < 14) return true;
  if (h >= 15 && h < 18) return true;
  return false;
}

function grabarRecado(intro) {
  return `<Say ${VOZ}>${intro}</Say>` +
    `<Record maxLength="120" playBeep="true" timeout="5" finishOnKey="#" action="${ACCION}" method="POST"/>`;
}

// El menú va DENTRO del Gather: el cliente puede marcar MIENTRAS habla (barge-in)
// y reacciona al instante con 1 tecla. Si no marca en 10 s, pasa a buzón.
function menuPrompt() {
  return `<Gather numDigits="1" method="POST" timeout="10" action="${ACCION}">` +
    `<Say ${VOZ}>${MENU}</Say>` +
    `</Gather>` +
    grabarRecado(BUZON);
}

// Escapa caracteres especiales para que el XML de TwiML no se rompa
// (nombres con & < > " ' etc.).
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Arma el <Client> que hace sonar la app del ÁREA y, además, le manda
// QUIÉN llama (nombre, teléfono, si es cliente y el CallSid de la fila)
// para que el mini banner de la app lo muestre.
// info = { tel, quien, esCliente, sid }
function clienteXml(area, info) {
  if (!area) return "";
  const i = info || {};
  let params = "";
  if (i.tel) params += `<Parameter name="tel" value="${esc(i.tel)}"/>`;
  if (i.quien) params += `<Parameter name="quien" value="${esc(i.quien)}"/>`;
  params += `<Parameter name="cliente" value="${i.esCliente ? "1" : "0"}"/>`;
  if (i.sid) params += `<Parameter name="sid" value="${esc(i.sid)}"/>`;
  return `<Client><Identity>${esc(area)}</Identity>${params}</Client>`;
}

function dialDestino(numero, area, texto, info) {
  let c = `<Say ${VOZ}>${texto}</Say>`;
  const cliente = area ? clienteXml(area, info) : "";
  const celular = numero ? `<Number>${numero}</Number>` : "";
  if (numero || area) {
    c += `<Dial callerId="${process.env.TWILIO_NUMBER}" timeout="20" action="${ACCION}" method="POST">${celular}${cliente}</Dial>`;
  } else {
    c += grabarRecado(BUZON);
  }
  return c;
}

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;

// Trae los CELULARES del área, ordenados de extensión más ALTA a más BAJA
// (operativo primero, jefe al final). Salta a quien no tenga celular.
async function rosterArea(area) {
  if (!SUPA_URL || !SUPA_KEY) return [];
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/colaboradores?area=eq.${encodeURIComponent(area)}&select=numero_oficial,extension,activo`, {
      headers: { "apikey": SUPA_KEY, "Authorization": "Bearer " + SUPA_KEY },
    });
    const arr = await r.json();
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x) => x.activo !== false && x.numero_oficial)
      .sort((a, b) => Number(b.extension || 0) - Number(a.extension || 0))
      .map((x) => x.numero_oficial);
  } catch { return []; }
}

// LA CASCADA: suena a la persona "paso" del área; si no contesta, el action
// vuelve aquí con paso+1 y suena a la siguiente; al acabarse la lista, buzón.
async function cascada(area, paso, fallbackCel, info) {
  const lista = await rosterArea(area);
  const sig = (n) => `${ACCION}?casc=${encodeURIComponent(area)}&amp;paso=${n}`;

  if (paso < lista.length) {
    const cel = lista[paso];
    // En el primer intento también suena la app de toda el área (los de escritorio).
    const app = paso === 0 ? clienteXml(area, info) : "";
    return `<Dial callerId="${process.env.TWILIO_NUMBER}" timeout="${SEG_POR_PERSONA}" action="${sig(paso + 1)}" method="POST"><Number>${cel}</Number>${app}</Dial>`;
  }

  // Ya no hay más celulares en la lista.
  if (paso === 0) {
    // Nadie con celular: al menos suena la app del área y el celular fijo de respaldo.
    const cel = fallbackCel ? `<Number>${fallbackCel}</Number>` : "";
    return `<Dial callerId="${process.env.TWILIO_NUMBER}" timeout="${SEG_POR_PERSONA}" action="${sig(1)}" method="POST">${cel}${clienteXml(area, info)}</Dial>`;
  }
  return grabarRecado(BUZON);
}

// Busca al CLIENTE por su teléfono (revisa todas las columnas, compara últimos 10 dígitos).
// Descarta valores con letras (CURP, INE, RFC) para no confundirse.
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
        if (/^\d{10,13}$/.test(clean) && clean.slice(-10) === ult10) {
          return c;
        }
      }
    }
  } catch {}
  return null;
}

// Resuelve los datos de quien llama para mandarlos al banner de la app:
// nombre del cliente (si su número está registrado), teléfono, si es
// cliente, y el CallSid de la llamada (para ligar la fila en "llamadas").
async function resolverQuien(p) {
  const tel = (p.get("From") || "").replace(/\D/g, "");
  const sid = p.get("CallSid") || "";
  const cliente = await buscarClientePorTel(tel);
  return {
    tel,
    quien: cliente ? (cliente.nombre || "Cliente") : "",
    esCliente: !!cliente,
    sid,
  };
}

async function registrarEntrante(p) {
  if (!SUPA_URL || !SUPA_KEY) return;
  const callSid = p.get("CallSid") || "";
  if (!callSid) return;
  const from = (p.get("From") || "").replace(/\D/g, "");
  const cliente = await buscarClientePorTel(from);
  const nombreCliente = cliente ? (cliente.nombre || "Cliente") : null;
  try {
    await fetch(`${SUPA_URL}/rest/v1/llamadas`, {
      method: "POST",
      headers: { "apikey": SUPA_KEY, "Authorization": "Bearer " + SUPA_KEY, "Content-Type": "application/json", "Prefer": "return=minimal" },
      body: JSON.stringify({
        tipo: "entrante", telefono: from || null, area: "atencion",
        nombre: nombreCliente,
        motivo: nombreCliente ? ("Llamada de " + nombreCliente) : "Llamada de número nuevo",
        resultado: "Pendiente (devolver llamada)",
        registrado_por: "Conmutador", call_sid: callSid,
      }),
    });
  } catch {}
}

// Busca a la persona con cierto ROL de teléfono (telefonista, secretaria, etc.).
// Si hay varias, prioriza la del área indicada. Devuelve null si no hay nadie.
async function buscarPorRol(rol, area) {
  if (!SUPA_URL || !SUPA_KEY || !rol) return null;
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/colaboradores?rol_telefonia=eq.${encodeURIComponent(rol)}&select=numero_oficial,area,nombre,activo`, {
      headers: { "apikey": SUPA_KEY, "Authorization": "Bearer " + SUPA_KEY },
    });
    let arr = await r.json();
    if (!Array.isArray(arr)) return null;
    arr = arr.filter((x) => x.activo !== false);
    if (area) {
      const enArea = arr.find((x) => x.area === area);
      if (enArea) return enArea;
    }
    return arr[0] || null;
  } catch { return null; }
}

async function buscarExtension(ext) {
  if (!SUPA_URL || !SUPA_KEY) return null;
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/colaboradores?extension=eq.${encodeURIComponent(ext)}&select=numero_oficial,area,nombre,rol_telefonia,activo`, {
      headers: { "apikey": SUPA_KEY, "Authorization": "Bearer " + SUPA_KEY },
    });
    const arr = await r.json();
    if (Array.isArray(arr) && arr.length) {
      const activos = arr.filter((x) => x.activo !== false);
      return activos[0] || arr[0];
    }
  } catch {}
  return null;
}

async function actualizar(p, cambios) {
  if (!SUPA_URL || !SUPA_KEY) return;
  const callSid = p.get("CallSid") || "";
  if (!callSid) return;
  try {
    await fetch(`${SUPA_URL}/rest/v1/llamadas?call_sid=eq.${encodeURIComponent(callSid)}`, {
      method: "PATCH",
      headers: { "apikey": SUPA_KEY, "Authorization": "Bearer " + SUPA_KEY, "Content-Type": "application/json", "Prefer": "return=minimal" },
      body: JSON.stringify(cambios),
    });
  } catch {}
}

export default async (req) => {
  let p;
  try { p = new URLSearchParams(await req.text()); } catch { p = new URLSearchParams(); }
  let url;
  try { url = new URL(req.url); } catch { url = null; }
  const casc = url ? (url.searchParams.get("casc") || "") : "";
  const pasoQ = url ? parseInt(url.searchParams.get("paso") || "0", 10) : 0;

  const digito = p.get("Digits") || "";
  const dialStatus = p.get("DialCallStatus") || "";
  const recUrl = p.get("RecordingUrl") || "";

  if (!digito && !dialStatus && !recUrl) {
    await registrarEntrante(p);
  }

  let cuerpo = "";

  if (recUrl) {
    await actualizar(p, { grabacion_url: recUrl + ".mp3", resultado: "Recado", devolver: true });
    cuerpo = `<Say ${VOZ}>${GRACIAS}</Say><Hangup/>`;
  } else if (casc && dialStatus) {
    // Paso de la CASCADA
    if (dialStatus === "completed") {
      const dur = parseInt(p.get("DialCallDuration") || "0", 10);
      await actualizar(p, { resultado: "Contestada", duracion: dur || null });
      cuerpo = `<Hangup/>`;
    } else {
      const info = await resolverQuien(p);
      cuerpo = await cascada(casc, pasoQ, undefined, info);
    }
  } else if (dialStatus) {
    // Dial directo (extensión)
    if (dialStatus === "completed") {
      const dur = parseInt(p.get("DialCallDuration") || "0", 10);
      await actualizar(p, { resultado: "Contestada", duracion: dur || null });
      cuerpo = `<Hangup/>`;
    } else {
      await actualizar(p, { resultado: "No contestó", devolver: true });
      cuerpo = grabarRecado(BUZON);
    }
  } else if (digito) {
    const info = await resolverQuien(p);
    if (digito.length >= 3) {
      // MARCADO POR EXTENSIÓN (directo a esa persona)
      const persona = await buscarExtension(digito);
      if (persona && (persona.numero_oficial || persona.area)) {
        if (persona.rol_telefonia === "director") {
          // REGLA: a un DIRECTOR no se le pasa directo; primero su secretaria.
          const rolSec = SECRETARIA_AREA[persona.area] || "telefonista_primer_contacto";
          let sec = await buscarPorRol(rolSec, persona.area);
          if (!sec) sec = await buscarPorRol("telefonista_primer_contacto", "atencion");
          if (sec && (sec.numero_oficial || sec.area)) {
            const guionDir = "Le comunicamos con la asistente del área, quien con gusto le atiende y le canaliza. En un momento le atienden.";
            cuerpo = dialDestino(sec.numero_oficial, sec.area || persona.area, guionDir, info);
          } else {
            // Sin secretaria disponible: suena la app del área, NUNCA el director directo.
            const guion = GUION_AREA[persona.area] || "Le comunicamos. En un momento le atienden.";
            cuerpo = dialDestino(null, persona.area, guion, info);
          }
        } else {
          const guion = GUION_AREA[persona.area] || "Le comunicamos. En un momento le atienden.";
          cuerpo = dialDestino(persona.numero_oficial, persona.area, guion, info);
        }
      } else {
        cuerpo = `<Say ${VOZ}>${NO_EXT}</Say>` + menuPrompt();
      }
    } else if (RUTAS[digito]) {
      // OPCIÓN DEL MENÚ → primero a la SECRETARIA/TELEFONISTA del rol (Fase 3)
      const r = RUTAS[digito];
      const mapa = RUTA_ROL[digito];
      const persona = mapa ? await buscarPorRol(mapa.rol, mapa.area) : null;
      if (persona && (persona.numero_oficial || persona.area)) {
        // Timbra al celular de esa persona + la app de su área.
        cuerpo = dialDestino(persona.numero_oficial, persona.area || r.area, r.texto, info);
      } else {
        // Red de seguridad: si nadie tiene ese rol, cae como antes (cascada del área).
        cuerpo = `<Say ${VOZ}>${r.texto}</Say>` + await cascada(r.area, 0, r.numero, info);
      }
    } else {
      cuerpo = `<Say ${VOZ}>Opción no válida.</Say>` + menuPrompt();
    }
  } else {
    if (!estaAbierto()) {
      cuerpo = grabarRecado(FUERA);
    } else {
      cuerpo = `<Say ${VOZ}>${BIENVENIDA}</Say>` + menuPrompt();
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response>${cuerpo}</Response>`;
  return new Response(xml, { status: 200, headers: { "Content-Type": "text/xml" } });
};
