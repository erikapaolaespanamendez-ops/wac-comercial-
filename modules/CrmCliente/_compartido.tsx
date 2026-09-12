// Helpers compartidos por los paneles del expediente del cliente.
// (Se sacaron de CrmCliente.tsx para poder dividir los módulos por archivo.)
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "../../lib/supabase";
import { fetchPerfil } from "../../data/usuarios";

// ¿Quién soy? (rol del usuario) — para aplicar permisos en los paneles.
export function useMiRol(): string | null {
  const [rol, setRol] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const email = data.session?.user?.email;
      if (email) fetchPerfil(email).then((pf) => setRol(pf?.rol ?? null)).catch(() => {});
    });
  }, []);
  return rol;
}

// Fecha corta legible en español (ej. "15 mar 2023").
export function fechaCorta(iso: string): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

// Botón segmentado Sí / No.
export function SegmentoSiNo({ valor, onCambio }: { valor: boolean; onCambio: (v: boolean) => void }) {
  return (
    <div className="flex shrink-0 overflow-hidden rounded-lg border border-black/10">
      <button onClick={() => onCambio(false)} className={"px-3 py-1 text-[13px] font-semibold " + (!valor ? "bg-teal text-white" : "text-humo hover:bg-nube")}>No</button>
      <button onClick={() => onCambio(true)} className={"px-3 py-1 text-[13px] font-semibold " + (valor ? "bg-teal text-white" : "text-humo hover:bg-nube")}>Sí</button>
    </div>
  );
}

// Un renglón "Etiqueta → Valor" (muestra "—" si está vacío).
export function Dato({ label, valor, ancho }: { label: string; valor?: string | null; ancho?: boolean }) {
  const v = (valor ?? "").toString().trim();
  return (
    <div className={ancho ? "sm:col-span-2" : ""}>
      <div className="text-[13px] font-semibold uppercase tracking-wide text-humo">{label}</div>
      <div className={"mt-0.5 text-sm " + (v ? "text-tinta" : "text-humo/60")}>{v || "—"}</div>
    </div>
  );
}

// Una sección con título y grid de datos.
export function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
      <h3 className="mb-3 font-display text-sm font-extrabold uppercase tracking-wide text-teal-dark">{titulo}</h3>
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{children}</div>
    </section>
  );
}

// Fecha + hora legible (ej. "15 mar 2023, 14:30").
export function fechaLarga(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Últimos 10 dígitos de un teléfono (para emparejar llamadas).
export function dig10(s: string): string {
  return (s || "").replace(/\D/g, "").slice(-10);
}

// Ícono por tipo de tarea.
export const ICONO_TAREA: Record<string, string> = { tarea: "✅", llamada: "📞", correo: "✉️", cita: "📅" };
