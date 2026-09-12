// Pestaña "Llamadas" del expediente: historial de llamadas con grabaciones.
// (Extraído de CrmCliente.tsx para dividir los módulos por archivo.)
import { useState, useEffect } from "react";
import { type Cliente } from "../../../data/clientes";
import { fetchLlamadas, type Llamada } from "../../../data/llamadas";
import { supabase } from "../../../lib/supabase";
import { fechaLarga, dig10 } from "../_compartido";

// Duración en mm:ss a partir de segundos.
function dur(seg: number | null): string {
  if (seg == null) return "";
  const m = Math.floor(seg / 60), s = seg % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
// Saca el ID de un archivo de Google Drive desde su URL.
function driveId(url: string): string | null {
  const m = url.match(/\/d\/([^/]+)/) || url.match(/[?&]id=([^&]+)/);
  return m ? m[1] : null;
}

export default function PanelLlamadas({ cliente }: { cliente: Cliente }) {
  const [lista, setLista] = useState<Llamada[] | null>(null);
  const [error, setError] = useState(false);
  const [filtro, setFiltro] = useState<"todas" | "entrante" | "saliente">("todas");
  const [reproducir, setReproducir] = useState<Llamada | null>(null);
  const [pendiente, setPendiente] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetchLlamadas()
      .then((todas) => {
        const tels = new Set([dig10(cliente.telefono), dig10(cliente.telefono2)].filter(Boolean));
        const mias = todas.filter((l) => tels.has(dig10(l.telefono)));
        if (vivo) setLista(mias);
      })
      .catch(() => { if (vivo) setError(true); });
    // Seguimiento en espera: hay llamada pero falta el correo con evidencia.
    supabase.from("seguimiento_contactos_cliente")
      .select("ultima_llamada, ultimo_correo")
      .eq("cliente_id", String(cliente.id))
      .maybeSingle()
      .then(({ data }: { data: any }) => {
        if (!vivo || !data) return;
        const ll = data.ultima_llamada ? new Date(data.ultima_llamada).getTime() : 0;
        const co = data.ultimo_correo ? new Date(data.ultimo_correo).getTime() : 0;
        setPendiente(ll && co < ll ? "Falta el correo con evidencia para cerrar el seguimiento." : null);
      });
    return () => { vivo = false; };
  }, [cliente.id, cliente.telefono, cliente.telefono2]);

  if (error) return <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-10 text-center text-amber-800">No se pudieron cargar las llamadas.</div>;
  if (lista === null) return <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-10 text-center text-humo">Cargando llamadas…</div>;

  const conGrab = lista.filter((l) => l.grabacionUrl).length;
  const ent = lista.filter((l) => l.tipo === "entrante").length;
  const sal = lista.filter((l) => l.tipo === "saliente").length;
  const visibles = lista.filter((l) => filtro === "todas" || l.tipo === filtro);
  const repId = reproducir?.grabacionUrl ? driveId(reproducir.grabacionUrl) : null;
  const chips: [typeof filtro, string, number][] = [["todas", "Todas", lista.length], ["entrante", "📥 Entrantes", ent], ["saliente", "📤 Salientes", sal]];

  return (
    <div className="space-y-3">
      {pendiente && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          📋 <b>Seguimiento de llamada en espera de elaborar.</b> {pendiente}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-teal-soft px-2.5 py-0.5 font-semibold text-teal-dark">{lista.length} llamada{lista.length === 1 ? "" : "s"}</span>
        <span className="rounded-full bg-nube px-2.5 py-0.5 font-semibold text-tinta">🎙️ {conGrab} con grabación</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {chips.map(([v, label, n]) => (
          <button key={v} onClick={() => setFiltro(v)} className={"rounded-lg px-2.5 py-1 text-[13px] font-semibold " + (filtro === v ? "bg-teal text-white" : "border border-black/10 text-humo hover:bg-nube")}>{label} ({n})</button>
        ))}
      </div>

      {visibles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-10 text-center text-humo">No hay llamadas en este filtro.</div>
      ) : visibles.map((l) => (
        <div key={l.id} className="rounded-2xl border border-black/5 bg-white p-3.5 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-tinta">{l.tipo === "saliente" ? "📤 Saliente" : "📥 Entrante"}</span>
            {(l.duracion ?? 0) < 30 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[13px] font-semibold text-amber-800">📵 Intento · no contestó</span>
            )}
            <span className="text-xs text-humo">{fechaLarga(l.fecha)}</span>
            {l.duracion != null && <span className="rounded-full bg-nube px-2 py-0.5 text-[13px] font-semibold text-tinta">⏱ {dur(l.duracion)}</span>}
            {l.resultado && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[13px] font-semibold text-sky-700">{l.resultado}</span>}
            {l.urgente && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[13px] font-semibold text-red-700">Urgente</span>}
          </div>
          {(l.motivo || l.fase) && <p className="mt-1.5 text-[14px] text-tinta">{l.motivo}{l.fase ? " · Fase: " + l.fase : ""}</p>}
          {l.nota && <p className="mt-1 whitespace-pre-wrap rounded-lg bg-nube/50 px-2.5 py-1.5 text-[14px] text-tinta">{l.nota}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {(l.registradoPor || l.responsable) && <span className="text-[13px] text-humo">Atendió: {l.registradoPor || l.responsable}</span>}
            {l.grabacionUrl ? (
              <>
                <button onClick={() => setReproducir(l)} className="text-[13px] font-semibold text-teal underline">▶️ Reproducir</button>
                <a href={l.grabacionUrl} target="_blank" rel="noreferrer" className="text-[13px] font-semibold text-humo underline">↗️ Abrir</a>
              </>
            ) : <span className="text-[13px] text-humo/60">Sin grabación</span>}
          </div>
        </div>
      ))}

      {reproducir && (
        <div className="fixed inset-0 z-[70] flex flex-col justify-center bg-black/70 p-3" onClick={() => setReproducir(null)}>
          <div className="mx-auto flex w-full max-w-2xl flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2 pb-2 text-white">
              <span className="min-w-0 truncate text-sm font-semibold">🎙️ Grabación · {fechaLarga(reproducir.fecha)}</span>
              <button onClick={() => setReproducir(null)} className="shrink-0 rounded-lg bg-white/15 px-3 py-1 text-xs font-semibold text-white hover:bg-white/25">✕ Cerrar</button>
            </div>
            {repId
              ? <iframe src={`https://drive.google.com/file/d/${repId}/preview`} title="Grabación" className="h-72 w-full rounded-xl bg-white" />
              : <audio src={reproducir.grabacionUrl} controls autoPlay className="w-full rounded-xl bg-white" />}
          </div>
        </div>
      )}
    </div>
  );
}
