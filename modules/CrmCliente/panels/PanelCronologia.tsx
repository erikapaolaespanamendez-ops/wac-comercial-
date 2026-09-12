// Pestaña "Cronología" del expediente: junta correos, notas, llamadas,
// tareas y actuaciones en una sola línea de tiempo.
// (Extraído de CrmCliente.tsx para dividir los módulos por archivo.)
import { useState, useEffect } from "react";
import { type Cliente } from "../../../data/clientes";
import { fetchComunicaciones } from "../../../data/comunicaciones";
import { fetchLlamadas } from "../../../data/llamadas";
import { fetchActuaciones } from "../../../data/actuaciones";
import { fetchTareasCliente } from "../../../data/tareas";
import { fechaLarga, dig10, ICONO_TAREA } from "../_compartido";

type Evento = { fecha: string; icono: string; titulo: string; detalle?: string | null; autor?: string | null; link?: string | null; linkTexto?: string };

const TIPO_COM: Record<string, { icono: string; titulo: string }> = {
  correo:       { icono: "✉️", titulo: "Correo" },
  nota:         { icono: "📝", titulo: "Nota" },
  whatsapp:     { icono: "💬", titulo: "WhatsApp" },
  videollamada: { icono: "📹", titulo: "Videollamada" },
};

export default function PanelCronologia({ cliente }: { cliente: Cliente }) {
  const [eventos, setEventos] = useState<Evento[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let vivo = true;
    const cid = String(cliente.id);
    const tels = new Set([dig10(cliente.telefono), dig10(cliente.telefono2)].filter(Boolean));
    Promise.all([
      fetchComunicaciones(cid).catch(() => []),
      fetchTareasCliente(cid).catch(() => []),
      fetchLlamadas().catch(() => []),
      fetchActuaciones(cid).catch(() => []),
    ])
      .then(([coms, tareas, llamadas, actuaciones]) => {
        const evs: Evento[] = [];
        // Comunicaciones (correos, notas, WhatsApp, videollamadas).
        // Las llamadas se toman de su propia tabla para no duplicar.
        for (const m of coms) {
          // Las llamadas y los intentos que la base espejó desde el conmutador
          // se saltan aquí: más abajo se toman de la tabla "llamadas", que trae
          // además la duración y la grabación. Si no se saltaran, cada llamada
          // aparecería dos veces en la línea de tiempo.
          if (m.tipo === "llamada" || m.tipo === "intento") continue;
          const meta = TIPO_COM[m.tipo] || { icono: "•", titulo: m.tipo };
          evs.push({ fecha: m.created_at, icono: meta.icono, titulo: meta.titulo, detalle: m.detalle, autor: m.autor });
        }
        // Llamadas reales (emparejadas por teléfono), con su grabación.
        for (const l of llamadas) {
          if (!tels.has(dig10(l.telefono))) continue;
          // Menos de 30 segundos = no contestaron. Cuenta como intento: se asienta
          // igual, pero no mueve el semáforo de seguimiento.
          const esIntento = (l.duracion ?? 0) < 30;
          evs.push({
            fecha: l.fecha,
            icono: esIntento ? "📵" : "📞",
            titulo: esIntento
              ? "Intento de llamada, no contestó"
              : (l.tipo === "saliente" ? "Llamada saliente" : "Llamada entrante"),
            detalle: l.motivo || l.nota,
            autor: l.registradoPor || l.responsable,
            link: l.grabacionUrl || null,
            linkTexto: "🎙️ Grabación",
          });
        }
        // Tareas (por fecha de creación).
        for (const t of tareas) {
          evs.push({
            fecha: t.createdAt,
            icono: ICONO_TAREA[t.tipo] || "✅",
            titulo: "Tarea: " + t.titulo + (t.estado === "hecha" ? " (hecha)" : ""),
            detalle: t.detalle,
            autor: t.autorNombre,
          });
        }
        // Boletines judiciales + actuaciones jurídicas.
        for (const a of actuaciones) {
          evs.push({
            fecha: a.fecha,
            icono: a.tipo === "boletin" ? "📰" : "⚖️",
            titulo: (a.tipo === "boletin" ? "Boletín: " : "Actuación: ") + a.titulo,
            detalle: a.detalle,
            autor: a.autor,
          });
        }
        evs.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
        if (vivo) setEventos(evs);
      })
      .catch(() => { if (vivo) setError(true); });
    return () => { vivo = false; };
  }, [cliente.id, cliente.telefono, cliente.telefono2]);

  if (error) return <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-10 text-center text-amber-800">No se pudo cargar la cronología.</div>;
  if (eventos === null) return <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-10 text-center text-humo">Armando la línea de tiempo…</div>;
  if (eventos.length === 0) return <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-10 text-center text-humo">Aún no hay actividad registrada para este cliente.</div>;

  return (
    <div>
      <div className="mb-3 text-xs">
        <span className="rounded-full bg-teal-soft px-2.5 py-0.5 font-semibold text-teal-dark">{eventos.length} evento{eventos.length === 1 ? "" : "s"} en total</span>
      </div>
      <ol className="relative ml-3 border-l-2 border-black/10">
        {eventos.map((e, i) => (
          <li key={i} className="relative ml-5 pb-4">
            <span className="absolute -left-[1.7rem] top-0 flex h-7 w-7 items-center justify-center rounded-full bg-white text-sm shadow ring-1 ring-black/5">{e.icono}</span>
            <div className="rounded-2xl border border-black/5 bg-white p-3 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-tinta">{e.titulo}</span>
                <span className="text-[13px] text-humo">{fechaLarga(e.fecha)}</span>
              </div>
              {e.detalle && <p className="mt-1 whitespace-pre-wrap text-[14px] text-tinta">{e.detalle}</p>}
              {(e.autor || e.link) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-3">
                  {e.autor && <span className="text-[13px] text-humo">{e.autor}</span>}
                  {e.link && <a href={e.link} target="_blank" rel="noreferrer" className="text-[13px] font-semibold text-teal underline">{e.linkTexto || "Abrir"}</a>}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
