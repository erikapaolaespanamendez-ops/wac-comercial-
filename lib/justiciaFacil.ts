// ============================================================
// JurisConecta · Lectura de lo Jurídico desde JusticiaFácil
// ------------------------------------------------------------
// JusticiaFácil es el sistema donde vive el proceso jurídico
// (URRJ, UCP, UCM, UDP, UFC: dictámenes, garantías, expedientes).
// JurisConecta SOLO LEE de aquí para mostrarlo dentro de la ficha
// del cliente. NO escribe nada en JusticiaFácil. Es solo lectura
// (llave publishable/anon).
// ============================================================

const JF_URL = "https://dquoysougxqknvgooiqg.supabase.co";
const JF_KEY = "sb_publishable__rEHm2hdrMkQfaBrRqqtOw_akusY-Em";
const jfHeaders = { apikey: JF_KEY, Authorization: `Bearer ${JF_KEY}` };

// Una garantía/caso tal como lo guarda JusticiaFácil (solo lo que nos importa aquí).
export interface GarantiaJF {
  id: string;
  nombre: string | null;
  estado: string | null;
  folio: string | null;
  total: number | null;
  saldo: number | null;
  formalizacion_solicitada: boolean | null;
  observaciones: string | null;
  jc_cliente_id: string | number | null;
  caso_juridico: {
    id: string;
    expediente: string | null;
    unidad: string | null;
    entidad: string | null;
    etapa_actual: string | null;
    estatus_general: string | null;
    prioridad: string | null;
    juzgado: string | null;
    no_credito: string | null;
    archivado: boolean | null;
    // 👇 Candado de edición de la DGE (ver clientes.bloqueado en JurisConecta).
    // Cuando es true, el caso fue revisado contra los documentos originales
    // y queda de solo lectura: se puede AGREGAR, no editar ni borrar.
    bloqueado: boolean | null;
    bloqueado_por: string | null;
    bloqueado_en: string | null;
  } | null;
}

const SELECT =
  "id,nombre,estado,folio,total,saldo,formalizacion_solicitada,observaciones,jc_cliente_id," +
  "caso_juridico(id,expediente,unidad,entidad,etapa_actual,estatus_general,prioridad,juzgado,no_credito,archivado,bloqueado,bloqueado_por,bloqueado_en)";

const norm = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

export interface DocumentoFijoJF {
  drive_id: string;
  nombre: string | null;
  mime: string | null;
}

export interface MovimientoJF {
  id: string;
  tipo: string | null;
  nota: string | null;
  fecha_mov: string | null;
  drive_copia: { nombre: string | null } | null;
}

// Movimientos/actuaciones (con su nota completa y el documento fijo relacionado,
// si lo tiene) registrados en JusticiaFácil para un caso.
export async function movimientosJF(casoId: string): Promise<MovimientoJF[]> {
  try {
    const r = await fetch(
      `${JF_URL}/rest/v1/documento_garantia?select=id,tipo,nota,fecha_mov,drive_copia_id&caso_id=eq.${encodeURIComponent(casoId)}&en_papelera=eq.false&order=fecha_mov.desc.nullslast`,
      { headers: jfHeaders }
    );
    if (!r.ok) return [];
    const filas: (MovimientoJF & { drive_copia_id?: string | null })[] = await r.json();
    if (!filas.length) return filas;

    // Trae los nombres de los documentos fijos relacionados aparte (sin depender
    // de que la API tenga cacheada la relación entre tablas — más robusto).
    const ids = Array.from(new Set(filas.map((f) => f.drive_copia_id).filter(Boolean)));
    let nombres: Record<string, string | null> = {};
    if (ids.length) {
      const rn = await fetch(`${JF_URL}/rest/v1/drive_copia?select=id,nombre&id=in.(${ids.join(",")})`, { headers: jfHeaders });
      if (rn.ok) {
        const filasNombre: { id: string; nombre: string | null }[] = await rn.json();
        for (const n of filasNombre) nombres[n.id] = n.nombre;
      }
    }
    return filas.map((f) => ({ ...f, drive_copia: f.drive_copia_id ? { nombre: nombres[f.drive_copia_id] ?? null } : null }));
  } catch {
    return [];
  }
}

export interface VisitaJuzgadoJF {
  id: string;
  fecha_visita: string;
  realizado_por: string | null;
  motivo: string | null;
  documentos_verificados: string | null;
  hallazgos: string | null;
}

// Visitas al juzgado registradas en JusticiaFácil (UCP) para un caso.
export async function visitasJuzgadoJF(casoId: string): Promise<VisitaJuzgadoJF[]> {
  try {
    const r = await fetch(
      `${JF_URL}/rest/v1/visita_juzgado?select=id,fecha_visita,realizado_por,motivo,documentos_verificados,hallazgos&caso_id=eq.${encodeURIComponent(casoId)}&order=fecha_visita.desc`,
      { headers: jfHeaders }
    );
    return r.ok ? await r.json() : [];
  } catch {
    return [];
  }
}

// Documentos ya copiados al almacén de JusticiaFácil ("Documentos fijos") para un caso.
export async function documentosFijosJF(casoId: string): Promise<DocumentoFijoJF[]> {
  try {
    const r = await fetch(
      `${JF_URL}/rest/v1/drive_copia?select=drive_id,nombre,mime&caso_id=eq.${encodeURIComponent(casoId)}&papelera=eq.false&order=nombre.asc`,
      { headers: jfHeaders }
    );
    return r.ok ? await r.json() : [];
  } catch {
    return [];
  }
}

// Busca las garantías/casos de este cliente en JusticiaFácil, por nombre.
// Igual que del otro lado: primero por el ID real del cliente (jc_cliente_id,
// que es el enlace correcto y exclusivo de ESTE cliente). Si un caso viejo
// todavía no tiene ese enlace capturado, como respaldo se busca por nombre
// exacto, pero SIEMPRE excluyendo lo que ya esté enlazado a otro cliente
// distinto — así dos clientes con el mismo nombre (ej. dos garantías del
// mismo Octavio Chiquete, registradas como 2 clientes) nunca se mezclan.
export async function garantiasJF(nombreCliente: string, clienteId?: string | number): Promise<GarantiaJF[]> {
  const nombre = (nombreCliente || "").trim();
  const idStr = clienteId != null ? String(clienteId) : "";
  if (!nombre && !idStr) return [];
  const base = `cliente_juicio?select=${SELECT}&en_papelera=eq.false`;
  const pedir = async (filtro: string): Promise<GarantiaJF[]> => {
    try {
      const r = await fetch(`${JF_URL}/rest/v1/${base}&${filtro}`, { headers: jfHeaders });
      return r.ok ? await r.json() : [];
    } catch {
      return [];
    }
  };

  let porId: GarantiaJF[] = [];
  if (idStr) porId = await pedir(`jc_cliente_id=eq.${encodeURIComponent(idStr)}`);

  if (!nombre) return porId;

  let porNombre = await pedir(`nombre=eq.${encodeURIComponent(nombre)}`);
  if (porNombre.length === 0) {
    const tok = nombre.split(/\s+/)[0] || nombre;
    const candidatas = await pedir(`nombre=ilike.*${encodeURIComponent(tok)}*`);
    const objetivo = norm(nombre);
    porNombre = candidatas.filter((c) => norm(c.nombre || "") === objetivo);
  }
  // Del respaldo por nombre, solo se agregan los que NO tengan dueño o cuyo
  // dueño sea este mismo cliente — nunca los que ya son de otro cliente distinto.
  const yaTengo = new Set(porId.map((g) => g.id));
  const extra = porNombre.filter(
    (g) => !yaTengo.has(g.id) && (!g.jc_cliente_id || (idStr && String(g.jc_cliente_id) === idStr))
  );
  return [...porId, ...extra];
}

// ------------------------------------------------------------
// Espejo de tareas hacia JusticiaFácil (SÍ escribe, a diferencia
// de las funciones de arriba que son solo lectura). Se usa cuando
// una tarea en JurisConecta se le asigna a alguien del área jurídico.
// ------------------------------------------------------------

export function esAreaJuridico(area: string | null | undefined): boolean {
  const a = (area || "").trim().toLowerCase();
  return a === "juridico" || a === "jurídico" || a === "urrj" || a === "ucp" || a === "ucm" || a === "udp" || a === "ufc";
}

export function plataformaDeArea(area: string | null | undefined): string {
  return esAreaJuridico(area) ? "JusticiaFácil" : "JurisConecta";
}

export interface ColaboradorJF {
  correo: string;
  nombre: string;
  rol: string | null;
}

export async function listarColaboradoresJF(): Promise<ColaboradorJF[]> {
  try {
    const r = await fetch(`${JF_URL}/rest/v1/colaboradores?select=correo,nombre,rol&activo=eq.true`, { headers: jfHeaders });
    if (!r.ok) return [];
    return await r.json();
  } catch {
    return [];
  }
}

export async function buscarClienteJF(nombre: string): Promise<boolean> {
  const q = (nombre || "").trim();
  if (!q) return false;
  try {
    const r = await fetch(`${JF_URL}/rest/v1/cliente_juicio?select=id&nombre=ilike.${encodeURIComponent(q)}&en_papelera=eq.false&limit=1`, { headers: jfHeaders });
    if (!r.ok) return false;
    const d = await r.json();
    return Array.isArray(d) && d.length > 0;
  } catch {
    return false;
  }
}

export async function crearClienteJFDesdeJC(cli: {
  id: string; nombre: string; domicilio?: string | null; telefono?: string | null;
  telefono2?: string | null; whatsapp?: string | null; email?: string | null;
  curpRfc?: string | null; codigo?: string | null; area?: string | null; estatus?: string | null;
}): Promise<{ ok: boolean; id?: string }> {
  try {
    const r = await fetch(`${JF_URL}/rest/v1/cliente_juicio`, {
      method: "POST",
      headers: { ...jfHeaders, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({
        nombre: cli.nombre,
        domicilio_garantia: cli.domicilio || null,
        origen: "jurisconecta",
        jc_cliente_id: cli.id,
        nota_origen: `Creado automático desde JurisConecta (código ${cli.codigo || "—"}, área ${cli.area || "—"}).`,
        validado_jc: false,
        estado: cli.estatus || null,
        en_papelera: false,
      }),
    });
    if (!r.ok) return { ok: false };
    const d = await r.json();
    return { ok: true, id: d?.[0]?.id };
  } catch {
    return { ok: false };
  }
}

export async function crearEventoEspejoJF(e: {
  tipo: string; titulo: string; detalle?: string | null; fecha?: string | null;
  asignadoCorreo: string; clienteNombre?: string | null; clienteId?: string | null; jcTareaId?: string;
}): Promise<{ ok: boolean; id?: string }> {
  try {
    const r = await fetch(`${JF_URL}/rest/v1/evento_agenda`, {
      method: "POST",
      headers: { ...jfHeaders, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({
        tipo: e.tipo,
        titulo: e.titulo,
        nota: e.detalle || null,
        fecha: e.fecha || null,
        asignado_a: e.asignadoCorreo,
        cliente_nombre: e.clienteNombre || null,
        cliente_jc_id: e.clienteId || null,
        cliente_estado: e.clienteId ? "vinculado" : null,
        jc_tarea_id: e.jcTareaId || null,
        estado: "pendiente",
        creado_por: "JurisConecta",
      }),
    });
    if (!r.ok) return { ok: false };
    const d = await r.json();
    return { ok: true, id: d?.[0]?.id };
  } catch {
    return { ok: false };
  }
}

export async function actualizarEventoEspejoJF(jfEventoId: string, cambios: Record<string, unknown>): Promise<{ ok: boolean }> {
  try {
    const r = await fetch(`${JF_URL}/rest/v1/evento_agenda?id=eq.${encodeURIComponent(jfEventoId)}`, {
      method: "PATCH",
      headers: { ...jfHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(cambios),
    });
    return { ok: r.ok };
  } catch {
    return { ok: false };
  }
}
