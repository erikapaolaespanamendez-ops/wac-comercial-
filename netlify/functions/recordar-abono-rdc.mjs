// =====================================================================
//  recordar-abono-rdc.mjs — ROBOT DE RECORDATORIO DE ABONOS RDC (1 vez al día)
//
//  Qué hace, en simple:
//   1) Lee las Devoluciones Compensadas (RDC) ya HABILITADAS.
//   2) Para cada una revisa si ya llegó su "fecha_proximo_abono" (la fecha
//      en que toca el siguiente pago al cliente).
//   3) Si ya llegó y no se ha avisado de ESA fecha todavía, mete UN aviso en
//      la campanita (tabla 'eventos') para RAC/SRAC/ATC/GAD, y marca esa
//      fecha como ya avisada (columna abono_notificado_hasta) para no
//      repetir el aviso todos los días.
//   4) Cuando alguien registra el abono en el sistema (agregarAbono), la
//      fecha_proximo_abono se recorre 1 mes sola — así este robot vuelve a
//      avisar el mes siguiente automáticamente, sin configurar nada más.
//   5) Al final manda UN push de resumen al celular de todos.
//
//  Usa la llave SECRETA (service_role) en la variable de entorno de Netlify
//  SUPABASE_SERVICE_ROLE (NO va en el código). Mismo patrón que
//  compensacion-anual.mjs / escalar-seguimiento.mjs.
// =====================================================================
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://xzvtgjtumvwftulqxiao.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE || "";

export async function handler() {
  if (!SERVICE_KEY) {
    console.error("Falta la variable SUPABASE_SERVICE_ROLE en Netlify.");
    return { statusCode: 200, body: "Sin llave de servicio: no se avisó nada." };
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const hoy = new Date().toISOString().slice(0, 10);

  const [{ data: comps }, { data: clientes }] = await Promise.all([
    supabase.from("compensacion_devolucion")
      .select("cliente_id, folio, fecha_proximo_abono, abono_notificado_hasta")
      .eq("estado", "habilitada")
      .not("fecha_proximo_abono", "is", null)
      .lte("fecha_proximo_abono", hoy),
    supabase.from("clientes").select("id, nombre"),
  ]);

  const cliById = new Map((clientes || []).map((c) => [String(c.id), c]));
  const filas = [];
  const updates = [];

  for (const comp of (comps || [])) {
    const id = String(comp.cliente_id);
    const cli = cliById.get(id);
    if (!cli) continue;

    // Ya se avisó de esta misma fecha → no repetir.
    if (comp.abono_notificado_hasta && comp.abono_notificado_hasta >= comp.fecha_proximo_abono) continue;

    const fechaTexto = new Date(comp.fecha_proximo_abono + "T00:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });

    filas.push({
      tipo: "cliente",
      accion: "recordatorio_abono_rdc",
      titulo: `📅 Próximo abono RDC: ${cli.nombre}`,
      detalle: `Folio ${comp.folio || "—"} · Tope $50,000 por abono · Fecha estimada: ${fechaTexto} · Atención: RAC, SRAC, Telefonista y GAD`,
      autor: "Robot de abonos RDC",
      modulo: "clientes",
      ref_id: id,
      icono: "📅",
      meta: { cliente_id: id, folio: comp.folio, fecha_proximo_abono: comp.fecha_proximo_abono, atencion: ["RAC", "SRAC", "ATC", "GAD"] },
    });
    updates.push({ cliente_id: id, fecha: comp.fecha_proximo_abono });
  }

  if (filas.length === 0) {
    return { statusCode: 200, body: "Ningún abono RDC vencido por avisar hoy." };
  }

  const { error } = await supabase.from("eventos").insert(filas);
  if (error) {
    console.error("No se pudieron guardar los avisos:", error.message);
    return { statusCode: 500, body: "Error guardando avisos." };
  }

  for (const u of updates) {
    await supabase.from("compensacion_devolucion").update({ abono_notificado_hasta: u.fecha }).eq("cliente_id", u.cliente_id);
  }

  try {
    const base = process.env.URL || "";
    if (base) {
      await fetch(base + "/.netlify/functions/notificar-todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: `📅 ${filas.length} abono(s) RDC por dar seguimiento`,
          detalle: "Revisa a los clientes con Devolución Compensada",
          modulo: "clientes",
        }),
      });
    }
  } catch (e) {
    console.error("Push de resumen falló (no afecta los avisos):", e?.message || e);
  }

  return { statusCode: 200, body: `Avisados ${filas.length} abono(s) RDC.` };
}
