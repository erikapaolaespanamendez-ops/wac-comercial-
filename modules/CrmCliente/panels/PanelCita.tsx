// ============================================================================
// Pestaña "Cita" del expediente — VALIDACIÓN PRESENCIAL
// ============================================================================
// Es la única puerta por la que se puede escribir en una ficha bloqueada.
// No hay botón de "desbloquear": lo que se abre es una ventana, y solo se abre
// con el cliente parado enfrente.
//
// Tres momentos, en este orden:
//   1. La sucursal ABRE la cita (el cliente está presente).
//   2. Coteja documentos y datos. La ficha acepta cambios mientras tanto.
//   3. La sucursal CIERRA. Después el RAC VALIDA y vuelve el candado.
//
// El permiso de escribir en la ficha bloqueada NO lo da esta pantalla: lo da
// el disparador fn_bloqueo_clientes de la base, que revisa si hay una cita
// abierta. Aunque alguien llamara al API por fuera, sin cita no pasa.
// ============================================================================
import { useState, useEffect } from "react";
import { type Cliente } from "../../../data/clientes";
import {
  fetchCitaAbierta, fetchHistorialCitas, fetchCamposCotejo, fetchDocumentosRequeridos,
  abrirCita, cerrarCita, validarCita, documentoVigente,
  fetchCitaAgendada, fetchAgendaCliente, agendarCita, marcarNoSePresento,
  cuposDelMes, TOPE_CITAS_MES, fetchSucursales,
  type CitaValidacion, type CampoCotejo, type DocumentoRequerido, type CitaAgendada, type Sucursal,
} from "../../../data/cita";
import { fetchExpediente, guardarDoc, type DocExpediente } from "../../../data/expedienteDocs";
import { useMiRol, fechaCorta } from "../_compartido";

const ROLES_VALIDAN = ["RAC", "SRAC", "DGE", "Super_Admin"];

export default function PanelCita({ cliente }: { cliente: Cliente }) {
  const miRol = useMiRol();
  const [cita, setCita] = useState<CitaValidacion | null>(null);
  const [historial, setHistorial] = useState<CitaValidacion[]>([]);
  const [campos, setCampos] = useState<CampoCotejo[]>([]);
  const [requeridos, setRequeridos] = useState<DocumentoRequerido[]>([]);
  const [docs, setDocs] = useState<DocExpediente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cotejados, setCotejados] = useState<Record<string, boolean>>({});
  const [observaciones, setObservaciones] = useState("");
  const [agendada, setAgendada] = useState<CitaAgendada | null>(null);
  const [agenda, setAgenda] = useState<CitaAgendada[]>([]);
  const [cupos, setCupos] = useState<{ usados: number; libres: number }>({ usados: 0, libres: TOPE_CITAS_MES });
  const [fFecha, setFFecha] = useState("");
  const [fHora, setFHora] = useState("10:00");
  const [fSucursal, setFSucursal] = useState(cliente.sucursal || "");
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);

  const puedeValidar = miRol != null && ROLES_VALIDAN.includes(miRol);

  async function recargar() {
    const cid = String(cliente.id);
    const [c, h, ca, rq, dc, ag, hg] = await Promise.all([
      fetchCitaAbierta(cid), fetchHistorialCitas(cid),
      fetchCamposCotejo(), fetchDocumentosRequeridos(), fetchExpediente(cid),
      fetchCitaAgendada(cid), fetchAgendaCliente(cid),
    ]);
    const suc = await fetchSucursales();
    setSucursales(suc);
    // Se propone la sucursal del cliente; si no tiene, la primera del catálogo.
    setFSucursal((prev) => prev || cliente.sucursal || suc[0]?.nombre || "");
    setCita(c); setHistorial(h); setCampos(ca); setRequeridos(rq); setDocs(dc);
    setAgendada(ag); setAgenda(hg);
    setCupos(await cuposDelMes(fFecha ? fFecha + "T12:00:00" : new Date().toISOString()));
    setCargando(false);
  }

  useEffect(() => { recargar(); /* eslint-disable-next-line */ }, [cliente.id]);

  // Busca el documento del expediente que corresponde a una clave del catálogo.
  function docDe(clave: string): DocExpediente | undefined {
    return docs.find((d) => d.clave === clave);
  }

  // Un documento está listo cuando existe, se cotejó contra el original y,
  // si su catálogo pide vigencia, la fecha de expedición está dentro del plazo.
  function estadoDoc(r: DocumentoRequerido): { ok: boolean; texto: string; tono: string } {
    const d = docDe(r.clave);
    if (!d || d.archivos.length === 0) return { ok: false, texto: "No lo ha entregado", tono: "rose" };
    if (!d.cotejadoOriginal) return { ok: false, texto: "Falta cotejar contra el original", tono: "amber" };
    const vig = documentoVigente(d.fechaExpedicion, r.mesesVigencia);
    if (vig === null) return { ok: false, texto: "Falta la fecha de expedición", tono: "amber" };
    if (vig === false) return { ok: false, texto: `Vencido · pasa de ${r.mesesVigencia} meses`, tono: "rose" };
    return { ok: true, texto: d.fechaExpedicion ? "Cotejado · " + fechaCorta(d.fechaExpedicion) : "Cotejado", tono: "emerald" };
  }

  const obligatorios = requeridos.filter((r) => r.obligatorio);
  const documentosOk = obligatorios.every((r) => estadoDoc(r).ok);
  const camposOk = campos.filter((c) => c.obligatorio).every((c) => cotejados[c.clave]);

  // La lista de documentos que se le dicta al cliente por teléfono.
  function listaDocumentos(): string {
    return requeridos.map((r) => {
      const vig = r.mesesVigencia != null ? ` (máximo ${r.mesesVigencia} meses de antigüedad)` : "";
      return (r.obligatorio ? "• " : "• Si tiene: ") + r.etiqueta + vig;
    }).join("\n");
  }

  async function onAgendar() {
    if (!fFecha) { setAviso("Falta el día de la cita."); return; }
    setOcupado(true); setAviso(null);
    const r = await agendarCita({
      clienteId: cliente.id,
      fechaHora: new Date(fFecha + "T" + fHora + ":00").toISOString(),
      sucursal: fSucursal,
      quien: miRol || "Atención",
      documentosDictados: listaDocumentos(),
    });
    setAviso(r.ok ? "Cita agendada. Se le dictaron los documentos al cliente." : (r.error || "No se pudo agendar."));
    await recargar();
    setOcupado(false);
  }

  async function onNoLlego() {
    if (!agendada) return;
    setOcupado(true);
    const ok = await marcarNoSePresento(agendada.id, miRol || "Sucursal");
    setAviso(ok ? "Asentado: no se presentó. El cupo quedó libre y su turno no se pierde." : "No se pudo guardar.");
    await recargar();
    setOcupado(false);
  }

  async function onAbrir() {
    setOcupado(true); setAviso(null);
    const r = await abrirCita({ clienteId: cliente.id, quien: miRol || "Sucursal", agendaId: agendada?.id ?? null });
    if (!r.ok) setAviso(r.error || "No se pudo abrir la cita.");
    else { setAviso("Cita abierta. La ficha acepta cambios mientras esté abierta."); await recargar(); }
    setOcupado(false);
  }

  async function onMarcarDoc(clave: string, valor: boolean) {
    setOcupado(true);
    await guardarDoc(String(cliente.id), clave, {
      cotejadoOriginal: valor,
      cotejadoPor: valor ? (miRol || "Sucursal") : null,
      cotejadoEn: valor ? new Date().toISOString() : null,
    });
    await recargar();
    setOcupado(false);
  }

  async function onFechaDoc(clave: string, fecha: string) {
    setOcupado(true);
    await guardarDoc(String(cliente.id), clave, { fechaExpedicion: fecha || null });
    await recargar();
    setOcupado(false);
  }

  async function onCerrar() {
    if (!cita) return;
    if (!documentosOk) { setAviso("Faltan documentos obligatorios por cotejar o están vencidos."); return; }
    if (!camposOk) { setAviso("Faltan datos por marcar como cotejados."); return; }
    setOcupado(true); setAviso(null);
    const ok = await cerrarCita({
      citaId: cita.id, clienteId: cliente.id, quien: miRol || "Sucursal",
      documentosOk: true, observaciones: observaciones.trim() || undefined,
    });
    setAviso(ok ? "Cita cerrada. Queda pendiente que el RAC la valide." : "No se pudo cerrar la cita.");
    await recargar();
    setOcupado(false);
  }

  async function onValidar(c: CitaValidacion) {
    setOcupado(true); setAviso(null);
    const ok = await validarCita({ citaId: c.id, clienteId: cliente.id, quien: miRol || "RAC" });
    setAviso(ok ? "Datos validados. La ficha quedó bloqueada de nuevo." : "No se pudo validar.");
    await recargar();
    setOcupado(false);
  }

  if (cargando) return <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-10 text-center text-humo">Cargando la cita…</div>;

  const porValidar = historial.find((h) => h.cerradaEn && !h.validadaEn);

  return (
    <div className="space-y-4">
      {aviso && (
        <div className="rounded-xl border border-teal/30 bg-teal-soft/40 px-3 py-2 text-[14px] text-teal-dark">{aviso}</div>
      )}

      {/* ---------- Agenda ---------- */}
      {!cita && (
        <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-tinta">Agendar la cita de validación</h3>
            <span className={"rounded-full px-2.5 py-0.5 text-[13px] font-semibold " +
              (cupos.libres > 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800")}>
              {cupos.usados} de {TOPE_CITAS_MES} cupos usados este mes
            </span>
          </div>

          {agendada ? (
            <div className="mt-3 rounded-xl border border-teal/30 bg-teal-soft/40 p-3">
              <p className="text-[14px] font-semibold text-teal-dark">
                📅 Cita el {new Date(agendada.fechaHora).toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" })} · {agendada.sucursal}
              </p>
              <p className="mt-1 text-[13px] text-humo">Agendó: {agendada.agendadaPor}</p>
              {agendada.documentosDictados && (
                <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-white/70 px-2.5 py-2 text-[13px] text-tinta">{agendada.documentosDictados}</pre>
              )}
              <button onClick={onNoLlego} disabled={ocupado}
                className="mt-2 rounded-lg border border-black/10 px-2.5 py-1 text-[13px] font-semibold text-humo hover:bg-nube disabled:opacity-50">
                No se presentó
              </button>
            </div>
          ) : (
            <>
              <p className="mt-1 text-[13.5px] text-humo">
                Cuando el cliente llame: dile qué documentos traer y apártale día, hora y sucursal.
              </p>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="text-[13px] text-humo">Día<br />
                  <input type="date" value={fFecha} onChange={(e) => setFFecha(e.target.value)}
                    className="mt-0.5 rounded-lg border border-black/10 px-2 py-1 text-[14px]" /></label>
                <label className="text-[13px] text-humo">Hora<br />
                  <input type="time" value={fHora} onChange={(e) => setFHora(e.target.value)}
                    className="mt-0.5 rounded-lg border border-black/10 px-2 py-1 text-[14px]" /></label>
                <label className="text-[13px] text-humo">Sucursal<br />
                  <select value={fSucursal} onChange={(e) => setFSucursal(e.target.value)}
                    className="mt-0.5 rounded-lg border border-black/10 px-2 py-1 text-[14px]">
                    {sucursales.length === 0 && <option value="">Sin catálogo</option>}
                    {sucursales.map((s) => <option key={s.clave} value={s.nombre}>{s.nombre}</option>)}
                  </select></label>
                <button onClick={onAgendar} disabled={ocupado || cupos.libres === 0 || !fSucursal}
                  className="rounded-lg bg-teal px-3 py-1.5 text-[14px] font-semibold text-white disabled:opacity-50">
                  📅 Agendar
                </button>
              </div>
              {cupos.libres === 0 && (
                <p className="mt-2 text-[13px] text-rose-800">
                  Ya no hay cupo este mes. El cliente pasa a la lista del siguiente, sin perder su turno en la fila.
                </p>
              )}
              <details className="mt-3">
                <summary className="cursor-pointer text-[13.5px] font-semibold text-teal">Ver la lista que se le dicta</summary>
                <pre className="mt-1.5 whitespace-pre-wrap rounded-lg bg-nube/40 px-2.5 py-2 text-[13px] text-tinta">{listaDocumentos()}</pre>
              </details>
            </>
          )}
        </div>
      )}

      {/* ---------- Estado del cliente ---------- */}
      <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {cliente.datosValidadosSucursal ? (
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[13px] font-semibold text-emerald-800">✓ Datos validados</span>
          ) : (
            <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[13px] font-semibold text-rose-800">✕ Sin validar</span>
          )}
          {cliente.bloqueado && <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-[13px] font-semibold text-purple-800">🔒 Ficha bloqueada</span>}
          {cita && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[13px] font-semibold text-amber-800">🚪 Cita abierta desde {fechaCorta(cita.abiertaEn)}</span>}
        </div>
        <p className="mt-2 text-[14px] text-humo">
          {cita
            ? "La ventana está abierta: la ficha acepta cambios. Al cerrarla vuelve el candado."
            : "El cliente debe presentarse en sucursal con sus documentos. Sin cita abierta, la ficha no se puede modificar."}
        </p>
        {!cita && (
          <button onClick={onAbrir} disabled={ocupado}
            className="mt-3 rounded-lg bg-teal px-3 py-1.5 text-[14px] font-semibold text-white disabled:opacity-50">
            🚪 {agendada ? "El cliente llegó — abrir la ventana" : "Abrir sin cita previa (llegó de imprevisto)"}
          </button>
        )}
      </div>

      {/* ---------- Documentos ---------- */}
      <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-tinta">Documentos que trae el cliente</h3>
        <div className="mt-3 space-y-2">
          {requeridos.map((r) => {
            const d = docDe(r.clave);
            const st = estadoDoc(r);
            return (
              <div key={r.clave} className="rounded-xl border border-black/5 bg-nube/30 p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-semibold text-tinta">{r.etiqueta}</span>
                  {r.obligatorio
                    ? <span className="rounded-full bg-nube px-2 py-0.5 text-[12px] font-semibold text-humo">Obligatorio</span>
                    : <span className="rounded-full bg-nube px-2 py-0.5 text-[12px] text-humo">Si tiene</span>}
                  {r.mesesVigencia != null && <span className="rounded-full bg-nube px-2 py-0.5 text-[12px] text-humo">Máx. {r.mesesVigencia} meses</span>}
                  <span className={"rounded-full px-2 py-0.5 text-[12.5px] font-semibold " +
                    (st.tono === "emerald" ? "bg-emerald-100 text-emerald-800"
                      : st.tono === "amber" ? "bg-amber-100 text-amber-800"
                      : "bg-rose-100 text-rose-800")}>{st.texto}</span>
                </div>
                {cita && d && d.archivos.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    {r.mesesVigencia != null && (
                      <label className="flex items-center gap-1.5 text-[13px] text-humo">
                        Expedido el
                        <input type="date" value={d.fechaExpedicion || ""} disabled={ocupado}
                          onChange={(e) => onFechaDoc(r.clave, e.target.value)}
                          className="rounded-lg border border-black/10 px-2 py-1 text-[13px]" />
                      </label>
                    )}
                    <label className="flex items-center gap-1.5 text-[13px] font-semibold text-tinta">
                      <input type="checkbox" checked={d.cotejadoOriginal} disabled={ocupado}
                        onChange={(e) => onMarcarDoc(r.clave, e.target.checked)} />
                      Vi el original
                    </label>
                    {d.cotejadoPor && <span className="text-[12.5px] text-humo">Cotejó: {d.cotejadoPor}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ---------- Datos a cotejar ---------- */}
      {cita && (
        <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-tinta">Datos que se cotejan contra los documentos</h3>
          <p className="mt-1 text-[13px] text-humo">Corrige el dato en la Ficha técnica y luego márcalo aquí.</p>
          {["identidad", "dinero"].map((g) => (
            <div key={g} className="mt-3">
              <p className="text-[13px] font-semibold uppercase tracking-wide text-humo">{g === "identidad" ? "Identidad" : "Dinero"}</p>
              <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                {campos.filter((c) => c.grupo === g).map((c) => (
                  <label key={c.clave} className="flex items-center gap-2 rounded-lg border border-black/5 bg-nube/30 px-2.5 py-1.5 text-[14px] text-tinta">
                    <input type="checkbox" checked={!!cotejados[c.clave]}
                      onChange={(e) => setCotejados((p) => ({ ...p, [c.clave]: e.target.checked }))} />
                    {c.etiqueta}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Observaciones de la cita (opcional)"
            className="mt-3 w-full rounded-xl border border-black/10 px-3 py-2 text-[14px]" rows={2} />
          <button onClick={onCerrar} disabled={ocupado}
            className="mt-3 rounded-lg bg-teal px-3 py-1.5 text-[14px] font-semibold text-white disabled:opacity-50">
            ✓ Cerrar la cita
          </button>
          {(!documentosOk || !camposOk) && (
            <p className="mt-2 text-[13px] text-amber-800">
              {!documentosOk ? "Faltan documentos obligatorios. " : ""}
              {!camposOk ? "Faltan datos por marcar." : ""}
            </p>
          )}
        </div>
      )}

      {/* ---------- Validación del RAC ---------- */}
      {porValidar && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="text-sm font-semibold text-amber-900">Pendiente de validar por el RAC</h3>
          <p className="mt-1 text-[14px] text-amber-800">
            La sucursal cerró la cita el {fechaCorta(porValidar.cerradaEn || "")} ({porValidar.cerradaPor}).
            Al validar, la ficha queda bloqueada sobre datos ya verificados.
          </p>
          {puedeValidar ? (
            <button onClick={() => onValidar(porValidar)} disabled={ocupado}
              className="mt-3 rounded-lg bg-amber-700 px-3 py-1.5 text-[14px] font-semibold text-white disabled:opacity-50">
              🔒 Validar y cerrar el candado
            </button>
          ) : (
            <p className="mt-2 text-[13px] text-amber-800">Solo el RAC puede validar.</p>
          )}
        </div>
      )}

      {/* ---------- Historial de agenda ---------- */}
      {agenda.length > 0 && (
        <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-tinta">Citas agendadas</h3>
          <ul className="mt-2 space-y-1.5">
            {agenda.map((a) => (
              <li key={a.id} className="text-[13.5px] text-humo">
                {new Date(a.fechaHora).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })} · {a.sucursal} · <b>{a.estado.replace(/_/g, " ")}</b> · agendó {a.agendadaPor}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ---------- Historial ---------- */}
      {historial.length > 0 && (
        <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-tinta">Citas anteriores</h3>
          <ul className="mt-2 space-y-1.5">
            {historial.map((h) => (
              <li key={h.id} className="text-[13.5px] text-humo">
                {fechaCorta(h.abiertaEn)} · abrió {h.abiertaPor}
                {h.cerradaEn ? ` · cerró ${h.cerradaPor}` : " · sin cerrar"}
                {h.validadaEn ? ` · validó ${h.validadaPor}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
