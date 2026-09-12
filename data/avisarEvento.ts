import { supabase } from "../lib/supabase";
// Lo que un módulo manda cuando "pasa algo".
export type EventoNuevo = {
  tipo: string;          // 'cliente' | 'llamada' | 'reunion' | 'colaborador' | 'grupo' | 'mensaje' | 'sistema'
  titulo: string;        // "Nuevo cliente: Juan Pérez"
  detalle?: string;      // texto chico debajo
  autor?: string;        // quién lo hizo
  accion?: string;       // 'creado' | 'actualizado' | ...
  modulo?: string;       // a qué vista llevar al tocar: 'clientes','llamadas','chat'...
  refId?: string;        // id del registro (para abrirlo)
  icono?: string;        // emoji
  meta?: Record<string, any>;
};
// Cómo se ve una fila ya guardada (lo que leerá la campanita).
export type Evento = {
  id: string;
  created_at: string;
  tipo: string;
  accion: string | null;
  titulo: string;
  detalle: string | null;
  autor: string | null;
  modulo: string | null;
  ref_id: string | null;
  icono: string | null;
  meta: Record<string, any> | null;
};
// ---- "EN VIVO" de los eventos: UN canal broadcast global (el mismo "en vivo" que SÍ funciona) ----
const canalEventos = supabase.channel("eventos_global_v1", { config: { broadcast: { self: false } } });
let estado: "no" | "conectando" | "listo" = "no";
const oyentes = new Set<(e: Evento) => void>();
const pendientes: Evento[] = [];
function enviarPorCanal(e: Evento) {
  canalEventos.send({ type: "broadcast", event: "nuevo_evento", payload: e });
}
function asegurarSuscrito() {
  if (estado !== "no") return;
  estado = "conectando";
  canalEventos
    .on("broadcast", { event: "nuevo_evento" }, ({ payload }) => {
      const e = payload as Evento;
      oyentes.forEach((fn) => { try { fn(e); } catch {} });
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        estado = "listo";
        while (pendientes.length) enviarPorCanal(pendientes.shift() as Evento);
      }
    });
}
// La campanita usará esto (en la Parte 2) para oír los avisos en vivo.
export function escucharEventos(fn: (e: Evento) => void): () => void {
  asegurarSuscrito();
  oyentes.add(fn);
  return () => { oyentes.delete(fn); };
}
// ===== EL AYUDANTE CENTRAL: cualquier módulo llama esto cuando "pasa algo". =====
export async function avisarEvento(e: EventoNuevo): Promise<void> {
  // 1) Guardar el evento (queda para siempre y lo ve cualquier aparato, aunque se conecte después).
  let guardado: Evento | null = null;
  try {
    const { data, error } = await supabase
      .from("eventos")
      .insert({
        tipo: e.tipo,
        accion: e.accion ?? null,
        titulo: e.titulo,
        detalle: e.detalle ?? null,
        autor: e.autor ?? null,
        modulo: e.modulo ?? null,
        ref_id: e.refId ?? null,
        icono: e.icono ?? null,
        meta: e.meta ?? null,
      })
      .select().single();
    if (error) console.error("avisarEvento no guardó:", error.message);
    else guardado = data as Evento;
  } catch (err: any) {
    console.error("avisarEvento error al guardar:", err?.message || err);
  }
  // 2) Mandarlo EN VIVO a quien esté conectado (si falla, NO rompe la acción original).
  if (guardado) {
    try {
      asegurarSuscrito();
      if (estado === "listo") enviarPorCanal(guardado);
      else pendientes.push(guardado);
    } catch {}
  }
  // 3) Avisar al CELULAR de TODOS (push). Fire-and-forget.
  //    👉 La función 'notificar-todos' la creamos en la PARTE 2. Mientras no exista,
  //       esto simplemente no hace nada (el .catch se lo traga, no rompe).
  try {
    fetch("/.netlify/functions/notificar-todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        titulo: e.titulo,
        detalle: e.detalle || "",
        autor: e.autor || "",
        modulo: e.modulo || "",
        refId: e.refId || "",
      }),
    }).catch(() => {});
  } catch {}
}

// ===== Avisar SOLO a una persona (dirigido). La campanita lo esconde de los demás. =====
// No manda push a los celulares de todos (eso quedaría para una función aparte).
export async function avisarEventoA(paraEmail: string, e: EventoNuevo): Promise<void> {
  const destino = (paraEmail || "").trim().toLowerCase();
  const meta = { ...(e.meta || {}), paraEmail: destino };
  let guardado: Evento | null = null;
  try {
    const { data, error } = await supabase
      .from("eventos")
      .insert({
        tipo: e.tipo,
        accion: e.accion ?? null,
        titulo: e.titulo,
        detalle: e.detalle ?? null,
        autor: e.autor ?? null,
        modulo: e.modulo ?? null,
        ref_id: e.refId ?? null,
        icono: e.icono ?? null,
        meta,
      })
      .select().single();
    if (error) console.error("avisarEventoA no guardó:", error.message);
    else guardado = data as Evento;
  } catch (err: any) {
    console.error("avisarEventoA error al guardar:", err?.message || err);
  }
  if (guardado) {
    try {
      asegurarSuscrito();
      if (estado === "listo") enviarPorCanal(guardado);
      else pendientes.push(guardado);
    } catch {}
  }
}
