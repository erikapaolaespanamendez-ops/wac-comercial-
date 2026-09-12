// =====================================================================
//  vencer-firma-rdc.mjs — ROBOT DE VENCIMIENTO DE FIRMA RDC (cada 3 horas)
//
//  Qué hace, en simple:
//   1) Lee las Devoluciones Compensadas (RDC) que YA SE DESCARGARON pero
//      todavía NO tienen la carta firmada subida.
//   2) Si ya pasaron las 24 horas desde que se descargó y sigue sin firma,
//      la marca como VENCIDA (descarga_vencida = true) y regresa el estado
//      a "solicitada" (para que vuelva a aparecer en "Solicitudes" del
//      tablero Control de Devoluciones y alguien la retome).
//   3) Avisa por campanita a RAC de cada caso vencido.
//
//  Usa la llave SECRETA (service_role) en la variable de entorno de Netlify
//  SUPABASE_SERVICE_ROLE (NO va en el código). Mismo patrón que
//  compensacion-anual.mjs / recordar-abono-rdc.mjs.
// =====================================================================
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://xzvtgjtumvwftulqxiao.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE || "";

export async function handler() {
  if (!SERVICE_KEY) {
    console.error("Falta la variable SUPABASE_SERVICE_ROLE en Netlify.");
    return { statusCode: 200, body: "Sin llave de servicio: no se venció nada." };
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const ahoraIso = new Date().toISOString();

  const [{ data: comps }, { data: clientes }] = await Promise.all([
    supabase.from("compensacion_devolucion")
      .select("cliente_id, folio, plazo_firma_hasta, doc_firmado, descarga_vencida, modalidad")
      .not("fecha_descargado", "is", null)
      .not("plazo_firma_hasta", "is", null)
      .lt("plazo_firma_hasta", ahoraIso)
      .eq("descarga_vencida", false)
      .is("doc_firmado", null),
    supabase.from("clientes").select("id, nombre"),
  ]);

  const cliById = new Map((clientes || []).map((c) => [String(c.id), c]));
  const filas = [];
  const idsVencidosRdc = [];
  const idsVencidosConvenioSimple = [];

  for (const comp of (comps || [])) {
    const id = String(comp.cliente_id);
    const cli = cliById.get(id);
    if (!cli) continue;

    const esConvenioSimple = comp.modalidad === "convenio_simple";

    filas.push({
      tipo: "cliente",
      accion: "rdc_firma_vencida",
      titulo: `⏰ Venció el plazo de firma RDC: ${cli.nombre}`,
      detalle: esConvenioSimple
        ? `Folio ${comp.folio || "—"} · No se subió la carta firmada (Modalidad 2) dentro de las 24 horas · NO se puede regenerar remoto — debe ir a sucursal con su Gerente · Atención: RAC`
        : `Folio ${comp.folio || "—"} · No se subió la carta firmada dentro de las 24 horas · Hay que volver a generar/descargar el convenio · Atención: RAC`,
      autor: "Robot de vencimiento RDC",
      modulo: "clientes",
      ref_id: id,
      icono: "⏰",
      meta: { cliente_id: id, folio: comp.folio, atencion: ["RAC", "SRAC"] },
    });

    if (esConvenioSimple) idsVencidosConvenioSimple.push(id);
    else idsVencidosRdc.push(id);
  }

  if (filas.length === 0) {
    return { statusCode: 200, body: "Ninguna firma RDC vencida por procesar." };
  }

  const { error: errEventos } = await supabase.from("eventos").insert(filas);
  if (errEventos) {
    console.error("No se pudieron guardar los avisos:", errEventos.message);
    return { statusCode: 500, body: "Error guardando avisos." };
  }

  // Modalidad 1 (RDC): se puede volver a intentar de forma remota — se resetea normal.
  if (idsVencidosRdc.length > 0) {
    const { error } = await supabase
      .from("compensacion_devolucion")
      .update({ descarga_vencida: true, estado: "solicitada", veces_descargado: 0, historial_descargas: [] })
      .in("cliente_id", idsVencidosRdc);
    if (error) console.error("No se pudo marcar como vencida (RDC):", error.message);
  }

  // Modalidad 2 (Convenio simple): NO se puede regenerar remoto — se bloquea
  // hasta que el cliente vaya a sucursal con su Gerente.
  if (idsVencidosConvenioSimple.length > 0) {
    const { error } = await supabase
      .from("compensacion_devolucion")
      .update({ descarga_vencida: true, requiere_regenerar_sucursal: true, estado: "solicitada" })
      .in("cliente_id", idsVencidosConvenioSimple);
    if (error) console.error("No se pudo marcar como vencida (Convenio simple):", error.message);
  }

  try {
    const base = process.env.URL || "";
    if (base) {
      await fetch(base + "/.netlify/functions/notificar-todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: `⏰ ${filas.length} convenio(s) RDC sin firmar a tiempo`,
          detalle: "Revisa Control de Devoluciones para regenerarlos",
          modulo: "clientes",
        }),
      });
    }
  } catch (e) {
    console.error("Push de resumen falló (no afecta los avisos):", e?.message || e);
  }

  return { statusCode: 200, body: `Vencidas ${filas.length} firma(s) RDC.` };
}
