import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type Solicitud = { email: string; nombre: string; estado: string };

const ROLES = ["DGE", "DIL", "DGC", "GAD", "RAC", "UCM", "UCP", "URRJ", "Colaborador", "Invitado"];

export default function SolicitudesAcceso() {
  const [lista, setLista] = useState<Solicitud[]>([]);
  const [cargando, setCargando] = useState(true);
  const [rolSel, setRolSel] = useState<Record<string, string>>({});

  async function cargar() {
    setCargando(true);
    const { data } = await supabase.from("usuarios").select("email,nombre,estado").eq("estado", "pendiente").order("nombre");
    setLista((data as Solicitud[]) || []);
    setCargando(false);
  }
  useEffect(() => { cargar(); }, []);

  async function aprobar(s: Solicitud) {
    const rol = rolSel[s.email];
    if (!rol) return;
    const { error } = await supabase.from("usuarios").update({ estado: "activo", rol }).eq("email", s.email);
    if (error) { alert("No se pudo aprobar."); return; }
    setLista((prev) => prev.filter((x) => x.email !== s.email));
  }
  async function rechazar(s: Solicitud) {
    if (!confirm(`¿Rechazar el acceso de ${s.nombre}?`)) return;
    const { error } = await supabase.from("usuarios").update({ estado: "rechazado" }).eq("email", s.email);
    if (error) { alert("No se pudo rechazar."); return; }
    setLista((prev) => prev.filter((x) => x.email !== s.email));
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-base font-extrabold text-tinta">🔔 Solicitudes de acceso</h2>
        {lista.length > 0 && <span className="rounded-full bg-rose-500 px-2 py-0.5 text-xs font-bold text-white">{lista.length}</span>}
      </div>
      <p className="mt-1 text-sm text-humo">Personas que se registraron y esperan tu aprobación.</p>

      {cargando ? (
        <p className="mt-4 text-sm text-slate-400">Cargando…</p>
      ) : lista.length === 0 ? (
        <p className="mt-4 rounded-xl bg-nube px-4 py-3 text-sm text-humo">No hay solicitudes pendientes. ✅</p>
      ) : (
        <div className="mt-4 space-y-3">
          {lista.map((s) => (
            <div key={s.email} className="rounded-xl border border-slate-200 p-3">
              <p className="font-semibold text-tinta">{s.nombre}</p>
              <p className="text-xs text-humo break-all">{s.email}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select value={rolSel[s.email] || ""} onChange={(e) => setRolSel((r) => ({ ...r, [s.email]: e.target.value }))} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                  <option value="">Elige un rol…</option>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <button onClick={() => aprobar(s)} disabled={!rolSel[s.email]} className="rounded-lg bg-teal px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-dark disabled:opacity-50">Aprobar</button>
                <button onClick={() => rechazar(s)} className="rounded-lg border border-rose-300 px-3 py-1.5 text-sm font-semibold text-rose-600 hover:bg-rose-50">Rechazar</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
