// Convenio de Transacción · Devolución Compensada (RDC).
// Vive en la pestaña "Convenio" del expediente. Usa la tabla ya existente
// compensacion_devolucion (no crea infraestructura paralela).
//
// Reglas de este bloque (pedidas por Paola):
//  · Solo SRAC y RAC pueden GENERAR/DESCARGAR el convenio. El resto de
//    roles que llegan a este panel solo VEN el estatus, sin botones.
//  · Antes de descargar, se pide confirmación explícita.
//  · Al descargar arranca un plazo de 24 horas para que el cliente firme.
//    Si no se sube la firma a tiempo, un robot diario marca la descarga
//    como vencida (ver netlify/functions/vencer-firma-rdc.mjs).
//  · Al descargar se arma un correo (mailto, el asesor lo revisa y envía
//    desde su propio correo — así lo pide la regla de correos de DIIPA) al
//    cliente con copia a RAC, y además se manda una notificación interna
//    automática (campanita) a RAC — la campanita interna sí es automática.
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import type { Cliente } from "../../../data/clientes";
import {
  calcularRDC, crearSolicitudRdc, obtenerRdcCliente, registrarDescargaRdc, subirFirmaRdc, marcarRevisadoYHabilitar,
  calcularConvenioSimple, guardarGerenteCofirma, guardarDocConvenioRdc,
  PLAZO_DEFINICION_DIAS, PLAZO_MESES_PARA_COMPENSACION,
  M1_MESES_INICIO_CAPITAL, M1_NUM_PAGOS_CAPITAL, M1_MESES_INICIO_COMPENSACION, M1_NUM_PAGOS_COMPENSACION,
  MESES_ENTRE_PAGOS_MIN, MESES_ENTRE_PAGOS_MAX, M2_MESES_INICIO, M2_NUM_PAGOS_MAX,
  PLAZO_FIRMA_HORAS, LIMITE_DESCARGAS_POR_PERSONA, type RdcDevolucion,
} from "../../../data/rdc";
import { puedeAccion } from "../../../data/roles";
import { generarExpediente } from "../../../data/expediente";
import { subirArchivoDrive } from "../../../data/expedienteDocs";
import { avisarEvento } from "../../../data/avisarEvento";
import { fetchCorreoPorRol, fetchPerfil } from "../../../data/usuarios";
import { fetchAbonos, type Abono } from "../../../data/convenioDevolucion";
import { supabase } from "../../../lib/supabase";
import { useMiRol, fechaCorta } from "../_compartido";

import { hayParametros } from "../../../data/parametrosDevolucion";
import AvisoParametros from "../../../components/AvisoParametros";
function money(n: number): string {
  return "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " M.N.";
}

function fechaLarga(iso: string): string {
  if (!iso) return "____________________________";
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
}

function etiquetaSoporte(s: string): string {
  if (s === "notarial_original") return "Solicitud de pago notarial original";
  if (s === "documento_original") return "Documento original";
  if (s === "efectivo_apoderado") return "Efectivo — comprobante de oficina firmado por el apoderado";
  if (s === "correo") return "Correo de confirmación";
  return "Sin soporte (con nota)";
}

function etiquetaTipoPago(t: string): string {
  if (t === "contrato") return "Contrato";
  if (t === "apartado") return "Apartado";
  if (t === "segundo_pago") return "Segundo pago";
  if (t === "cesion") return "Cesión";
  if (t === "escritura") return "Escritura";
  return "Otro pago";
}

function bloqueDatosYPagos(cliente: Cliente, rdc: RdcDevolucion | null): string {
  const lineas = rdc?.lineasPago || [];
  const filasPago = lineas.length
    ? lineas.map((l, i) => `<tr>
        <td style="padding:6px 8px;border:1px solid #d1d5db;font-size:10pt">${i + 1}. ${etiquetaTipoPago(l.tipo)}</td>
        <td style="padding:6px 8px;border:1px solid #d1d5db;font-size:10pt;text-align:right">${money(l.monto)}</td>
        <td style="padding:6px 8px;border:1px solid #d1d5db;font-size:9.5pt">${etiquetaSoporte(l.soporte)}${l.nota ? `<br><span style="color:#6b7280">${l.nota}</span>` : ""}</td>
      </tr>`).join("")
    : `<tr><td colspan="3" style="padding:6px 8px;border:1px solid #d1d5db;font-size:10pt;color:#6b7280">Sin líneas de pago capturadas.</td></tr>`;

  return `
<table style="width:100%;margin-bottom:14px;font-size:10.5pt">
<tr><td style="padding:4px 0;width:20%;color:#6b7280">Domicilio</td><td style="padding:4px 0"><strong>${cliente.domicilio || "____________________________"}</strong></td></tr>
<tr><td style="padding:4px 0;color:#6b7280">Teléfono</td><td style="padding:4px 0"><strong>${cliente.telefono || "____________________________"}</strong>${cliente.telefono2 ? ` &nbsp;·&nbsp; Celular: <strong>${cliente.telefono2}</strong>` : ""}</td></tr>
</table>
<p style="font-weight:800;text-transform:uppercase;font-size:10.5pt;margin:14px 0 6px">Detalle de pagos recibidos</p>
<table style="width:100%;border-collapse:collapse;margin-bottom:16px">${filasPago}</table>`;
}

function fechaHoraCorta(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function leerBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] || "");
    r.onerror = () => rej(new Error("No se pudo leer " + file.name));
    r.readAsDataURL(file);
  });
}

export default function ConvenioRDC({ cliente }: { cliente: Cliente }) {
  // 👇 Sin parámetros no se calcula nada — ver parametrosDevolucion.ts
  if (!hayParametros()) return <AvisoParametros onListo={() => window.location.reload()} />;

  const miRol = useMiRol();
  const [miEmail, setMiEmail] = useState<string | null>(null);
  const [miNombre, setMiNombre] = useState<string | null>(null);
  const [rdc, setRdc] = useState<RdcDevolucion | null>(null);
  const [abonos, setAbonos] = useState<Abono[]>([]);
  const puedeHabilitar = puedeAccion(miRol, "habilitar_compensacion"); // RAC/SRAC/DGE: revisan y generan siempre
  const esQuienLoPidio = !!miEmail && !!rdc?.habilitadoDescargaPara && rdc.habilitadoDescargaPara.toLowerCase() === miEmail.toLowerCase();
  const puedeAccionar = puedeHabilitar || esQuienLoPidio; // 👈 tras revisarse, quien lo pidió también puede
  const [cargando, setCargando] = useState(true);
  const [generando, setGenerando] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [revisando, setRevisando] = useState(false);
  const [subiendoFirma, setSubiendoFirma] = useState(false);
  const [guardandoDoc, setGuardandoDoc] = useState(false);
  const [pasoFirma, setPasoFirma] = useState("");
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const email = data.session?.user?.email;
      if (email) {
        setMiEmail(email);
        fetchPerfil(email).then((pf) => setMiNombre(pf?.nombre ?? null)).catch(() => {});
      }
    });
  }, []);

  async function recargar() {
    const [r, a] = await Promise.all([obtenerRdcCliente(cliente.id), fetchAbonos(cliente.id)]);
    setRdc(r);
    setAbonos(a);
    return r;
  }

  useEffect(() => {
    let vivo = true;
    recargar().finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [cliente.id]);

  // 👇 Si ya se subió el documento del Convenio a Drive (después de la
  // primera descarga), el QR codifica la URL real — al leerlo abre el
  // documento directo. Antes de eso (o si por algo falló la subida),
  // codifica solo el folio, como respaldo — igual que antes.
  useEffect(() => {
    const payload = rdc?.docConvenio?.url || rdc?.folio;
    if (payload && qrCanvasRef.current) {
      QRCode.toCanvas(qrCanvasRef.current, payload, { width: 120, margin: 1 })
        .then(() => setQrDataUrl(qrCanvasRef.current?.toDataURL() || ""))
        .catch((e) => console.warn("QR no se pudo dibujar:", e));
    }
  }, [rdc]);

  async function generar() {
    // 👇 CANDADO. No se genera convenio si el expediente no pasó las dos
    // validaciones: la de sucursal (gerente/DGC) y la revisión de RAC/Sub-RAC.
    // Sin esto se podía llegar a un folio de convenio sin expediente validado.
    if (!cliente.datosValidadosSucursal) {
      alert("No se puede generar el convenio: los datos del cliente todavía no se validan en sucursal.\n\nPrimero hay que completar ese paso en la Solicitud Formal.");
      return;
    }
    if (!rdc?.revisadoPor && !rdc?.solicitudFirmadaEn) {
      alert("No se puede generar el convenio: la Solicitud Formal aún no la revisa RAC/Sub-RAC ni está firmada por el cliente.");
      return;
    }
    // La Modalidad 2 exige co-firma de gerente — se captura antes de generar.
    if (rdc?.modalidad === "convenio_simple" && !rdc?.gerenteCofirma) {
      const nombreGerente = window.prompt("Este convenio requiere co-firma del Gerente de sucursal.\n\nEscribe el nombre completo del Gerente que va a co-firmar:");
      if (!nombreGerente || !nombreGerente.trim()) return;
      const ok = await guardarGerenteCofirma(cliente.id, nombreGerente.trim());
      if (!ok) { alert("No se pudo guardar el nombre del gerente. Intenta de nuevo."); return; }
    }
    setGenerando(true);
    try {
      const nueva = await crearSolicitudRdc(cliente, miRol || "Sistema");
      if (!nueva) { alert("No se pudo generar el convenio. Intenta de nuevo."); return; }
      setRdc(nueva);
    } finally {
      setGenerando(false);
    }
  }

  function construirHtmlConvenioSimple(actual: RdcDevolucion | null): string {
    const svg = qrDataUrl ? `<img src="${qrDataUrl}" width="120" height="120" alt="QR" />` : "";
    const { capital, contratoYaVencido, compensacionPorVencimiento, total, numPagos } = calcularConvenioSimple(cliente, actual);
    const nombreCli = (cliente.nombre || "____________________________").toUpperCase();
    const lugarFirma = cliente.sucursal || "La Paz, Baja California Sur";
    const hoyTexto = new Date().toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
    const gerente = actual?.gerenteCofirma || "____________________________";

    const filaLinea = (num: string, detalle: string, monto: string) => `
<tr>
<td style="width:26px;padding:10px 0;vertical-align:top"><div style="width:10px;height:10px;border-radius:50%;background:#1e50a0;margin-top:4px"></div></td>
<td style="padding:10px 12px 10px 0;border-bottom:1px solid #e5e7eb">
<p style="margin:0 0 2px;font-size:9.5pt;font-weight:800;color:#1e50a0;letter-spacing:0.3px">${num}</p>
<p style="margin:0;font-size:10.5pt;color:#1f2937">${detalle}</p>
</td>
<td style="padding:10px 0;border-bottom:1px solid #e5e7eb;text-align:right;white-space:nowrap;vertical-align:top">
<p style="margin:0;font-size:12pt;font-weight:800;color:#1f2937">${monto}</p>
</td>
</tr>`;

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Convenio Simple ${actual?.folio || ""}</title>
<style>body{margin:0;padding:0;font-family:"Times New Roman",serif;font-size:12pt;line-height:1.65;color:#1f2937;background:#fff}
.contenido{padding:40px 50px}
table{border-collapse:collapse;width:100%}td{vertical-align:top}
@media print{.contenido{padding:20mm 25mm}@page{margin:0;size:letter}}</style></head><body>
<div style="background:#1e50a0;padding:22px 50px;color:#fff">
<p style="margin:0 0 3px;font-family:Arial,sans-serif;font-size:9.5pt;letter-spacing:1px;opacity:0.85">DIIPA &middot; DEVOLUCI&Oacute;N DE CAPITAL</p>
<p style="margin:0;font-family:Arial,sans-serif;font-size:15pt;font-weight:700">Convenio de devoluci&oacute;n de capital</p>
<p style="margin:2px 0 0;font-family:Arial,sans-serif;font-size:10.5pt;opacity:0.9">Modalidad 2 &middot; sin espera de compensaci&oacute;n</p>
</div>
<div class="contenido">
<p style="text-align:right;margin-bottom:24px">${lugarFirma} a ${hoyTexto}</p>
<p style="margin-bottom:2px"><strong>DESARROLLOS INTELIGENTES DE INMUEBLES Y PROPIEDADES ACCESIBLES, S.A. DE C.V.</strong></p>
<p style="margin-bottom:20px"><strong>Presente.</strong></p>
<p style="text-align:justify;margin-bottom:12px">Por medio de la presente, yo, <strong style="border-bottom:1px solid #000;padding:0 4px">${nombreCli}</strong>, en mi car&aacute;cter de <strong>CLIENTE</strong> adquirente del contrato de prestaci&oacute;n de servicios celebrado el <strong>${fechaLarga(cliente.fechaFirma)}</strong> correspondiente a la garant&iacute;a <strong>${cliente.garantia || "_____________"}</strong>, solicito la devoluci&oacute;n de mi capital, eligiendo expresamente NO esperar la compensaci&oacute;n anual del 5%, en pleno uso de mi derecho y por voluntad propia.</p>

<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px 18px;margin:18px 0">
<p style="margin:0 0 10px;font-family:Arial,sans-serif;font-size:10pt;font-weight:700;color:#1e50a0;letter-spacing:0.5px;text-transform:uppercase">Cu&aacute;ndo recibe su capital</p>
<table>
${filaLinea("D&Iacute;A DE LA FIRMA", contratoYaVencido ? "Compensaci&oacute;n por Terminaci&oacute;n (pago &uacute;nico, contrato ya vencido)" : "No aplica Compensaci&oacute;n por Terminaci&oacute;n (contrato a&uacute;n no vencido)", contratoYaVencido ? money(compensacionPorVencimiento) : "&mdash;")}
${filaLinea("DESDE LA FIRMA", "Hasta " + M2_NUM_PAGOS_MAX() + " pagos de capital, cada " + MESES_ENTRE_PAGOS_MIN() + "-" + MESES_ENTRE_PAGOS_MAX() + " meses seg&uacute;n ventas &middot; empiezan a los " + M2_MESES_INICIO() + " meses de firmado", "")}
</table>
<table style="margin-top:10px"><tr>
<td style="padding:10px 12px;background:#dbeafe;border-radius:6px">
<p style="margin:0 0 2px;font-size:9pt;color:#1e50a0">Total estimado a devolver</p>
<p style="margin:0;font-size:13pt;font-weight:800;color:#1e50a0">${money(total)}</p>
</td>
</tr></table>
</div>

<p style="margin-bottom:4px;font-family:Arial,sans-serif;font-size:10pt;font-weight:700;color:#1e50a0;letter-spacing:0.5px;text-transform:uppercase">Declaraciones</p>
<p style="text-align:justify;margin-bottom:8px"><strong>I.</strong> DIIPA declara ser una sociedad legalmente constituida (Escritura P&uacute;blica 1,809 de 20 de abril de 2022, Notar&iacute;a 256 de Mazatl&aacute;n, Sinaloa), con domicilio en dicha ciudad, dedicada a la gesti&oacute;n y recuperaci&oacute;n de derechos de cesi&oacute;n, de car&aacute;cter civil.</p>
<p style="text-align:justify;margin-bottom:8px"><strong>II.</strong> Que entre las partes se celebr&oacute; el contrato de prestaci&oacute;n de servicios de fecha ${cliente.fechaFirma ? fechaLarga(cliente.fechaFirma) : "____________________________"}, respecto de la garant&iacute;a ${cliente.garantia || "____________________________"}.</p>
<p style="text-align:justify;margin-bottom:16px"><strong>III.</strong> Que el CLIENTE present&oacute; Solicitud Formal de Devoluci&oacute;n${actual ? ` de fecha ${fechaCorta(actual.fechaSolicitudDev)}` : ""}, la cual DIIPA acepta en este acto mediante el presente Convenio.</p>

<p style="text-align:justify;margin-bottom:12px"><strong>PRIMERA.</strong> La relaci&oacute;n jur&iacute;dica es de car&aacute;cter estrictamente civil, derivada de un contrato de prestaci&oacute;n de servicios de gesti&oacute;n y recuperaci&oacute;n de derechos en t&eacute;rminos de los art&iacute;culos 2029 y 2032 del C&oacute;digo Civil Federal, fuera de la competencia de CONDUSEF y PROFECO conforme a los art&iacute;culos 2 y 2 Bis de la Ley para la Transparencia y Ordenamiento de los Servicios Financieros.</p>
${bloqueDatosYPagos(cliente, actual)}
<table style="margin-bottom:16px;font-size:11pt">
<tr><td style="padding:8px;border:1px solid #1f2937;width:65%;background:#f3f4f6"><strong>1. Devoluci&oacute;n del capital</strong></td><td style="padding:8px;border:1px solid #1f2937;text-align:right;font-weight:800">${money(capital)}</td></tr>
${contratoYaVencido ? `<tr><td style="padding:8px;border:1px solid #1f2937;background:#f3f4f6"><strong>2. Compensaci&oacute;n por terminaci&oacute;n del contrato</strong><br><span style="font-size:10pt">El contrato original ya venci&oacute; al momento de esta solicitud; esta compensaci&oacute;n es &uacute;nica (no se acumula por a&ntilde;os).</span></td><td style="padding:8px;border:1px solid #1f2937;text-align:right;font-weight:800">${money(compensacionPorVencimiento)}</td></tr>` : ""}
<tr><td style="padding:10px 8px;border:2px solid #1e50a0;background:#eff6ff"><strong style="color:#1e50a0">Total a devolver</strong></td><td style="padding:10px 8px;border:2px solid #1e50a0;background:#eff6ff;text-align:right;font-weight:800;font-size:13pt;color:#1e50a0">${money(total)}</td></tr>
</table>
<p style="text-align:justify;margin-bottom:12px"><strong>SEGUNDA.</strong> El capital se cubrir&aacute; en <strong>hasta ${numPagos} pagos</strong>, cada ${MESES_ENTRE_PAGOS_MIN()} a ${MESES_ENTRE_PAGOS_MAX()} meses seg&uacute;n la disponibilidad de ventas que determine el &aacute;rea comercial &mdash; no son pagos mensuales ni de monto fijo. Las fechas de pago iniciar&aacute;n a partir de los ${M2_MESES_INICIO()} (tres) meses de firmado el presente convenio, y quedan establecidas a favor de DIIPA como deudor de la presente obligaci&oacute;n, en t&eacute;rminos del art&iacute;culo 1958 del C&oacute;digo Civil Federal.</p>
<p style="text-align:justify;margin-bottom:12px"><strong>TERCERA.</strong> El presente convenio &uacute;nicamente puede firmarse y subirse en presencia del Gerente de sucursal, quien co-firma como testigo. El CLIENTE reconoce que esta co-firma cumple una funci&oacute;n de fe de hechos entre particulares, sin que ello implique que el Gerente asume responsabilidad solidaria alguna por las obligaciones de pago de DIIPA frente al CLIENTE. El CLIENTE cuenta con ${PLAZO_FIRMA_HORAS()} horas a partir de la descarga de este documento para firmarlo y subirlo, firmado tambi&eacute;n por su gerente asignado. Si no se sube a tiempo, esta solicitud NO podr&aacute; regenerarse de forma remota &mdash; el CLIENTE deber&aacute; acudir a sucursal a firmar nuevamente junto con su gerente, como en un convenio bancario.</p>
<p style="text-align:justify;margin-bottom:12px"><strong>CUARTA.</strong> El CLIENTE entiende que, al elegir esta v&iacute;a sin esperar la compensaci&oacute;n anual, esta Devoluci&oacute;n se atender&aacute; con menor prioridad en el calendario de pagos que las devoluciones con compensaci&oacute;n (RDC), ya que estas &uacute;ltimas requieren un tiempo de espera mayor de parte del cliente. Esta diferencia de prioridad no constituye una penalizaci&oacute;n en t&eacute;rminos del art&iacute;culo 1840 del C&oacute;digo Civil Federal, sino un criterio objetivo de orden de pago conforme a la disponibilidad de recursos de la empresa.</p>
<p style="text-align:justify;margin-bottom:12px"><strong>QUINTA.</strong> Ambas partes reconocen que el contrato original se celebr&oacute; de buena fe, sin dolo ni mala fe en t&eacute;rminos de los art&iacute;culos 1815 a 1817 del C&oacute;digo Civil Federal, ni se actualiza el tipo penal de fraude previsto en el art&iacute;culo 386 del C&oacute;digo Penal Federal. Con la firma, se da por cerrada y finiquitada la prestaci&oacute;n de servicios originalmente contratada.</p>
<p style="text-align:justify;margin-bottom:12px"><strong>SEXTA.</strong> Ambas partes ratifican que el presente convenio tiene, entre ellas, la misma eficacia que una sentencia ejecutoriada, en t&eacute;rminos del art&iacute;culo 2953 del C&oacute;digo Civil Federal.</p>
<p style="text-align:justify;margin-bottom:12px"><strong>S&Eacute;PTIMA.</strong> El CLIENTE podr&aacute; optar, en lugar de recibir su Devoluci&oacute;n en efectivo, por solicitar un <strong>cambio de garant&iacute;a</strong>. En este supuesto, el monto que en su caso le corresponda conforme al presente convenio ser&aacute; aplicado al valor de la nueva garant&iacute;a que se le asigne, sin necesidad de tramitarse por separado.</p>
<p style="text-align:justify;margin-bottom:12px"><strong>OCTAVA.</strong> Una vez cubierta la totalidad de la Devoluci&oacute;n en los t&eacute;rminos del presente convenio, el CLIENTE otorga a DIIPA el m&aacute;s amplio finiquito que en derecho proceda, y manifiesta que no se reserva acci&oacute;n ni derecho alguno que ejercitar en su contra por ning&uacute;n concepto relacionado con el contrato de origen o con el presente convenio. El CLIENTE reconoce que promover cualquier reclamaci&oacute;n adicional por la misma causa, existiendo el presente finiquito, constituir&iacute;a un acto de mala fe.</p>
<p style="text-align:justify;margin-bottom:12px"><strong>NOVENA.</strong> El CLIENTE se obliga a guardar confidencialidad respecto de los montos, plazos y dem&aacute;s t&eacute;rminos espec&iacute;ficos de su Devoluci&oacute;n pactados en el presente convenio, absteni&eacute;ndose de divulgarlos a terceros ajenos al mismo.</p>
<p style="text-align:justify;margin-bottom:12px"><strong>D&Eacute;CIMA.</strong> En caso de que el CLIENTE incumpla el presente convenio &mdash; incluyendo, de manera enunciativa mas no limitativa: (i) no presentarse a firmar dentro del plazo se&ntilde;alado en la cl&aacute;usula TERCERA; (ii) proporcionar documentaci&oacute;n o informaci&oacute;n falsa; (iii) solicitar la cancelaci&oacute;n de su Devoluci&oacute;n despu&eacute;s de haber recibido cualquier pago parcial, sin causa justificada; o (iv) incurrir en los actos previstos en la cl&aacute;usula D&Eacute;CIMA PRIMERA &mdash; los honorarios devengados por DIIPA con motivo de los trabajos de gesti&oacute;n y recuperaci&oacute;n de derechos realizados quedar&aacute;n firmes a su favor, en un monto fijo del <strong>15% (quince por ciento)</strong> sobre el valor de la operaci&oacute;n, sin perjuicio de las dem&aacute;s consecuencias previstas en este convenio.</p>
<p style="text-align:justify;margin-bottom:24px"><strong>D&Eacute;CIMA PRIMERA.</strong> Cualquier demanda, procedimiento, gasto, costa judicial, da&ntilde;o o perjuicio, as&iacute; como cualquier acto de difamaci&oacute;n o menoscabo a la reputaci&oacute;n de DIIPA que sea promovido, causado u ocasionado por el CLIENTE en relaci&oacute;n con el contrato de origen o con el presente convenio, correr&aacute; por cuenta y cargo exclusivo del CLIENTE, quien se obliga a resarcir a DIIPA los da&ntilde;os y perjuicios que le sean ocasionados con motivo de ello.</p>
<table style="margin-top:50px"><tr>
<td style="text-align:center;border-top:1px solid #000;padding-top:6px;width:33%"><strong>${nombreCli}</strong><br><span style="font-size:10.5pt">CLIENTE</span></td>
<td style="width:5%"></td>
<td style="text-align:center;border-top:1px solid #000;padding-top:6px;width:33%"><strong>${gerente}</strong><br><span style="font-size:10.5pt">Gerente (co-firma)</span></td>
<td style="width:5%"></td>
<td style="text-align:center;border-top:1px solid #000;padding-top:6px;width:33%"><strong>Pedro Flores Mercado</strong><br><span style="font-size:10.5pt">Apoderado &middot; DIIPA</span></td>
</tr></table>
<div style="margin-top:36px;text-align:center">${svg}<div style="font-size:8pt;color:#6b7280;letter-spacing:1px;margin-top:2px">FOLIO ${actual?.folio || ""}</div></div>
<p style="text-align:center;font-size:9pt;color:#6b7280;margin-top:18px">Este documento se imprime por duplicado: un ejemplar para el CLIENTE y un ejemplar para DIIPA.</p>
</div>
</body></html>`;
  }

  function construirHtmlCarta(actual: RdcDevolucion | null): string {
    const svg = qrDataUrl ? `<img src="${qrDataUrl}" width="120" height="120" alt="QR" />` : "";
    const { capital, mesesDesdeFirma, aniosTranscurridos, compensacionTerminacion, compensacionEspera, total, generoBeneficio, contratoYaVencido, fechaPagoCompensacion } = calcularRDC(cliente, actual, abonos);
    const nombreCli = (cliente.nombre || "____________________________").toUpperCase();
    const lugarFirma = cliente.sucursal || "La Paz, Baja California Sur";
    const hoyTexto = new Date().toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });

    // 👇 Proyección de "cuándo recibe qué" — independiente de si ya se
    // firmó o no (a diferencia de compensacionEspera, que solo cuenta
    // desde la firma real). Sirve para que el cliente vea, ANTES de
    // firmar, los dos escenarios posibles según cuándo pida su capital.
    const compAnio1Min = capital * 0.04; // si pide entre 12 y 24 meses
    const compAnio1Max = capital * 0.05; // sube en automático si espera los 24 meses completos
    const compAnio2 = capital * 0.05;
    const totalSiPideEntre12y24 = capital + compensacionTerminacion + compAnio1Min;
    const totalSiEsperaLos24Meses = capital + compensacionTerminacion + compAnio1Max + compAnio2;

    const filaLinea = (num: string, detalle: string, monto: string) => `
<tr>
<td style="width:26px;padding:10px 0;vertical-align:top"><div style="width:10px;height:10px;border-radius:50%;background:#1e50a0;margin-top:4px"></div></td>
<td style="padding:10px 12px 10px 0;border-bottom:1px solid #e5e7eb">
<p style="margin:0 0 2px;font-size:9.5pt;font-weight:800;color:#1e50a0;letter-spacing:0.3px">${num}</p>
<p style="margin:0;font-size:10.5pt;color:#1f2937">${detalle}</p>
</td>
<td style="padding:10px 0;border-bottom:1px solid #e5e7eb;text-align:right;white-space:nowrap;vertical-align:top">
<p style="margin:0;font-size:12pt;font-weight:800;color:#1f2937">${monto}</p>
</td>
</tr>`;

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Convenio RDC ${actual?.folio || ""}</title>
<style>body{margin:0;padding:0;font-family:"Times New Roman",serif;font-size:12pt;line-height:1.65;color:#1f2937;background:#fff}
.contenido{padding:40px 50px}
table{border-collapse:collapse;width:100%}td{vertical-align:top}
@media print{.contenido{padding:20mm 25mm}@page{margin:0;size:letter}}</style></head><body>
<div style="background:#1e50a0;padding:22px 50px;color:#fff">
<p style="margin:0 0 3px;font-family:Arial,sans-serif;font-size:9.5pt;letter-spacing:1px;opacity:0.85">DIIPA &middot; DEVOLUCI&Oacute;N COMPENSADA</p>
<p style="margin:0;font-family:Arial,sans-serif;font-size:15pt;font-weight:700">Convenio de transacci&oacute;n</p>
<p style="margin:2px 0 0;font-family:Arial,sans-serif;font-size:10.5pt;opacity:0.9">Modalidad 1 &middot; con compensaci&oacute;n</p>
</div>
<div class="contenido">
<p style="text-align:right;margin-bottom:24px">${lugarFirma} a ${hoyTexto}</p>
<p style="margin-bottom:2px"><strong>DESARROLLOS INTELIGENTES DE INMUEBLES Y PROPIEDADES ACCESIBLES, S.A. DE C.V.</strong></p>
<p style="margin-bottom:2px"><strong>Atn:</strong> Pedro Flores Mercado</p>
<p style="margin-bottom:20px"><strong>Presente.</strong></p>
<p style="text-align:justify;margin-bottom:12px">Por medio de la presente, yo, <strong style="border-bottom:1px solid #000;padding:0 4px">${nombreCli}</strong>, en mi car&aacute;cter de <strong>CLIENTE</strong> adquirente del contrato de prestaci&oacute;n de servicios celebrado el <strong>${fechaLarga(cliente.fechaFirma)}</strong> correspondiente a la garant&iacute;a <strong>${cliente.garantia || "_____________"}</strong>, manifiesto estar plenamente consciente de que dicho contrato consiste en una <strong>prestaci&oacute;n de servicios de gesti&oacute;n y recuperaci&oacute;n de derechos</strong>, y no en una inversi&oacute;n, ni en la compra-venta directa de un bien inmueble.</p>

<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px 18px;margin:18px 0">
<p style="margin:0 0 10px;font-family:Arial,sans-serif;font-size:10pt;font-weight:700;color:#1e50a0;letter-spacing:0.5px;text-transform:uppercase">Cu&aacute;ndo recibe su capital y su compensaci&oacute;n</p>
<table>
${filaLinea("D&Iacute;A DE LA FIRMA", contratoYaVencido ? "Compensaci&oacute;n por Terminaci&oacute;n (pago &uacute;nico, contrato ya vencido)" : "No aplica Compensaci&oacute;n por Terminaci&oacute;n (contrato a&uacute;n no vencido)", contratoYaVencido ? money(compensacionTerminacion) : "&mdash;")}
${filaLinea(M1_MESES_INICIO_CAPITAL() + " MESES DESDE LA FIRMA", "Inicia el capital &middot; " + M1_NUM_PAGOS_CAPITAL() + " pagos, cada " + MESES_ENTRE_PAGOS_MIN() + "-" + MESES_ENTRE_PAGOS_MAX() + " meses seg&uacute;n ventas", "")}
${filaLinea(M1_MESES_INICIO_COMPENSACION() + " MESES DESDE LA FIRMA", "Inicia la compensaci&oacute;n &middot; " + M1_NUM_PAGOS_COMPENSACION() + " pagos, cada " + MESES_ENTRE_PAGOS_MIN() + "-" + MESES_ENTRE_PAGOS_MAX() + " meses &middot; siempre DESPU&Eacute;S de terminar el capital", money(compAnio1Min + compAnio2))}
</table>
<table style="margin-top:10px">
<tr>
<td style="width:50%;padding:10px 12px;background:#f9fafb;border-radius:6px 0 0 6px">
<p style="margin:0 0 2px;font-size:9pt;color:#6b7280">Si pide su capital entre 12 y 24 meses</p>
<p style="margin:0;font-size:13pt;font-weight:800;color:#1f2937">${money(totalSiPideEntre12y24)}</p>
</td>
<td style="width:50%;padding:10px 12px;background:#dbeafe;border-radius:0 6px 6px 0">
<p style="margin:0 0 2px;font-size:9pt;color:#1e50a0">Si espera los 24 meses completos</p>
<p style="margin:0;font-size:13pt;font-weight:800;color:#1e50a0">${money(totalSiEsperaLos24Meses)}</p>
</td>
</tr>
</table>
<p style="margin:10px 0 0;font-size:8.5pt;color:#6b7280;line-height:1.5">Los plazos de ${M1_MESES_INICIO_CAPITAL()} y ${M1_MESES_INICIO_COMPENSACION()} meses se cuentan desde la FIRMA de este convenio, y quedan establecidos a favor de DIIPA como deudor de la Devoluci&oacute;n (art. 1958 del C&oacute;digo Civil Federal) &mdash; no son fechas fijas de calendario.</p>
</div>

<p style="margin-bottom:4px;font-family:Arial,sans-serif;font-size:10pt;font-weight:700;color:#1e50a0;letter-spacing:0.5px;text-transform:uppercase">Declaraciones</p>
<p style="text-align:justify;margin-bottom:8px"><strong>I.</strong> DIIPA declara ser una sociedad legalmente constituida (Escritura P&uacute;blica 1,809 de 20 de abril de 2022, Notar&iacute;a 256 de Mazatl&aacute;n, Sinaloa), con domicilio en dicha ciudad, dedicada a la gesti&oacute;n y recuperaci&oacute;n de derechos de cesi&oacute;n, de car&aacute;cter civil.</p>
<p style="text-align:justify;margin-bottom:8px"><strong>II.</strong> Que entre las partes se celebr&oacute; el contrato de prestaci&oacute;n de servicios de fecha ${cliente.fechaFirma ? fechaLarga(cliente.fechaFirma) : "____________________________"}, respecto de la garant&iacute;a ${cliente.garantia || "____________________________"}.</p>
<p style="text-align:justify;margin-bottom:16px"><strong>III.</strong> Que el CLIENTE present&oacute; Solicitud Formal de Devoluci&oacute;n${rdc ? ` de fecha ${fechaCorta(rdc.fechaSolicitudDev)}` : ""}, la cual DIIPA acepta en este acto mediante el presente Convenio de Transacci&oacute;n.</p>

<p style="text-align:justify;margin-bottom:12px"><strong>PRIMERA.</strong> Las partes reconocen que la relaci&oacute;n jur&iacute;dica es de car&aacute;cter estrictamente civil, derivada de un contrato de prestaci&oacute;n de servicios. No constituye una operaci&oacute;n regulada por la Ley para la Transparencia y Ordenamiento de los Servicios Financieros (arts. 2 y 2 Bis) ni por la Ley Federal de Protecci&oacute;n al Consumidor, por lo que queda fuera de la competencia de CONDUSEF y de PROFECO. Cualquier controversia se dirimir&aacute; exclusivamente ante los tribunales civiles del domicilio de la garant&iacute;a.</p>
<p style="text-align:justify;margin-bottom:12px"><strong>SEGUNDA.</strong> En t&eacute;rminos de los art&iacute;culos 2944 a 2963 del C&oacute;digo Civil Federal (o su equivalente en el C&oacute;digo Civil del estado donde se ubique la garant&iacute;a), el presente instrumento se celebra como convenio de transacci&oacute;n, mediante el cual las partes, haci&eacute;ndose concesiones rec&iacute;procas, previenen y dan por terminada cualquier controversia relacionada con el contrato de origen. Conforme al art&iacute;culo 2953, el presente convenio tiene entre las partes la misma eficacia y autoridad que la cosa juzgada. Las partes declaran expresamente que el presente convenio NO se celebra sobre un t&iacute;tulo nulo, ni con base en documentos falsos, ni existe mala fe de ninguna de ellas &mdash; de forma que no se actualiza ninguna de las causales de nulidad previstas en los art&iacute;culos 2954 a 2957 del mismo C&oacute;digo.</p>
<p style="text-align:justify;margin-bottom:12px"><strong>TERCERA.</strong> El CLIENTE reconoce que el capital aqu&iacute; devuelto proviene de una relaci&oacute;n de cesi&oacute;n y gesti&oacute;n de derechos de cobro en t&eacute;rminos de los art&iacute;culos 2029 y 2032 del C&oacute;digo Civil Federal, y no de una inversi&oacute;n, dep&oacute;sito, ni operaci&oacute;n de cr&eacute;dito, ahorro o captaci&oacute;n de recursos del p&uacute;blico.</p>
${bloqueDatosYPagos(cliente, actual)}
<table style="margin-bottom:16px;font-size:11pt">
<tr><td style="padding:8px;border:1px solid #1f2937;width:65%;background:#f3f4f6"><strong>1. Devoluci&oacute;n del capital</strong><br><span style="font-size:10pt">Restituci&oacute;n de los fondos entregados en el proceso de gesti&oacute;n de la garant&iacute;a.</span></td><td style="padding:8px;border:1px solid #1f2937;text-align:right;font-weight:800">${money(capital)}</td></tr>
${contratoYaVencido ? `<tr><td style="padding:8px;border:1px solid #1f2937;background:#f3f4f6"><strong>2. Compensaci&oacute;n por Terminaci&oacute;n</strong><br><span style="font-size:10pt">Pago &uacute;nico, por terminaci&oacute;n del contrato ya vencido a la fecha de firma. No se acumula por a&ntilde;os.</span></td><td style="padding:8px;border:1px solid #1f2937;text-align:right;font-weight:800">${money(compensacionTerminacion)}</td></tr>` : ""}
<tr><td style="padding:8px;border:1px solid #1f2937;background:#f3f4f6"><strong>${contratoYaVencido ? "3" : "2"}. Compensaci&oacute;n por Espera</strong><br><span style="font-size:10pt">4% al primer a&ntilde;o, 5% desde el segundo, sobre el capital pendiente. Se genera desde la FIRMA de este convenio. ${generoBeneficio ? `A&ntilde;os transcurridos: ${aniosTranscurridos.toFixed(2)}` : `A&uacute;n faltan ${Math.max(0, Math.ceil(PLAZO_MESES_PARA_COMPENSACION() - mesesDesdeFirma))} mes(es) para la primera.`}</span></td><td style="padding:8px;border:1px solid #1f2937;text-align:right;font-weight:800">${money(compensacionEspera)}</td></tr>
<tr><td style="padding:10px 8px;border:2px solid #1e50a0;background:#eff6ff"><strong style="color:#1e50a0">Total Devoluci&oacute;n Compensada (RDC)</strong></td><td style="padding:10px 8px;border:2px solid #1e50a0;background:#eff6ff;text-align:right;font-weight:800;font-size:13pt;color:#1e50a0">${money(total)}</td></tr>
</table>
<p style="text-align:justify;margin-bottom:12px"><strong>CUARTA.</strong> El presente convenio lo firma el CLIENTE en pleno uso de su derecho y por voluntad propia. Esta solicitud fue presentada de manera personal en sucursal, con identificaci&oacute;n oficial (INE) en mano. El CLIENTE cuenta con <strong>24 (veinticuatro) horas</strong> a partir de la entrega/descarga de este documento para firmarlo; de no hacerlo dentro de dicho plazo, la presente solicitud quedar&aacute; cancelada y deber&aacute; generarse nuevamente.</p>
<p style="text-align:justify;margin-bottom:12px"><strong>QUINTA.</strong> La empresa cuenta con un plazo de <strong>${PLAZO_DEFINICION_DIAS()} (noventa) d&iacute;as naturales</strong>, contados a partir de la recepci&oacute;n formal de esta solicitud (${rdc ? fechaCorta(rdc.fechaSolicitudDev) : "—"}), para definir y confirmar por escrito al CLIENTE los t&eacute;rminos de pago de su Devoluci&oacute;n Compensada.</p>
<p style="text-align:justify;margin-bottom:12px"><strong>SEXTA.</strong> El capital se cubrir&aacute; en <strong>${M1_NUM_PAGOS_CAPITAL()} (seis) pagos</strong>, cada ${MESES_ENTRE_PAGOS_MIN()} a ${MESES_ENTRE_PAGOS_MAX()} meses conforme a la disponibilidad de ventas que determine el &aacute;rea comercial de la empresa &mdash; no son pagos mensuales ni de monto fijo. Iniciar&aacute;n a partir de los <strong>${M1_MESES_INICIO_CAPITAL()} (doce) meses</strong> contados desde la FIRMA del presente convenio, y quedan establecidos a favor de DIIPA como deudor de la presente obligaci&oacute;n, en t&eacute;rminos del art&iacute;culo 1958 del C&oacute;digo Civil Federal. Cada pago recibido constituye finiquito parcial por el monto correspondiente, liberando a la empresa proporcionalmente sin afectar el derecho del CLIENTE sobre el saldo restante.</p>
<p style="text-align:justify;margin-bottom:12px"><strong>S&Eacute;PTIMA.</strong> El CLIENTE entiende y acepta que, para tener derecho a la <strong>Compensaci&oacute;n por Espera</strong>, su Devoluci&oacute;n Compensada deber&aacute; permanecer en la empresa un m&iacute;nimo de <strong>${PLAZO_MESES_PARA_COMPENSACION()} (doce) meses, contados a partir de la FIRMA DEL PRESENTE CONVENIO</strong> — no desde la solicitud. El CLIENTE <strong>no podr&aacute; solicitar la entrega de su capital antes</strong> de que se cumpla dicho plazo sin perder este beneficio en particular. Al cumplirse los 12 meses, la Compensaci&oacute;n por Espera ser&aacute; del <strong>4%</strong> sobre el capital que en ese momento le siga pendiente de pago. A partir del segundo a&ntilde;o (24 meses) y cada a&ntilde;o subsecuente, ser&aacute; del <strong>5%</strong> sobre el saldo pendiente en ese momento. La compensaci&oacute;n se cubrir&aacute; en <strong>${M1_NUM_PAGOS_COMPENSACION()} (tres) pagos</strong>, cada ${MESES_ENTRE_PAGOS_MIN()} a ${MESES_ENTRE_PAGOS_MAX()} meses, iniciando a partir de los <strong>${M1_MESES_INICIO_COMPENSACION()} (veinticuatro) meses</strong> de firmado el presente convenio &mdash; siempre DESPU&Eacute;S de haberse cubierto la totalidad del capital (cl&aacute;usula SEXTA), nunca antes ni mezclados con &eacute;l${fechaPagoCompensacion ? ` (el primer pago, aproximadamente el ${fechaCorta(fechaPagoCompensacion)})` : ""}. Si al cumplirse los 24 meses el CLIENTE solicita &uacute;nicamente la Compensaci&oacute;n, sin retirar su capital, el plazo de espera se extender&aacute; un a&ntilde;o adicional antes de cubrirla. Esta condici&oacute;n no representa una sanci&oacute;n hacia el CLIENTE: refleja &uacute;nicamente el tiempo natural en el que se construye el beneficio pactado, y en nada afecta su derecho a recuperar la totalidad del capital entregado.</p>
<p style="text-align:justify;margin-bottom:12px"><strong>OCTAVA.</strong> Si a la fecha de firma del presente convenio el contrato original ya se encontraba vencido, se reconoce a favor del CLIENTE la <strong>Compensaci&oacute;n por Terminaci&oacute;n</strong>, del 5% sobre el capital, por concepto de terminaci&oacute;n del contrato por causas atribuibles a la empresa. Este es un <strong>pago &uacute;nico, no recurrente</strong>, independiente de la Compensaci&oacute;n por Espera de la cl&aacute;usula S&Eacute;PTIMA, y se suma al capital sin condicionarse a ning&uacute;n plazo de espera.</p>
<p style="text-align:justify;margin-bottom:12px"><strong>NOVENA.</strong> Ambas partes reconocen y declaran que el contrato de prestaci&oacute;n de servicios que dio origen al presente convenio se celebr&oacute; de buena fe y sin que haya mediado enga&ntilde;o alguno al momento de su celebraci&oacute;n, en t&eacute;rminos de los art&iacute;culos 1815 a 1817 del C&oacute;digo Civil Federal, no actualiz&aacute;ndose el dolo ni la mala fe como vicios del consentimiento, ni el tipo penal de fraude previsto en el art&iacute;culo 386 del C&oacute;digo Penal Federal, al no existir enga&ntilde;o ni aprovechamiento de error alguno por parte de la empresa. Con la firma del presente convenio, ambas partes dan por cerrada y finiquitada la prestaci&oacute;n de servicios originalmente contratada, sin que quede pendiente reclamaci&oacute;n adicional alguna derivada de la misma, salvo el cumplimiento puntual de lo aqu&iacute; pactado.</p>
<p style="text-align:justify;margin-bottom:12px"><strong>D&Eacute;CIMA.</strong> El CLIENTE podr&aacute; optar, en lugar de recibir su Devoluci&oacute;n Compensada en efectivo, por solicitar un <strong>cambio de garant&iacute;a</strong>. En este supuesto, la compensaci&oacute;n que en su caso haya generado conforme a las cl&aacute;usulas S&Eacute;PTIMA y OCTAVA ser&aacute; sumada al valor de la nueva garant&iacute;a que se le asigne, sin necesidad de tramitarse por separado.</p>
<p style="text-align:justify;margin-bottom:12px"><strong>D&Eacute;CIMA PRIMERA.</strong> En caso de que el CLIENTE promueva alguna acci&oacute;n judicial relacionada con el presente convenio y &eacute;sta sea declarada por autoridad competente como <strong>temeraria o de mala fe</strong>, el CLIENTE se obliga a resarcir a la empresa los gastos y costas judiciales efectivamente erogados con motivo de dicho litigio, sin que ello limite el derecho del CLIENTE a acudir a los tribunales de buena fe.</p>
<p style="text-align:justify;margin-bottom:12px"><strong>D&Eacute;CIMA SEGUNDA.</strong> Ambas partes ratifican que el presente convenio de transacci&oacute;n tiene, entre ellas, la misma eficacia que una sentencia ejecutoriada, y renuncian a promover cualquier acci&oacute;n posterior derivada de los mismos hechos, salvo por las causales de nulidad expresamente previstas por la ley y descartadas en la cl&aacute;usula SEGUNDA.</p>
<p style="text-align:justify;margin-bottom:12px"><strong>D&Eacute;CIMA TERCERA.</strong> Una vez cubierta la totalidad de la Devoluci&oacute;n Compensada en los t&eacute;rminos del presente convenio, el CLIENTE otorga a DIIPA el m&aacute;s amplio finiquito que en derecho proceda, y manifiesta que no se reserva acci&oacute;n ni derecho alguno que ejercitar en su contra por ning&uacute;n concepto relacionado con el contrato de origen o con el presente convenio. El CLIENTE reconoce que promover cualquier reclamaci&oacute;n adicional por la misma causa, existiendo el presente finiquito, constituir&iacute;a un acto de mala fe.</p>
<p style="text-align:justify;margin-bottom:12px"><strong>D&Eacute;CIMA CUARTA.</strong> El CLIENTE se obliga a guardar confidencialidad respecto de los montos, plazos y dem&aacute;s t&eacute;rminos espec&iacute;ficos de su Devoluci&oacute;n Compensada pactados en el presente convenio, absteni&eacute;ndose de divulgarlos a terceros ajenos al mismo.</p>
<p style="text-align:justify;margin-bottom:12px"><strong>D&Eacute;CIMA QUINTA.</strong> En caso de que el CLIENTE incumpla el presente convenio &mdash; incluyendo, de manera enunciativa mas no limitativa: (i) no presentarse a firmar dentro del plazo se&ntilde;alado en la cl&aacute;usula CUARTA; (ii) proporcionar documentaci&oacute;n o informaci&oacute;n falsa; (iii) solicitar la cancelaci&oacute;n de su Devoluci&oacute;n despu&eacute;s de haber recibido cualquier pago parcial, sin causa justificada; (iv) promover una acci&oacute;n judicial declarada temeraria o de mala fe en t&eacute;rminos de la cl&aacute;usula D&Eacute;CIMA PRIMERA; o (v) incurrir en los actos previstos en la cl&aacute;usula D&Eacute;CIMA SEXTA &mdash; los honorarios devengados por DIIPA con motivo de los trabajos de gesti&oacute;n y recuperaci&oacute;n de derechos realizados quedar&aacute;n firmes a su favor, en un monto fijo del <strong>15% (quince por ciento)</strong> sobre el valor de la operaci&oacute;n, sin perjuicio de las dem&aacute;s consecuencias previstas en este convenio.</p>
<p style="text-align:justify;margin-bottom:24px"><strong>D&Eacute;CIMA SEXTA.</strong> Cualquier demanda, procedimiento, gasto, costa judicial, da&ntilde;o o perjuicio, as&iacute; como cualquier acto de difamaci&oacute;n o menoscabo a la reputaci&oacute;n de DIIPA que sea promovido, causado u ocasionado por el CLIENTE en relaci&oacute;n con el contrato de origen o con el presente convenio, correr&aacute; por cuenta y cargo exclusivo del CLIENTE, quien se obliga a resarcir a DIIPA los da&ntilde;os y perjuicios que le sean ocasionados con motivo de ello.</p>
<table style="margin-top:50px"><tr>
<td style="text-align:center;border-top:1px solid #000;padding-top:6px"><strong>${nombreCli}</strong><br><span style="font-size:10.5pt">CLIENTE</span></td>
<td style="width:40px;border:none"></td>
<td style="text-align:center;border-top:1px solid #000;padding-top:6px"><strong>Pedro Flores Mercado</strong><br><span style="font-size:10.5pt">Apoderado &middot; DIIPA</span></td>
</tr></table>
<div style="margin-top:36px;text-align:center">${svg}<div style="font-size:8pt;color:#6b7280;letter-spacing:1px;margin-top:2px">FOLIO ${actual?.folio || ""}</div></div>
<p style="text-align:center;font-size:9pt;color:#6b7280;margin-top:18px">Este documento se imprime por duplicado: un ejemplar para el CLIENTE y un ejemplar para DIIPA.</p>
</div>
</body></html>`;
  }

  function imprimir(actual: RdcDevolucion | null, ventanaAbierta?: Window | null) {
    const win = ventanaAbierta || window.open("", "_blank", "width=820,height=900");
    if (!win) { alert("Tu navegador bloque\u00f3 la ventana. Permite popups para esta p\u00e1gina."); return; }
    const html = actual?.modalidad === "convenio_simple" ? construirHtmlConvenioSimple(actual) : construirHtmlCarta(actual);
    win.document.open();
    win.document.write(html + "<script>window.onload=function(){setTimeout(function(){window.print();},300)};<\/script>");
    win.document.close();
  }

  // 👇 Descarga con confirmación: arranca el plazo de 24h, arma el correo
  // (mailto, lo revisa/envía el asesor) y avisa a RAC por campanita.
  // Límite: cada PERSONA (por correo) hasta 2 veces el mismo folio.
  async function confirmarYDescargar() {
    if (!rdc?.folio || !miEmail) return;
    const yaDescargue = rdc.historialDescargas.filter((d) => d.persona === miEmail.trim().toLowerCase()).length;
    if (yaDescargue >= LIMITE_DESCARGAS_POR_PERSONA()) {
      alert(`Ya descargaste este convenio ${yaDescargue} de ${LIMITE_DESCARGAS_POR_PERSONA()} veces permitidas. No se puede volver a descargar con tu usuario.`);
      return;
    }
    const ok = window.confirm(
      `¿Estás seguro de descargar el Convenio RDC?\n\n` +
      `Al descargarlo se activa un plazo de ${PLAZO_FIRMA_HORAS()} horas para que el cliente lo firme. Si no se sube la firma a tiempo, la solicitud se cancela y hay que generarla de nuevo.\n\n` +
      `📋 Imprime 2 copias: una para el cliente y otra para la empresa.\n\n` +
      `Tus descargas de este folio: ${yaDescargue} de ${LIMITE_DESCARGAS_POR_PERSONA()} permitidas.`
    );
    if (!ok) return;

    // 👇 CLAVE del arreglo: la ventana se abre AQUÍ, en el mismo instante
    // del clic — antes de cualquier `await`. Si se abre después de esperar
    // varias operaciones (subir a Drive, guardar, correo…), el navegador
    // ya no lo considera parte del clic del usuario y la bloquea como
    // pop-up, sin avisar claro — eso era lo que fallaba siempre.
    const ventanaImpresion = window.open("", "_blank", "width=820,height=900");
    if (ventanaImpresion) {
      ventanaImpresion.document.write("<p style=\"font-family:sans-serif;padding:40px;color:#6b7280\">Generando el documento…</p>");
    }

    setDescargando(true);
    try {
      const res = await registrarDescargaRdc(cliente.id, miRol || "Sistema", miEmail, miNombre);
      if (!res.ok) {
        ventanaImpresion?.close();
        if (res.motivo === "limite") alert(`Ya se alcanzó el límite de descargas (${res.vecesPersona}/${res.limite}) para tu usuario.`);
        else alert("No se pudo registrar la descarga. Intenta de nuevo.");
        return;
      }
      let actualizado = await recargar();

      // 👇 NUEVO: sube el documento real del Convenio a Drive y guarda su
      // URL — mismo patrón que ya usa la Solicitud Formal
      // (habilitarYSubirSolicitud). Antes esto no pasaba: el Convenio solo
      // se imprimía en el momento y no quedaba ningún archivo respaldado.
      // 👇 El convenio es el papel que sostiene la deuda. Si no se guarda,
      // el usuario TIENE que enterarse: antes esto fallaba en silencio con un
      // console.warn y quedaban folios sin ningún documento detrás.
      const guardado = await guardarConvenioEnDrive(actualizado);
      if (guardado.ok) {
        actualizado = await recargar(); // refresca docConvenio para que el QR apunte al documento real
      } else {
        alert(
          "⚠️ El convenio SÍ se generó y se va a imprimir, pero NO se pudo guardar en Drive.\n\n" +
          `Motivo: ${guardado.motivo}\n\n` +
          "El expediente queda sin documento respaldado. Usa el botón «Reintentar guardado» " +
          "en esta misma pantalla, o avisa a sistemas. El plazo de 24 horas NO se reinicia."
        );
      }

      // Correo al cliente con copia a RAC — mailto: el asesor lo revisa y envía.
      try {
        const racInfo = await fetchCorreoPorRol("RAC");
        const tos = [cliente.email].filter((v): v is string => !!v && v.trim() !== "");
        if (tos.length > 0) {
          const asunto = `Tu Convenio de Devolución Compensada (RDC) · Folio ${actualizado?.folio || ""}`;
          const cuerpo =
            `Hola ${cliente.nombre},\n\n` +
            `Se generó tu Convenio de Devolución Compensada (RDC), folio ${actualizado?.folio || ""}.\n\n` +
            `Tienes 24 horas a partir de este momento para firmarlo y devolverlo. Si no se recibe firmado dentro de ese plazo, la solicitud quedará cancelada y deberá generarse nuevamente.\n\n` +
            `Quedamos atentos.\n\nDIIPA`;
          let url = `mailto:${tos.join(",")}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
          if (racInfo?.email) url += `&cc=${encodeURIComponent(racInfo.email)}`;
          window.location.href = url;
        } else {
          alert("El cliente no tiene correo registrado — no se pudo armar el correo. Avísale a RAC manualmente.");
        }
      } catch (e) { console.warn("No se pudo armar el correo al cliente:", e); }

      // Notificación interna a RAC (campanita) — esto sí es automático.
      try {
        await avisarEvento({
          tipo: "cliente",
          accion: "rdc_descargado",
          titulo: `📄 Convenio RDC descargado: ${cliente.nombre}`,
          detalle: `Folio ${actualizado?.folio || ""} · Descargado por ${miRol} · Plazo de firma: 24 horas`,
          autor: miRol || "Sistema",
          modulo: "clientes",
          refId: cliente.id,
          icono: "📄",
          meta: { cliente_id: cliente.id, atencion: ["RAC"] },
        });
      } catch (e) { console.warn("No se pudo avisar a RAC:", e); }

      imprimir(actualizado, ventanaImpresion);
    } finally {
      setDescargando(false);
    }
  }

  /**
   * Sube el documento del Convenio a Drive y guarda su URL. Devuelve el
   * motivo exacto cuando falla, para poder decírselo al usuario en lugar de
   * tragarse el error. Se usa al descargar y también al reintentar.
   */
  async function guardarConvenioEnDrive(actual: RdcDevolucion | null): Promise<{ ok: boolean; motivo: string }> {
    try {
      if (!actual?.folio) return { ok: false, motivo: "El convenio todavía no tiene folio generado." };
      const htmlConvenio = actual.modalidad === "convenio_simple"
        ? construirHtmlConvenioSimple(actual)
        : construirHtmlCarta(actual);
      const exp = await generarExpediente(cliente);
      if (!exp?.carpetaId) return { ok: false, motivo: "No se pudo abrir la carpeta de Drive del expediente." };
      const base64 = btoa(unescape(encodeURIComponent(htmlConvenio)));
      const up = await subirArchivoDrive({
        carpetaId: exp.carpetaId,
        nombre: `Convenio ${actual.folio}.html`,
        base64,
        subcarpeta: "Convenio RDC",
        mime: "text/html",
        publico: true,
      });
      if (!up.ok || !up.link) return { ok: false, motivo: up.error || "Drive no devolvió el enlace del archivo." };
      const ok = await guardarDocConvenioRdc(cliente.id, { url: up.link, nombre: up.nombre || `Convenio ${actual.folio}.html` });
      if (!ok) return { ok: false, motivo: "El archivo subió a Drive pero no se pudo guardar su enlace en el expediente." };
      return { ok: true, motivo: "" };
    } catch (e) {
      return { ok: false, motivo: e instanceof Error ? e.message : "Error desconocido al guardar el convenio." };
    }
  }

  /** Reintento manual: vuelve a subir el documento SIN regenerar el convenio
   *  ni reiniciar el plazo de 24 horas. Sirve para los expedientes viejos que
   *  quedaron con folio y sin papel. */
  async function reintentarGuardado() {
    setGuardandoDoc(true);
    try {
      const r = await guardarConvenioEnDrive(rdc);
      if (r.ok) { await recargar(); alert("Listo. El convenio quedó guardado en Drive y ligado al expediente."); }
      else alert(`No se pudo guardar el convenio.\n\nMotivo: ${r.motivo}`);
    } finally { setGuardandoDoc(false); }
  }

  async function subirFirma(input: HTMLInputElement) {
    const file = input.files?.[0];
    if (!file) return;
    setSubiendoFirma(true);
    try {
      setPasoFirma("Subiendo firma…");
      let carpetaId = (cliente.carpetaDriveId || "").trim();
      if (!carpetaId) {
        const exp = await generarExpediente(cliente);
        if (!exp.ok || !exp.carpetaId) throw new Error("No se pudo abrir la carpeta de Drive.");
        carpetaId = exp.carpetaId;
      }
      const base64 = await leerBase64(file);
      const up = await subirArchivoDrive({ carpetaId, nombre: file.name, base64, subcarpeta: "Convenio RDC firmado", mime: file.type, publico: true });
      if (!up.ok || !up.link) throw new Error("Falló la subida del documento.");
      const ok = await subirFirmaRdc(cliente.id, { url: up.link, nombre: up.nombre || file.name });
      if (!ok) throw new Error("No se pudo guardar la firma.");
      await recargar();
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo subir la firma.");
    } finally {
      setSubiendoFirma(false); setPasoFirma(""); input.value = "";
    }
  }

  if (cargando) return <p className="text-[11px] text-humo">Cargando convenio RDC…</p>;

  // ── Aún no existe convenio ────────────────────────────────────────
  if (!rdc?.folio) {
    const pedidaSinRevisar = !!rdc?.solicitadoIniciarPor && !rdc?.revisadoPor;

    // Solicitud a mano subida (flujo viejo) = Paso 1 ya cumplido. Solo falta
    // superar los 90 días de definición desde esa solicitud para poder
    // generar/descargar el convenio.
    let indicador90: { texto: string; clase: string; puedeGenerar: boolean } | null = null;
    if (cliente.docSolicitudDevolucion?.url && rdc?.fechaSolicitudDev) {
      const dias = Math.floor((Date.now() - new Date(rdc.fechaSolicitudDev + "T00:00:00").getTime()) / 86400000);
      const faltan = PLAZO_DEFINICION_DIAS() - dias;
      indicador90 = faltan <= 0
        ? { texto: "✅ Paso 1 completo (solicitud a mano) · ya superó los 90 días · listo para generar convenio", clase: "bg-emerald-100 text-emerald-800", puedeGenerar: true }
        : { texto: `📎 Paso 1 completo (solicitud a mano) · faltan ${faltan} día(s) de los 90 para poder generar el convenio`, clase: "bg-amber-100 text-amber-800", puedeGenerar: false };
    }

    // 🔒 CANDADO: no se puede generar el Convenio si la Solicitud Formal
    // todavía no está firmada — salvo clientes viejos con solicitud a mano,
    // que ya cumplieron su equivalente (indicador90.puedeGenerar). PERO en
    // los dos casos, sin excepción, primero deben estar los datos
    // validados en sucursal (documentos obligatorios completos) — si no,
    // ni la solicitud a mano vieja puede saltarse ese mínimo.
    const solicitudCompleta = !!cliente.datosValidadosSucursal && (!!rdc?.solicitudFirmadaEn || (indicador90?.puedeGenerar ?? false));

    if (!puedeHabilitar) {
      return (
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 text-[13px]">
          <p className="font-semibold text-blue-800">📄 Convenio de Transacción · Devolución Compensada (RDC)</p>
          <p className="mt-1 text-[13px] text-humo">Aún no se ha generado el convenio para este cliente.</p>
          {indicador90 && <p className={"mt-1 rounded-lg px-2 py-1 text-[13px] font-semibold " + indicador90.clase}>{indicador90.texto}</p>}
          {rdc?.requiereRegenerarSucursal && <p className="mt-1 rounded-lg bg-rose-100 px-2 py-1 text-[13px] font-semibold text-rose-800">🏢 No se firmó a tiempo (Modalidad 2) — el cliente debe volver a sucursal con su Gerente.</p>}
          {pedidaSinRevisar && <p className="mt-1 text-[13px] font-semibold text-amber-700">⏳ Pedida por {rdc?.solicitadoIniciarPor}, pendiente de revisión de RAC/SRAC/DGE.</p>}
        </div>
      );
    }
    if (rdc?.requiereRegenerarSucursal) {
      return (
        <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 text-[13px]">
          <p className="mb-2 font-semibold text-rose-800">🏢 Requiere regenerarse en sucursal</p>
          <p className="mb-2 text-[13px] text-humo">No se subió la firma dentro de las 24 horas (Modalidad 2). Este convenio no se puede volver a generar de forma remota — el cliente debe estar físicamente en sucursal, junto con su Gerente, para continuar.</p>
          <button
            onClick={async () => {
              setRevisando(true);
              try {
                const { error } = await supabase.from("compensacion_devolucion").update({ requiere_regenerar_sucursal: false, gerente_cofirma: null, updated_at: new Date().toISOString() }).eq("cliente_id", cliente.id);
                if (!error) await recargar();
                else alert("No se pudo desbloquear.");
              } finally { setRevisando(false); }
            }}
            disabled={revisando}
            className="rounded-lg bg-rose-700 px-4 py-2.5 text-[15px] font-semibold text-white hover:bg-rose-800 disabled:opacity-50"
          >
            {revisando ? "Guardando…" : "🏢 Confirmar presencia en sucursal y desbloquear"}
          </button>
        </div>
      );
    }
    if (!solicitudCompleta) {
      return (
        <div className="rounded-xl border border-amber-300 bg-amber-50/70 p-4 text-[13px]">
          <p className="mb-1.5 text-[16px] font-semibold text-amber-800">🔒 Convenio bloqueado</p>
          {!cliente.datosValidadosSucursal ? (
            <p className="text-[14px] text-amber-700">Faltan datos y documentos por validar en sucursal (INE, CURP, comprobante, contrato). Complétalos primero, arriba en esta misma ficha, para poder generar el Convenio — incluso si el cliente trae una solicitud a mano vieja, este mínimo no se salta.</p>
          ) : (
            <p className="text-[14px] text-amber-700">Este cliente todavía no ha firmado su Solicitud Formal. Complétala primero (arriba, en esta misma ficha) para poder generar el Convenio.</p>
          )}
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 text-[13px]">
        <p className="mb-2 font-semibold text-blue-800">📄 Convenio de Transacción · Devolución Compensada (RDC)</p>
        <p className="mb-2 text-[13px] text-humo">Aún no se ha generado el convenio para este cliente.</p>
        {indicador90 && <p className={"mb-2 rounded-lg px-2 py-1 text-[13px] font-semibold " + indicador90.clase}>{indicador90.texto}</p>}
        {pedidaSinRevisar && puedeHabilitar && (
          <div className="mb-2 rounded-lg bg-amber-100 p-2">
            <p className="mb-1.5 text-[13px] font-semibold text-amber-800">⏳ Pedida por {rdc?.solicitadoIniciarPor} — revisa los datos y habilítala.</p>
            <button
              onClick={async () => {
                setRevisando(true);
                try {
                  const ok = await marcarRevisadoYHabilitar(cliente.id, miNombre || miRol || "RAC/SRAC");
                  if (ok) await recargar();
                  else alert("No se pudo marcar como revisada.");
                } finally { setRevisando(false); }
              }}
              disabled={revisando}
              className="rounded-lg bg-amber-600 px-3 py-2 text-[14px] font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {revisando ? "Guardando…" : "✅ Marcar revisado y habilitar descarga"}
            </button>
          </div>
        )}
        <button onClick={generar} disabled={generando || (indicador90 !== null && !indicador90.puedeGenerar)} className="rounded-lg bg-blue-700 px-4 py-2.5 text-[15px] font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
          {generando ? "Generando…" : "Generar convenio RDC"}
        </button>
      </div>
    );
  }

  // ── Ya existe convenio: calcular estatus de firma ───────────────────
  const { total } = calcularRDC(cliente, rdc, abonos);
  const ahora = Date.now();
  const plazoMs = rdc.plazoFirmaHasta ? new Date(rdc.plazoFirmaHasta).getTime() : null;
  const firmado = !!rdc.docFirmado;
  const vencido = rdc.descargaVencida || (!!plazoMs && !firmado && ahora > plazoMs);
  const horasRestantes = plazoMs ? Math.max(0, Math.round((plazoMs - ahora) / 3600000)) : null;

  let estatusFirma: { texto: string; clase: string };
  if (!rdc.fechaDescargado) estatusFirma = { texto: "Aún no se ha entregado/descargado al cliente", clase: "bg-nube text-humo" };
  else if (firmado) estatusFirma = { texto: `✅ Firmado el ${fechaHoraCorta(rdc.firmadoEn || "")}`, clase: "bg-green-100 text-green-700" };
  else if (vencido) estatusFirma = { texto: `⏰ Plazo de firma vencido (venció ${rdc.plazoFirmaHasta ? fechaHoraCorta(rdc.plazoFirmaHasta) : ""}) — hay que volver a descargar`, clase: "bg-rose-100 text-rose-700" };
  else estatusFirma = { texto: `⏳ Pendiente de firma · quedan ~${horasRestantes}h (vence ${rdc.plazoFirmaHasta ? fechaHoraCorta(rdc.plazoFirmaHasta) : ""})`, clase: "bg-amber-100 text-amber-700" };

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 text-[12.5px]">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-semibold text-blue-800">📄 Convenio RDC</span>
        <span className="rounded-full bg-blue-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-blue-800">{rdc.folio}</span>
        <span className="text-[11px] text-humo">Solicitado {rdc.fechaSolicitudDev ? fechaCorta(rdc.fechaSolicitudDev) : "—"} · Total {money(total)}</span>
        {puedeAccionar && (
          <div className="ml-auto flex gap-2">
            <button onClick={confirmarYDescargar} disabled={descargando || !miEmail} className="rounded-lg border border-blue-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-blue-800 hover:bg-blue-50 disabled:opacity-50">
              {descargando ? "Procesando…" : "🖨️ Descargar / Imprimir"}
            </button>
          </div>
        )}
      </div>

      <div className={"mb-2 rounded-lg px-3 py-1.5 text-[11.5px] font-semibold " + estatusFirma.clase}>
        {estatusFirma.texto}
      </div>

      {rdc.historialDescargas.length > 0 && (
        <div className="mb-2 rounded-lg border border-black/10 bg-white p-2">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-humo">Quién ya lo descargó</p>
          <ul className="space-y-0.5 text-[11px] text-tinta">
            {rdc.historialDescargas.map((d, i) => (
              <li key={i}>
                {d.personaNombre || d.persona} <span className="text-humo">({d.rol})</span> — {fechaHoraCorta(d.fecha)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {puedeAccionar && rdc.fechaDescargado && !firmado && (
        <div className="mb-2 rounded-lg border border-dashed border-blue-300 bg-white p-2">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-humo">Subir carta firmada por el cliente</label>
          <input type="file" accept="image/*,application/pdf" onChange={(e) => e.target.files?.[0] && subirFirma(e.target)} disabled={subiendoFirma} className="mt-1 w-full text-[11px] file:mr-1 file:rounded file:border-0 file:bg-blue-100 file:px-1.5 file:py-0.5 file:text-[11px] file:font-semibold file:text-blue-700" />
          {pasoFirma && <p className="mt-1 text-[11px] text-blue-700">{pasoFirma}</p>}
        </div>
      )}

      {rdc.docFirmado?.url && (
        <a href={rdc.docFirmado.url} target="_blank" rel="noreferrer" className="mb-2 inline-block text-[11px] font-semibold text-teal hover:underline">
          📎 Ver carta firmada: {rdc.docFirmado.nombre}
        </a>
      )}

      <div className="rounded-lg border border-black/10 bg-white p-2 text-center">
        <canvas ref={qrCanvasRef} width={120} height={120} className="mx-auto" style={{ width: 120, height: 120, maxWidth: 120 }} />
        {rdc.docConvenio?.url ? (
          <a href={rdc.docConvenio.url} target="_blank" rel="noreferrer" className="mt-1.5 block text-[13px] font-semibold text-teal hover:underline">
            Al leer el QR se abre el documento →
          </a>
        ) : (
          <p className="mt-1.5 text-[11px] text-humo">El QR aún solo trae el folio — se activa el enlace al documento tras la primera descarga.</p>
        )}
      </div>

      {/* 👇 Convenio con folio pero SIN documento guardado. Antes esto no se
          veía por ningún lado: el folio existía, el cliente firmaba, y el
          expediente quedaba sin papel que respaldara la deuda. */}
      {rdc.folio && !rdc.docConvenio?.url && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="text-[12.5px] font-semibold text-amber-900">
            ⚠️ Este convenio no tiene documento guardado
          </p>
          <p className="mt-1 text-[11.5px] text-amber-800">
            El folio {rdc.folio} existe, pero no hay archivo respaldado en Drive. Mientras
            siga así, el expediente no puede entrar a la cola de pago sin que la Dirección
            lo regularice.
          </p>
          <button
            onClick={reintentarGuardado}
            disabled={guardandoDoc}
            className="mt-2 rounded-md border border-amber-400 bg-white px-3 py-1.5 text-[12px] font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            {guardandoDoc ? "Guardando…" : "Reintentar guardado en Drive"}
          </button>
          <p className="mt-1.5 text-[10.5px] text-amber-700">
            No regenera el convenio ni reinicia el plazo de 24 horas: sólo vuelve a subir el documento.
          </p>
        </div>
      )}
    </div>
  );
}
