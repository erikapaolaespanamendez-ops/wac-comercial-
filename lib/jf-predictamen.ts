// =====================================================================
//  PUENTE · Mandar una garantía a pre-dictaminar
//  →  src/lib/jf-predictamen.ts
//
//  Es el único lugar donde JurisConecta ESCRIBE en JusticiaFácil, y solo
//  hace una cosa: levantar la solicitud de pre-dictamen.
//
//  Lo que se manda es una FOTO CONGELADA de la dirección y el crédito.
//  Allá no se pueden editar (hay un candado en la base). Si mañana se
//  corrige el domicilio aquí, el dictamen que se firmó allá sigue
//  diciendo lo que decía cuando se firmó.
//
//  NO se copia nada de dinero: ni adeudo, ni precio de compra, ni avalúo.
//  Eso es del negocio, no del expediente.
// =====================================================================
import { supabase } from "./supabase";

const JF_URL = "https://dquoysougxqknvgooiqg.supabase.co";
const JF_KEY = "sb_publishable__rEHm2hdrMkQfaBrRqqtOw_akusY-Em";
const jfHeaders = {
  apikey: JF_KEY,
  Authorization: `Bearer ${JF_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

// Lo que se necesita saber de la garantía para poder mandarla.
export type ParaPredictamen = {
  id: string;
  folio: string;
  numCredito: string | null;
  administradoraCodigo: string | null;
  direccion: string;
  deudor: string | null;
  estadoMx: string | null;
  etapaProcesal: string | null;
  tipoInmueble?: string | null;
  recamaras?: number | null;
  banos?: number | null;
  m2Terreno: number | null;
  m2Construccion: number | null;
  avaluoComercial: number | null;
  fotoFachada: string | null;
  lat: number | null;
  lng: number | null;
};

// ── Qué le falta para poder mandarse ─────────────────────────────────
// Por regla de la DGE: metros, foto de fachada y link de mapas con
// coordenadas. Sin los tres, el botón no se prende.
export function faltaParaMandar(g: ParaPredictamen): string[] {
  const falta: string[] = [];
  if (!g.m2Construccion) falta.push("metros de construcción");
  if (!g.fotoFachada) falta.push("foto de fachada");
  if (g.lat == null || g.lng == null) falta.push("link de mapas con coordenadas");
  return falta;
}

// ── Folio del pre-dictamen ───────────────────────────────────────────
// Sigue la serie que ya usa JusticiaFácil: URRJ-PD-XX-NNN.
async function siguienteFolioJF(): Promise<string> {
  try {
    const r = await fetch(
      `${JF_URL}/rest/v1/predictamen?select=folio&folio=like.URRJ-PD-XX-*&order=folio.desc&limit=1`,
      { headers: jfHeaders },
    );
    const filas = (await r.json()) as { folio?: string }[];
    if (!Array.isArray(filas) || !filas.length) return "URRJ-PD-XX-001";
    const n = parseInt((filas[0].folio || "").split("-").pop() || "0", 10) || 0;
    return "URRJ-PD-XX-" + String(n + 1).padStart(3, "0");
  } catch {
    return "URRJ-PD-XX-" + String(Date.now()).slice(-3);
  }
}

export type Resultado = {
  ok: boolean;
  folioPredictamen?: string;
  error?: string;
};

// ── Mandar ───────────────────────────────────────────────────────────
// Son tres pasos y en este orden, para que nada quede colgado:
//   1. crear el asunto en JusticiaFácil, en unidad URRJ y SIN cliente
//   2. crear el pre-dictamen pendiente, ligado a ese asunto
//   3. anotar de este lado que ya se mandó
export async function mandarAPredictamen(
  g: ParaPredictamen,
  quien: string,
): Promise<Resultado> {
  const falta = faltaParaMandar(g);
  if (falta.length) return { ok: false, error: "Falta " + falta.join(", ") + "." };

  // CANDADO CONTRA REPETIDOS.
  // Se pregunta a la BASE, no a la pantalla: aunque alguien abra dos
  // ventanas, le dé doble clic o entre por otro lado, aquí se atora.
  // Una garantía mandada dos veces son dos fichas en URRJ del mismo
  // asunto, y dos abogados dictaminando lo mismo sin saberlo.
  {
    const { data: yaEsta } = await supabase
      .from("garantia")
      .select("jf_caso_id,etapa")
      .eq("id", g.id)
      .single();
    const f = yaEsta as { jf_caso_id?: string | null; etapa?: string } | null;
    if (f?.jf_caso_id) {
      return { ok: false, error: "Esta garantía ya se mandó a pre-dictaminar. No se puede mandar dos veces." };
    }
    if (f?.etapa && f.etapa !== "en_cartera") {
      return { ok: false, error: "Esta garantía ya salió de cartera: está en " + f.etapa + "." };
    }
  }

  // 1 · El asunto jurídico
  let casoId = "";
  try {
    const r = await fetch(`${JF_URL}/rest/v1/caso_juridico`, {
      method: "POST",
      headers: jfHeaders,
      body: JSON.stringify({
        unidad: "URRJ",
        // Las fichas de URRJ NUNCA traen cliente: se dictamina la
        // garantía antes de venderla. Por eso va en blanco a propósito.
        cliente_nombre: null,
        demandado: g.deudor,
        no_credito: g.numCredito,
        direccion_garantia: g.direccion,
        entidad: g.estadoMx,
        etapa_actual: g.etapaProcesal,
        // La foto congelada + el apuntador de regreso
        jc_garantia_id: g.id,
        direccion_congelada: g.direccion,
        credito_congelado: g.numCredito,
        congelado_en: new Date().toISOString(),
      }),
    });
    if (!r.ok) return { ok: false, error: "No se pudo crear el asunto: " + (await r.text()) };
    const creado = (await r.json()) as { id?: string }[];
    casoId = creado?.[0]?.id || "";
    if (!casoId) return { ok: false, error: "El asunto se creó sin id." };
  } catch (e) {
    return { ok: false, error: "No se pudo conectar con JusticiaFácil." };
  }

  // 2 · El pre-dictamen pendiente
  const folio = await siguienteFolioJF();
  // El id del pre-dictamen no se usa de este lado: el amarre es el folio.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let predictamenId = ""; void predictamenId;
  try {
    const r = await fetch(`${JF_URL}/rest/v1/predictamen`, {
      method: "POST",
      headers: jfHeaders,
      body: JSON.stringify({
        caso_id: casoId,
        garantia_id: casoId,
        folio,
        estado: g.estadoMx,
        etapa_firma: "elabora",
        // Sin resultado: lo pone el abogado. Aquí solo se solicita.
        resultado: null,
        nota_sin_juicio: "Solicitud desde Carteras · " + g.folio,
        datos: {
          numeroCredito: g.numCredito,
          deudor: g.deudor,
          ubicacion: g.direccion,
          etapaProcesal: g.etapaProcesal,
          origenSolicitud: "JurisConecta",
          garantiaJC: g.id,
          solicitadoPor: quien,
        },
      }),
    });
    if (!r.ok) return { ok: false, error: "No se pudo crear el pre-dictamen: " + (await r.text()) };
    const creado = (await r.json()) as { id?: string }[];
    predictamenId = creado?.[0]?.id || "";
  } catch {
    return { ok: false, error: "El asunto se creó pero el pre-dictamen no." };
  }

  // 3 · La solicitud EN JUSTICIAFÁCIL
  // Esta es la que hace que la garantía aparezca en la bandeja
  // "Solicitudes de URRJ para dictaminar". Sin este renglón el asunto
  // existe pero nadie lo ve llegar.
  try {
    await fetch(`${JF_URL}/rest/v1/solicitud_predictamen`, {
      method: "POST",
      headers: { ...jfHeaders, Prefer: "return=minimal" },
      body: JSON.stringify({
        caso_id: casoId,
        // OJO: garantia_id de este lado apunta a caso_juridico, no a la
        // garantia de JurisConecta. El amarre real va en caso.jc_garantia_id.
        garantia_id: casoId,
        numero_credito: g.numCredito || null,
        expediente: null,
        cliente: null,
        juzgado: null,
        estado: "pendiente",
        area: "URRJ",
        tipo_dictamen: "Dictamen Jurídico",
        administradora_codigo: g.administradoraCodigo || null,
        nota: "Enviada desde Comercial · " + g.folio + " · " + g.direccion,
        solicitado_por: quien,
      }),
    });
  } catch {
    // Si la bandeja no recibe el aviso, el asunto igual quedó creado.
    // No se detiene el envío por esto.
  }

  // No se guarda copia de la solicitud de este lado: la solicitud vive
  // UNA sola vez, en JusticiaFácil. El amarre de este lado es
  // garantia.jf_caso_id y garantia.jf_predictamen_id, que se escriben
  // aquí abajo.

  await supabase
    .from("garantia")
    .update({
      etapa: "en_predictamen",
      jf_caso_id: casoId,
      jf_predictamen_id: folio,
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", g.id);

  return { ok: true, folioPredictamen: folio };
}

// ── Leer de regreso ──────────────────────────────────────────────────
// Para ver, desde Carteras, en qué va el pre-dictamen sin salirse a
// JusticiaFácil. Solo lectura.
export type EstadoJF = {
  folio: string | null;
  resultado: string | null;
  etapaFirma: string | null;
  abogado: string | null;
  terminado: boolean;
};

export async function estadoEnJF(casoId: string): Promise<EstadoJF | null> {
  try {
    const r = await fetch(
      `${JF_URL}/rest/v1/predictamen?select=folio,resultado,etapa_firma,abogado_nombre,terminado` +
        `&caso_id=eq.${encodeURIComponent(casoId)}&vigente=eq.true&limit=1`,
      { headers: jfHeaders },
    );
    const filas = (await r.json()) as Record<string, unknown>[];
    if (!Array.isArray(filas) || !filas.length) return null;
    const f = filas[0];
    return {
      folio: (f.folio as string) ?? null,
      resultado: (f.resultado as string) ?? null,
      etapaFirma: (f.etapa_firma as string) ?? null,
      abogado: (f.abogado_nombre as string) ?? null,
      terminado: Boolean(f.terminado),
    };
  } catch {
    return null;
  }
}
