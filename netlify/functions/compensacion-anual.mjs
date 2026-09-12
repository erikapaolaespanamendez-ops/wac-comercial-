// =====================================================================
//  compensacion-anual.mjs — ROBOT DE COMPENSACIÓN POR LA ESPERA (1 vez al día)
//
//  Qué hace, en simple:
//   1) Lee las compensaciones HABILITADAS.
//   2) Para cada una calcula los AÑOS cumplidos desde el vencimiento
//      (vencimiento = fecha guardada, o fecha de firma + plazo si está vacía).
//   3) Si cumplió un AÑO NUEVO desde la última vez que avisó, mete UN aviso
//      en la campanita (tabla 'eventos'), rotulado a GAD y Dirección (DGE),
//      y guarda hasta qué año ya avisó (columna anios_notificados) para NO repetir.
//   4) Al final manda UN push de resumen al celular de todos.
//
//  Usa la llave SECRETA (service_role) en la variable de entorno de Netlify
//  SUPABASE_SERVICE_ROLE (NO va en el código). Mismo patrón que escalar-seguimiento.
// =====================================================================
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://xzvtgjtumvwftulqxiao.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE || "";

// Suma meses a una fecha ISO (yyyy-mm-dd). Devuelve Date o null.
function sumarMeses(iso, meses) {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  d.setMonth(d.getMonth() + (Number(meses) || 0));
  return d;
}

export async function handler() {
  if (!SERVICE_KEY) {
    console.error("Falta la variable SUPABASE_SERVICE_ROLE en Netlify.");
    return { statusCode: 200, body: "Sin llave de servicio: no se avisó nada." };
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // 1) Datos: compensaciones habilitadas + nombres/fecha de firma + total del convenio.
  const [{ data: comps }, { data: clientes }, { data: convs }] = await Promise.all([
    supabase.from("compensacion_devolucion")
      .select("cliente_id, capital, plazo_meses, fecha_vencimiento, tasa, estado, anios_notificados")
      .eq("estado", "habilitada"),
    supabase.from("clientes").select("id, nombre, fecha_firma"),
    supabase.from("convenio_devolucion").select("cliente_id, monto_total"),
  ]);

  const cliById = new Map((clientes || []).map((c) => [String(c.id), c]));
  const totalByCliente = new Map((convs || []).map((c) => [String(c.cliente_id), Number(c.monto_total) || 0]));

  const fmtMXN = (n) => "$" + (Math.round(n) || 0).toLocaleString("es-MX");
  const filas = [];
  const updates = [];

  for (const comp of (comps || [])) {
    const id = String(comp.cliente_id);
    const cli = cliById.get(id);
    if (!cli) continue;

    // Vencimiento: el guardado, o firma + plazo.
    const venc = comp.fecha_vencimiento
      ? new Date(comp.fecha_vencimiento + "T00:00:00")
      : sumarMeses(cli.fecha_firma, comp.plazo_meses || 14);
    if (!venc || isNaN(venc.getTime())) continue;

    const dias = Math.floor((Date.now() - venc.getTime()) / 86400000);
    if (dias < 365) continue;                       // aún no cumple el primer año
    const anios = Math.floor(dias / 365);
    const yaNotif = Number(comp.anios_notificados) || 0;
    if (anios <= yaNotif) continue;                 // ya se avisó de este año

    const capital = (Number(comp.capital) || 0) > 0 ? Number(comp.capital) : (totalByCliente.get(id) || 0);
    const tasa = Number(comp.tasa) || 5;
    const cincoPorAnio = Math.round(capital * (tasa / 100));
    const totalAnual = cincoPorAnio * anios;

    filas.push({
      tipo: "cliente",
      accion: "compensacion_anual",
      titulo: `💠 Compensación: ${cli.nombre} cumplió ${anios} año(s) de espera`,
      detalle: `Suma +${tasa}% (${fmtMXN(cincoPorAnio)}). Compensación anual acumulada: ${fmtMXN(totalAnual)} · Atención: GAD y Dirección (DGE)`,
      autor: "Robot de compensación",
      modulo: "clientes",
      ref_id: id,
      icono: "💠",
      meta: { cliente_id: id, anios, cinco_por_anio: cincoPorAnio, total_anual: totalAnual, atencion: ["GAD", "DGE"] },
    });
    updates.push({ cliente_id: id, anios });
  }

  if (filas.length === 0) {
    return { statusCode: 200, body: "Ninguna compensación cumplió un año nuevo." };
  }

  // 2) Guardar avisos en la campanita.
  const { error } = await supabase.from("eventos").insert(filas);
  if (error) {
    console.error("No se pudieron guardar los avisos:", error.message);
    return { statusCode: 500, body: "Error guardando avisos." };
  }

  // 3) Marcar hasta qué año ya se avisó (para no repetir).
  for (const u of updates) {
    await supabase.from("compensacion_devolucion")
      .update({ anios_notificados: u.anios })
      .eq("cliente_id", u.cliente_id);
  }

  // 4) Push de resumen al celular de todos (reusa la función que ya existe).
  try {
    const base = process.env.URL || "";
    if (base) {
      await fetch(base + "/.netlify/functions/notificar-todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: `💠 ${filas.length} compensación(es) cumplieron un año`,
          detalle: "Revisa los clientes en compensación",
          modulo: "clientes",
        }),
      });
    }
  } catch (e) {
    console.error("Push de resumen falló (no afecta los avisos):", e?.message || e);
  }

  return { statusCode: 200, body: `Avisadas ${filas.length} compensación(es).` };
}
