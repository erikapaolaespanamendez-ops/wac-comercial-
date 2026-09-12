// =====================================================================
//  canjear-sso.mjs  —  cambia el código de un solo uso por tu sesión real
//
//  La llama JusticiaFácil / JurisConecta / etc. cuando llegas a su
//  ruta /sso?code=XXXX viniendo del Portal. Verifica que el código
//  exista, no esté usado y no tenga más de 60 segundos, lo marca
//  como usado, y devuelve los tokens para que ese sistema abra tu
//  sesión con supabase.auth.setSession(...).
// =====================================================================
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://xzvtgjtumvwftulqxiao.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";

const VIGENCIA_SEGUNDOS = 60;

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
  if (!SERVICE_KEY) return { statusCode: 500, headers, body: "Falta configurar SUPABASE_SERVICE_KEY en Netlify" };

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, headers, body: "JSON inválido" }; }

  const { code } = body;
  if (!code) return { statusCode: 400, headers, body: "Falta el código" };

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: fila, error: selErr } = await admin
    .from("sso_handoff")
    .select("id, correo, access_token, refresh_token, creado_en, usado")
    .eq("id", code)
    .maybeSingle();

  if (selErr || !fila) return { statusCode: 400, headers, body: "Código no válido" };
  if (fila.usado) return { statusCode: 400, headers, body: "Ese código ya fue usado" };

  const edadSegundos = (Date.now() - new Date(fila.creado_en).getTime()) / 1000;
  if (edadSegundos > VIGENCIA_SEGUNDOS) {
    return { statusCode: 400, headers, body: "El código expiró, vuelve a entrar desde el Portal" };
  }

  // Lo marcamos usado ANTES de responder, así nadie más lo puede canjear
  // aunque interceptara la misma petición dos veces.
  await admin.from("sso_handoff").update({ usado: true }).eq("id", code);

  return {
    statusCode: 200,
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      correo: fila.correo,
      access_token: fila.access_token,
      refresh_token: fila.refresh_token,
    }),
  };
}
