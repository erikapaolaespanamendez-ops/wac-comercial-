// Pestaña "Convenio" del expediente del cliente.
//
// El ciclo de vida completo de la devolución (solicitud, validación, generar
// convenio, firma) sigue viviendo en Control de Devoluciones. Esta pestaña
// muestra el resumen y, desde el 01-sep-2026, TAMBIÉN PERMITE REGISTRAR
// ABONOS — porque el abono llega por teléfono o por correo y quien lo recibe
// está en esta pantalla, no en la otra.
//
// No hay dos almacenes: los abonos que se capturen aquí van a la MISMA tabla
// `abonos_devolucion` que lee Control de Devoluciones, así que el saldo se
// actualiza en las dos pantallas al instante.
//
// PERMISOS (definidos por la DGE):
//   · REGISTRAR abono y subir evidencia → ATC, SRAC, RAC, DGE
//   · EDITAR y BORRAR abono             → SOLO RAC y DGE
//
// El bloque viejo de "Convenio" (monto total/plazo/inicio, tabla
// `convenio_devolucion`) quedó DEPRECADO — confirmado por Erika que ya no se
// usa desde que existe el sistema RDC.
import { useEffect, useState } from "react";
import { type Cliente } from "../../../data/clientes";
import {
  fetchAbonos, agregarAbono, editarAbono, borrarAbono, actualizarEvidenciasAbono,
  type Abono, type TipoAbono, type EvidenciaArchivo,
} from "../../../data/convenioDevolucion";
import { fetchContingencia, etiqueta, QUIEN_DEMANDA, TIPOS_DEMANDA } from "../../../data/contingencia";
import { imprimirHTML, escHtml } from "../../../lib/exportar";
import { irADevolucion } from "../../../lib/navegarDevolucion";
import { obtenerRdcCliente, calcularRDC, type RdcDevolucion } from "../../../data/rdc";
import { puedeAccion } from "../../../data/roles";
import { subirArchivo } from "../../../data/chat";
import { useMiRol, fechaCorta } from "../_compartido";

import { hayParametros } from "../../../data/parametrosDevolucion";
import AvisoParametros from "../../../components/AvisoParametros";
function money(n: number): string {
  return "$" + Math.round(n || 0).toLocaleString("es-MX");
}

export default function PanelConvenio({ cliente }: { cliente: Cliente }) {
  // 👇 Sin parámetros no se calcula nada — ver parametrosDevolucion.ts
  if (!hayParametros()) return <AvisoParametros onListo={() => window.location.reload()} />;

  const [rdc, setRdc] = useState<RdcDevolucion | null>(null);
  const [abonos, setAbonos] = useState<Abono[]>([]);
  const [cargando, setCargando] = useState(true);
  const [exportando, setExportando] = useState(false);

  const miRol = useMiRol();
  // 👇 Los dos permisos son DISTINTOS a propósito: capturar un abono lo hace
  // quien lo recibe; corregirlo o quitarlo mueve el saldo del cliente y se
  // queda cerrado a RAC y Dirección.
  const puedeRegistrar = puedeAccion(miRol, "registrar_abono");
  const puedeEditar = puedeAccion(miRol, "editar_abono");
  const puedeBorrar = puedeAccion(miRol, "borrar_abono");

  // Alta de abono
  const [abriendoAlta, setAbriendoAlta] = useState(false);
  const [fechaNueva, setFechaNueva] = useState(new Date().toISOString().slice(0, 10));
  const [montoNuevo, setMontoNuevo] = useState("");
  const [tipoNuevo, setTipoNuevo] = useState<TipoAbono>("capital");
  const [notaNueva, setNotaNueva] = useState("");
  const [archivosNuevos, setArchivosNuevos] = useState<EvidenciaArchivo[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);

  // Edición en línea
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [edFecha, setEdFecha] = useState("");
  const [edMonto, setEdMonto] = useState("");
  const [edTipo, setEdTipo] = useState<TipoAbono>("capital");

  async function cargar() {
    setCargando(true);
    const [r, a] = await Promise.all([obtenerRdcCliente(cliente.id), fetchAbonos(String(cliente.id))]);
    setRdc(r); setAbonos(a); setCargando(false);
  }

  useEffect(() => { cargar(); }, [cliente.id]);

  async function subirEvidencia(file: File | null | undefined, destino: "alta" | string) {
    if (!file) return;
    setSubiendo(true);
    try {
      const res = await subirArchivo(file);
      if (!res) { alert("No se pudo subir el archivo. Inténtalo de nuevo."); return; }
      const nuevo: EvidenciaArchivo = { nombre: res.nombre, link: res.url };
      if (destino === "alta") {
        setArchivosNuevos((prev) => [...prev, nuevo]);
      } else {
        const abono = abonos.find((a) => a.id === destino);
        const ok = await actualizarEvidenciasAbono(destino, [...(abono?.archivos || []), nuevo]);
        if (ok) await cargar(); else alert("No se pudo adjuntar el archivo al abono.");
      }
    } finally { setSubiendo(false); }
  }

  async function registrar() {
    const monto = Number(montoNuevo);
    if (!monto || monto <= 0 || !fechaNueva) { alert("Escribe una fecha y un monto válidos."); return; }
    setGuardando(true);
    try {
      const ok = await agregarAbono({
        clienteId: String(cliente.id), fecha: fechaNueva, monto, tipo: tipoNuevo,
        nota: notaNueva || undefined, registradoPor: miRol || "Sistema", archivos: archivosNuevos,
      });
      if (!ok) { alert("No se pudo registrar el abono."); return; }
      setMontoNuevo(""); setNotaNueva(""); setArchivosNuevos([]); setAbriendoAlta(false);
      await cargar();
    } finally { setGuardando(false); }
  }

  function abrirEdicion(a: Abono) {
    setEditandoId(a.id); setEdFecha(a.fecha); setEdMonto(String(a.monto)); setEdTipo(a.tipo || "capital");
  }

  async function guardarEdicion() {
    if (!editandoId) return;
    const monto = Number(edMonto);
    if (!monto || monto <= 0 || !edFecha) { alert("Escribe una fecha y un monto válidos."); return; }
    setGuardando(true);
    try {
      const ok = await editarAbono(editandoId, { fecha: edFecha, monto, tipo: edTipo }, miRol || "Sistema");
      if (!ok) { alert("No se pudo guardar la corrección."); return; }
      setEditandoId(null); await cargar();
    } finally { setGuardando(false); }
  }

  async function quitar(a: Abono) {
    // 👇 Borrar un abono SUBE el saldo del cliente. Se avisa con el monto a la vista.
    const ok = confirm(
      `¿Borrar el abono de ${money(a.monto)} del ${fechaCorta(a.fecha)}?\n\n` +
      `El saldo del cliente SUBIRÁ en ${money(a.monto)}. Esta acción no se puede deshacer.`,
    );
    if (!ok) return;
    const hecho = await borrarAbono(a.id);
    if (hecho) await cargar(); else alert("No se pudo borrar el abono.");
  }

  async function exportarFichaLegal() {
    setExportando(true);
    try {
      const cont = await fetchContingencia(String(cliente.id));
      const { capital, compensacionTerminacion, compensacionEspera, total } = calcularRDC(cliente, rdc, abonos);
      const pagado = abonos.reduce((s, a) => s + a.monto, 0);
      const restante = Math.max(total - pagado, 0);
      const evid = (arr: { nombre: string }[]) => (arr && arr.length ? arr.map((f) => escHtml(f.nombre)).join("<br>") : "—");

      const cab = "<h1>Ficha legal / financiera</h1><div class='sub'><b>" + escHtml(cliente.nombre) + "</b> · Código " + escHtml(cliente.codigo || "—") + " · Generado " + escHtml(new Date().toLocaleString("es-MX")) + "</div>";

      const datos = "<table>" +
        "<tr><td class='k'>Garantía</td><td>" + escHtml(cliente.garantia || cliente.direccionGarantia || "—") + "</td></tr>" +
        "<tr><td class='k'>Expediente</td><td>" + escHtml(cliente.expediente || "—") + "</td></tr>" +
        "<tr><td class='k'>Crédito SIGA</td><td>" + escHtml(cliente.creditoSiga || "—") + "</td></tr>" +
        "<tr><td class='k'>Asesor</td><td>" + escHtml(cliente.asesorAsignado || "—") + "</td></tr>" +
        "</table>";

      let cHtml = "<h2>Contingencia / Demanda</h2>";
      if (cont && cont.tieneDemanda) {
        cHtml += "<table>" +
          "<tr><td class='k'>¿Quién demanda?</td><td>" + escHtml(etiqueta(QUIEN_DEMANDA, cont.quienDemanda)) + "</td></tr>" +
          "<tr><td class='k'>Tipo</td><td>" + escHtml(etiqueta(TIPOS_DEMANDA, cont.tipo)) + "</td></tr>" +
          "<tr><td class='k'>Abogado</td><td>" + escHtml(cont.abogado || "—") + "</td></tr>" +
          "<tr><td class='k'>Etapa</td><td>" + escHtml(cont.etapa || "—") + "</td></tr>" +
          "<tr><td class='k'>Nota</td><td>" + escHtml(cont.nota || "—") + "</td></tr>" +
          "</table>";
      } else { cHtml += "<p class='muted'>Sin contingencia registrada.</p>"; }

      let vHtml = "<h2>Devolución Compensada (RDC)</h2>";
      if (rdc?.folio) {
        vHtml += "<table>" +
          "<tr><td class='k'>Folio</td><td>" + escHtml(rdc.folio) + "</td></tr>" +
          "<tr><td class='k'>Capital</td><td>" + escHtml(money(capital)) + "</td></tr>" +
          "<tr><td class='k'>Compensación por terminación</td><td>" + escHtml(money(compensacionTerminacion)) + "</td></tr>" +
          "<tr><td class='k'>Compensación por espera (a la fecha)</td><td>" + escHtml(money(compensacionEspera)) + "</td></tr>" +
          "<tr><td class='k'>Total</td><td>" + escHtml(money(total)) + "</td></tr>" +
          "<tr><td class='k'>Abonado</td><td>" + escHtml(money(pagado)) + "</td></tr>" +
          "<tr><td class='k'>Restante</td><td>" + escHtml(money(restante)) + "</td></tr>" +
          "</table>";
        vHtml += "<h2>Abonos (" + abonos.length + ")</h2>";
        vHtml += abonos.length
          ? "<table><thead><tr><th>Fecha</th><th class='num'>Monto</th><th>Nota</th><th>Evidencia</th></tr></thead><tbody>" +
              abonos.map((a) => "<tr><td>" + escHtml(fechaCorta(a.fecha)) + "</td><td class='num'>" + escHtml(money(a.monto)) + "</td><td>" + escHtml(a.nota || "—") + "</td><td>" + evid(a.archivos) + "</td></tr>").join("") +
              "<tr><td class='k'>TOTAL</td><td class='num'><b>" + escHtml(money(pagado)) + "</b></td><td></td><td></td></tr></tbody></table>"
          : "<p class='muted'>Sin abonos.</p>";
      } else { vHtml += "<p class='muted'>Sin proceso de devolución registrado.</p>"; }

      imprimirHTML("Ficha legal - " + cliente.nombre, cab + datos + cHtml + vHtml);
    } finally {
      setExportando(false);
    }
  }

  const { capital, compensacionTerminacion, compensacionEspera, total } = calcularRDC(cliente, rdc, abonos);
  const pagado = abonos.reduce((s, a) => s + a.monto, 0);
  const restante = Math.max(total - pagado, 0);

  return (
    <div className="space-y-3">

      {/* Resumen — el proceso completo (solicitud, validación, firma) vive en Control de Devoluciones */}
      <div className="rounded-2xl border border-teal/30 bg-teal-soft/20 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-[14px] font-extrabold text-tinta">💰 Devolución Compensada (RDC)</h3>
          <button onClick={() => irADevolucion(cliente)} className="rounded-lg bg-teal px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-teal-dark">
            Ver proceso de devolución →
          </button>
        </div>

        {cargando ? (
          <p className="text-[12.5px] text-humo">Cargando…</p>
        ) : !rdc ? (
          <p className="text-[12.5px] text-humo">Este cliente todavía no tiene un proceso de devolución iniciado.</p>
        ) : (
          <>
            <p className="mb-2 text-[12px] text-humo">{rdc.folio || "Sin folio todavía"} · {rdc.estado}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg bg-white p-2.5">
                <p className="text-[10.5px] text-humo">Capital</p>
                <p className="text-[13px] font-semibold text-tinta">{money(capital)}</p>
              </div>
              <div className="rounded-lg bg-white p-2.5">
                <p className="text-[10.5px] text-humo">Compensación</p>
                <p className="text-[13px] font-semibold text-tinta">{money(compensacionTerminacion + compensacionEspera)}</p>
              </div>
              <div className="rounded-lg bg-emerald-50 p-2.5">
                <p className="text-[10.5px] text-emerald-700">Abonado</p>
                <p className="text-[13px] font-semibold text-emerald-800">{money(pagado)}</p>
              </div>
              <div className="rounded-lg bg-amber-50 p-2.5">
                <p className="text-[10.5px] text-amber-700">Restante</p>
                <p className="text-[13px] font-semibold text-amber-800">{money(restante)}</p>
              </div>
            </div>

            {/* 👇 Aclaración pedida por la DGE: que nadie piense que el capital
                está mal porque no baja con cada abono. */}
            <p className="mt-2 rounded-lg bg-white/70 px-2.5 py-2 text-[11.5px] leading-snug text-humo">
              <b className="text-tinta">El capital no baja con los abonos, y así debe ser.</b>{" "}
              El capital es <b>lo que se le reconoció al cliente</b> cuando se pactó la devolución, y se
              queda fijo como referencia de cuánto se le debía en un principio. Lo que baja con cada
              abono es el <b>Restante</b>. La <b>Compensación</b> sí se recalcula: cada año se cobra
              sobre el capital que quedaba pendiente en esa fecha, así que mientras más pronto se le
              abona, menos compensación se genera.
            </p>
          </>
        )}
      </div>

      {/* ── ABONOS ─────────────────────────────────────────────────────────── */}
      {!cargando && rdc && (
        <div className="rounded-2xl border border-black/10 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-[13.5px] font-extrabold text-tinta">🧾 Abonos registrados</h3>
              <p className="text-[11px] text-humo">
                Se guardan en el mismo lugar que Control de Devoluciones: lo que captures aquí se ve allá al instante.
              </p>
            </div>
            {puedeRegistrar && !abriendoAlta && (
              <button onClick={() => setAbriendoAlta(true)} className="rounded-lg bg-teal px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-teal-dark">
                ➕ Registrar abono
              </button>
            )}
          </div>

          {/* Alta */}
          {puedeRegistrar && abriendoAlta && (
            <div className="mb-3 rounded-xl border border-teal/30 bg-teal-soft/10 p-3">
              <div className="grid gap-2 sm:grid-cols-4">
                <div>
                  <label className="mb-1 block text-[10.5px] font-semibold uppercase text-humo">Fecha del abono</label>
                  <input type="date" value={fechaNueva} onChange={(e) => setFechaNueva(e.target.value)}
                    className="w-full rounded-lg border border-black/10 px-2 py-1.5 text-[12.5px]" />
                </div>
                <div>
                  <label className="mb-1 block text-[10.5px] font-semibold uppercase text-humo">Monto</label>
                  <input type="number" min="0" step="0.01" value={montoNuevo} onChange={(e) => setMontoNuevo(e.target.value)}
                    placeholder="0.00" className="w-full rounded-lg border border-black/10 px-2 py-1.5 text-[12.5px]" />
                </div>
                <div>
                  <label className="mb-1 block text-[10.5px] font-semibold uppercase text-humo">Tipo</label>
                  <select value={tipoNuevo} onChange={(e) => setTipoNuevo(e.target.value as TipoAbono)}
                    className="w-full rounded-lg border border-black/10 px-2 py-1.5 text-[12.5px]">
                    <option value="capital">Capital</option>
                    <option value="compensacion">Compensación</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[10.5px] font-semibold uppercase text-humo">Comprobante</label>
                  <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-teal/50 bg-white px-2 py-1.5 text-[12px] font-semibold text-teal hover:bg-teal-soft/30">
                    {subiendo ? "Subiendo…" : "📎 Subir archivo"}
                    <input type="file" className="hidden" disabled={subiendo}
                      onChange={(e) => { subirEvidencia(e.target.files?.[0], "alta"); e.currentTarget.value = ""; }} />
                  </label>
                </div>
              </div>

              <div className="mt-2">
                <label className="mb-1 block text-[10.5px] font-semibold uppercase text-humo">Nota (opcional)</label>
                <input value={notaNueva} onChange={(e) => setNotaNueva(e.target.value)}
                  placeholder="Ej. transferencia SPEI, clave de rastreo…"
                  className="w-full rounded-lg border border-black/10 px-2 py-1.5 text-[12.5px]" />
              </div>

              {archivosNuevos.length > 0 && (
                <p className="mt-2 text-[11.5px] text-emerald-700">
                  📎 {archivosNuevos.length} archivo(s) listo(s): {archivosNuevos.map((f) => f.nombre).join(", ")}
                </p>
              )}

              <div className="mt-3 flex items-center justify-end gap-2">
                <button onClick={() => { setAbriendoAlta(false); setArchivosNuevos([]); setMontoNuevo(""); setNotaNueva(""); }}
                  className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-[12px] font-semibold text-tinta hover:bg-nube">
                  Cancelar
                </button>
                <button onClick={registrar} disabled={guardando || subiendo}
                  className="rounded-lg bg-teal px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-teal-dark disabled:opacity-50">
                  {guardando ? "Guardando…" : "✅ Guardar abono"}
                </button>
              </div>
            </div>
          )}

          {/* Historial */}
          {abonos.length === 0 ? (
            <p className="text-[12.5px] text-humo">Todavía no se le ha registrado ningún abono.</p>
          ) : (
            <div className="space-y-1.5">
              {abonos.map((a) => (
                <div key={a.id} className="rounded-xl border border-black/10 bg-nube/40 p-2.5">
                  {editandoId === a.id ? (
                    <div className="grid gap-2 sm:grid-cols-4">
                      <input type="date" value={edFecha} onChange={(e) => setEdFecha(e.target.value)}
                        className="rounded-lg border border-black/10 px-2 py-1.5 text-[12.5px]" />
                      <input type="number" min="0" step="0.01" value={edMonto} onChange={(e) => setEdMonto(e.target.value)}
                        className="rounded-lg border border-black/10 px-2 py-1.5 text-[12.5px]" />
                      <select value={edTipo} onChange={(e) => setEdTipo(e.target.value as TipoAbono)}
                        className="rounded-lg border border-black/10 px-2 py-1.5 text-[12.5px]">
                        <option value="capital">Capital</option>
                        <option value="compensacion">Compensación</option>
                      </select>
                      <div className="flex items-center gap-1.5">
                        <button onClick={guardarEdicion} disabled={guardando}
                          className="flex-1 rounded-lg bg-teal px-2 py-1.5 text-[12px] font-semibold text-white hover:bg-teal-dark disabled:opacity-50">
                          Guardar
                        </button>
                        <button onClick={() => setEditandoId(null)}
                          className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-[12px] font-semibold text-tinta hover:bg-nube">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-tinta">
                          {money(a.monto)}{" "}
                          <span className="text-[11px] font-normal text-humo">· {fechaCorta(a.fecha)} · {a.tipo || "capital"}</span>
                        </p>
                        <p className="truncate text-[11px] text-humo">
                          Registró: {a.registradoPor || "—"}
                          {a.nota ? " · " + a.nota : ""}
                        </p>
                        {(a.archivos || []).length > 0 && (
                          <p className="text-[11px] text-teal">
                            {(a.archivos || []).map((f, i) => (
                              <a key={i} href={f.link} target="_blank" rel="noreferrer" className="mr-2 underline">📎 {f.nombre}</a>
                            ))}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {puedeRegistrar && (
                          <label className="cursor-pointer rounded-lg border border-black/10 bg-white px-2 py-1 text-[11.5px] font-semibold text-tinta hover:bg-nube">
                            {subiendo ? "…" : "📎 Archivo"}
                            <input type="file" className="hidden" disabled={subiendo}
                              onChange={(e) => { subirEvidencia(e.target.files?.[0], a.id); e.currentTarget.value = ""; }} />
                          </label>
                        )}
                        {puedeEditar && (
                          <button onClick={() => abrirEdicion(a)}
                            className="rounded-lg border border-black/10 bg-white px-2 py-1 text-[11.5px] font-semibold text-tinta hover:bg-nube">
                            ✏️ Editar
                          </button>
                        )}
                        {puedeBorrar && (
                          <button onClick={() => quitar(a)}
                            className="rounded-lg border border-rose-200 bg-white px-2 py-1 text-[11.5px] font-semibold text-rose-600 hover:bg-rose-50">
                            🗑️ Eliminar
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 👇 Que quede claro en pantalla por qué unos botones no aparecen. */}
          {!puedeRegistrar && (
            <p className="mt-2 text-[11.5px] text-humo">
              Tu rol no registra abonos. Los captura Atención al Cliente (ATC), la Sub-RAC, RAC o Dirección.
            </p>
          )}
          {puedeRegistrar && !puedeEditar && (
            <p className="mt-2 text-[11.5px] text-humo">
              Puedes registrar abonos y subir comprobantes. Para <b>corregir o eliminar</b> uno ya
              registrado, pídelo a RAC o a Dirección: cambiar un abono mueve el saldo del cliente.
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-end">
        <button onClick={exportarFichaLegal} disabled={exportando} className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-[12px] font-semibold text-tinta hover:bg-nube disabled:opacity-50">
          {exportando ? "Generando…" : "🖨️ Exportar ficha (PDF)"}
        </button>
      </div>

      {/* Información de la garantía — dato simple, no forma parte del proceso interactivo */}
      <div className="rounded-2xl border border-teal/20 bg-teal-soft/20 p-3">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-base">🏠</span>
          <h3 className="font-display text-[13px] font-extrabold text-tinta">Información de la garantía</h3>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <div><div className="text-[10px] font-semibold uppercase text-humo">Garantía</div><div className="text-[12.5px] text-tinta">{cliente.garantia || cliente.direccionGarantia || "—"}</div></div>
          <div><div className="text-[10px] font-semibold uppercase text-humo">Dirección de la garantía</div><div className="text-[12.5px] text-tinta">{cliente.direccionGarantia || "—"}</div></div>
          <div><div className="text-[10px] font-semibold uppercase text-humo">Sucursal</div><div className="text-[12.5px] text-tinta">{cliente.sucursal || "—"}</div></div>
        </div>
      </div>

    </div>
  );
}
