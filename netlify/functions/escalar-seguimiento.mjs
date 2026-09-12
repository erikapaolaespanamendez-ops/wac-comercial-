// =====================================================================
//  escalar-seguimiento.mjs  —  EL ROBOT DE ESCALAMIENTO (corre solo, 1 vez al día)
//
//  Qué hace, en simple:
//   1) Lee todos los clientes activos, el catálogo (plazos por código) y
//      la vista de contactos (última llamada / último correo).
//   2) Calcula quién está VENCIDO (misma regla que el tablero Seguimiento:
//      SVT basta llamada; los demás llamada + correo; R3/RDC sin reloj).
//   3) Por cada vencido mete UN aviso en la campanita (tabla 'eventos'),
//      rotulado al director del área + Dirección.
//   4) No repite: si ya avisó de ese cliente en las últimas ~20 horas, lo salta.
//   5) Al final, manda UN push de resumen al celular de todos.
//
//  IMPORTANTE: usa la llave SECRETA de Supabase (service_role) para poder
//  leer desde el servidor sin sesión. Esa llave va en una VARIABLE DE ENTORNO
//  de Netlify llamada SUPABASE_SERVICE_ROLE (NO en el código).
// =====================================================================
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://xzvtgjtumvwftulqxiao.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE || "";

// Para cada código: cómo se rotula y a qué director escala (además de Dirección).
const ESCALA = {
  SVT: { area: "Comercial",      director: "DGC" },
  RV:  { area: "Atención",       director: "RAC" },
  R1:  { area: "Atención",       director: "RAC" },
  R2:  { area: "Jurídico",       director: "DIL" },
  R2C: { area: "Jurídico",       director: "DIL" },
  R3:  { area: "Jurídico",       director: "DIL" },
  RDC: { area: "Administración", director: "GAD" },
};

function diasDesde(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

// Misma regla del tablero. Devuelve si está vencido, los días y qué falta.
function evaluar(codigo, diasLimite, ultimaLlamada, ultimoCorreo) {
  if (diasLimite == null) return { vencido: false };              // R3/RDC: sin reloj
  if (codigo === "SVT") {
    if (!ultimaLlamada) return { vencido: true, dias: null, falta: "llamada" };
    const d = diasDesde(ultimaLlamada);
    return { vencido: d > diasLimite, dias: d };
  }
  // RV / R1 / R2 / R2C: llamada + correo
  if (!ultimaLlamada && !ultimoCorreo) return { vencido: true, dias: null, falta: "ambos" };
  if (!ultimaLlamada) return { vencido: true, dias: null, falta: "llamada" };
  if (!ultimoCorreo)  return { vencido: true, dias: null, falta: "correo" };
  const refMs = Math.min(new Date(ultimaLlamada).getTime(), new Date(ultimoCorreo).getTime());
  const d = Math.floor((Date.now() - refMs) / 86400000);
  return { vencido: d > diasLimite, dias: d };
}

export async function handler() {
  if (!SERVICE_KEY) {
    console.error("Falta la variable SUPABASE_SERVICE_ROLE en Netlify.");
    return { statusCode: 200, body: "Sin llave de servicio: no se escaló nada." };
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // 1) Traer datos
  const [{ data: clientes }, { data: catalogo }, { data: contactos }, { data: colabs }, { data: actos }, { data: contis }] = await Promise.all([
    supabase.from("clientes").select("id, nombre, codigo, archivado, asesor_asignado"),
    supabase.from("catalogo_codigos").select("codigo, dias_limite, responsable_rol, escala_a, escala_cuando, escala_dias"),
    supabase.from("seguimiento_contactos_cliente").select("cliente_id, ultima_llamada, ultimo_correo"),
    supabase.from("colaboradores").select("id, nombre, alterno_id"),
    supabase.from("actuaciones_cliente").select("cliente_id, fecha, tipo").in("tipo", ["boletin", "actuacion"]),
    supabase.from("contingencia_cliente").select("cliente_id, tiene_demanda").eq("tiene_demanda", true),
  ]);

  const reglas = new Map((catalogo || []).map((c) => [c.codigo, c]));
  const cont = new Map((contactos || []).map((r) => [String(r.cliente_id), r]));

  // 👇 Fase 3C/G3: colaboradores (alterno), boletines y avances (último por cliente), contingencias.
  const norm = (s) => (s || "").toString().trim().toLowerCase();
  const colById = new Map((colabs || []).map((c) => [String(c.id), c]));
  const colByNombre = new Map((colabs || []).map((c) => [norm(c.nombre), c]));
  const ultBoletin = new Map();
  const ultAvance = new Map();
  for (const a of (actos || [])) {
    const id = String(a.cliente_id);
    const m = a.tipo === "boletin" ? ultBoletin : ultAvance;
    const prev = m.get(id);
    if (a.fecha && (!prev || a.fecha > prev)) m.set(id, a.fecha);
  }
  const contingencias = new Set((contis || []).map((r) => String(r.cliente_id)));
  const CODIGOS_BOLETIN = new Set(["R2", "R2C", "R3"]);

  // 2) Anti-repetición: a quién ya le avisamos en las últimas 20h
  const corte = new Date(Date.now() - 20 * 3600 * 1000).toISOString();
  const { data: yaAvisados } = await supabase
    .from("eventos").select("ref_id").eq("tipo", "seguimiento").gte("created_at", corte);
  const yaSet = new Set((yaAvisados || []).map((r) => r.ref_id));

  // 3) Calcular vencidos y armar los avisos
  const filas = [];
  for (const cli of (clientes || [])) {
    if (cli.archivado) continue;
    if (yaSet.has(cli.id)) continue;                  // ya avisado hoy
    const regla = reglas.get(cli.codigo);
    const c = cont.get(String(cli.id)) || {};
    const r = regla
      ? evaluar(cli.codigo, regla.dias_limite, c.ultima_llamada || null, c.ultimo_correo || null)
      : { vencido: false };

    // 👇 Parte 6: ¿CUÁNDO escala el vencimiento?
    //   "al_vencer" = apenas se vence (default).  "dias" = solo a los X días de vencido.
    const escalaCuando = (regla && regla.escala_cuando) || "al_vencer";
    const escalaDias = (regla && regla.escala_dias != null) ? Number(regla.escala_dias) : 0;
    let vencidoEscalable = r.vencido;
    if (r.vencido && escalaCuando === "dias" && escalaDias > 0) {
      if (r.dias == null) {
        vencidoEscalable = true; // sin ningún contacto: no se puede medir la espera → escala igual
      } else {
        const diasVencido = r.dias - regla.dias_limite;
        vencidoEscalable = diasVencido >= escalaDias; // solo escala tras X días de vencido
      }
    }

    // ¿Falta el boletín de esta semana? (solo R2 / R2C / R3)
    const faltaBoletin = CODIGOS_BOLETIN.has(cli.codigo) && (() => {
      const f = ultBoletin.get(String(cli.id));
      return !f || diasDesde(f) > 7;
    })();

    // ¿Contingencia activa sin documento de avance de esta semana?
    const contingencia = contingencias.has(String(cli.id));
    const faltaAvance = contingencia && (() => {
      const f = ultAvance.get(String(cli.id));
      return !f || diasDesde(f) > 7;
    })();

    if (!vencidoEscalable && !faltaBoletin && !faltaAvance) continue;

    const esc = ESCALA[cli.codigo] || { area: cli.codigo, director: "DGE" };
    // 👇 Parte 3b-2: si el catálogo define "escala_a", se usa; si no, respaldo al director fijo.
    const _ea = (regla && regla.escala_a) ? regla.escala_a : "";
    const destino =
      (!_ea || _ea === "Director del área") ? esc.director :
      (_ea === "Dirección (DGE)") ? "DGE" :
      _ea;

    // Responsable real (asesor asignado) y su alterno.
    const asesorNombre = (cli.asesor_asignado || "").trim();
    const colab = asesorNombre ? colByNombre.get(norm(asesorNombre)) : null;
    const alterno = colab && colab.alterno_id ? colById.get(String(colab.alterno_id)) : null;
    const alternoNombre = alterno ? alterno.nombre : null;

    // Texto de qué está fallando.
    const partes = [];
    if (vencidoEscalable) {
      partes.push(r.dias != null ? `lleva ${r.dias} días vencido` : (r.falta === "ambos" ? "sin contacto" : `falta ${r.falta}`));
    }
    if (faltaBoletin) partes.push("falta boletín de esta semana");
    if (faltaAvance) partes.push("falta documento de avance");
    const dtxt = partes.join(" y ");

    const quien = asesorNombre || destino;
    const detalle =
      (contingencia ? "🚨 CONTINGENCIA · " : "") +
      `Responsable: ${quien}` +
      (alternoNombre ? ` · ⚠️ Alterno avisado: ${alternoNombre}` : "") +
      ` · Atención: ${destino} y Dirección (DGE)`;

    filas.push({
      tipo: "seguimiento",
      accion: "vencido",
      titulo: `${contingencia ? "🚨 " : "⚠️ "}${esc.area} — ${cli.nombre}: ${dtxt}`,
      detalle,
      autor: "Robot de seguimiento",
      modulo: "seguimiento",
      ref_id: cli.id,
      icono: contingencia ? "🚨" : "⚠️",
      meta: {
        cliente_id: cli.id,
        codigo: cli.codigo,
        responsable: quien,
        alterno: alternoNombre,
        contingencia,
        falta_boletin: faltaBoletin,
        falta_avance: faltaAvance,
        dias: r.dias ?? null,
        escala_a: [destino, "DGE", ...(alternoNombre ? [alternoNombre] : [])],
      },
    });
  }

  // ── H4-B · Convenios por vencer (o vencidos) con saldo pendiente ──
  try {
    const nombrePorId = new Map((clientes || []).map((c) => [String(c.id), c.nombre]));
    const [{ data: convs }, { data: abns }] = await Promise.all([
      supabase.from("convenio_devolucion").select("cliente_id, tiene_convenio, monto_total, meses, fecha_inicio").eq("tiene_convenio", true),
      supabase.from("abonos_devolucion").select("cliente_id, monto"),
    ]);
    const pagadoPorCliente = new Map();
    for (const a of (abns || [])) {
      const id = String(a.cliente_id);
      pagadoPorCliente.set(id, (pagadoPorCliente.get(id) || 0) + (Number(a.monto) || 0));
    }
    const fmtMXN = (n) => "$" + (Math.round(n) || 0).toLocaleString("es-MX");
    for (const cv of (convs || [])) {
      if (!cv.fecha_inicio || !cv.meses) continue;
      const id = String(cv.cliente_id);
      const restante = (Number(cv.monto_total) || 0) - (pagadoPorCliente.get(id) || 0);
      if (restante <= 0) continue; // ya está pagado → no se avisa
      const fin = new Date(cv.fecha_inicio + "T00:00:00");
      fin.setMonth(fin.getMonth() + Number(cv.meses));
      const diasParaFin = Math.round((fin.getTime() - Date.now()) / 86400000);
      if (diasParaFin > 7) continue; // todavía lejos
      const nombre = nombrePorId.get(id) || "Cliente";
      const venc = diasParaFin < 0;
      filas.push({
        tipo: "cliente",
        accion: "convenio_por_vencer",
        titulo: `${venc ? "🔴" : "💰"} Convenio ${venc ? "vencido" : "por vencer"}: ${nombre}`,
        detalle: `${venc ? `Venció hace ${Math.abs(diasParaFin)} día(s)` : `Vence en ${diasParaFin} día(s)`} · Restante ${fmtMXN(restante)} · Atención: GAD y DGE`,
        autor: "Robot de seguimiento",
        modulo: "clientes",
        ref_id: id,
        icono: venc ? "🔴" : "💰",
        meta: { cliente_id: id, restante, dias_para_fin: diasParaFin, atencion: ["GAD", "DGE"] },
      });
    }
  } catch (e) {
    console.error("Chequeo de convenios por vencer falló (no afecta lo demás):", e?.message || e);
  }

  if (filas.length === 0) {
    return { statusCode: 200, body: "Nada vencido nuevo. Todo en orden." };
  }

  // 4) Guardar los avisos en la campanita
  const { error } = await supabase.from("eventos").insert(filas);
  if (error) {
    console.error("No se pudieron guardar los avisos:", error.message);
    return { statusCode: 500, body: "Error guardando avisos." };
  }

  // 5) Un push de resumen al celular de todos (reusa la función que ya existe)
  try {
    const base = process.env.URL || "";
    if (base) {
      await fetch(base + "/.netlify/functions/notificar-todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: `⚠️ ${filas.length} seguimiento(s) vencido(s)`,
          detalle: "Revisa el tablero de Seguimiento",
          modulo: "seguimiento",
        }),
      });
    }
  } catch (e) {
    console.error("Push de resumen falló (no afecta los avisos):", e?.message || e);
  }

  return { statusCode: 200, body: `Escalados ${filas.length} cliente(s).` };
}
