// ===================================================================
// Puente con la tabla 'catalogo_codigos' de Supabase.
// La app lee las reglas de aquí y guarda los cambios aquí.
// ===================================================================
import { supabase } from "../lib/supabase";

export type Etiqueta = {
  texto: string;
  color: string;    // "rojo" | "ambar" | "verde" | "azul" | "violeta" | "gris"
  cuando: string;   // "siempre" | "vencido" | "porvencer" | "falta_accion" | "contingencia"
};

export type AccionCodigo = {
  nombre: string;
  evidencia: string;   // "ninguna" | "foto" | "pdf" | "doc"
  cuenta?: boolean;    // 👈 FASE D3: si true, esta acción cuenta para "atendido"
};

export type CatalogoCodigo = {
  codigo: string;
  nombre: string;
  area_duena: string;
  responsable_rol: string;
  alterno_rol: string;
  respaldo_rol: string;
  apoyos: string;
  ritmo: string;
  dias_limite: number | null;
  dias_aviso?: number | null;   // 👈 días antes del límite para ponerse naranja (si vacío, usa 3)
  requiere_llamada?: boolean | null;   // 👈 FASE D: qué cuenta como atendido
  requiere_correo?: boolean | null;
  requiere_boletin?: boolean | null;
  acciones?: AccionCodigo[] | null;   // 👈 FASE D2: acciones para atender (con sugerencia de evidencia)
  etiquetas?: Etiqueta[] | null;      // 👈 FASE G1: indicadores de color por código
  siguiente_accion: string;
  completa_con: string;
  escalamiento: string;
  escala_a?: string | null;        // 👈 Parte 3b: a quién escala (rol o preset)
  escala_cuando?: string | null;   // "al_vencer" | "dias"
  escala_dias?: number | null;
  salidas: string;
  urgente: boolean;
  orden: number;
  fase?: string;        // 👈 a qué fase pertenece (libre)
  activo: boolean;
};

// Trae las 7 reglas, ordenadas.
export async function fetchCatalogo(): Promise<CatalogoCodigo[]> {
  const { data, error } = await supabase
    .from("catalogo_codigos")
    .select("*")
    .order("orden", { ascending: true });
  if (error) throw error;
  return (data ?? []) as CatalogoCodigo[];
}

// Guarda los cambios de un código (lo edita DGE/RAC desde la pantalla).
export async function guardarCodigo(c: CatalogoCodigo): Promise<{ ok: boolean; error?: string }> {
  const { codigo, ...campos } = c;
  const { error } = await supabase
    .from("catalogo_codigos")
    .update({ ...campos, actualizado_en: new Date().toISOString() })
    .eq("codigo", codigo);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Crea un código NUEVO (inserta una fila nueva en el catálogo).
export async function crearCodigo(c: CatalogoCodigo): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("catalogo_codigos")
    .insert({ ...c, actualizado_en: new Date().toISOString() });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Archiva / desarchiva un código (lo prende o apaga sin borrarlo).
export async function archivarCodigo(codigo: string, activo: boolean): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("catalogo_codigos")
    .update({ activo, actualizado_en: new Date().toISOString() })
    .eq("codigo", codigo);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
