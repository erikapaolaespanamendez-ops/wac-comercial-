// Seguimiento jurídico semanal de cada cliente:
//  - "boletin"   = revisión semanal del Boletín Judicial del juzgado.
//  - "actuacion" = movimientos del expediente (promociones, audiencias, acuerdos…).
import { supabase } from "../lib/supabase";

export type TipoActuacion = "boletin" | "actuacion";

export type Actuacion = {
  id: string;
  clienteId: string;
  tipo: TipoActuacion;
  fecha: string;        // YYYY-MM-DD
  titulo: string;
  detalle: string | null;
  autor: string | null;
  respaldo: { url: string; nombre: string } | null;   // documento de respaldo (Drive), opcional
  createdAt: string;
};

export async function fetchActuaciones(clienteId: string): Promise<Actuacion[]> {
  const { data, error } = await supabase
    .from("actuaciones_cliente")
    .select("*")
    .eq("cliente_id", clienteId)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map((r: any) => ({
    id: r.id,
    clienteId: r.cliente_id,
    tipo: r.tipo,
    fecha: r.fecha,
    titulo: r.titulo,
    detalle: r.detalle,
    autor: r.autor,
    respaldo: r.respaldo || null,
    createdAt: r.created_at,
  }));
}

export async function agregarActuacion(a: {
  clienteId: string;
  tipo: TipoActuacion;
  fecha: string;
  titulo: string;
  detalle?: string;
  autor?: string | null;
  respaldo?: { url: string; nombre: string } | null;
}): Promise<Actuacion | null> {
  const { data, error } = await supabase
    .from("actuaciones_cliente")
    .insert({
      cliente_id: a.clienteId,
      tipo: a.tipo,
      fecha: a.fecha,
      titulo: a.titulo,
      detalle: a.detalle || null,
      autor: a.autor || null,
      respaldo: a.respaldo || null,
    })
    .select("*")
    .single();
  if (error || !data) return null;
  return {
    id: data.id,
    clienteId: data.cliente_id,
    tipo: data.tipo,
    fecha: data.fecha,
    titulo: data.titulo,
    detalle: data.detalle,
    autor: data.autor,
    respaldo: data.respaldo || null,
    createdAt: data.created_at,
  };
}

export async function borrarActuacion(id: string): Promise<boolean> {
  const { error } = await supabase.from("actuaciones_cliente").delete().eq("id", id);
  return !error;
}
