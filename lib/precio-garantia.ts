// =====================================================================
//  PRECIO DE LA GARANTÍA · la fórmula, en un solo lugar
//  →  src/lib/precio-garantia.ts
//
//  Este archivo NO pinta nada ni habla con la base. Solo calcula. Lo usan
//  los tres momentos del proceso, para que los tres den el mismo número:
//
//    1. La DGE sube la cartera y pone el precio piso
//       → aparece el APROXIMADO, con y sin habilitación.
//    2. Antes de mandar a pre-dictaminar se completan medidas, foto,
//       avalúo y mapa → el aproximado se recalcula con los metros reales.
//    3. Vuelve APTA del dictamen → GAD, DGE o RAC calculan el precio de
//       verdad y deciden si lo dejan, lo suben o lo bajan.
//
//  LA FÓRMULA (regla de la DGE, agosto 2026):
//
//      base            = precio piso + adeudos
//      honorarios      = base × % de la contingencia
//      PRECIO DE VENTA = base + honorarios
//
//  DESCUENTO: se captura EN PESOS —es lo que la gente tiene en la cabeza—
//  y la pantalla lo enseña convertido a porcentaje. Se resta al final.
//
//  Lo que NO entra al precio de venta:
//    · la HABILITACIÓN — es un servicio aparte que el cliente pide a
//      mitad del proceso y paga en ese momento. Se calcula aquí solo
//      para poder enseñar "con y sin", pero se suma por separado.
//    · los gastos jurídicos — los absorbe DIIPA dentro de sus honorarios.
//
//  Se retira la fórmula vieja de SIGA, que aplicaba honorarios variables
//  de 60% a 18% por etapa procesal y le sumaba gastos jurídicos y
//  remodelación al subtotal.
// =====================================================================
import { esquemaEnCache } from "./esquemas-pago-cache";

// ── Las tres contingencias ───────────────────────────────────────────
// Son las MISMAS tres del devengamiento de honorarios. A mayor
// contingencia, mayor porcentaje: hay más trabajo y más riesgo.
export type Contingencia = "derecho_credito" | "remate_sentencia" | "adjudicacion";

export const CONTINGENCIAS: { clave: Contingencia; nombre: string; pct: number; ayuda: string }[] = [
  {
    clave: "derecho_credito",
    nombre: "Derecho de crédito",
    pct: 45,
    ayuda: "Juicio temprano, con contingencias por delante. Es el estándar esperado.",
  },
  {
    clave: "remate_sentencia",
    nombre: "Remate a sentencia firme",
    pct: 35,
    ayuda: "Ya hay sentencia firme a favor. Menos riesgo, menos honorarios.",
  },
  {
    clave: "adjudicacion",
    nombre: "Adjudicación firme",
    pct: 22,
    ayuda: "El activo ya está resuelto. Es el mínimo.",
  },
];

export function pctDeContingencia(c: Contingencia | null | undefined): number {
  return CONTINGENCIAS.find((x) => x.clave === c)?.pct ?? 45;
}

export function nombreContingencia(c: Contingencia | null | undefined): string {
  return CONTINGENCIAS.find((x) => x.clave === c)?.nombre ?? "Sin definir";
}

// ── Cómo se llama el precio piso, en TODOS lados ─────────────────────
// La etiqueta vive aquí y no escrita a mano en cada pantalla, para que
// diga lo mismo en las cuatro donde aparece. Es la aclaración que pidió
// la DGE: el piso NO es lo que cuesta la garantía, es el número del que
// se parte para calcular en cuánto se vende.
export const ETIQUETA_PISO = "Precio piso · para calcular";
export const NOTA_PISO = "Es para CALCULAR el precio de venta, no es el precio de compra.";

// ── Los costos operativos ────────────────────────────────────────────
// Cuatro precargados. Tres son adeudos que traía el inmueble y el cuarto
// es gasto nuestro del proceso, pero los cuatro entran igual a la base
// del precio, así que viven en una sola lista. Al calcular se pueden
// cambiar los montos, quitar los que no apliquen o agregar otros
// (cofinanciamiento, cuotas de condominio). Por eso se guardan por
// garantía y no como constante.
export type Adeudo = {
  concepto: string;
  monto: number;
  /** Para qué es. Texto libre, opcional: lo que se quiera dejar
   *  explicado de ese costo para quien lea el cálculo después. */
  nota?: string;
};

export const ADEUDOS_FIJOS: Adeudo[] = [
  { concepto: "Predial", monto: 15000 },
  { concepto: "Agua", monto: 10000 },
  { concepto: "Luz", monto: 10000 },
  { concepto: "Pago de juicio", monto: 45000 },
];

/** Los adeudos guardados o, si la garantía todavía no tiene, los tres fijos. */
export function adeudosOFijos(guardados: unknown): Adeudo[] {
  if (!Array.isArray(guardados) || guardados.length === 0) {
    return ADEUDOS_FIJOS.map((a) => ({ ...a }));
  }
  return (guardados as Record<string, unknown>[]).map((a) => ({
    concepto: String(a.concepto ?? ""),
    monto: Number(a.monto) || 0,
    nota: a.nota ? String(a.nota) : undefined,
  }));
}

/** Le agrega el PAGO DE JUICIO a una lista que no lo traiga.
 *
 *  Hace falta porque `adeudosOFijos` solo usa los precargados cuando la
 *  garantía no tiene nada guardado, y las que se capturaron antes de que
 *  existiera este concepto se quedaron con tres renglones.
 *
 *  Se usa SOLO en garantías a las que todavía no se les ha calculado el
 *  precio. En las ya calculadas se respeta al pie de la letra lo que se
 *  guardó: si alguien lo quitó a propósito, no debe reaparecer solo. */
export function conPagoDeJuicio(lista: Adeudo[]): Adeudo[] {
  const yaEsta = lista.some((a) => a.concepto.toLowerCase().includes("juicio"));
  if (yaEsta) return lista;
  const fijo = ADEUDOS_FIJOS.find((a) => a.concepto === "Pago de juicio");
  return fijo ? [...lista, { ...fijo }] : lista;
}

export function sumaAdeudos(lista: Adeudo[]): number {
  return lista.reduce((t, a) => t + (Number(a.monto) || 0), 0);
}

// ── Habilitación ─────────────────────────────────────────────────────
// El monto NO se cotiza a mano: sale del catálogo por metros cuadrados de
// construcción. Sobre ese monto va el 45%, que YA TRAE EL IVA INCLUIDO —
// no se le suma impuesto aparte.
//
// Cubre pintura, impermeabilización, puertas de entrada y salida, y dejar
// el inmueble habitable. No cubre vicios ocultos.
//
// Fuera de 45 a 200 m² va a cotización manual: aquí regresa null y la
// pantalla debe pedir el monto en lugar de inventarlo.
//
// LOS TRAMOS SE LEEN POR EL TOPE, no por "desde-hasta". Antes decían
// 45-60, 61-120 y 121-200, y como los metros vienen con decimales
// —53.51, 59.45— una casa de 60.5 m² no caía en ningún tramo y se iba a
// cotización manual sin razón. Ahora se busca el PRIMER tramo cuyo tope
// alcance los metros, así no quedan huecos y ningún monto se repite.
//
// OJO: la otra tabla, la del "seguro de remodelación" de SIGA (tramos de
// 55-90, 91-180 y 181-250, con 10% o 15% extra según acabado), QUEDA
// RETIRADA. Nunca se concilió con ésta y en 120 m² daban distinto.
export const M2_MINIMO_HABILITACION = 45;

export const CATALOGO_HABILITACION: { hasta: number; monto: number }[] = [
  { hasta: 60, monto: 60000 },
  { hasta: 120, monto: 85000 },
  { hasta: 200, monto: 130000 },
];

export const MARGEN_HABILITACION = 0.45; // ya incluye IVA

export type Habilitacion = {
  m2: number;
  montoCatalogo: number | null;   // null = fuera de rango, cotización manual
  precioAlCliente: number | null; // catálogo × 1.45
  cotizacionManual: boolean;
  sinMedidas: boolean;
};

export function calcularHabilitacion(m2Construccion: number | null | undefined): Habilitacion {
  const m2 = Number(m2Construccion) || 0;
  if (!m2) {
    return { m2: 0, montoCatalogo: null, precioAlCliente: null, cotizacionManual: false, sinMedidas: true };
  }
  // Abajo del mínimo no hay tramo: es obra chica y se cotiza a mano.
  const tramo = m2 >= M2_MINIMO_HABILITACION
    ? CATALOGO_HABILITACION.find((t) => m2 <= t.hasta)
    : undefined;
  if (!tramo) {
    return { m2, montoCatalogo: null, precioAlCliente: null, cotizacionManual: true, sinMedidas: false };
  }
  return {
    m2,
    montoCatalogo: tramo.monto,
    precioAlCliente: Math.round(tramo.monto * (1 + MARGEN_HABILITACION)),
    cotizacionManual: false,
    sinMedidas: false,
  };
}

// ── El cálculo ───────────────────────────────────────────────────────
export type EntradaPrecio = {
  precioPiso: number | null;
  adeudos: Adeudo[];
  contingencia: Contingencia | null;
  m2Construccion: number | null;
  /** Para el aviso contra valor: el avalúo o, si no hay, el comercial. */
  valorReferencia?: number | null;
  /** Descuento EN PESOS. Se resta al final; la pantalla lo enseña en %. */
  descuento?: number | null;
};

/** Lo que el cliente gana comprando con DIIPA: la diferencia entre lo que
 *  vale el inmueble y lo que paga. Se calcula dos veces, con y sin
 *  habilitación, porque con habilitación paga más pero recibe la casa
 *  habitable. El porcentaje es sobre lo que paga, no sobre el valor. */
export type Ganancia = {
  paga: number;
  gana: number;
  pct: number | null;
};

export type ResultadoPrecio = {
  precioPiso: number;
  totalAdeudos: number;
  base: number;
  honorariosPct: number;
  honorarios: number;
  /** El precio de venta SIN habilitación. Es el que va al catálogo. */
  precioVenta: number;
  habilitacion: Habilitacion;
  /** Solo para enseñar "con habilitación". NO es el precio de catálogo. */
  precioConHabilitacion: number | null;
  /** Descuento aplicado, en pesos y en porcentaje del precio antes de él. */
  descuento: number;
  descuentoPct: number | null;
  precioAntesDescuento: number;
  /** Lo que gana el cliente, sin y con habilitación. */
  ganaSinHabilitacion: Ganancia | null;
  ganaConHabilitacion: Ganancia | null;
  /** % que representa el precio contra el avalúo o valor comercial. */
  pctSobreValor: number | null;
  /** true cuando el precio se pasa del valor de referencia. */
  arribaDelValor: boolean;
  /** Sin precio piso no hay nada que calcular. */
  incompleto: boolean;
};

export function calcularPrecio(e: EntradaPrecio): ResultadoPrecio {
  const precioPiso = Number(e.precioPiso) || 0;
  const totalAdeudos = sumaAdeudos(e.adeudos || []);
  const base = precioPiso + totalAdeudos;
  const honorariosPct = pctDeContingencia(e.contingencia);
  const honorarios = base * (honorariosPct / 100);
  const precioAntesDescuento = Math.round(base + honorarios);

  const descuento = Math.max(0, Number(e.descuento) || 0);
  const precioVenta = Math.max(0, precioAntesDescuento - descuento);
  const descuentoPct = precioAntesDescuento > 0 && descuento > 0
    ? Math.round((descuento / precioAntesDescuento) * 1000) / 10
    : null;

  const habilitacion = calcularHabilitacion(e.m2Construccion);
  const precioConHabilitacion = habilitacion.precioAlCliente != null
    ? precioVenta + habilitacion.precioAlCliente
    : null;

  const valor = Number(e.valorReferencia) || 0;
  const pctSobreValor = valor > 0 ? Math.round((precioVenta / valor) * 100) : null;

  // Lo que gana el cliente. Sin valor de referencia no se puede decir nada,
  // y se regresa null en vez de inventar un número.
  const ganancia = (paga: number): Ganancia | null => {
    if (valor <= 0 || paga <= 0) return null;
    const gana = valor - paga;
    return { paga, gana, pct: Math.round((gana / paga) * 1000) / 10 };
  };

  return {
    precioPiso,
    totalAdeudos,
    base,
    honorariosPct,
    honorarios: Math.round(honorarios),
    precioAntesDescuento,
    descuento,
    descuentoPct,
    precioVenta,
    habilitacion,
    precioConHabilitacion,
    ganaSinHabilitacion: ganancia(precioVenta),
    ganaConHabilitacion: precioConHabilitacion != null ? ganancia(precioConHabilitacion) : null,
    pctSobreValor,
    arribaDelValor: valor > 0 && precioVenta > valor,
    incompleto: precioPiso <= 0,
  };
}

// =====================================================================
//  LAS DOS RUTAS
//
//  RUTA DEL PISO (la normal):
//      precio de lista + costos operativos, y encima 45%, 35% o 22% de
//      honorarios según la contingencia. Se construye HACIA ARRIBA. De
//      aquí sale el primer pago.
//
//  RUTA DEL AVALÚO (cuando no hay precio piso o está muy bajo):
//      avalúo comercial MENOS 22%, 35% o 40% según la contingencia. Es
//      cuánto vale esa casa con el litigio encima. Se construye HACIA
//      ABAJO.
//
//  Las dos se calculan SIEMPRE y se guardan las dos. Manda la del piso,
//  salvo que no haya piso o que quede muy por debajo — y esa decisión la
//  toma una persona, no el sistema: se le propone y ella escoge.
// =====================================================================

// El descuento que se le hace al avalúo según el litigio. OJO: no son los
// mismos números que los honorarios, aunque dos se parezcan.
export const DESCUENTO_AVALUO: Record<Contingencia, number> = {
  derecho_credito: 40,    // demanda
  remate_sentencia: 35,   // sentencia
  adjudicacion: 22,       // adjudicación
};

// "proyecto" es la tercera puerta: las unidades de una plaza o
// desarrollo propio no se cotizan con esta fórmula — su precio lo saca
// la base multiplicando los metros por el precio por m² autorizado de
// la cartera. Aquí sólo se nombra para poder reconocerla en pantalla.
export type RutaPrecio = "piso" | "avaluo" | "proyecto";

export type ComparaRutas = {
  porPiso: number | null;
  porAvaluo: number | null;
  descuentoAvaluoPct: number;
  /** Cuánto se separan una de otra, en % sobre la del piso. */
  brechaPct: number | null;
  /** Qué ruta conviene, para proponerla. */
  sugerida: RutaPrecio;
  /** Aviso en palabras. Es lo que hoy se ve a mano. */
  semaforo: "sano" | "piso_barato" | "sin_negocio" | "sin_datos";
  mensaje: string;
};

export function compararRutas(
  precioPorPiso: number | null,
  avaluo: number | null,
  contingencia: Contingencia | null,
): ComparaRutas {
  const pct = DESCUENTO_AVALUO[contingencia || "derecho_credito"];
  const porAvaluo = avaluo && avaluo > 0 ? Math.round(avaluo * (1 - pct / 100)) : null;
  const porPiso = precioPorPiso && precioPorPiso > 0 ? precioPorPiso : null;

  if (!porPiso && !porAvaluo) {
    return { porPiso, porAvaluo, descuentoAvaluoPct: pct, brechaPct: null,
      sugerida: "piso", semaforo: "sin_datos",
      mensaje: "Falta el precio piso y el avalúo: no se puede cotizar." };
  }
  if (!porPiso) {
    return { porPiso, porAvaluo, descuentoAvaluoPct: pct, brechaPct: null,
      sugerida: "avaluo", semaforo: "sin_datos",
      mensaje: "Sin precio piso. Se cotiza sobre el avalúo, con " + pct + "% de descuento por la contingencia." };
  }
  if (!porAvaluo) {
    return { porPiso, porAvaluo, descuentoAvaluoPct: pct, brechaPct: null,
      sugerida: "piso", semaforo: "sin_datos",
      mensaje: "Sin avalúo no hay con qué comparar. Se cotiza sobre el precio piso." };
  }

  const brechaPct = Math.round(((porAvaluo - porPiso) / porPiso) * 1000) / 10;

  // Si la ruta del avalúo queda MUY por debajo de la del piso, el activo
  // no da negocio a ese precio: se estaría pidiendo más de lo que la casa
  // vale con su litigio encima.
  if (brechaPct <= -10) {
    return { porPiso, porAvaluo, descuentoAvaluoPct: pct, brechaPct,
      sugerida: "avaluo", semaforo: "sin_negocio",
      mensaje: "El precio por avalúo queda " + Math.abs(brechaPct) +
        "% abajo del que sale del piso. A ese precio el activo no deja negocio: hay que renegociar la compra o vender más barato." };
  }
  // Si el avalúo queda muy por arriba, el piso está barato: hay margen.
  if (brechaPct >= 10) {
    return { porPiso, porAvaluo, descuentoAvaluoPct: pct, brechaPct,
      sugerida: "avaluo", semaforo: "piso_barato",
      mensaje: "El precio piso está barato: por avalúo la casa aguanta " + brechaPct +
        "% más. Hay margen para subir el precio de venta." };
  }
  return { porPiso, porAvaluo, descuentoAvaluoPct: pct, brechaPct,
    sugerida: "piso", semaforo: "sano",
    mensaje: "Las dos rutas dan casi lo mismo (" + brechaPct + "%). El precio está sano." };
}

// =====================================================================
//  ESQUEMA DE PAGOS
//  Arranca en CUATRO —las etapas del proceso, según la contingencia— y
//  se pueden agregar más. El
//  concepto de cada uno se escribe a mano, para que en el contrato diga
//  para qué es ese pago y no solo un porcentaje suelto.
//
//  EL ÚLTIMO PAGO NO SE CAPTURA: es lo que falte para llegar a 100. Así
//  la base siempre cierra sola, sin que nadie tenga que sacar la cuenta,
//  y si mañana se agrega un pago más, el último se reacomoda solo.
//
//  El APARTADO va aparte del 100 y se descuenta EN PESOS del último
//  pago. El orden importa: primero se saca el remanente sobre el 100 y
//  hasta después se resta el apartado, para no ensuciar el porcentaje.
// =====================================================================
export type Pago = {
  concepto: string;
  pct: number;
  /** Para qué es ese pago. Texto libre, opcional. */
  nota?: string;
};

// ── El reparto por omisión, según la CONTINGENCIA ────────────────────
// Son las cuatro etapas del modelo, y el reparto cambia con la
// contingencia igual que ya cambiaban los honorarios: entre más avanzado
// el asunto, menos pesa la dictaminación y más pesa la compra.
//
//   Derecho de crédito   35 · 50 · 5 · 10
//   Remate a sentencia   25 · 60 · 5 · 10
//   Adjudicación firme   22 · 63 · 5 · 10
//
// El EXHORTO DE DESALOJO es renglón propio: antes iba escondido dentro
// de la Fase B y por eso no se le pedía al cliente en su momento.
//
// ESTO ES SÓLO EL RESPALDO. Los porcentajes buenos viven en la tabla
// `esquema_pago_contingencia` de la base, para que la DGE los cambie sin
// publicar. Aquí quedan por si la lectura falla, para que nunca se
// quede sin reparto.
export const PAGOS_POR_CONTINGENCIA: Record<Contingencia, Pago[]> = {
  derecho_credito: [
    { concepto: "Fase A · estudio y dictaminación", pct: 35 },
    { concepto: "Fase B · compra de la cesión", pct: 50 },
    { concepto: "Exhorto de desalojo", pct: 5 },
    { concepto: "Entrega", pct: 10 },
  ],
  remate_sentencia: [
    { concepto: "Fase A · estudio y dictaminación", pct: 25 },
    { concepto: "Fase B · compra de la cesión", pct: 60 },
    { concepto: "Exhorto de desalojo", pct: 5 },
    { concepto: "Entrega", pct: 10 },
  ],
  adjudicacion: [
    { concepto: "Fase A · estudio y dictaminación", pct: 22 },
    { concepto: "Fase B · compra de la cesión", pct: 63 },
    { concepto: "Exhorto de desalojo", pct: 5 },
    { concepto: "Entrega", pct: 10 },
  ],
};

/** El reparto con el que arranca una garantía de esa contingencia.
 *
 *  Primero busca lo que se leyó de la base; si no hay nada cargado, usa
 *  el respaldo de arriba. Sin contingencia escogida se toma la de
 *  derecho de crédito, que es el estándar esperado. */
export function pagosPorOmision(c: Contingencia | null | undefined): Pago[] {
  const clave: Contingencia = c ?? "derecho_credito";
  const deLaBase = esquemaEnCache(clave);
  if (deLaBase) {
    return deLaBase.map((f) => ({ concepto: f.concepto, pct: f.pct }));
  }
  return PAGOS_POR_CONTINGENCIA[clave].map((p) => ({ ...p }));
}

/** Los pagos ya pactados de la garantía o, si no tiene, los de su
 *  contingencia. Lo guardado SIEMPRE gana: si alguien ya acordó un
 *  reparto con el cliente, no se le pisa aunque cambie la contingencia. */
export function pagosOPorOmision(guardados: unknown, contingencia?: Contingencia | null): Pago[] {
  if (!Array.isArray(guardados) || guardados.length === 0) {
    return pagosPorOmision(contingencia ?? null);
  }
  return (guardados as Record<string, unknown>[]).map((p) => ({
    concepto: String(p.concepto ?? ""),
    pct: Number(p.pct) || 0,
    nota: p.nota ? String(p.nota) : undefined,
  }));
}

// OJO: `avisoApartado` es texto que pone el sistema, no la `nota` que
// escribe la persona. Son dos cosas distintas y no deben mezclarse: la
// nota se guarda en la base, el aviso solo se pinta.
export type PagoCalculado = Pago & {
  monto: number;
  avisoApartado?: string;
  esRemanente?: boolean;
};

/** Reparte el precio entre los pagos.
 *
 *  El ÚLTIMO renglón no usa el porcentaje que traiga capturado: se le
 *  calcula como 100 menos lo que sumen los anteriores. Por eso `filas`
 *  regresa el pct ya corregido y la pantalla lo debe pintar de ahí, no
 *  del que tiene guardado.
 *
 *  Si los pagos anteriores ya se pasaron de 100, el remanente sale
 *  negativo: ahí `sePaso` queda en true y no se debe dejar guardar. */
export function repartirPagos(precio: number, pagos: Pago[], apartado: number): {
  filas: PagoCalculado[];
  sumaPct: number;
  cuadra: boolean;
  remanentePct: number;
  sePaso: boolean;
} {
  const ultimoIdx = pagos.length - 1;
  const pctAnteriores = pagos
    .slice(0, Math.max(0, ultimoIdx))
    .reduce((t, p) => t + (Number(p.pct) || 0), 0);
  const remanentePct = Math.round((100 - pctAnteriores) * 10) / 10;
  const sePaso = remanentePct < 0;

  const filas: PagoCalculado[] = pagos.map((p, i) => {
    const ultimo = i === ultimoIdx;
    const pct = ultimo ? Math.max(0, remanentePct) : Number(p.pct) || 0;
    const monto = Math.round(precio * (pct / 100));
    return ultimo
      ? {
          ...p, pct, esRemanente: true,
          monto: apartado > 0 ? Math.max(0, monto - apartado) : monto,
          avisoApartado: apartado > 0 ? "menos " + money(apartado) + " de apartado" : undefined,
        }
      : { ...p, pct, monto };
  });

  const sumaPct = Math.round(filas.reduce((t, f) => t + f.pct, 0) * 10) / 10;
  return { filas, sumaPct, cuadra: !sePaso, remanentePct, sePaso };
}

// =====================================================================
//  ESTIMADO DE CIERRE · sólo para decirle al cliente
//
//  No entra al precio y no se guarda: es un número para que el asesor
//  pueda contestar cuando el cliente pregunta cuánto le va a costar la
//  cesión o la escritura. Va ENCIMA del 100 de la operación.
//
//    3%  el cliente escritura con su propio notario. Solo la cesión.
//    5%  cesión y escritura con la notaría que gestiona DIIPA. Es el
//        precio de lista.
//
//  El 4% NO aparece aquí a propósito: no es opción de catálogo, es
//  margen de negociación por monto alto, sólo si el cliente lo pide, y
//  lo autoriza la DGE caso por caso. Ponerlo en pantalla lo volvería
//  precio de lista y se acabaría dando siempre.
// =====================================================================
export const CIERRE_SOLO_CESION = 3;
export const CIERRE_CON_ESCRITURA = 5;

export type EstimadoCierre = {
  soloCesionPct: number;
  soloCesion: number;
  conEscrituraPct: number;
  conEscritura: number;
};

export function estimadoCierre(precioVenta: number | null | undefined): EstimadoCierre | null {
  const p = Number(precioVenta) || 0;
  if (p <= 0) return null;
  return {
    soloCesionPct: CIERRE_SOLO_CESION,
    soloCesion: Math.round(p * (CIERRE_SOLO_CESION / 100)),
    conEscrituraPct: CIERRE_CON_ESCRITURA,
    conEscritura: Math.round(p * (CIERRE_CON_ESCRITURA / 100)),
  };
}

// =====================================================================
//  RESUMEN SOBRE UN PRECIO YA DECIDIDO
//
//  Para qué: la ficha NO debe recalcular el precio. El precio ya se
//  decidió y se guardó. Lo que la ficha necesita es lo que CUELGA de ese
//  número: cuánto costaría con habilitación y cuánto gana el cliente.
//
//  Esto arregla un error que se veía en pantalla: la ficha calculaba la
//  habilitación sobre el precio de la RUTA DEL PISO aunque la garantía se
//  hubiera cotizado por AVALÚO, así que el "con habilitación" salía MENOR
//  que el precio de venta. Con esta función siempre se suma sobre el
//  precio que de verdad se está vendiendo.
// =====================================================================
export type ResumenSobrePrecio = {
  precio: number;
  habilitacion: Habilitacion;
  /** El precio de venta MÁS la habilitación. Siempre mayor al precio. */
  precioConHabilitacion: number | null;
  /** Cuánto le suma la habilitación, en pesos y en % del precio. */
  incrementoHabilitacion: number | null;
  incrementoHabilitacionPct: number | null;
  ganaSinHabilitacion: Ganancia | null;
  ganaConHabilitacion: Ganancia | null;
};

export function resumenSobrePrecio(
  precioFinal: number | null | undefined,
  m2Construccion: number | null | undefined,
  valorReferencia: number | null | undefined,
): ResumenSobrePrecio {
  const precio = Number(precioFinal) || 0;
  const habilitacion = calcularHabilitacion(m2Construccion);
  const extra = habilitacion.precioAlCliente;

  const precioConHabilitacion = extra != null && precio > 0 ? precio + extra : null;
  const incrementoHabilitacionPct = extra != null && precio > 0
    ? Math.round((extra / precio) * 1000) / 10
    : null;

  const valor = Number(valorReferencia) || 0;
  const ganancia = (paga: number): Ganancia | null => {
    if (valor <= 0 || paga <= 0) return null;
    const gana = valor - paga;
    return { paga, gana, pct: Math.round((gana / paga) * 1000) / 10 };
  };

  return {
    precio,
    habilitacion,
    precioConHabilitacion,
    incrementoHabilitacion: extra,
    incrementoHabilitacionPct,
    ganaSinHabilitacion: ganancia(precio),
    ganaConHabilitacion: precioConHabilitacion != null ? ganancia(precioConHabilitacion) : null,
  };
}

// ── Estado del precio ────────────────────────────────────────────────
// Para que en el catálogo se vea el avance. Un precio calculado por GAD o
// RAC queda PROPUESTO hasta que la DGE lo aprueba; si lo captura la propia
// DGE, nace aprobado. Solo un precio aprobado se puede publicar.
export type EstadoPrecio = "propuesto" | "aprobado";

/** Estado de la columna plana `precio_estado` de la garantía.
 *
 *  Desde el 8 de septiembre de 2026 SIEMPRE queda en "propuesto", sin
 *  importar quién guarde. Un precio ya no se aprueba por el hecho de que
 *  lo escriba la DGE: se aprueba con las TRES firmas —Contabilidad,
 *  Comercial y DGE— en la bandeja de validaciones. Antes, si guardaba la
 *  DGE, salía "aprobado" de una vez y se saltaba la validación completa. */
export function estadoAlGuardar(_rol: string | null | undefined): EstadoPrecio {
  return "propuesto";
}

/** Cómo se le llama al precio en pantalla.
 *
 *  El número se muestra desde que se calcula, para que Comercial pueda
 *  ir trabajando con él, pero mientras no tenga las tres firmas se dice
 *  claramente que va EN APROBACIÓN. Así nadie lo cotiza como firme. */
export function etiquetaEstadoPrecio(e: string | null | undefined): string {
  if (e === "aprobado") return "Precio aprobado";
  if (e === "propuesto") return "Precio en aprobación";
  return "Sin precio";
}

// ── Quién puede poner el precio ──────────────────────────────────────
// Regla de la DGE del 7 de septiembre de 2026: calcular el precio queda
// en tres — el DIRECTOR COMERCIAL (DGC), el GAD y la DGE. Es el
// comercial quien tiene en la cabeza los datos de venta de la zona, así
// que es quien debe poner el número.
//
// SALE EL RAC de esta parte, y sigue sin entrar el asesor comercial.
// La gerente de contingencias tampoco calcula: ella opina sobre la
// contingencia y su opinión queda asentada en la validación.
export const ROLES_CALCULAN_PRECIO = ["Super_Admin", "DGE", "GAD", "DGC", "GRC"];

// ── Quién ve el precio piso y quién puede cotizar sobre él ───────────
// El precio piso es el costo del que arranca la ruta normal. Lo VEN la
// DGE, el GAD, el RAC y el director comercial. La gerente de remates y
// contingencias (GRC) NO lo ve: ella cotiza ÚNICAMENTE por la ruta del
// avalúo, que no depende del piso ni lo deja adivinar.
//
// Capturarlo es aparte y más restringido: solo DGE y RAC, en
// ROLES_EDITAN_BASE.
export const ROLES_VEN_PISO = ["Super_Admin", "DGE", "GAD", "RAC", "DGC"];

export function puedeVerPrecioPiso(rol: string | null | undefined): boolean {
  return ROLES_VEN_PISO.includes(rol || "");
}

/** Si este rol puede cotizar por la ruta del piso. Quien no puede,
 *  cotiza solo por avalúo y ni siquiera ve esa opción en pantalla. */
export function puedeUsarRutaPiso(rol: string | null | undefined): boolean {
  return puedeCalcularPrecio(rol) && puedeVerPrecioPiso(rol);
}

export function puedeCalcularPrecio(rol: string | null | undefined): boolean {
  return ROLES_CALCULAN_PRECIO.includes(rol || "");
}

// Corregir la BASE del precio —precio piso, avalúo y valor comercial— es
// más delicado que calcular: cambia el número de origen del que sale todo.
// Solo DGE y RAC. Ni siquiera GAD.
export const ROLES_EDITAN_BASE = ["Super_Admin", "DGE", "RAC"];

export function puedeEditarBase(rol: string | null | undefined): boolean {
  return ROLES_EDITAN_BASE.includes(rol || "");
}

// ── Formato ──────────────────────────────────────────────────────────
export function money(n: number | null | undefined): string {
  if (n == null) return "—";
  return "$" + Math.round(n).toLocaleString("es-MX");
}
