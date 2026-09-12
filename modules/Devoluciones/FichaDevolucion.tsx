// Ficha de Devolución — wizard paso a paso. Reemplaza la vista "todo junto"
// anterior: un paso a la vez, con navegación por puntos, "Ver todos los
// pasos" para el modo largo, y la ganancia SIEMPRE visible arriba —
// R3 (quedarse) destacado primero, para ayudar a vender el cambio antes
// de mostrar las 2 rutas de devolución. Los permisos por rol NO cambian:
// cada bloque (SolicitudFormalRDC, ConvenioRDC) sigue controlando quién
// edita/descarga qué, exactamente igual que antes — el wizard solo decide
// QUÉ bloque se ve, no QUIÉN puede tocarlo.
import { useEffect, useState } from "react";
import type { Cliente } from "../../data/clientes";
import { calcularRDC, calcularConvenioSimple, obtenerRdcCliente, guardarFechaProximoAbono, type RdcDevolucion } from "../../data/rdc";
import {
  fetchAbonos, agregarAbono, editarAbono, borrarAbono, actualizarEvidenciasAbono,
  type Abono, type TipoAbono, type EvidenciaArchivo,
} from "../../data/convenioDevolucion";
import { puedeAccion } from "../../data/roles";
import { subirArchivo } from "../../data/chat";
import { useMiRol, fechaCorta } from "../CrmCliente/_compartido";
import ConvenioRDC from "../CrmCliente/panels/ConvenioRDC";
import SolicitudFormalRDC from "../CrmCliente/panels/SolicitudFormalRDC";

import { hayParametros } from "../../data/parametrosDevolucion";
import AvisoParametros from "../../components/AvisoParametros";
function money(n: number): string {
  return "$" + Math.round(n || 0).toLocaleString("es-MX");
}

function diasRestantes(fechaIso: string): number {
  const f = new Date(fechaIso + "T00:00:00").getTime();
  return Math.ceil((f - Date.now()) / 86400000);
}

type Bloque = "solicitud" | "convenio" | "pagos";

export default function FichaDevolucion({ cliente, onCerrar }: { cliente: Cliente; onCerrar: () => void }) {
  // 👇 Sin parámetros no se calcula nada — ver parametrosDevolucion.ts
  if (!hayParametros()) return <AvisoParametros onListo={() => window.location.reload()} />;

  const miRol = useMiRol();
  const [rdc, setRdc] = useState<RdcDevolucion | null>(null);
  const [abonos, setAbonos] = useState<Abono[]>([]);
  const [cargando, setCargando] = useState(true);
  const [registrando, setRegistrando] = useState(false);
  const [montoNuevo, setMontoNuevo] = useState("");
  const [tipoAbonoNuevo, setTipoAbonoNuevo] = useState<TipoAbono>("capital");
  const [fechaNueva, setFechaNueva] = useState(new Date().toISOString().slice(0, 10));
  const [editandoFecha, setEditandoFecha] = useState(false);
  const [fechaProxTemp, setFechaProxTemp] = useState("");
  const [pasoActivo, setPasoActivo] = useState(0);
  const [verTodos, setVerTodos] = useState(false);

  // 👇 Abonos: permisos separados. REGISTRAR y subir comprobante lo hacen ATC,
  // SRAC, RAC y Dirección; CORREGIR y BORRAR solo RAC y Dirección, porque
  // cambiar un abono mueve el saldo del cliente.
  const puedeRegistrarAbono = puedeAccion(miRol, "registrar_abono");
  const puedeEditarAbono = puedeAccion(miRol, "editar_abono");
  const puedeBorrarAbono = puedeAccion(miRol, "borrar_abono");
  const [archivosNuevos, setArchivosNuevos] = useState<EvidenciaArchivo[]>([]);
  const [notaNueva, setNotaNueva] = useState("");
  const [subiendoArchivo, setSubiendoArchivo] = useState(false);
  const [editandoAbonoId, setEditandoAbonoId] = useState<string | null>(null);
  const [edFecha, setEdFecha] = useState("");
  const [edMonto, setEdMonto] = useState("");
  const [edTipo, setEdTipo] = useState<TipoAbono>("capital");

  async function cargar() {
    setCargando(true);
    const [r, a] = await Promise.all([obtenerRdcCliente(cliente.id), fetchAbonos(cliente.id)]);
    setRdc(r);
    setAbonos(a);
    setCargando(false);
  }

  useEffect(() => { cargar(); }, [cliente.id]);

  async function registrarAbono() {
    const monto = Number(montoNuevo);
    if (!monto || monto <= 0 || !fechaNueva) { alert("Escribe fecha y monto válidos."); return; }
    setRegistrando(true);
    try {
      const ok = await agregarAbono({
        clienteId: cliente.id, fecha: fechaNueva, monto, tipo: tipoAbonoNuevo,
        nota: notaNueva || undefined, registradoPor: miRol || "Sistema", archivos: archivosNuevos,
      });
      if (ok) { setMontoNuevo(""); setNotaNueva(""); setArchivosNuevos([]); await cargar(); }
      else alert("No se pudo registrar el abono.");
    } finally {
      setRegistrando(false);
    }
  }

  async function subirComprobante(file: File | null | undefined, destino: "alta" | string) {
    if (!file) return;
    setSubiendoArchivo(true);
    try {
      const res = await subirArchivo(file);
      if (!res) { alert("No se pudo subir el archivo. Inténtalo de nuevo."); return; }
      const nuevo: EvidenciaArchivo = { nombre: res.nombre, link: res.url };
      if (destino === "alta") {
        setArchivosNuevos((prev) => [...prev, nuevo]);
      } else {
        const abono = abonos.find((x) => x.id === destino);
        const ok = await actualizarEvidenciasAbono(destino, [...(abono?.archivos || []), nuevo]);
        if (ok) await cargar(); else alert("No se pudo adjuntar el archivo al abono.");
      }
    } finally { setSubiendoArchivo(false); }
  }

  function abrirEdicionAbono(a: Abono) {
    setEditandoAbonoId(a.id); setEdFecha(a.fecha); setEdMonto(String(a.monto)); setEdTipo(a.tipo || "capital");
  }

  async function guardarEdicionAbono() {
    if (!editandoAbonoId) return;
    const monto = Number(edMonto);
    if (!monto || monto <= 0 || !edFecha) { alert("Escribe una fecha y un monto válidos."); return; }
    const ok = await editarAbono(editandoAbonoId, { fecha: edFecha, monto, tipo: edTipo }, miRol || "Sistema");
    if (ok) { setEditandoAbonoId(null); await cargar(); } else alert("No se pudo guardar la corrección.");
  }

  async function quitarAbono(a: Abono) {
    // 👇 Borrar un abono SUBE el saldo del cliente: se avisa con el monto a la vista.
    const ok = confirm(
      "¿Borrar el abono de " + money(a.monto) + " del " + fechaCorta(a.fecha) + "?\n\n" +
      "El saldo del cliente SUBIRÁ en " + money(a.monto) + ". Esta acción no se puede deshacer.",
    );
    if (!ok) return;
    const hecho = await borrarAbono(a.id);
    if (hecho) await cargar(); else alert("No se pudo borrar el abono.");
  }

  async function guardarFechaProxima() {
    if (!fechaProxTemp) return;
    const ok = await guardarFechaProximoAbono(cliente.id, fechaProxTemp);
    if (ok) { setEditandoFecha(false); setFechaProxTemp(""); await cargar(); }
  }

  const { capital, compensacion, total, mesesDesdeFirma, compensacionTerminacion } = calcularRDC(cliente, rdc, abonos);
  const pagado = abonos.reduce((sum, a) => sum + a.monto, 0);
  const debe = Math.max(0, total - pagado);
  const tieneSolicitudAMano = !!cliente.docSolicitudDevolucion?.url;

  // Etapas — mismas 5 de siempre, ahora manejan también en qué punto del
  // wizard se abre la ficha (arranca en la etapa actual, no en la 1).
  const etapas = rdc ? [
    { nombre: "Solicitud pedida", relleno: "quién solicita, modalidad elegida", hecho: !!rdc.fechaSolicitudDev, fecha: rdc.fechaSolicitudDev },
    // 👇 "Datos validados" solo se da por hecha con la validación PRESENCIAL
    //    en sucursal. Antes bastaba con `rdc.revisadoPor` —que solo significa
    //    que alguien revisó la solicitud, no que se cotejaron los datos contra
    //    el contrato físico—, y por eso la ficha se contradecía sola: arriba
    //    decía "Datos validados en sucursal: No" y el paso 2 salía en verde.
    //    Con esto el proceso arranca donde debe: en validar datos.
    //    ⚠️ NO usar `rdc.folio` como prueba de nada: ese folio se asigna al
    //    PEDIR la devolución (estado "solicitada"), no al generar el Convenio.
    //    Hoy 110 de 112 expedientes con folio no tienen Convenio, y usarlo aquí
    //    pintaba el paso 2 en verde para clientes que ni siquiera fueron a
    //    sucursal. Tampoco vale `docConvenio`: hay 2 convenios generados fuera
    //    de orden, con el expediente en "solicitada" y sin validar nada. La
    //    única prueba de esta etapa es la validación presencial misma.
    { nombre: "Datos validados", relleno: "valores, fechas, INE/CURP/comprobante", hecho: !!cliente.datosValidadosSucursal, fecha: cliente.fechaValidadoSucursal ? cliente.fechaValidadoSucursal.slice(0, 10) : rdc.fechaRevisado ? rdc.fechaRevisado.slice(0, 10) : null, pendiente: !cliente.datosValidadosSucursal },
    { nombre: "Solicitud firmada", relleno: `documento físico, QR (${rdc.folioMaestro || rdc.folio || "···"}-SOL)`, hecho: !!rdc.solicitudFirmadaEn, fecha: rdc.solicitudFirmadaEn ? rdc.solicitudFirmadaEn.slice(0, 10) : null },
    { nombre: "Convenio generado", relleno: `capital, compensación, plazo, QR (${rdc.folioMaestro || rdc.folio || "···"}-CONV)`, hecho: !!rdc.docConvenio && !!rdc.docFirmado, fecha: rdc.firmadoEn ? rdc.firmadoEn.slice(0, 10) : null },
    { nombre: debe <= 0 && pagado > 0 ? "Liquidado" : "En pago", relleno: "cada abono, hasta liquidar", hecho: abonos.length > 0, fecha: null as string | null },
  ] : null;
  const idxActual = etapas ? etapas.findIndex((e) => !e.hecho) : -1;
  const diasRevision = rdc?.fechaLimiteRevision ? diasRestantes(rdc.fechaLimiteRevision) : null;

  // Al cargar (o cambiar de cliente) el wizard abre directo en la etapa
  // donde va el proceso — nadie tiene que buscarla.
  useEffect(() => {
    if (etapas) setPasoActivo(idxActual >= 0 ? idxActual : etapas.length - 1);
  }, [rdc?.id, cliente.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Comparador de las 3 rutas con el capital REAL del cliente.
  const compAnio1Min = capital * 0.04;
  const compAnio1Max = capital * 0.05;
  const compAnio2 = capital * 0.05;
  const totalModalidad1Min = capital + compensacionTerminacion + compAnio1Min;
  const totalModalidad1Max = capital + compensacionTerminacion + compAnio1Max + compAnio2;
  const { total: totalModalidad2 } = calcularConvenioSimple(cliente, rdc);
  const totalR3 = capital * 1.45;
  // 👇 Porcentajes reales — se calculan solos, no van fijos, porque cambian
  // según si el contrato ya venció o no (con terminación: 14-15% en
  // Modalidad 1, 5% en Modalidad 2; sin terminación: 9-10% y 0%).
  const pctModalidad1Min = capital > 0 ? Math.round(((totalModalidad1Min - capital) / capital) * 100) : 0;
  const pctModalidad1Max = capital > 0 ? Math.round(((totalModalidad1Max - capital) / capital) * 100) : 0;
  const pctModalidad2 = capital > 0 ? Math.round(((totalModalidad2 - capital) / capital) * 100) : 0;

  const tasaActual = mesesDesdeFirma >= 12 ? 0.05 : 0.04;
  const capitalRestante = Math.max(0, capital - pagado);
  const compensacionDiaria = (capitalRestante * tasaActual) / 365;
  const esRdc = (rdc?.modalidad || "rdc") === "rdc";

  function bloqueDePaso(paso: number): Bloque {
    return paso <= 2 ? "solicitud" : paso === 3 ? "convenio" : "pagos";
  }
  const bloqueActivo = bloqueDePaso(pasoActivo);

  function irPaso(delta: number) {
    setPasoActivo((p) => Math.min(4, Math.max(0, p + delta)));
  }

  // 👇 Ancho completo: antes la ficha estaba topada en max-w-5xl (~1024px) y
  // dejaba una franja vacía a los lados en pantallas anchas. El tope de 1600px
  // solo aplica en monitores muy grandes, para que el texto no quede en
  // renglones larguísimos.
  return (
    <div className="mx-auto w-full px-3 py-3 sm:px-6 sm:py-5 lg:px-10 lg:py-6 2xl:max-w-[1600px]">
      <button onClick={onCerrar} className="mb-3 text-[15px] font-semibold text-humo hover:text-tinta">← Volver a Control de Devoluciones</button>

      <div className="mb-4 rounded-2xl border border-black/10 bg-white p-4">
        <p className="font-display text-[22px] font-extrabold leading-tight text-tinta">{cliente.nombre}</p>
        {rdc?.folioMaestro ? (
          <div className="mt-1.5 inline-flex items-center gap-2 rounded-lg bg-teal-soft/50 px-3 py-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-teal-dark">Expediente</span>
            <span className="text-[14px] font-semibold text-teal-dark">{rdc.folioMaestro}</span>
            {rdc.estado && <span className="text-[12px] text-teal-dark/70">· {rdc.estado}</span>}
          </div>
        ) : (
          <p className="mt-1 text-[14px] text-humo">Sin folio todavía {rdc?.estado ? `· ${rdc.estado}` : ""}</p>
        )}
        {cliente.docSolicitudDevolucion?.url && (
          <a href={cliente.docSolicitudDevolucion.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-[13px] font-semibold text-amber-800 hover:bg-amber-200">
            📎 Solicitud a mano (subida antes del sistema) — ver documento
          </a>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <span className={"inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12.5px] font-semibold " + (tieneSolicitudAMano ? "bg-amber-100 text-amber-800" : "bg-nube text-humo")}>
            {tieneSolicitudAMano ? "✓" : "✕"} Tiene solicitud de devolución (a mano): <strong>{tieneSolicitudAMano ? "Sí" : "No"}</strong>
          </span>
          <span className={"inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12.5px] font-semibold " + (cliente.datosValidadosSucursal ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800")}>
            {cliente.datosValidadosSucursal ? "✓" : "✕"} Datos validados en sucursal: <strong>{cliente.datosValidadosSucursal ? "Sí" : "No"}</strong>
          </span>
        </div>
        {/* Bandera de cita: aquí es donde trabaja quien lleva las devoluciones.
            👇 Es un RECORDATORIO, no un candado. Antes decía "antes de
            habilitarle la Solicitud Formal", y se leía como que el expediente
            estaba trabado hasta que el cliente fuera a sucursal. No lo está:
            el llenado de datos se captura desde ya, y lo único que espera a la
            cita es la firma presencial. */}
        {cliente.requiereCitaSucursal && !cliente.validacionPresencialEn && (
          <div className="mt-2 rounded-lg border-2 border-amber-300 bg-amber-50 p-3">
            <p className="text-[13px] font-bold text-amber-900">
              🚪 Falta que se presente en sucursal{cliente.sucursal ? " · " + cliente.sucursal : ""} para validar sus datos en persona
            </p>
            <p className="mt-1 text-[12px] text-amber-800">
              No está trabado: puedes capturar su llenado de datos aquí abajo desde ahora. Si te llama,
              agéndale la cita desde su expediente, pestaña Cita, y dile qué documentos traer.
            </p>
          </div>
        )}

        {rdc?.tieneDemanda && (
          <div className="mt-2 rounded-lg bg-rose-50 border border-rose-200 p-3">
            <p className="text-[13px] font-bold text-rose-800">⚠️ Cliente con demanda ({rdc.tipoDemanda || "sin especificar"}) — bloqueado del proceso normal de RDC</p>
            <p className="mt-1 text-[12px] text-rose-700">No genera compensación ni entra a la fila de $150,000. Solo se le agregan abonos bajo "Convenios con Jurídico". {rdc.demandaNotas}</p>
          </div>
        )}
      </div>

      {cargando ? (
        <p className="text-[15px] text-humo">Cargando…</p>
      ) : (
        <>
          {/* Resumen persistente — siempre visible, sin importar el paso */}
          <div className="mb-4 grid grid-cols-3 gap-1.5 sm:gap-2">
            <div className="rounded-xl bg-nube/60 p-3 text-center">
              <p className="text-[11.5px] text-humo">Total RDC</p>
              <p className="text-[18px] font-semibold text-tinta">{money(total)}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3 text-center">
              <p className="text-[11.5px] text-humo">Ya se le dio</p>
              <p className="text-[18px] font-semibold text-emerald-700">{money(pagado)}</p>
            </div>
            <div className="rounded-xl bg-amber-50 p-3 text-center">
              <p className="text-[11.5px] text-humo">Se le debe</p>
              <p className="text-[18px] font-semibold text-amber-700">{money(debe)}</p>
            </div>
          </div>

          {/* Ganancia — SIEMPRE arriba, R3 destacado primero para vender el cambio */}
          {capital > 0 && (
            <div className="mb-4 rounded-2xl border border-black/10 bg-white p-4">
              <div className="mb-3 rounded-xl bg-emerald-50 p-3.5">
                <p className="mb-1 text-[13.5px] font-semibold text-emerald-800">⭐ La opción que más conviene: quedarse con nosotros</p>
                <p className="mb-1.5 text-[12px] text-emerald-700">Con un cambio de garantía (R3), sobre su capital de {money(capital)} ganaría aproximadamente</p>
                <p className="text-[24px] font-semibold text-emerald-700">{money(totalR3)} <span className="text-[12px] font-normal">(45%)</span></p>
                <p className="mt-1 text-[11px] text-emerald-700">Conserva antigüedad. Garantía ya predictaminada. Sin trámite de devolución.</p>
              </div>
              <p className="mb-2 text-[12.5px] text-humo">Si aun así prefiere su devolución, estas son sus 2 rutas:</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-black/10 p-3">
                  <p className="text-[12px] font-semibold text-tinta">Modalidad 1 · esperando</p>
                  <p className="text-[16px] font-semibold text-teal-dark">{money(totalModalidad1Min)}–{money(totalModalidad1Max)} <span className="text-[11px] font-normal">({pctModalidad1Min}%–{pctModalidad1Max}%)</span></p>
                  <p className="mt-0.5 text-[10.5px] text-humo">Según pida entre 12-24 meses, o espere completo</p>
                </div>
                <div className="rounded-lg border border-black/10 p-3">
                  <p className="text-[12px] font-semibold text-tinta">Modalidad 2 · simple</p>
                  <p className="text-[16px] font-semibold text-tinta">{money(totalModalidad2)} <span className="text-[11px] font-normal">({pctModalidad2}%)</span></p>
                  <p className="mt-0.5 text-[10.5px] text-humo">Sin espera, pero entra después en la fila</p>
                </div>
              </div>
            </div>
          )}

          {/* Navegador del wizard: puntos + ver todos + atrás/siguiente */}
          {etapas && (
            <div className="mb-4 rounded-2xl border border-black/10 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                {etapas.map((e, i) => (
                  <button
                    key={e.nombre}
                    onClick={() => { setPasoActivo(i); setVerTodos(false); }}
                    title={e.nombre}
                    className={
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold " +
                      (e.hecho ? "bg-emerald-500 text-white" : i === pasoActivo && !verTodos ? "border-2 border-teal bg-teal-soft text-teal-dark" : "border border-black/10 bg-nube text-humo hover:bg-black/5")
                    }
                  >
                    {e.hecho ? "✓" : i + 1}
                  </button>
                ))}
                <button onClick={() => setVerTodos((v) => !v)} className="ml-1 text-[12px] font-semibold text-teal hover:underline">
                  {verTodos ? "Ver un paso a la vez" : "Ver todos los pasos"}
                </button>
              </div>

              {!verTodos && (
                <div className="mt-3">
                  <p className="text-[16px] font-semibold text-tinta">{etapas[pasoActivo].nombre}</p>
                  <p className="text-[13px] text-humo">{etapas[pasoActivo].relleno}</p>
                </div>
              )}

              {diasRevision !== null && !rdc?.revisadoPor && (
                <p className={"mt-3 rounded-lg px-2.5 py-1.5 text-center text-[12px] font-semibold " + (diasRevision < 0 ? "bg-rose-100 text-rose-700" : diasRevision <= 5 ? "bg-amber-100 text-amber-700" : "bg-nube text-humo")}>
                  {diasRevision < 0 ? `⏰ Vencido hace ${Math.abs(diasRevision)} día(s) sin revisar` : `Quedan ${diasRevision} día(s) para revisar (plazo de 15-30 días)`}
                </p>
              )}

              {!verTodos && (
                <div className="mt-3 flex items-center justify-between gap-3">
                  <button onClick={() => irPaso(-1)} disabled={pasoActivo === 0} className="rounded-lg border border-black/15 bg-white px-4 py-2 text-[13px] font-semibold text-tinta disabled:opacity-40">
                    ← Atrás
                  </button>
                  <button onClick={() => irPaso(1)} disabled={pasoActivo === 4} className="rounded-lg bg-teal px-5 py-2 text-[13px] font-semibold text-white hover:bg-teal-dark disabled:opacity-40">
                    Siguiente →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Bloque: Solicitud (etapas 1-3) */}
          {(verTodos || bloqueActivo === "solicitud") && (
            <div className="mb-4">
              <SolicitudFormalRDC cliente={cliente} />
            </div>
          )}

          {/* Bloque: Convenio (etapa 4) — con indicadores de lo generado a la fecha */}
          {(verTodos || bloqueActivo === "convenio") && (
            <div className="mb-4">
              {rdc?.folio && esRdc && (
                <div className="mb-3 rounded-2xl border border-teal/20 bg-white p-4">
                  <div className="mb-2.5 rounded-lg bg-teal-soft/40 p-3">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-teal-dark">Lo que ya se generó a la fecha</p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <div><p className="text-[11px] text-humo">Capital</p><p className="text-[15px] font-semibold text-tinta">{money(capital)}</p></div>
                      <div><p className="text-[11px] text-humo">Compensación a hoy</p><p className="text-[15px] font-semibold text-teal-dark">{money(compensacion)}</p></div>
                      <div><p className="text-[11px] text-humo">Total del convenio</p><p className="text-[15px] font-semibold text-tinta">{money(capital + compensacion)}</p></div>
                    </div>
                    {rdc.firmadoEn && (
                      <p className="mt-2 border-t border-teal/20 pt-2 text-[12px] text-teal-dark">
                        ⏱️ Genera <strong>{money(compensacionDiaria)} por día</strong> {tasaActual === 0.04 ? "mientras esté en el año 1 de compensación (4%)" : "en el año 2 en adelante (5%)"}, sobre el saldo pendiente ({money(capitalRestante)}).
                      </p>
                    )}
                  </div>
                </div>
              )}
              <ConvenioRDC cliente={cliente} />
            </div>
          )}

          {/* Bloque: Pagos (etapa 5) — calendario del próximo abono y alta */}
          {(verTodos || bloqueActivo === "pagos") && (
            <>
              <div className="mb-4 rounded-xl border border-teal/20 bg-teal-soft/20 p-4">
                <p className="mb-1.5 text-[13px] font-semibold uppercase tracking-wide text-humo">Próximo abono</p>
                {editandoFecha ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input type="date" value={fechaProxTemp} onChange={(e) => setFechaProxTemp(e.target.value)} className="rounded-lg border border-black/10 px-3 py-2 text-[15px]" />
                    <button onClick={guardarFechaProxima} className="rounded-lg bg-teal px-3 py-2 text-[14px] font-semibold text-white">Guardar</button>
                    <button onClick={() => setEditandoFecha(false)} className="text-[14px] text-humo">Cancelar</button>
                  </div>
                ) : (
                  <button onClick={() => { setEditandoFecha(true); setFechaProxTemp(rdc?.fechaProximoAbono || ""); }} className="text-[18px] font-semibold text-tinta hover:underline">
                    {rdc?.fechaProximoAbono ? `${fechaCorta(rdc.fechaProximoAbono)} · ${money(rdc.abonoMensual || 0)}` : "Sin fecha asignada — toca para poner una"}
                  </button>
                )}
              </div>

              {puedeRegistrarAbono && (
                <div className="mb-4 rounded-xl border border-dashed border-black/15 bg-white p-4">
                  <p className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-humo">Registrar abono pagado</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <input type="date" value={fechaNueva} onChange={(e) => setFechaNueva(e.target.value)} className="rounded-lg border border-black/10 px-3 py-2 text-[15px]" />
                    <select value={tipoAbonoNuevo} onChange={(e) => setTipoAbonoNuevo(e.target.value as TipoAbono)} className="rounded-lg border border-black/10 px-3 py-2 text-[15px]">
                      <option value="capital">Capital</option>
                      <option value="compensacion">Compensación</option>
                    </select>
                    <input type="number" placeholder="Monto" value={montoNuevo} onChange={(e) => setMontoNuevo(e.target.value)} className="w-28 rounded-lg border border-black/10 px-3 py-2 text-[15px]" />
                    {/* 👇 Comprobante del pago: se guarda junto con el abono. */}
                    <label className="cursor-pointer rounded-lg border border-dashed border-teal/50 bg-white px-3 py-2 text-[14px] font-semibold text-teal hover:bg-teal-soft/30">
                      {subiendoArchivo ? "Subiendo…" : "📎 Subir comprobante"}
                      <input type="file" className="hidden" disabled={subiendoArchivo}
                        onChange={(e) => { subirComprobante(e.target.files?.[0], "alta"); e.currentTarget.value = ""; }} />
                    </label>
                    <button onClick={registrarAbono} disabled={registrando || subiendoArchivo} className="rounded-lg bg-tinta px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-50">
                      {registrando ? "Guardando…" : "Registrar"}
                    </button>
                  </div>
                  <input value={notaNueva} onChange={(e) => setNotaNueva(e.target.value)}
                    placeholder="Nota (opcional): forma de pago, clave de rastreo, quién lo entregó…"
                    className="mt-2 w-full rounded-lg border border-black/10 px-3 py-2 text-[14px]" />
                  {archivosNuevos.length > 0 && (
                    <p className="mt-2 text-[13px] text-emerald-700">
                      📎 {archivosNuevos.length} archivo(s) listo(s): {archivosNuevos.map((f) => f.nombre).join(", ")}
                    </p>
                  )}
                </div>
              )}

            </>
          )}

          {/* 👇 ABONOS REGISTRADOS — SIEMPRE VISIBLES, en cualquier paso.
              Igual que en la pestaña Convenio del CRM: el historial de lo que
              ya se le pagó no depende de en qué punto del proceso vaya el
              cliente, y quien abre la ficha necesita verlo de entrada. */}
          <div className="mb-4">
              <div className="rounded-xl border border-black/10 bg-white p-4">
                <p className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-humo">Abonos registrados ({abonos.length})</p>
                {/* 👇 MISMA VISTA que la pestaña Convenio del CRM: un renglón por
                    abono, con monto y fecha arriba, quién lo registró y la nota
                    abajo, los comprobantes como enlaces, y los botones a la
                    derecha según el permiso de cada quien. */}
                {abonos.length === 0 ? (
                  <p className="text-[15px] text-humo">Todavía no se le ha registrado ningún abono.</p>
                ) : (
                  <div className="space-y-1.5">
                    {abonos.map((a) => (
                      <div key={a.id} className="rounded-xl border border-black/10 bg-nube/40 p-2.5">
                        {editandoAbonoId === a.id ? (
                          <div className="grid gap-2 sm:grid-cols-4">
                            <input type="date" value={edFecha} onChange={(e) => setEdFecha(e.target.value)} className="rounded-lg border border-black/10 px-2 py-1.5 text-[13px]" />
                            <input type="number" min="0" step="0.01" value={edMonto} onChange={(e) => setEdMonto(e.target.value)} className="rounded-lg border border-black/10 px-2 py-1.5 text-[13px]" />
                            <select value={edTipo} onChange={(e) => setEdTipo(e.target.value as TipoAbono)} className="rounded-lg border border-black/10 px-2 py-1.5 text-[13px]">
                              <option value="capital">Capital</option>
                              <option value="compensacion">Compensación</option>
                            </select>
                            <div className="flex items-center gap-1.5">
                              <button onClick={guardarEdicionAbono} className="flex-1 rounded-lg bg-teal px-2 py-1.5 text-[13px] font-semibold text-white hover:bg-teal-dark">Guardar</button>
                              <button onClick={() => setEditandoAbonoId(null)} className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-[13px] font-semibold text-tinta hover:bg-nube">Cancelar</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-[14px] font-semibold text-tinta">
                                {money(a.monto)}{" "}
                                <span className="text-[12px] font-normal text-humo">· {fechaCorta(a.fecha)} · {a.tipo === "compensacion" ? "compensación" : "capital"}</span>
                              </p>
                              <p className="text-[12px] text-humo">
                                Registró: {a.registradoPor || "—"}
                                {a.nota ? " · " + a.nota : ""}
                              </p>
                              {(a.archivos || []).length > 0 ? (
                                <p className="text-[12px]">
                                  {(a.archivos || []).map((f, i) => (
                                    <a key={i} href={f.link} target="_blank" rel="noreferrer" className="mr-2 text-teal underline">📎 {f.nombre}</a>
                                  ))}
                                </p>
                              ) : (
                                <p className="text-[12px] text-humo">Sin comprobante adjunto</p>
                              )}
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              {puedeRegistrarAbono && (
                                <label className="cursor-pointer rounded-lg border border-black/10 bg-white px-2 py-1 text-[12px] font-semibold text-tinta hover:bg-nube">
                                  {subiendoArchivo ? "…" : "📎 Archivo"}
                                  <input type="file" className="hidden" disabled={subiendoArchivo}
                                    onChange={(e) => { subirComprobante(e.target.files?.[0], a.id); e.currentTarget.value = ""; }} />
                                </label>
                              )}
                              {puedeEditarAbono && (
                                <button onClick={() => abrirEdicionAbono(a)} className="rounded-lg border border-black/10 bg-white px-2 py-1 text-[12px] font-semibold text-tinta hover:bg-nube">✏️ Editar</button>
                              )}
                              {puedeBorrarAbono && (
                                <button onClick={() => quitarAbono(a)} className="rounded-lg border border-rose-200 bg-white px-2 py-1 text-[12px] font-semibold text-rose-600 hover:bg-rose-50">🗑️ Eliminar</button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {puedeRegistrarAbono && !puedeEditarAbono && (
                  <p className="mt-2 text-[12px] text-humo">
                    Puedes registrar abonos y subir comprobantes. Para <b>corregir o eliminar</b> uno ya
                    registrado, pídelo a RAC o a Dirección: cambiar un abono mueve el saldo del cliente.
                  </p>
                )}
                            </div>
          </div>
        </>
      )}
    </div>
  );
}
