// =====================================================================
//  MÓDULO COMERCIAL · Datos de carteras
//  →  src/data/carteras.ts
//
//  El único archivo que habla con las tablas `cartera`, `administradora`
//  y `garantia`. Ninguna pantalla le pega directo a la base.
// =====================================================================
import { supabase } from "../lib/supabase";

// ── Administradoras ──────────────────────────────────────────────────
export type Administradora = {
  codigo: string;
  nombre: string;
  tipo: "ADM" | "BANCO";
  activo: boolean;
};

export async function listarAdministradoras(): Promise<Administradora[]> {
  const { data, error } = await supabase
    .from("administradora")
    .select("codigo,nombre,tipo,activo")
    .eq("activo", true)
    .order("codigo");

  if (error) {
    console.warn("administradoras · no se pudo leer:", error.message);
    return [];
  }
  const filas = (data ?? []) as unknown as Record<string, unknown>[];
  return filas.map((f) => ({
    codigo: String(f.codigo),
    nombre: String(f.nombre || ""),
    tipo: (f.tipo as Administradora["tipo"]) || "ADM",
    activo: Boolean(f.activo),
  }));
}

// ── Carteras ─────────────────────────────────────────────────────────
export type Cartera = {
  id: string;
  // Código propio de la cartera, CAR-00X. Lo ve cualquiera: es lo que
  // se muestra a quien no tiene permiso de ver el nombre del fondo.
  codigo: string | null;
  nombre: string;
  // El ACTOR: el fondo o banco dueño de los créditos, escrito como
  // aparece en la demanda. Se captura UNA VEZ en el catálogo de
  // carteras y todas sus garantías lo heredan.
  actor: string | null;
  // Mes del corte con el que se cargó o actualizó. Dice de qué entrega
  // viene la información que se está viendo.
  corteMes: string | null;
  administradoraCodigo: string | null;
  tipoOrigen: string;
  estatus: string;
  // Contadores que se calculan con las garantías, no vienen de la base.
  total: number;
  dictaminadas: number;
};

export const TIPO_ORIGEN: { clave: string; nombre: string }[] = [
  { clave: "ADM", nombre: "Administradora (convenio)" },
  { clave: "PRO", nombre: "Activo propio" },
  { clave: "EXT", nombre: "Externa (compra de derechos)" },
];

export async function listarCarteras(): Promise<Cartera[]> {
  const { data, error } = await supabase
    .from("cartera")
    .select("id,codigo,nombre,actor,corte_mes,administradora_codigo,tipo_origen,estatus")
    .neq("estatus", "archivada")
    .order("nombre");

  if (error) {
    console.warn("carteras · no se pudo leer:", error.message);
    return [];
  }
  const filas = (data ?? []) as unknown as Record<string, unknown>[];
  const carteras: Cartera[] = filas.map((f) => ({
    id: String(f.id),
    nombre: String(f.nombre || ""),
    codigo: (f.codigo as string) ?? null,
    actor: (f.actor as string) ?? null,
    corteMes: (f.corte_mes as string) ?? null,
    administradoraCodigo: (f.administradora_codigo as string) ?? null,
    tipoOrigen: String(f.tipo_origen || "ADM"),
    estatus: String(f.estatus || "activa"),
    total: 0,
    dictaminadas: 0,
  }));

  // Una sola consulta para contar todas, en vez de una por cartera.
  const { data: g } = await supabase
    .from("garantia")
    .select("cartera_id,dictamen_resultado")
    .eq("archivada", false);

  const conteos = (g ?? []) as unknown as Record<string, unknown>[];
  for (const fila of conteos) {
    const c = carteras.find((x) => x.id === String(fila.cartera_id));
    if (!c) continue;
    c.total++;
    if (fila.dictamen_resultado) c.dictaminadas++;
  }
  return carteras;
}

export async function crearCartera(c: {
  nombre: string;
  administradoraCodigo: string | null;
  tipoOrigen: string;
  quien: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("cartera").insert({
    nombre: c.nombre.trim(),
    administradora_codigo: c.administradoraCodigo,
    tipo_origen: c.tipoOrigen,
    creado_por: c.quien,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function asignarAdministradora(
  carteraId: string,
  codigo: string | null,
): Promise<boolean> {
  const { error } = await supabase
    .from("cartera")
    .update({ administradora_codigo: codigo, actualizado_en: new Date().toISOString() })
    .eq("id", carteraId);
  if (error) console.warn("cartera · no se pudo asignar:", error.message);
  return !error;
}

// ── Garantías de una cartera ─────────────────────────────────────────
export type GarantiaCartera = {
  id: string;
  folio: string;
  numCredito: string | null;
  direccion: string;
  deudor: string | null;
  sucursal: string | null;
  estadoMx: string | null;
  etapaProcesal: string | null;
  adeudoInicial: number | null;
  avaluoComercial: number | null;
  precioPiso: number | null;
  contingencia: string | null;
  valorGarantia: number | null;
  adeudos: unknown;
  precioCalculado: number | null;
  m2Estimados: boolean;
  precioCompra: number | null;
  precioVenta: number | null;
  m2Terreno: number | null;
  m2Construccion: number | null;
  fotoFachada: string | null;
  mapsLink: string | null;
  lat: number | null;
  lng: number | null;
  etapa: string;
  jfPredictamenId: string | null;
  jfCasoId: string | null;
  dictamenResultado: string | null;
  bloqueada: boolean;
};

const COLS =
  "id,folio,num_credito,direccion,deudor,sucursal,estado_mx,etapa_procesal," +
  "adeudo_inicial,avaluo_comercial,precio_compra,precio_venta," +
  "m2_terreno,m2_construccion,foto_fachada,maps_link,lat,lng," +
  "precio_piso,contingencia,valor_garantia,adeudos,precio_calculado,m2_estimados," +
  "etapa,jf_predictamen_id,jf_caso_id,dictamen_resultado,bloqueada";

function aGarantia(f: Record<string, unknown>): GarantiaCartera {
  return {
    id: String(f.id),
    folio: String(f.folio || ""),
    numCredito: (f.num_credito as string) ?? null,
    direccion: String(f.direccion || ""),
    deudor: (f.deudor as string) ?? null,
    sucursal: (f.sucursal as string) ?? null,
    estadoMx: (f.estado_mx as string) ?? null,
    etapaProcesal: (f.etapa_procesal as string) ?? null,
    adeudoInicial: (f.adeudo_inicial as number) ?? null,
    avaluoComercial: (f.avaluo_comercial as number) ?? null,
    precioPiso: (f.precio_piso as number) ?? null,
    contingencia: (f.contingencia as string) ?? null,
    valorGarantia: (f.valor_garantia as number) ?? null,
    adeudos: (f.adeudos as unknown) ?? null,
    precioCalculado: (f.precio_calculado as number) ?? null,
    m2Estimados: Boolean(f.m2_estimados),
    precioCompra: (f.precio_compra as number) ?? null,
    precioVenta: (f.precio_venta as number) ?? null,
    m2Terreno: (f.m2_terreno as number) ?? null,
    m2Construccion: (f.m2_construccion as number) ?? null,
    fotoFachada: (f.foto_fachada as string) ?? null,
    mapsLink: (f.maps_link as string) ?? null,
    lat: (f.lat as number) ?? null,
    lng: (f.lng as number) ?? null,
    etapa: String(f.etapa || "en_cartera"),
    jfPredictamenId: (f.jf_predictamen_id as string) ?? null,
    jfCasoId: (f.jf_caso_id as string) ?? null,
    dictamenResultado: (f.dictamen_resultado as string) ?? null,
    bloqueada: Boolean(f.bloqueada),
  };
}

export async function garantiasDeCartera(carteraId: string): Promise<GarantiaCartera[]> {
  const { data, error } = await supabase
    .from("garantia")
    .select(COLS)
    .eq("cartera_id", carteraId)
    .eq("archivada", false)
    .order("folio", { ascending: false });

  if (error) {
    console.warn("garantias · no se pudo leer:", error.message);
    return [];
  }
  const filas = (data ?? []) as unknown as Record<string, unknown>[];
  return filas.map(aGarantia);
}

// ── Identidad y repetidas ────────────────────────────────────────────
// La dirección se normaliza igual siempre: mayúsculas, sin acentos, sin
// signos y sin espacios. Así "Av. Cempoala 214" y "AV CEMPOALA 214"
// se reconocen como la misma.
export function normalizarDireccion(dir: string): string {
  return (dir || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export type Repetida = {
  folio: string;
  direccion: string;
  cartera: string;
  /** "credito" bloquea el alta. "direccion" solo avisa. */
  motivo: "credito" | "direccion";
} | null;

// ── Buscar repetida ──────────────────────────────────────────────────
//  CORREGIDO EL 07-09-2026. Antes se buscaba por DIRECCIÓN y solo se
//  consideraba repetida si además coincidía el crédito. Estaba al revés:
//  la identidad de la garantía es el NÚMERO DE CRÉDITO, no el domicilio.
//  Con la regla vieja, el mismo crédito capturado con la dirección
//  escrita distinta —"Circuito San Alejandro 6085" y "Cto San Alejandro
//  6085"— entraba dos veces como si fueran garantías diferentes.
//
//  Ahora son dos revisiones distintas:
//    1. MISMO CRÉDITO  → es la misma garantía. Se BLOQUEA el alta.
//    2. MISMA DIRECCIÓN con otro crédito → solo AVISA. Puede ser
//       legítimo: dos créditos sobre un mismo domicilio, o un
//       departamento sin número interior. Que lo decida quien captura.
export async function buscarRepetida(direccion: string, numCredito: string): Promise<Repetida> {
  const credito = (numCredito || "").trim();

  // 1 · Por crédito. Este sí bloquea.
  if (credito) {
    const { data } = await supabase
      .from("garantia")
      .select("folio,direccion,cartera_id")
      .eq("num_credito", credito)
      .eq("archivada", false)
      .limit(1);
    const f = (data ?? [])[0] as Record<string, unknown> | undefined;
    if (f) {
      return {
        folio: String(f.folio),
        direccion: String(f.direccion),
        cartera: String(f.cartera_id),
        motivo: "credito",
      };
    }
  }

  // 2 · Por dirección. Este solo avisa.
  const norm = normalizarDireccion(direccion);
  if (!norm) return null;
  const { data } = await supabase
    .from("garantia")
    .select("folio,direccion,cartera_id")
    .eq("direccion_norm", norm)
    .eq("archivada", false)
    .limit(1);
  const f = (data ?? [])[0] as Record<string, unknown> | undefined;
  if (!f) return null;

  return {
    folio: String(f.folio),
    direccion: String(f.direccion),
    cartera: String(f.cartera_id),
    motivo: "direccion",
  };
}

// ── Folio automático ─────────────────────────────────────────────────
export async function siguienteFolio(): Promise<string> {
  const { data } = await supabase
    .from("garantia")
    .select("folio")
    .like("folio", "GAR-%")
    .order("folio", { ascending: false })
    .limit(1);

  const filas = (data ?? []) as unknown as Record<string, unknown>[];
  if (!filas.length) return "GAR-0001";
  const num = parseInt(String(filas[0].folio).split("-")[1] || "0", 10) || 0;
  return "GAR-" + String(num + 1).padStart(4, "0");
}

// ── Alta ─────────────────────────────────────────────────────────────
export type NuevaGarantia = {
  carteraId: string;
  numCredito: string;
  deudor: string;
  direccion: string;
  estadoMx: string;
  sucursal: string;
  codigoPostal: string;
  adeudoInicial: string;
  etapaProcesal: string;
  avaluoComercial: string;
  precioCompra: string;
  // ---- lo que se captura al subir la cartera para tener el aproximado ----
  // El precio piso es lo que pide la administradora. Con eso y la
  // contingencia ya sale un precio estimado, sin esperar al dictamen.
  precioPiso: string;
  contingencia: string;
  municipio: string;
  colonia: string;
  valorGarantia: string;   // valor comercial, cuando la cartera no trae avalúo
  m2Terreno: string;       // a veces la cartera los trae, a veces no
  m2Construccion: string;
};

export async function crearGarantia(
  g: NuevaGarantia,
  quien: string,
): Promise<{ ok: boolean; folio?: string; error?: string }> {
  const folio = await siguienteFolio();
  const num = (v: string) => (v.trim() ? parseFloat(v.replace(/[^0-9.]/g, "")) : null);

  const { error } = await supabase.from("garantia").insert({
    cartera_id: g.carteraId,
    folio,
    num_credito: g.numCredito.trim() || null,
    deudor: g.deudor.trim() || null,
    direccion: g.direccion.trim(),
    direccion_norm: normalizarDireccion(g.direccion),
    estado_mx: g.estadoMx.trim() || null,
    sucursal: g.sucursal || null,
    codigo_postal: g.codigoPostal.trim() || null,
    adeudo_inicial: num(g.adeudoInicial),
    etapa_procesal: g.etapaProcesal || null,
    avaluo_comercial: num(g.avaluoComercial),
    precio_compra: num(g.precioCompra),
    valor_garantia: num(g.valorGarantia),
    precio_piso: num(g.precioPiso),
    municipio: g.municipio.trim() || null,
    colonia: g.colonia.trim() || null,
    contingencia: g.contingencia || null,
    m2_terreno: num(g.m2Terreno),
    m2_construccion: num(g.m2Construccion),
    etapa: "en_cartera",
    creado_por: quien,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, folio };
}

// ── Formato de dinero ────────────────────────────────────────────────
export function money(n: number | null | undefined): string {
  if (n == null) return "—";
  return "$" + Math.round(n).toLocaleString("es-MX");
}
