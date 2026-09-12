// ===================================================================
// SolicitudesClientesJF · src/modules/Bienvenida/SolicitudesClientesJF.tsx
// Lista de tareas creadas desde JusticiaFácil cuyo cliente no se
// encontró aquí. Menú de 3 puntos: Vincular con otro / Conservar
// (crear nuevo) / Eliminar.
// ===================================================================
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  fetchSolicitudesPendientesJF, vincularSolicitudConCliente, conservarSolicitudComoClienteNuevo,
  descartarSolicitudJF, type SolicitudJF, type ClienteMinimo,
} from "../../data/solicitudesJF";
import { fechaCorta, ICONO_TAREA } from "../CrmCliente/_compartido";

const ICONO_ORIGEN = "⚖️"; // JusticiaFácil

export default function SolicitudesClientesJF({ quien, onCambio }: { quien: string; onCambio?: () => void }) {
  const [lista, setLista] = useState<SolicitudJF[] | null>(null);
  const [menuAbierto, setMenuAbierto] = useState<string | null>(null);
  const [vinculando, setVinculando] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  function cargar() {
    fetchSolicitudesPendientesJF().then(setLista);
  }
  useEffect(() => { cargar(); }, []);

  async function conservar(s: SolicitudJF) {
    setOcupado(s.id); setMenuAbierto(null);
    const r = await conservarSolicitudComoClienteNuevo(s, quien);
    setOcupado(null);
    if (r.ok) { cargar(); onCambio?.(); }
    else alert("No se pudo crear el cliente: " + (r.error || ""));
  }
  async function vincular(s: SolicitudJF, c: ClienteMinimo) {
    setOcupado(s.id);
    const r = await vincularSolicitudConCliente(s, c, quien);
    setOcupado(null);
    if (r.ok) { setVinculando(null); cargar(); onCambio?.(); }
    else alert("No se pudo vincular: " + (r.error || ""));
  }
  async function descartar(s: SolicitudJF) {
    if (!window.confirm(`¿Eliminar la solicitud de "${s.nombreCliente}"?`)) return;
    setOcupado(s.id); setMenuAbierto(null);
    const r = await descartarSolicitudJF(s, quien);
    setOcupado(null);
    if (r.ok) { cargar(); onCambio?.(); }
    else alert("No se pudo eliminar: " + (r.error || ""));
  }

  if (lista === null) return <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-10 text-center text-humo">Cargando solicitudes…</div>;
  if (lista.length === 0) return <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-10 text-center text-humo">No hay solicitudes pendientes de JusticiaFácil. 👍</div>;

  return (
    <div className="space-y-2">
      {lista.map((s) => (
        <div key={s.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-tinta">{ICONO_ORIGEN} No se encontró: {s.nombreCliente}</p>
              {s.titulo && <p className="mt-0.5 text-[13px] text-tinta">{ICONO_TAREA[(s.tipo as any) || "tarea"] || "✅"} {s.titulo}</p>}
              <p className="mt-1 text-[11px] text-humo">
                {s.asignadoNombre ? `Para ${s.asignadoNombre}` : ""}{s.fecha ? ` · ${fechaCorta(s.fecha)}` : ""} · desde JusticiaFácil
              </p>
            </div>
            <div className="relative shrink-0">
              <button onClick={() => setMenuAbierto(menuAbierto === s.id ? null : s.id)} disabled={ocupado === s.id}
                className="rounded-lg border border-black/10 bg-white px-2 py-1 text-sm font-bold text-humo hover:bg-nube disabled:opacity-50">⋮</button>
              {menuAbierto === s.id && (
                <div className="absolute right-0 z-10 mt-1 w-56 rounded-lg border border-black/10 bg-white py-1 shadow-lg">
                  <button onClick={() => { setVinculando(s.id); setMenuAbierto(null); }} className="block w-full px-3 py-1.5 text-left text-xs text-tinta hover:bg-nube">🔗 Vincular con otro cliente</button>
                  <button onClick={() => conservar(s)} className="block w-full px-3 py-1.5 text-left text-xs text-tinta hover:bg-nube">✅ Conservar (crear cliente nuevo)</button>
                  <button onClick={() => descartar(s)} className="block w-full px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50">🗑 Eliminar solicitud</button>
                </div>
              )}
            </div>
          </div>
          {vinculando === s.id && (
            <div className="mt-2 border-t border-amber-200 pt-2">
              <BuscadorCliente ocupado={ocupado === s.id} onElegir={(c) => vincular(s, c)} onCancelar={() => setVinculando(null)} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Buscador chiquito de clientes existentes (por nombre) para "Vincular con otro".
function BuscadorCliente({ onElegir, onCancelar, ocupado }: { onElegir: (c: ClienteMinimo) => void; onCancelar: () => void; ocupado: boolean }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<any[]>([]);
  const [buscando, setBuscando] = useState(false);
  useEffect(() => {
    const texto = q.trim();
    if (texto.length < 3) { setRes([]); return; }
    const t = setTimeout(async () => {
      setBuscando(true);
      const { data } = await supabase.from("clientes").select("id,nombre,codigo,folio").eq("eliminado", false).ilike("nombre", `%${texto}%`).limit(10);
      setRes(data || []);
      setBuscando(false);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente existente…" autoFocus
          className="h-8 w-full rounded-lg border border-black/10 bg-white px-2.5 text-xs outline-none focus:border-teal" />
        <button onClick={onCancelar} className="shrink-0 rounded-lg border border-black/10 bg-white px-2 py-1 text-xs text-humo hover:bg-nube">✕</button>
      </div>
      {buscando && <p className="text-[11px] text-humo">Buscando…</p>}
      {res.length > 0 && (
        <div className="max-h-32 overflow-y-auto rounded-lg border border-black/10 bg-white">
          {res.map((c) => (
            <button key={c.id} disabled={ocupado} onClick={() => onElegir(c)} className="block w-full truncate px-2.5 py-1.5 text-left text-xs hover:bg-nube disabled:opacity-50">
              {c.nombre} {c.codigo && <span className="text-[10px] text-humo">· {c.codigo}{c.folio ? ` · ${c.folio}` : ""}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
