// ===================================================================
//  FOLIOS DE REGISTRO  →  pestaña dentro de Configuración.
//  Entradas / Salidas / Rechazadas, con contadores por área.
//  No usa base de datos nueva: sale de los clientes + usuarios rechazados.
// ===================================================================
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { fetchClientes, prefijoArea, estatusDe, type Cliente, type Area } from "../../data/clientes";

const AREAS_CLIENTE: Area[] = ["Comercial", "RAC", "Admin", "Jurídico", "UFC"];

type AccesoRechazado = { email: string; nombre: string };
type Cat = "entradas" | "salidas" | "rechazadas";

export default function FoliosRegistro() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [rechazos, setRechazos] = useState<AccesoRechazado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [cat, setCat] = useState<Cat>("entradas");

  useEffect(() => {
    (async () => {
      try {
        const [cs, res] = await Promise.all([
          fetchClientes(),
          supabase.from("usuarios").select("email,nombre").eq("estado", "rechazado").order("nombre"),
        ]);
        setClientes(cs);
        setRechazos((res.data as AccesoRechazado[]) || []);
      } catch {
        /* si algo falla, dejamos lo que se haya podido cargar */
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  // Las 3 categorías (de los clientes que ya tienes).
  const entradas = useMemo(() => clientes.filter((c) => c.folio), [clientes]);
  const salidas = useMemo(() => clientes.filter((c) => c.archivado || c.folioCierre), [clientes]);
  const rechazadasCli = useMemo(() => clientes.filter((c) => c.estatus === "cancelado"), [clientes]);

  const totalRechazadas = rechazadasCli.length + rechazos.length;

  // Lista activa según la categoría seleccionada.
  const lista = cat === "entradas" ? entradas : cat === "salidas" ? salidas : rechazadasCli;
  const folioDe = (c: Cliente) => (cat === "salidas" ? c.folioCierre || c.folio : c.folio);
  const porArea = (a: Area) => lista.filter((c) => c.area === a);

  const vacio = cat === "rechazadas" ? totalRechazadas === 0 : lista.length === 0;

  if (cargando) {
    return (
      <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-12 text-center text-humo">
        Cargando folios…
      </div>
    );
  }

  const TabCat = ({ id, label, n }: { id: Cat; label: string; n: number }) => (
    <button
      onClick={() => setCat(id)}
      className={`flex-1 rounded-xl px-3 py-2.5 text-center transition ${cat === id ? "bg-teal text-white shadow-sm" : "border border-black/10 bg-white text-tinta hover:bg-teal-soft"}`}
    >
      <div className="text-lg font-extrabold leading-none">{n}</div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide">{label}</div>
    </button>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-xl font-extrabold text-tinta">Folios de Registro</h1>
        <p className="text-sm text-humo">Control de movimientos por área. Entradas (registros), salidas (cierres) y rechazadas.</p>
      </div>

      {/* Selector de categoría con contadores */}
      <div className="flex gap-2">
        <TabCat id="entradas" label="Entradas" n={entradas.length} />
        <TabCat id="salidas" label="Salidas" n={salidas.length} />
        <TabCat id="rechazadas" label="Rechazadas" n={totalRechazadas} />
      </div>

      {/* Resumen por área de la categoría activa */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {AREAS_CLIENTE.map((a) => (
          <div key={a} className="rounded-xl border border-black/5 bg-white p-3 text-center shadow-sm">
            <div className="font-mono text-[11px] font-bold text-dorado-dark">{prefijoArea(a)}</div>
            <div className="text-xl font-extrabold text-tinta">{porArea(a).length}</div>
            <div className="truncate text-[11px] text-humo">{a}</div>
          </div>
        ))}
      </div>

      {/* Detalle */}
      {vacio ? (
        <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-8 text-center text-sm text-humo">
          Sin registros en esta categoría.
        </div>
      ) : (
        <div className="space-y-3">
          {AREAS_CLIENTE.map((a) => {
            const items = porArea(a);
            if (items.length === 0) return null;
            return (
              <div key={a} className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-black/5 bg-nube/50 px-3 py-2">
                  <span className="text-sm font-bold text-tinta">
                    {a} <span className="font-mono text-xs text-dorado-dark">({prefijoArea(a)})</span>
                  </span>
                  <span className="text-xs text-humo">{items.length}</span>
                </div>
                {items.map((c) => {
                  const est = estatusDe(c.estatus);
                  return (
                    <div key={c.id} className="flex items-center justify-between gap-2 border-b border-black/5 px-3 py-2 last:border-b-0">
                      <span className="min-w-0">
                        <span className="block font-mono text-[12px] text-dorado-dark">{folioDe(c) || "—"}</span>
                        <span className="block truncate text-sm text-tinta">{c.nombre}</span>
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${est.chip}`} title={est.textoCompleto}>{est.label}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Solicitudes de acceso rechazadas (solo en Rechazadas) */}
          {cat === "rechazadas" && rechazos.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
              <div className="border-b border-black/5 bg-nube/50 px-3 py-2 text-sm font-bold text-tinta">
                Solicitudes de acceso rechazadas <span className="text-xs text-humo">({rechazos.length})</span>
              </div>
              {rechazos.map((r) => (
                <div key={r.email} className="flex items-center justify-between gap-2 border-b border-black/5 px-3 py-2 last:border-b-0">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-tinta">{r.nombre || "—"}</span>
                    <span className="block truncate text-[11px] text-humo">{r.email}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">Acceso rechazado</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
