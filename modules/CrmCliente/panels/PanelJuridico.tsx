// Pestaña "Jurídico" del expediente: muestra en vivo las garantías/casos
// de este cliente en JusticiaFácil (URRJ, UCP, UCM, UFC). Solo lectura.
import { useEffect, useState } from "react";
import { type Cliente } from "../../../data/clientes";
import { garantiasJF, documentosFijosJF, visitasJuzgadoJF, movimientosJF, type GarantiaJF, type DocumentoFijoJF, type VisitaJuzgadoJF, type MovimientoJF } from "../../../lib/justiciaFacil";

const fmtMXN = (v: number | null) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(Number(v) || 0);
const fmtFechaCorta = (s: string | null) => {
  if (!s) return "—";
  const m = String(s).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s;
  return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
};

function VisitasJuzgado({ casoId }: { casoId: string }) {
  const [visitas, setVisitas] = useState<VisitaJuzgadoJF[] | null>(null);

  useEffect(() => {
    let vivo = true;
    visitasJuzgadoJF(casoId).then((v) => { if (vivo) setVisitas(v); });
    return () => { vivo = false; };
  }, [casoId]);

  if (visitas === null || visitas.length === 0) return null;

  return (
    <div className="mt-2 border-t border-black/5 pt-2">
      <p className="mb-1 text-[12px] font-semibold text-humo">🏛️ Visitas al juzgado ({visitas.length})</p>
      <div className="space-y-1.5">
        {visitas.map((v) => (
          <div key={v.id} className="rounded-md bg-nube px-2 py-1.5 text-[12px] text-tinta">
            <span className="font-semibold">{fmtFechaCorta(v.fecha_visita)}</span>
            {v.realizado_por ? <span className="text-humo"> · {v.realizado_por}</span> : null}
            {v.motivo ? <p className="mt-0.5 text-humo">{v.motivo}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function MovimientosDeCaso({ casoId }: { casoId: string }) {
  const [movs, setMovs] = useState<MovimientoJF[] | null>(null);

  useEffect(() => {
    let vivo = true;
    movimientosJF(casoId).then((m) => { if (vivo) setMovs(m); });
    return () => { vivo = false; };
  }, [casoId]);

  if (movs === null || movs.length === 0) return null;

  return (
    <div className="mt-2 border-t border-black/5 pt-2">
      <p className="mb-1 text-[12px] font-semibold text-humo">📝 Notas y movimientos ({movs.length})</p>
      <div className="space-y-1.5">
        {movs.map((m) => (
          <div key={m.id} className="rounded-md bg-nube px-2 py-1.5 text-[12px] text-tinta">
            <p>{m.nota || "—"}</p>
            {m.drive_copia?.nombre && <p className="mt-0.5 text-humo">📎 {m.drive_copia.nombre}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function DocumentosDeCaso({ casoId }: { casoId: string }) {
  const [docs, setDocs] = useState<DocumentoFijoJF[] | null>(null);

  useEffect(() => {
    let vivo = true;
    documentosFijosJF(casoId).then((d) => { if (vivo) setDocs(d); });
    return () => { vivo = false; };
  }, [casoId]);

  if (docs === null) return <p className="mt-2 text-[12px] text-humo">Buscando documentos…</p>;
  if (docs.length === 0) return <p className="mt-2 text-[12px] text-humo">Sin documentos copiados todavía en JusticiaFácil.</p>;

  return (
    <div className="mt-2 border-t border-black/5 pt-2">
      <p className="mb-1 text-[12px] font-semibold text-humo">📎 Documentos ({docs.length})</p>
      <div className="flex flex-wrap gap-1.5">
        {docs.map((d) => (
          <span key={d.drive_id} className="inline-flex items-center gap-1 rounded-md bg-nube px-2 py-1 text-[12px] text-tinta" title={d.nombre || ""}>
            📄 {(d.nombre || "documento").length > 28 ? (d.nombre || "").slice(0, 28) + "…" : d.nombre}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function PanelJuridico({ cliente }: { cliente: Cliente }) {
  const [cargando, setCargando] = useState(true);
  const [garantias, setGarantias] = useState<GarantiaJF[]>([]);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    garantiasJF(cliente.nombre, cliente.id)
      .then((g) => { if (vivo) setGarantias(g); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [cliente.nombre, cliente.id]);

  if (cargando) {
    return <p className="p-6 text-center text-sm text-humo">Buscando en JusticiaFácil…</p>;
  }

  if (garantias.length === 0) {
    return (
      <div className="rounded-2xl border border-black/5 bg-white p-6 text-center text-sm text-humo">
        Este cliente no tiene garantías vinculadas en JusticiaFácil.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[13px] font-semibold text-emerald-700">🟢 conectado con JusticiaFácil</span>
        <span className="text-[13px] text-humo">{garantias.length} garantía{garantias.length === 1 ? "" : "s"}</span>
      </div>

      {garantias.map((g) => {
        const cj = g.caso_juridico;
        return (
          <div key={g.id} className="rounded-2xl border border-black/5 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-tinta">{cj?.unidad || "Sin unidad"} {cj?.expediente ? `· Expediente ${cj.expediente}` : ""}</p>
                <p className="text-[13px] text-humo">{cj?.entidad || "—"} {cj?.juzgado ? `· ${cj.juzgado}` : ""}</p>
              </div>
              <div className="flex items-center gap-1.5">
                {cj?.bloqueado && (
                  <span
                    className="rounded-full bg-emerald-100 px-2 py-0.5 text-[12px] font-semibold text-emerald-700"
                    title={`Validado por ${cj.bloqueado_por ?? "—"}${cj.bloqueado_en ? " el " + fmtFechaCorta(cj.bloqueado_en) : ""}. Solo lectura: se puede agregar, no editar ni borrar.`}
                  >
                    🔒 Validado
                  </span>
                )}
                {cj?.archivado && <span className="rounded-full bg-nube px-2 py-0.5 text-[12px] font-semibold text-humo">Archivado</span>}
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-4">
              <div><span className="text-humo">Etapa actual</span><p className="font-semibold">{cj?.etapa_actual || "—"}</p></div>
              <div><span className="text-humo">Estatus general</span><p className="font-semibold">{cj?.estatus_general || "—"}</p></div>
              <div><span className="text-humo">Folio</span><p className="font-semibold">{g.folio || "—"}</p></div>
              <div><span className="text-humo">Saldo</span><p className="font-semibold text-teal-dark">{fmtMXN(g.saldo)}</p></div>
            </div>
            {g.formalizacion_solicitada && (
              <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-[12px] font-semibold text-blue-700">✔ Formalización solicitada</p>
            )}
            {g.observaciones && (
              <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-[12px] text-amber-900">
                <p className="mb-0.5 font-semibold">📋 {g.estado || "Nota"}</p>
                <p>{g.observaciones}</p>
              </div>
            )}
            {cj?.id && <DocumentosDeCaso casoId={cj.id} />}
            {cj?.id && <MovimientosDeCaso casoId={cj.id} />}
            {cj?.id && <VisitasJuzgado casoId={cj.id} />}
          </div>
        );
      })}
    </div>
  );
}
