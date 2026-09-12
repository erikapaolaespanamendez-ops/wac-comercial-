// =====================================================================
//  PUENTE DE REGRESO · El dictamen vuelve a la garantía
//  →  src/lib/regreso-dictamen.ts
//
//  Qué hace: para las garantías que están en pre-dictamen, va a
//  preguntarle a JusticiaFácil cómo quedó su dictamen. Si ya está
//  cerrado, lo anota aquí y sube la garantía a "aprobada".
//
//  LA REGLA (fijada por la DGE el 07-09-2026). Se activa SOLO cuando se
//  cumplen las TRES cosas al mismo tiempo:
//
//     1. el pre-dictamen está TERMINADO
//     2. la CADENA DE FIRMAS está COMPLETA  (etapa_firma = "completo")
//     3. el resultado dice APTO
//
//  La segunda es la importante y no se puede quitar. Hoy hay 71
//  pre-dictámenes atorados en la etapa "elabora" y varios ya dicen apto.
//  Si el candado fuera solo el resultado, esos 71 se subirían solos a
//  aprobadas sin que nadie los haya validado, y de ahí se irían a la
//  vitrina. La cadena completa quiere decir que ya pasó por DIL, UCM,
//  precio y la firma de la DGE.
//
//  Si el dictamen sale NO APTO o CONDICIONADO, el resultado también se
//  anota —para que se vea en la lista— pero la garantía NO avanza: se
//  queda donde está.
//
//  Por qué JurisConecta jala y no JusticiaFácil empuja: así cada base la
//  escribe su propio dueño. Allá no se le abre permiso de escritura a
//  nadie.
// =====================================================================
import { supabase } from "./supabase";

const JF_URL = "https://dquoysougxqknvgooiqg.supabase.co";
const JF_KEY = "sb_publishable__rEHm2hdrMkQfaBrRqqtOw_akusY-Em";
const jfHeaders = {
  apikey: JF_KEY,
  Authorization: `Bearer ${JF_KEY}`,
  "Content-Type": "application/json",
};

// Los tres resultados que acepta la base de JurisConecta. Si allá
// llegara a venir otra palabra, se ignora en lugar de guardar basura.
const RESULTADOS_VALIDOS = ["apto", "no_apto", "condicionado"];

export type ResumenRegreso = {
  revisadas: number;      // cuántas garantías se fueron a consultar
  aprobadas: number;      // cuántas subieron a "aprobada"
  anotadas: number;       // no aptas o condicionadas: se anotó el resultado
  enEspera: number;       // el dictamen existe pero la cadena no cierra
  error?: string;
};

type FilaJF = {
  caso_id?: string;
  resultado?: string | null;
  etapa_firma?: string | null;
  terminado?: boolean;
};

// ── La revisión ──────────────────────────────────────────────────────
export async function sincronizarDictamenes(): Promise<ResumenRegreso> {
  const vacio: ResumenRegreso = { revisadas: 0, aprobadas: 0, anotadas: 0, enEspera: 0 };

  // 1 · Las garantías que están esperando dictamen.
  const { data, error } = await supabase
    .from("garantia")
    .select("id,folio,jf_caso_id")
    .eq("etapa", "en_predictamen")
    .eq("archivada", false)
    .not("jf_caso_id", "is", null);

  if (error) return { ...vacio, error: error.message };

  const pendientes = (data ?? []) as unknown as { id: string; folio: string; jf_caso_id: string }[];
  if (!pendientes.length) return vacio;

  // 2 · Se preguntan TODAS de un solo viaje, no una por una.
  //     El `in.(...)` de PostgREST recibe la lista de asuntos.
  const ids = pendientes.map((g) => g.jf_caso_id);
  let filas: FilaJF[] = [];
  try {
    const r = await fetch(
      `${JF_URL}/rest/v1/predictamen?select=caso_id,resultado,etapa_firma,terminado` +
        `&caso_id=in.(${ids.map((i) => encodeURIComponent(i)).join(",")})` +
        `&vigente=eq.true&en_papelera=eq.false`,
      { headers: jfHeaders },
    );
    if (!r.ok) return { ...vacio, revisadas: pendientes.length, error: "JusticiaFácil no contestó." };
    filas = (await r.json()) as FilaJF[];
  } catch (e) {
    return { ...vacio, revisadas: pendientes.length, error: String(e) };
  }

  // Se arma un diccionario asunto → dictamen para no andar buscando.
  const porCaso = new Map<string, FilaJF>();
  for (const f of filas) if (f.caso_id) porCaso.set(String(f.caso_id), f);

  const resumen: ResumenRegreso = { ...vacio, revisadas: pendientes.length };

  // 3 · Una por una, se decide qué hacer.
  for (const g of pendientes) {
    const d = porCaso.get(g.jf_caso_id);
    if (!d) continue; // no hay dictamen vigente: se queda igual

    const cadenaCompleta = (d.etapa_firma || "") === "completo";
    const resultado = String(d.resultado || "").toLowerCase();
    const valido = RESULTADOS_VALIDOS.includes(resultado);

    // LA REGLA: sin cadena completa y sin terminado, no se mueve nada.
    if (!cadenaCompleta || !d.terminado || !valido) {
      resumen.enEspera++;
      continue;
    }

    if (resultado === "apto") {
      const { error: e1 } = await supabase
        .from("garantia")
        .update({ dictamen_resultado: "apto", etapa: "aprobada" })
        .eq("id", g.id);
      if (!e1) resumen.aprobadas++;
    } else {
      // No apto o condicionado: se anota el resultado para que se vea en
      // la lista, pero la garantía NO sube de etapa.
      const { error: e2 } = await supabase
        .from("garantia")
        .update({ dictamen_resultado: resultado })
        .eq("id", g.id);
      if (!e2) resumen.anotadas++;
    }
  }

  return resumen;
}

// ── Una sola garantía ────────────────────────────────────────────────
// Misma regla, para cuando se abre su ficha y se quiere refrescar solo
// esa. Regresa true si algo cambió.
export async function sincronizarUna(garantiaId: string, casoId: string): Promise<boolean> {
  try {
    const r = await fetch(
      `${JF_URL}/rest/v1/predictamen?select=resultado,etapa_firma,terminado` +
        `&caso_id=eq.${encodeURIComponent(casoId)}&vigente=eq.true&en_papelera=eq.false&limit=1`,
      { headers: jfHeaders },
    );
    const filas = (await r.json()) as FilaJF[];
    if (!Array.isArray(filas) || !filas.length) return false;

    const d = filas[0];
    const resultado = String(d.resultado || "").toLowerCase();
    if ((d.etapa_firma || "") !== "completo" || !d.terminado) return false;
    if (!RESULTADOS_VALIDOS.includes(resultado)) return false;

    const cambios: Record<string, string> = { dictamen_resultado: resultado };
    if (resultado === "apto") cambios.etapa = "aprobada";

    const { error } = await supabase.from("garantia").update(cambios).eq("id", garantiaId);
    return !error;
  } catch {
    return false;
  }
}
