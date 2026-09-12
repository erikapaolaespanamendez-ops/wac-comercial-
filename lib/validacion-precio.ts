// =====================================================================
//  src/lib/validacion-precio.ts · JurisConecta
//
//  Todo lo que la pantalla de Validaciones necesita para hablar con la
//  base. Aqui NO hay pantalla ni estilos: solo lectura de la bandeja y
//  las tres acciones (votar, opinar, pedir la sugerencia de zona).
//
//  Regla que se respeta desde aqui: ningun precio se sella con un
//  update a mano. Todo pasa por fn_precio_votar, que es la que sabe
//  quien falta por firmar y a donde queda el renglon.
// =====================================================================

//  La conexion es la MISMA del resto del sistema: el cliente que ya vive
//  en src/lib/supabase.ts. No se repite aqui la URL ni la llave — un
//  solo lugar para eso, para que el dia que cambien no haya que buscarlas
//  en dos archivos.
import { supabase } from "./supabase";

// ── Los roles que votan ──────────────────────────────────────────────
// CONTABILIDAD la firma el GAD. COMERCIAL la firma el director
// comercial. DGE va al ultimo. Contingencias opina, no vota.
export type RolVoto = "CONTABILIDAD" | "COMERCIAL" | "DGE";
export type Voto = "aprobado" | "rechazado";

// Los tres motivos de rechazo. Cada uno lleva a una salida distinta.
export const MOTIVOS = {
  datos: "Datos mal capturados — se corrige y se recalcula",
  zona: "Precio fuera de zona — no se vende a ese numero",
  margen: "No deja margen — es decision sobre el activo",
} as const;
export type Motivo = keyof typeof MOTIVOS;

// ── El renglon de la bandeja ─────────────────────────────────────────
export type PrecioBandeja = {
  id: string;
  garantia_id: string;
  version: number;
  estado: "propuesto" | "desempate" | "en_firma" | "autorizado" | "rechazado";

  ruta: "piso" | "avaluo" | null;
  precio_piso: number | null;
  avaluo_comercial: number | null;
  adeudos: number | null;
  gastos_juridicos: number | null;
  descuento_pct: number | null;
  honorarios_pct: number | null;
  subtotal: number | null;
  costo_total: number | null;
  precio_final: number | null;

  precio_zona: number | null;
  precio_zona_fuente: string | null;
  precio_zona_sugerido: number | null;
  notas: string | null;

  voto_contabilidad: Voto | null;
  voto_contabilidad_motivo: Motivo | null;
  voto_contabilidad_nota: string | null;
  voto_contabilidad_suplido: boolean;
  firma_contabilidad: string | null;
  firma_contabilidad_fecha: string | null;

  voto_comercial: Voto | null;
  voto_comercial_motivo: Motivo | null;
  voto_comercial_nota: string | null;
  voto_comercial_suplido: boolean;
  firma_comercial: string | null;
  firma_comercial_fecha: string | null;

  voto_dge: Voto | null;
  voto_dge_motivo: Motivo | null;
  voto_dge_nota: string | null;
  firma_dge: string | null;
  firma_dge_fecha: string | null;

  opinion_contingencias: string | null;
  opinion_contingencias_por: string | null;
  opinion_contingencias_en: string | null;

  creado_por: string | null;
  creado_en: string;
  cerrado_en: string | null;

  // Vienen de la garantia, para no tener que pedirla aparte.
  garantia: {
    folio: string | null;
    direccion: string | null;
    municipio: string | null;
    colonia: string | null;
    m2_construccion: number | null;
    etapa: string | null;
    foto_fachada: string | null;
    galeria_fotos: unknown[] | null;
    maps_link: string | null;
    cartera: { nombre: string | null } | null;
  } | null;
};

const CAMPOS = `
  id,garantia_id,version,estado,ruta,precio_piso,avaluo_comercial,adeudos,
  gastos_juridicos,descuento_pct,honorarios_pct,subtotal,costo_total,precio_final,
  precio_zona,precio_zona_fuente,precio_zona_sugerido,notas,
  voto_contabilidad,voto_contabilidad_motivo,voto_contabilidad_nota,voto_contabilidad_suplido,
  firma_contabilidad,firma_contabilidad_fecha,
  voto_comercial,voto_comercial_motivo,voto_comercial_nota,voto_comercial_suplido,
  firma_comercial,firma_comercial_fecha,
  voto_dge,voto_dge_motivo,voto_dge_nota,firma_dge,firma_dge_fecha,
  opinion_contingencias,opinion_contingencias_por,opinion_contingencias_en,
  creado_por,creado_en,cerrado_en,
  garantia:garantia_id(folio,direccion,municipio,colonia,m2_construccion,etapa,
                       foto_fachada,galeria_fotos,maps_link,cartera:cartera_id(nombre))
`.replace(/\s+/g, "");

// ── Leer la bandeja ──────────────────────────────────────────────────
// abiertos = los que todavia esperan a alguien.
// cerrados = autorizados y rechazados, para consultar el historial.
export async function leerBandeja(
  cuales: "abiertos" | "cerrados" | "todos" = "abiertos"
): Promise<PrecioBandeja[]> {
  let q = supabase.from("garantia_precio").select(CAMPOS).order("creado_en", { ascending: false });
  if (cuales === "abiertos") q = q.in("estado", ["propuesto", "desempate", "en_firma"]);
  if (cuales === "cerrados") q = q.in("estado", ["autorizado", "rechazado"]);

  const { data, error } = await q;
  if (error) throw new Error("No se pudo leer la bandeja: " + error.message);
  return (data ?? []) as unknown as PrecioBandeja[];
}

// ── Votar: aprobar o rechazar ────────────────────────────────────────
// El rechazo SIEMPRE lleva motivo; la base lo exige y aqui se avisa
// antes para no mandar un viaje perdido.
export async function votar(args: {
  precioId: string;
  rol: RolVoto;
  usuario: string;
  voto: Voto;
  motivo?: Motivo;
  nota?: string;
  suplencia?: boolean;
}): Promise<PrecioBandeja> {
  if (args.voto === "rechazado" && !args.motivo) {
    throw new Error("Un rechazo necesita motivo: datos, zona o margen.");
  }
  const { data, error } = await supabase.rpc("fn_precio_votar", {
    p_precio_id: args.precioId,
    p_rol: args.rol,
    p_usuario: args.usuario,
    p_voto: args.voto,
    p_motivo: args.motivo ?? null,
    p_nota: args.nota ?? null,
    p_suplencia: args.suplencia ?? false,
  });
  if (error) throw new Error(error.message);
  return data as unknown as PrecioBandeja;
}

// ── Opinion de contingencias ─────────────────────────────────────────
export async function opinar(precioId: string, usuario: string, texto: string) {
  const { data, error } = await supabase.rpc("fn_precio_opinar", {
    p_precio_id: precioId,
    p_usuario: usuario,
    p_texto: texto,
  });
  if (error) throw new Error(error.message);
  return data;
}

// ── Sugerencia de precio de zona ─────────────────────────────────────
// Devuelve null cuando no hay al menos dos garantias autorizadas en la
// misma zona. Eso NO es un error: al principio va a pasar siempre.
export async function sugerenciaZona(garantiaId: string): Promise<number | null> {
  const { data, error } = await supabase.rpc("fn_precio_zona_sugerido", {
    p_garantia_id: garantiaId,
  });
  if (error || data === null || data === undefined) return null;
  return Number(data);
}

// ── Ayudas de lectura, para que la pantalla no calcule reglas ────────

// A quien le toca moverle. Lo usa el tablero para el aviso.
export function aQuienLeToca(p: PrecioBandeja): string {
  if (p.estado === "autorizado") return "Autorizado";
  if (p.estado === "rechazado") return "Rechazado — a recalcular";
  if (p.estado === "desempate") return "Desempate de la DGE";
  if (p.estado === "en_firma") return "Firma de la DGE";
  const faltan: string[] = [];
  if (!p.voto_contabilidad) faltan.push("Contabilidad");
  if (!p.voto_comercial) faltan.push("Comercial");
  return `Falta ${faltan.join(" y ")}`;
}

// Si a este rol le toca votar ahora mismo. La DGE va al ultimo.
export function puedeVotar(p: PrecioBandeja, rol: RolVoto): boolean {
  if (p.estado === "autorizado" || p.estado === "rechazado") return false;
  if (rol === "CONTABILIDAD") return p.voto_contabilidad === null;
  if (rol === "COMERCIAL") return p.voto_comercial === null;
  return p.voto_contabilidad !== null && p.voto_comercial !== null && p.voto_dge === null;
}

// La suplencia se abre hasta 3 dias despues de propuesto.
export function puedeSuplir(p: PrecioBandeja, rol: RolVoto): boolean {
  if (rol !== "DGE") return false;
  if (p.estado === "autorizado" || p.estado === "rechazado") return false;
  if (p.voto_contabilidad !== null && p.voto_comercial !== null) return false;
  const dias = (Date.now() - new Date(p.creado_en).getTime()) / 86400000;
  return dias >= 3;
}

// Diferencia contra la zona, en %. Positivo = arriba de la zona.
export function difZona(p: PrecioBandeja): number | null {
  const zona = p.precio_zona ?? p.precio_zona_sugerido;
  if (!zona || !p.precio_final) return null;
  return ((p.precio_final - zona) / zona) * 100;
}

// Semaforo: verde dentro de +/-10%, amarillo hasta 25%, rojo pasando.
export function semaforoZona(p: PrecioBandeja): "verde" | "amarillo" | "rojo" | "gris" {
  const d = difZona(p);
  if (d === null) return "gris";
  const a = Math.abs(d);
  if (a <= 10) return "verde";
  if (a <= 25) return "amarillo";
  return "rojo";
}

// Tope de tres vueltas: a la tercera deja de ser tema de precio.
export function pasoElTope(p: PrecioBandeja): boolean {
  return p.version >= 3;
}

// Si al autorizar se va a publicar o se va a quedar esperando foto.
export function publicaraAlAutorizar(p: PrecioBandeja): boolean {
  const g = p.garantia;
  if (!g) return false;
  const tieneFoto = !!g.foto_fachada || (g.galeria_fotos?.length ?? 0) > 0;
  return g.etapa === "aprobada" && tieneFoto && !!g.maps_link;
}

export const pesos = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "—"
    : n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

export const fecha = (s: string | null) =>
  !s ? "—" : new Date(s).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });

// =====================================================================
//  LA HISTORIA DE PRECIOS DE UNA GARANTÍA
//
//  Lo mismo que muestra la bandeja del Tablero, pero visto desde la
//  garantía en vez de desde la lista. Lee de `garantia_precio`, la misma
//  tabla: nunca van a decir cosas distintas.
// =====================================================================
export async function leerPreciosDe(garantiaId: string): Promise<PrecioBandeja[]> {
  const { data, error } = await supabase
    .from("garantia_precio")
    .select(CAMPOS)
    .eq("garantia_id", garantiaId)
    .order("version", { ascending: false });
  if (error) throw new Error("No se pudo leer el historial: " + error.message);
  return (data ?? []) as unknown as PrecioBandeja[];
}

/** El precio que está vivo ahora: el autorizado si lo hay, y si no, el
 *  que sigue esperando firmas. Los rechazados son historia. */
export function precioVigente(lista: PrecioBandeja[]): PrecioBandeja | null {
  return (
    lista.find((p) => p.estado === "autorizado") ??
    lista.find((p) => p.estado !== "rechazado") ??
    null
  );
}

/** Cómo terminó cada versión, en una línea. */
export function comoTermino(p: PrecioBandeja): string {
  if (p.estado === "autorizado") return "Autorizado";
  if (p.estado !== "rechazado") return aQuienLeToca(p);
  const quien =
    p.voto_dge === "rechazado" ? "la DGE" :
    p.voto_contabilidad === "rechazado" && p.voto_comercial === "rechazado" ? "Contabilidad y Comercial" :
    p.voto_contabilidad === "rechazado" ? "Contabilidad" : "Comercial";
  const motivo = p.voto_dge_motivo ?? p.voto_contabilidad_motivo ?? p.voto_comercial_motivo;
  return "Rechazado por " + quien + (motivo ? " · " + MOTIVOS[motivo] : "");
}
