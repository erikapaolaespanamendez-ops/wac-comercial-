// =====================================================================
//  recordar-prospectos.mjs — ROBOT COMERCIAL (corre solo, 1 vez al día)
//
//  Qué hace, en simple:
//   1) Lee los prospectos ACTIVOS (no convertidos, no perdidos).
//   2) Busca los que ya les toca el "próximo toque" (fecha_proximo <= hoy):
//      lead nuevo del día, 2º intento, cita, reactivar a los 15/30 días…
//   3) Por cada uno mete UN aviso en la campanita (tabla 'eventos'),
//      rotulado al asesor dueño (o "sin asignar").
//   4) No repite: si ya avisó de ese prospecto en las últimas ~20h, lo salta.
//   5) Manda UN push de resumen al celular de todos.
//
//  Usa la llave SECRETA de Supabase (service_role) desde la variable de
//  entorno de Netlify SUPABASE_SERVICE_ROLE (la misma de escalar-seguimiento).
// =====================================================================
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://xzvtgjtumvwftulqxiao.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE || "";

const FUERA = new Set(["Cliente", "Perdido"]); // estos ya no se recuerdan
const HORAS_SIN_CONTACTO = 6; // un lead Nuevo sin un solo toque tras estas horas = alerta al GL + DGE

function horasDesde(iso) {
  return (Date.now() - new Date(iso).getTime()) / 3600000;
}

export async function handler() {
  if (!SERVICE_KEY) {
    console.error("Falta la variable SUPABASE_SERVICE_ROLE en Netlify.");
    return { statusCode: 200, body: "Sin llave de servicio: no se recordó nada." };
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const hoy = new Date().toISOString().slice(0, 10);

  // 1) Prospectos cuyo próximo toque ya llegó
  const { data: prospectos } = await supabase
    .from("prospectos")
    .select("id, folio, nombre, asesor, fase, proximo_paso, fecha_proximo, zona, sucursal, convertido, created_at")
    .lte("fecha_proximo", hoy);

  // ¿Quién ya tiene al menos un toque? (para la alerta de no-contacto)
  const { data: toques } = await supabase.from("prospecto_toques").select("prospecto_id");
  const conToque = new Set((toques || []).map((t) => String(t.prospecto_id)));

  // 2) Anti-repetición: a quién ya le avisamos en las últimas 20h
  const corte = new Date(Date.now() - 20 * 3600 * 1000).toISOString();
  const { data: yaAvisados } = await supabase
    .from("eventos").select("ref_id").eq("tipo", "prospecto").gte("created_at", corte);
  const yaSet = new Set((yaAvisados || []).map((r) => r.ref_id));

  // 3) Armar los avisos
  const filas = [];
  for (const p of (prospectos || [])) {
    if (p.convertido) continue;
    if (FUERA.has(p.fase)) continue;
    if (yaSet.has(p.id)) continue;

    const asesor = (p.asesor || "").trim();
    const zona = p.zona || p.sucursal || "";
    const paso = p.proximo_paso || "Dar seguimiento";

    // 7C · Alerta de NO-CONTACTO: lead Nuevo, sin un solo toque, ya pasó el tiempo límite.
    const sinContacto = p.fase === "Nuevo" && !conToque.has(String(p.id)) && horasDesde(p.created_at) >= HORAS_SIN_CONTACTO;
    if (sinContacto) {
      filas.push({
        tipo: "prospecto",
        accion: "sin_contactar",
        titulo: `🚨 SIN CONTACTAR ${p.folio || ""} ${p.nombre}`.trim(),
        detalle: `Lleva ${Math.round(horasDesde(p.created_at))} h sin un solo toque${zona ? " · " + zona : ""} · ${asesor ? "Asesor: " + asesor : "⚠️ sin asignar"} · Atención: Gerente Local y DGE`,
        autor: "Robot comercial",
        modulo: "prospectos",
        ref_id: p.id,
        icono: "🚨",
        meta: { fase: p.fase, asesor: asesor || null, zona: zona || null, horas: Math.round(horasDesde(p.created_at)), escala_a: ["GL", "DGC", "DGE"] },
      });
      continue;
    }

    const urgenteHoy = p.fase === "Nuevo";

    filas.push({
      tipo: "prospecto",
      accion: "recordatorio",
      titulo: `${urgenteHoy ? "🆕" : "🔔"} ${p.folio || ""} ${p.nombre}`.trim(),
      detalle: `${paso}${zona ? " · " + zona : ""} · ${asesor ? "Asesor: " + asesor : "⚠️ sin asignar"}`,
      autor: "Robot comercial",
      modulo: "prospectos",
      ref_id: p.id,
      icono: urgenteHoy ? "🆕" : "🔔",
      meta: { fase: p.fase, asesor: asesor || null, zona: zona || null, fecha_proximo: p.fecha_proximo },
    });
  }

  if (filas.length === 0) {
    return { statusCode: 200, body: "Ningún prospecto pendiente nuevo. Todo al día." };
  }

  // 4) Guardar los avisos en la campanita
  const { error } = await supabase.from("eventos").insert(filas);
  if (error) {
    console.error("No se pudieron guardar los recordatorios:", error.message);
    return { statusCode: 500, body: "Error guardando recordatorios." };
  }

  // 5) Push de resumen al celular de todos
  try {
    const base = process.env.URL || "";
    if (base) {
      await fetch(base + "/.netlify/functions/notificar-todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: `🔔 ${filas.length} prospecto(s) por contactar`,
          detalle: "Revisa CRM Prospectos",
          modulo: "prospectos",
        }),
      });
    }
  } catch (e) {
    console.error("Push de resumen falló (no afecta los avisos):", e?.message || e);
  }

  return { statusCode: 200, body: `Recordados ${filas.length} prospecto(s).` };
}
