// ===================================================================
// PAPELERA  →  va en: src/modules/Configuracion/Papelera.tsx
// Espacio único con pestañas: Clientes, Mensajes, Videollamadas y Llamadas.
// En cada uno puedes Restaurar o Borrar definitivamente lo eliminado.
// "Eliminar" en toda la app es borrado suave (recuperable). El borrado
// de verdad solo pasa aquí, con confirmación.
// ===================================================================
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "../../lib/supabase";
import { fetchPerfil } from "../../data/usuarios";
import { puedeAccion } from "../../data/roles";
import {
  fetchClientes, eliminarCliente, borrarClienteDefinitivo, estatusDe, type Cliente,
} from "../../data/clientes";
import {
  fetchMensajesEliminados, eliminarMensaje, borrarMensajeDefinitivo, type Mensaje,
} from "../../data/chat";
import {
  fetchReunionesEliminadas, eliminarReunion, borrarReunionDefinitivo, type Reunion,
} from "../../data/reuniones";
import {
  fetchLlamadasEliminadas, eliminarLlamada, borrarLlamadaDefinitivo, type Llamada,
} from "../../data/llamadas";

type Pestana = "clientes" | "mensajes" | "videollamadas" | "llamadas";

// Una fila genérica de la papelera (mismo diseño para los cuatro tipos).
function Fila({ titulo, sub, ocupado, puedeBorrar, puedeRestaurar, onRestaurar, onBorrar }: {
  titulo: string; sub: string; ocupado: boolean; puedeBorrar: boolean; puedeRestaurar: boolean;
  onRestaurar: () => void; onBorrar: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-black/10 px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-tinta">{titulo}</p>
        {sub && <p className="truncate text-[11px] text-humo">{sub}</p>}
      </div>
      <div className="flex shrink-0 gap-1.5">
        {puedeRestaurar && (
          <button onClick={onRestaurar} disabled={ocupado} className="rounded-lg border border-teal/30 px-2.5 py-1 text-[12px] font-semibold text-teal-dark transition hover:bg-teal-soft disabled:opacity-50">↩ Restaurar</button>
        )}
        {puedeBorrar && (
          <button onClick={onBorrar} disabled={ocupado} className="rounded-lg border border-rose-300 px-2.5 py-1 text-[12px] font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50">Borrar definitivo</button>
        )}
      </div>
    </div>
  );
}

function Marco({ cargando, vacio, children }: { cargando: boolean; vacio: boolean; children: ReactNode }) {
  if (cargando) return <p className="mt-4 text-sm text-humo/70">Cargando…</p>;
  if (vacio) return <p className="mt-4 rounded-xl bg-nube px-4 py-3 text-sm text-humo">Aquí no hay nada. ✅</p>;
  return <div className="mt-4 space-y-2.5">{children}</div>;
}

export default function Papelera() {
  const [tab, setTab] = useState<Pestana>("clientes");
  const [miRol, setMiRol] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [reuniones, setReuniones] = useState<Reunion[]>([]);
  const [llamadas, setLlamadas] = useState<Llamada[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const email = data.session?.user?.email;
      if (email) fetchPerfil(email).then((pf) => setMiRol(pf?.rol ?? null)).catch(() => {});
    });
  }, []);
  const puedeBorrar = puedeAccion(miRol, "borrar_definitivo");
  const puedeRestaurar = puedeAccion(miRol, "restaurar");

  useEffect(() => {
    Promise.all([
      fetchClientes().then((d) => setClientes(d.filter((c) => c.eliminado))),
      fetchMensajesEliminados().then(setMensajes),
      fetchReunionesEliminadas().then(setReuniones),
      fetchLlamadasEliminadas().then(setLlamadas),
    ]).finally(() => setCargando(false));
  }, []);

  const TABS: { clave: Pestana; nombre: string; n: number }[] = [
    { clave: "clientes", nombre: "Clientes", n: clientes.length },
    { clave: "mensajes", nombre: "Mensajes", n: mensajes.length },
    { clave: "videollamadas", nombre: "Videollamadas", n: reuniones.length },
    { clave: "llamadas", nombre: "Llamadas", n: llamadas.length },
  ];

  return (
    <section className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
      <h2 className="font-display text-base font-extrabold text-tinta">🗑️ Papelera</h2>
      <p className="mt-1 text-sm text-humo">Todo lo eliminado en la app. Puedes restaurarlo o borrarlo de forma definitiva.</p>

      {/* Pestañas internas */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button key={t.clave} onClick={() => setTab(t.clave)}
            className={tab === t.clave
              ? "rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white"
              : "rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-humo hover:bg-teal-soft"}>
            {t.nombre}{t.n > 0 ? ` (${t.n})` : ""}
          </button>
        ))}
      </div>

      {/* ===== CLIENTES ===== */}
      {tab === "clientes" && (
        <Marco cargando={cargando} vacio={clientes.length === 0}>
          {clientes.map((c) => (
            <Fila key={c.id} titulo={c.nombre} sub={`${estatusDe(c.estatus).label}${c.folio ? ` · ${c.folio}` : ""}`} ocupado={ocupado === c.id} puedeBorrar={puedeBorrar} puedeRestaurar={puedeRestaurar}
              onRestaurar={async () => { setOcupado(c.id); const ok = await eliminarCliente(c.id, false); setOcupado(null); if (ok) setClientes((p) => p.filter((x) => x.id !== c.id)); else alert("No se pudo restaurar."); }}
              onBorrar={async () => { if (!confirm(`¿BORRAR DEFINITIVAMENTE a "${c.nombre}"?\n\nYa no se podrá recuperar.`)) return; setOcupado(c.id); const ok = await borrarClienteDefinitivo(c.id); setOcupado(null); if (ok) setClientes((p) => p.filter((x) => x.id !== c.id)); else alert("No se pudo borrar."); }} />
          ))}
        </Marco>
      )}

      {/* ===== MENSAJES ===== */}
      {tab === "mensajes" && (
        <Marco cargando={cargando} vacio={mensajes.length === 0}>
          {mensajes.map((m) => (
            <Fila key={m.id} titulo={m.texto || (m.archivo_nombre ? `📎 ${m.archivo_nombre}` : "[archivo]")} sub={`${m.autor_nombre} · ${new Date(m.created_at).toLocaleString("es-MX")}`} ocupado={ocupado === m.id} puedeBorrar={puedeBorrar} puedeRestaurar={puedeRestaurar}
              onRestaurar={async () => { setOcupado(m.id); const ok = await eliminarMensaje(m.id, false); setOcupado(null); if (ok) setMensajes((p) => p.filter((x) => x.id !== m.id)); else alert("No se pudo restaurar."); }}
              onBorrar={async () => { if (!confirm("¿BORRAR DEFINITIVAMENTE este mensaje?\n\nYa no se podrá recuperar.")) return; setOcupado(m.id); const ok = await borrarMensajeDefinitivo(m.id); setOcupado(null); if (ok) setMensajes((p) => p.filter((x) => x.id !== m.id)); else alert("No se pudo borrar."); }} />
          ))}
        </Marco>
      )}

      {/* ===== VIDEOLLAMADAS ===== */}
      {tab === "videollamadas" && (
        <Marco cargando={cargando} vacio={reuniones.length === 0}>
          {reuniones.map((r) => (
            <Fila key={r.id} titulo={r.titulo || r.destino || "Videollamada"} sub={`${r.creado_por ? `Por ${r.creado_por} · ` : ""}${new Date(r.created_at).toLocaleString("es-MX")}`} ocupado={ocupado === r.id} puedeBorrar={puedeBorrar} puedeRestaurar={puedeRestaurar}
              onRestaurar={async () => { setOcupado(r.id); const ok = await eliminarReunion(r.id, false); setOcupado(null); if (ok) setReuniones((p) => p.filter((x) => x.id !== r.id)); else alert("No se pudo restaurar."); }}
              onBorrar={async () => { if (!confirm("¿BORRAR DEFINITIVAMENTE esta videollamada?\n\nYa no se podrá recuperar.")) return; setOcupado(r.id); const ok = await borrarReunionDefinitivo(r.id); setOcupado(null); if (ok) setReuniones((p) => p.filter((x) => x.id !== r.id)); else alert("No se pudo borrar."); }} />
          ))}
        </Marco>
      )}

      {/* ===== LLAMADAS ===== */}
      {tab === "llamadas" && (
        <Marco cargando={cargando} vacio={llamadas.length === 0}>
          {llamadas.map((l) => (
            <Fila key={l.id} titulo={`${l.folio || "Llamada"}${l.clienteNombre ? ` · ${l.clienteNombre}` : ""}`} sub={`${l.telefono || ""}${l.fecha ? ` · ${new Date(l.fecha).toLocaleString("es-MX")}` : ""}`} ocupado={ocupado === l.id} puedeBorrar={puedeBorrar} puedeRestaurar={puedeRestaurar}
              onRestaurar={async () => { setOcupado(l.id); const ok = await eliminarLlamada(l.id, false); setOcupado(null); if (ok) setLlamadas((p) => p.filter((x) => x.id !== l.id)); else alert("No se pudo restaurar."); }}
              onBorrar={async () => { if (!confirm(`¿BORRAR DEFINITIVAMENTE la llamada ${l.folio}?\n\nYa no se podrá recuperar.`)) return; setOcupado(l.id); const ok = await borrarLlamadaDefinitivo(l.id); setOcupado(null); if (ok) setLlamadas((p) => p.filter((x) => x.id !== l.id)); else alert("No se pudo borrar."); }} />
          ))}
        </Marco>
      )}
    </section>
  );
}
