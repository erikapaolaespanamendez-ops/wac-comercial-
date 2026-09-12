// =====================================================================
//  CAJÓN DEL REPARTO DE PAGOS  →  va en: src/lib/esquemas-pago-cache.ts
//
//  Guarda EN MEMORIA lo último que se leyó de la tabla
//  `esquema_pago_contingencia`, para que `precio-garantia.ts` lo pueda
//  consultar de forma SÍNCRONA mientras calcula, sin esperar a Supabase.
//
//  Este archivo NO importa nada, a propósito: ni Supabase ni
//  precio-garantia. Así no se arma un "import circular" —que es cuando
//  dos archivos se llaman entre sí y el paquete truena al compilar—.
//  Quien lo llena es `src/data/esquemas-pago.ts`.
// =====================================================================

export type FilaEsquema = { concepto: string; pct: number };

// contingencia → sus renglones, ya ordenados.
export type EsquemasEnCache = Record<string, FilaEsquema[]>;

let _cache: EsquemasEnCache | null = null;

/** Lo que se leyó de la base. null = todavía no se ha leído nada, y
 *  entonces manda el respaldo escrito en el código. */
export function getEsquemasCache(): EsquemasEnCache | null {
  return _cache;
}

/** Los renglones de UNA contingencia, o null si no hay nada cargado. */
export function esquemaEnCache(contingencia: string): FilaEsquema[] | null {
  if (!_cache) return null;
  const filas = _cache[contingencia];
  return filas && filas.length ? filas : null;
}

export function setEsquemasCache(c: EsquemasEnCache | null): void {
  _cache = c;
}
