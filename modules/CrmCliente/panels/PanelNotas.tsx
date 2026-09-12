// Pestaña "Notas" del expediente: notas internas del cliente.
// (Extraído de CrmCliente.tsx para dividir los módulos por archivo.)
import { useState, useEffect } from "react";
import { type Cliente } from "../../../data/clientes";
import { puedeAccion } from "../../../data/roles";
import { fetchComunicaciones, registrarComunicacion, type Comunicacion } from "../../../data/comunicaciones";
import { useMiRol, fechaLarga } from "../_compartido";

export default function PanelNotas({ cliente }: { cliente: Cliente }) {
  const miRol = useMiRol();
  const [lista, setLista] = useState<Comunicacion[] | null>(null);
  const [error, setError] = useState(false);
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);

  const yo = (() => { try { return JSON.parse(localStorage.getItem("chat_yo") || "null"); } catch { return null; } })();
  const autor: string | null = yo?.nombre || null;

  useEffect(() => {
    let vivo = true;
    fetchComunicaciones(String(cliente.id))
      .then((todas) => { if (vivo) setLista(todas.filter((m) => m.tipo === "nota")); })
      .catch(() => { if (vivo) setError(true); });
    return () => { vivo = false; };
  }, [cliente.id]);

  async function guardar() {
    if (!puedeAccion(miRol, "agregar_nota")) { alert("No tienes permiso para agregar notas."); return; }
    const t = texto.trim();
    if (!t || guardando) return;
    setGuardando(true);
    const r = await registrarComunicacion({ clienteId: String(cliente.id), clienteNombre: cliente.nombre, tipo: "nota", detalle: t, autor });
    setGuardando(false);
    if (r) { setLista((prev) => [r, ...(prev || [])]); setTexto(""); }
  }

  return (
    <div className="space-y-3">
      {/* Caja para agregar una nota */}
      <div className="rounded-2xl border border-black/5 bg-white p-3.5 shadow-sm">
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} placeholder="Escribe una nota sobre este cliente…" className="w-full resize-none rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20" />
        <div className="mt-2 flex justify-end">
          {puedeAccion(miRol, "agregar_nota") && <button onClick={guardar} disabled={!texto.trim() || guardando} className="rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-dark disabled:opacity-50">{guardando ? "Guardando…" : "Guardar nota"}</button>}
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-10 text-center text-amber-800">No se pudieron cargar las notas.</div>
      ) : lista === null ? (
        <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-10 text-center text-humo">Cargando notas…</div>
      ) : lista.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-10 text-center text-humo">Aún no hay notas para este cliente. Escribe la primera arriba. 👆</div>
      ) : (
        lista.map((m) => (
          <div key={m.id} className="rounded-2xl border border-black/5 bg-white p-3.5 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-tinta">📝 Nota</span>
              <span className="text-xs text-humo">{fechaLarga(m.created_at)}</span>
            </div>
            {m.detalle && <p className="mt-1.5 whitespace-pre-wrap text-[14px] text-tinta">{m.detalle}</p>}
            {m.autor && <p className="mt-1 text-[13px] text-humo">Por {m.autor}</p>}
          </div>
        ))
      )}
    </div>
  );
}
