// =====================================================================
//  crear-sso.mjs  —  genera un código de un solo uso para pasar tu
//  sesión de un sistema a otro (Portal → JusticiaFácil / JurisConecta / …)
//
//  La llama el Portal cuando das clic en la tarjeta de un sistema.
//  Recibe tu access_token + refresh_token (los que ya tienes guardados
//  en el navegador porque ya iniciaste sesión), verifica que sean
//  válidos, y los guarda 60 segundos en la tabla sso_handoff bajo un
//  código corto. El navegador NUNCA ve tus tokens reales otra vez —
//  solo ese código, en la URL.
// =====================================================================
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://xzvtgjtumvwftulqxiao.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6dnRnanR1bXZ3ZnR1bHF4aWFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0NDU0NzUsImV4cCI6MjA5NzAyMTQ3NX0.W1CwPHCop68e0z_lCiX85EaIUoaJPG3huy2OjlZlSy4";
// La llave "service" es SECRETA — vive SOLO en las variables de entorno
// de Netlify (Site settings → Environment variables). Nunca en el código.
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";

// Dominios desde los que se permite pedir un código (ajusta cuando
// tengas los dominios finales conectados).
const ORIGENES_PERMITIDOS = [
  "https://jurisconecta.netlify.app",
  "https://justiciafacil.netlify.app",
  "https://portaldiipa.netlify.app",
  "https://portal.diipadesarrollos.com",
];

function corsHeaders(origin) {
  const ok = ORIGENES_PERMITIDOS.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : ORIGENES_PERMITIDOS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function handler(event) {
  const origin = event.headers?.origin || event.headers?.Origin || "";
  const headers = corsHeaders(origin);

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: "Método no permitido" };
  if (!SERVICE_KEY) {
    console.error("crear-sso: falta SUPABASE_SERVICE_KEY o SUPABASE_SERVICE_ROLE en Netlify");
    return { statusCode: 500, headers, body: "Falta configurar SUPABASE_SERVICE_KEY en Netlify" };
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, headers, body: "JSON inválido" }; }

  const { access_token, refresh_token } = body;
  if (!access_token || !refresh_token) {
    console.error("crear-sso: faltan tokens en el body");
    return { statusCode: 400, headers, body: "Faltan access_token / refresh_token" };
  }

  // 1) Verificamos que el access_token sea real y vigente.
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: userData, error: userErr } = await anon.auth.getUser(access_token);
  if (userErr || !userData?.user?.email) {
    console.error("crear-sso: token inválido:", userErr?.message || "sin usuario");
    return { statusCode: 401, headers, body: "Sesión no válida" };
  }
  const correo = userData.user.email.toLowerCase();

  // 2) Guardamos el traspaso con la llave service_role (salta RLS).
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: fila, error: insErr } = await admin
    .from("sso_handoff")
    .insert({ correo, access_token, refresh_token })
    .select("id")
    .single();

  if (insErr || !fila) {
    console.error("crear-sso: error al insertar en sso_handoff:", insErr?.message || insErr);
    return { statusCode: 500, headers, body: "No se pudo crear el código de acceso: " + (insErr?.message || "error desconocido") };
  }

  return {
    statusCode: 200,
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ code: fila.id }),
  };
}
