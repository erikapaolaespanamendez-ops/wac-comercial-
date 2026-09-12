// =====================================================================
//  aprobar-prioridad-rdc.mjs — ÚNICA puerta para aprobar/rechazar una
//  solicitud de prioridad RDC. Ni JurisConecta ni JusticiaFácil pueden
//  escribir el "aprobada"/"rechazada" directo a la base — todos pasan
//  por aquí, con la llave de servicio (service_role), que sí puede
//  saltarse el RLS.
//
//  Quién puede llamar esta función:
//   1) El propio frontend de JurisConecta (mismo sitio) → sin necesidad
//      de secreto adicional, ya está detrás de su propio login.
//   2) JusticiaFácil, a través de SU PROPIA función servidor
//      (netlify/functions/aprobar-rdc-proxy.mjs) — esa función manda
//      un header 'x-bridge-secret' que debe coincidir con la variable
//      de entorno RDC_BRIDGE_SECRET configurada aquí. El secreto NUNCA
//      viaja al navegador de nadie — vive solo en las dos funciones de
//      servidor (JurisConecta y JusticiaFácil).
//
//  Body esperado (POST, JSON):
//   { solicitudId, accion: "aprobar" | "rechazar", aprobadoPor, origen }
// =====================================================================
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://xzvtgjtumvwftulqxiao.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE || "";
const BRIDGE_SECRET = process.env.RDC_BRIDGE_SECRET || "";

// Orígenes de navegador permitidos para el preflight de CORS (informativo,
// NO es el control de seguridad real — el control real es el secreto).
const ORIGENES_PERMITIDOS = [
  process.env.URL || "",
  process.env.JUSTICIAFACIL_URL || "",
].filter(Boolean);

function corsHeaders(origin) {
  const permitido = ORIGENES_PERMITIDOS.includes(origin) ? origin : ORIGENES_PERMITIDOS[0] || "*";
  return {
    "Access-Control-Allow-Origin": permitido,
    "Access-Control-Allow-Headers": "Content-Type, x-bridge-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

export async function handler(event) {
  const cors = corsHeaders(event.headers?.origin || event.headers?.Origin || "");

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: cors, body: "Método no permitido" };
  if (!SERVICE_KEY) return { statusCode: 500, headers: cors, body: "Falta SUPABASE_SERVICE_ROLE en el servidor." };

  // Si la llamada trae el header del puente (viene de JusticiaFácil), el
  // secreto DEBE coincidir. Si no trae el header, se asume que viene del
  // propio frontend de JurisConecta (mismo sitio, ya autenticado ahí).
  const secretoRecibido = event.headers?.["x-bridge-secret"] || event.headers?.["X-Bridge-Secret"];
  const vieneDePuente = !!secretoRecibido;
  if (vieneDePuente && (!BRIDGE_SECRET || secretoRecibido !== BRIDGE_SECRET)) {
    return { statusCode: 401, headers: cors, body: "Secreto de puente inválido." };
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, headers: cors, body: "JSON inválido." }; }

  const { solicitudId, accion, aprobadoPor, origen } = body;
  if (!solicitudId || !["aprobar", "rechazar"].includes(accion) || !aprobadoPor) {
    return { statusCode: 400, headers: cors, body: "Faltan datos: solicitudId, accion (aprobar|rechazar), aprobadoPor." };
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: solicitud, error: errBusqueda } = await supabase
    .from("solicitudes_prioridad_rdc")
    .select("id, cliente_id, estado, solicitado_por, tipo, monto_solicitado")
    .eq("id", solicitudId)
    .maybeSingle();

  if (errBusqueda || !solicitud) return { statusCode: 404, headers: cors, body: "No se encontró la solicitud." };
  if (solicitud.estado !== "pendiente") {
    return { statusCode: 409, headers: cors, body: `Esta solicitud ya se resolvió (estado actual: ${solicitud.estado}).` };
  }

  const nuevoEstado = accion === "aprobar" ? "aprobada" : "rechazada";
  const { error: errUpdate } = await supabase
    .from("solicitudes_prioridad_rdc")
    .update({
      estado: nuevoEstado,
      aprobado_por: aprobadoPor,
      aprobado_en: new Date().toISOString(),
      origen_aprobacion: origen || (vieneDePuente ? "justiciafacil" : "jurisconecta"),
    })
    .eq("id", solicitudId);

  if (errUpdate) return { statusCode: 500, headers: cors, body: "No se pudo actualizar la solicitud." };

  // Si es una solicitud de "monto mayor" y se aprobó, el monto queda aplicado
  // de una vez al convenio del cliente (ya no hace falta otro paso).
  if (solicitud.tipo === "monto_mayor" && nuevoEstado === "aprobada" && solicitud.monto_solicitado) {
    await supabase.from("compensacion_devolucion").update({ abono_mensual: solicitud.monto_solicitado, updated_at: new Date().toISOString() }).eq("cliente_id", solicitud.cliente_id);
  }

  // Aviso por campanita a RAC y a quien la solicitó.
  try {
    const { data: cli } = await supabase.from("clientes").select("nombre").eq("id", solicitud.cliente_id).maybeSingle();
    await supabase.from("eventos").insert({
      tipo: "cliente",
      accion: "rdc_prioridad_resuelta",
      titulo: nuevoEstado === "aprobada" ? `✅ Prioridad RDC aprobada: ${cli?.nombre || solicitud.cliente_id}` : `❌ Prioridad RDC rechazada: ${cli?.nombre || solicitud.cliente_id}`,
      detalle: `Solicitada por ${solicitud.solicitado_por} · Resuelta por ${aprobadoPor} (${origen || "jurisconecta"})`,
      autor: aprobadoPor,
      modulo: "clientes",
      ref_id: String(solicitud.cliente_id),
      icono: nuevoEstado === "aprobada" ? "✅" : "❌",
      meta: { cliente_id: String(solicitud.cliente_id), atencion: ["RAC", "SRAC"] },
    });
  } catch (e) {
    console.error("No se pudo avisar por campanita:", e?.message || e);
  }

  return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, estado: nuevoEstado }) };
}
