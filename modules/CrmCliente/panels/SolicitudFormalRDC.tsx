// Solicitud Formal de Devolución y Elección del Cliente (Paso 1-2).
// Vive en "Ficha técnica", junto al bloque simple de Solicitud de Devolución
// que ya existía. Aquí el CLIENTE elige, ANTES de que exista el Convenio, si
// quiere esperar la compensación del 5% o solo su capital. No tiene folio ni
// candado de 24h — eso es del Convenio (Paso 4 en adelante), que es aparte.
//
// Fase C: gerentes y Director Comercial (DGC) solo pueden "Pedir que se
// genere" (con una calculadora de vista previa) — no pueden generar/
// descargar directo. Eso lo hacen RAC/SRAC (permiso habilitar_compensacion),
// quienes al revisar le regresan el permiso de descarga a quien lo pidió.
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { marcarDatosValidadosSucursal, guardarDatosSucursalRdc, type Cliente, type LineaPagoRdc } from "../../../data/clientes";
import { fetchExpediente, subirArchivoDrive, guardarDoc, type DocExpediente } from "../../../data/expedienteDocs";
import { obligatoriosDeCodigo } from "../PanelExpediente";
import { generarExpediente } from "../../../data/expediente";
import EspacioSolicitudDevolucion from "./EspacioSolicitudDevolucion";

function leerComoBase64(archivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = reject;
    r.readAsDataURL(archivo);
  });
}
import {
  registrarSolicitudFormal, guardarEleccionCompensacion, obtenerRdcCliente, calcularFechaVencimientoHabil, guardarTerminosEspeciales,
  habilitarYSubirSolicitud, marcarSolicitudFirmada, previsualizarRDC,
  PLAZO_DEFINICION_DIAS, PLAZO_REVISION_MIN_DIAS,
  PLAZO_MESES_REVISION_EXPEDIENTE, PLAZO_MESES_PRIMER_ABONO, MESES_ENTRE_ABONOS_TEXTO,
  type RdcDevolucion,
} from "../../../data/rdc";
import { puedeAccion } from "../../../data/roles";
import { useMiRol, fechaCorta } from "../_compartido";

import { hayParametros } from "../../../data/parametrosDevolucion";
import AvisoParametros from "../../../components/AvisoParametros";
function money(n: number): string {
  return "$" + Math.round(n || 0).toLocaleString("es-MX");
}

/** Ciudad de la sucursal → estado, para saber qué calendario de días inhábiles usar. */
function estadoDeSucursal(sucursal: string): string {
  const s = (sucursal || "").toLowerCase();
  if (s.includes("guadalajara") || s.includes("gdl")) return "Jalisco";
  if (s.includes("la paz") || s.includes("lap")) return "Baja California Sur";
  if (s.includes("culiac") || s.includes("mazatl") || s.includes("cul") || s.includes("maz")) return "Sinaloa";
  return "Sinaloa"; // 👈 default razonable: es donde vive la matriz de DIIPA
}

function fechaLarga(iso: string): string {
  if (!iso) return "____________________________";
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
}

export default function SolicitudFormalRDC({ cliente: clienteProp }: { cliente: Cliente }) {
  // 👇 Sin parámetros no se calcula nada — ver parametrosDevolucion.ts
  if (!hayParametros()) return <AvisoParametros onListo={() => window.location.reload()} />;

  const miRol = useMiRol();
  const puedeHabilitar = puedeAccion(miRol, "habilitar_compensacion"); // RAC/SRAC: revisan/confirman lo ya llenado
  const puedeLlenarSucursal = puedeAccion(miRol, "llenar_datos_sucursal_rdc"); // gerente local/comercial/DGE/GAD/RAC
  const puedeSolicitarFormal = puedeAccion(miRol, "solicitar_devolucion_formal"); // asesor/colaborador: SOLO disparan
  const [cliente, setCliente] = useState(clienteProp);
  const [rdc, setRdc] = useState<RdcDevolucion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [generando, setGenerando] = useState(false);
  const [validando, setValidando] = useState(false);
  const [guardandoEleccion, setGuardandoEleccion] = useState(false);
  const [peticionesEspeciales, setPeticionesEspeciales] = useState("");
  const [docPeticion, setDocPeticion] = useState<File | null>(null);
  const [guardandoPeticion, setGuardandoPeticion] = useState(false);
  const [habilitando, setHabilitando] = useState(false);
  const [marcandoFirma, setMarcandoFirma] = useState(false);
  const [archivoFirmado, setArchivoFirmado] = useState<File | null>(null);
  const qrRef = useRef<HTMLCanvasElement>(null);
  const [verEspacio, setVerEspacio] = useState(false);

  // 👇 CANDADO DE DOCUMENTOS. La validación la hacen RAC y Sub-RAC, y solo se
  // puede confirmar cuando están los documentos obligatorios. La DGE puede
  // levantar ese candado a mano para casos excepcionales; queda registrado
  // quién lo levantó, para que no sea un salto silencioso.
  const esDGE = miRol === "DGE" || miRol === "Super_Admin";
  const [candadoLevantado, setCandadoLevantado] = useState(false);

  // Formulario de llenado en sucursal — los 3 documentos (INE, CURP,
  // comprobante) NO se suben aquí: viven en la pestaña "Expediente" del
  // cliente. Aquí solo se VERIFICA que ya estén ahí.
  const [fDireccion, setFDireccion] = useState("");
  const [fFechaFirma, setFFechaFirma] = useState("");
  const [fFechaVencimiento, setFFechaVencimiento] = useState("");
  const [fTelefono, setFTelefono] = useState("");
  const [fCelular, setFCelular] = useState("");
  const [fDomicilio, setFDomicilio] = useState("");
  const [lineas, setLineas] = useState<(LineaPagoRdc & { archivo?: File | null })[]>([
    { tipo: "apartado", monto: 0, soporte: "documento_original", archivo: null },
  ]);
  const [enviandoLlenado, setEnviandoLlenado] = useState(false);
  const [guardandoAvance, setGuardandoAvance] = useState(false);
  const [ultimoGuardado, setUltimoGuardado] = useState<Date | null>(null);
  const [docsExpediente, setDocsExpediente] = useState<DocExpediente[]>([]);
  const [paso, setPaso] = useState(1);
  const [archivosDocs, setArchivosDocs] = useState<Record<string, File | null>>({});
  const [subiendoDoc, setSubiendoDoc] = useState<string | null>(null);

  const capitalTotal = lineas.reduce((sum, l) => sum + (Number(l.monto) || 0), 0);

  function agregarLinea() {
    setLineas((prev) => [...prev, { tipo: "otro", monto: 0, soporte: "documento_original", archivo: null }]);
  }
  function quitarLinea(i: number) {
    setLineas((prev) => prev.filter((_, idx) => idx !== i));
  }
  function actualizarLinea(i: number, cambios: Partial<LineaPagoRdc & { archivo?: File | null }>) {
    setLineas((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...cambios } : l)));
  }

  useEffect(() => { setCliente(clienteProp); }, [clienteProp]);

  // 👇 Pre-llenado: si ya había algo guardado de una vez anterior (aunque
  // no se haya terminado el paso 4), lo carga de una vez — antes se perdía
  // todo al salir a medias, porque el formulario siempre arrancaba vacío.
  useEffect(() => {
    setFTelefono(cliente.telefono || "");
    setFCelular(cliente.telefono2 || "");
    setFDomicilio(cliente.domicilio || "");
    setFDireccion(cliente.direccionGarantia || "");
    setFFechaFirma(cliente.fechaFirma || "");
  }, [cliente.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cálculo real de la fecha de vencimiento: firma + 12 meses hábiles,
  // recorriendo los periodos de vacaciones judiciales del estado de la
  // sucursal del cliente (tabla editable por el equipo jurídico).
  useEffect(() => {
    if (!fFechaFirma) return;
    const estado = estadoDeSucursal(cliente.sucursal);
    let vivo = true;
    calcularFechaVencimientoHabil(fFechaFirma, estado).then((f) => { if (vivo) setFFechaVencimiento(f); });
    return () => { vivo = false; };
  }, [fFechaFirma, cliente.sucursal]);

  // 👇 Si la lectura truena, hay que ENTERARSE. Antes esta función no tenía
  // try/catch: cualquier error dejaba `cargando` en true para siempre y, como
  // más abajo hay un `if (cargando) return null`, la Solicitud Formal
  // desaparecía de la pantalla sin decir nada. Se veía como si al cliente
  // simplemente no le tocara llenar datos.
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  async function cargar() {
    setErrorCarga(null);
    try {
      const [r, docs] = await Promise.all([obtenerRdcCliente(cliente.id), fetchExpediente(cliente.id)]);
      setRdc(r);
      setDocsExpediente(docs);
      // 👇 Si ya había líneas de pago guardadas de un avance anterior, las
      // recupera — en vez de arrancar siempre con una línea vacía.
      if (r?.lineasPago && r.lineasPago.length > 0) {
        setLineas(r.lineasPago.map((l) => ({ ...l, archivo: null })));
      }
    } catch (e: any) {
      setErrorCarga(e?.message || "No se pudo leer el expediente de devolución.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, [cliente.id]);

  // 👇 Guarda lo que ya está capturado SIN exigir que los 4 pasos estén
  // completos — para que salir a medias (o que se caiga la conexión) no
  // pierda lo ya escrito. El botón "Enviar" al final del paso 4 sigue
  // siendo el que formalmente notifica a RAC/SRAC.
  async function guardarAvance() {
    setGuardandoAvance(true);
    try {
      const lineasFinal: LineaPagoRdc[] = lineas.map((l) => ({ tipo: l.tipo, monto: Number(l.monto) || 0, soporte: l.soporte, nota: l.nota, doc: l.doc ?? null }));
      await guardarDatosSucursalRdc(cliente.id, {
        capital: capitalTotal > 0 ? String(capitalTotal) : undefined,
        direccionGarantia: fDireccion || undefined,
        fechaFirma: fFechaFirma || undefined,
        fechaVencimiento: fFechaVencimiento || undefined,
        telefono: fTelefono || undefined,
        celular: fCelular || undefined,
        domicilio: fDomicilio || undefined,
        lineasPago: lineasFinal.length > 0 ? lineasFinal : undefined,
      }, miRol || "Sistema");
      setUltimoGuardado(new Date());
    } finally {
      setGuardandoAvance(false);
    }
  }

  // 👇 Autoguardado: 1.5s después de dejar de escribir/cambiar algo, guarda
  // solo — sin botón, sin tener que salir y volver a entrar para
  // confirmar que quedó. `yaCargado` evita que el pre-llenado inicial
  // (que también dispara estos mismos setState) cuente como "cambio" y
  // guarde de vuelta lo mismo que acaba de leer.
  const yaCargado = useRef(false);
  useEffect(() => { if (!cargando) yaCargado.current = true; }, [cargando]);
  useEffect(() => {
    if (!yaCargado.current || paso === 4) return;
    const t = setTimeout(() => { guardarAvance(); }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fTelefono, fCelular, fDomicilio, fDireccion, fFechaFirma, JSON.stringify(lineas.map((l) => ({ t: l.tipo, m: l.monto, s: l.soporte, n: l.nota })))]);

  // Dibuja el QR (arriba de todo, para no violar las reglas de hooks —
  // esta pantalla tiene varios "return" tempranos más abajo).
  // 👇 El QR es SIEMPRE el de la Solicitud Formal que genera el sistema.
  // Antes caía al documento subido a mano cuando no había formal, y eso hacía
  // pasar el papel del cliente POR la Solicitud Formal. Son dos documentos
  // distintos: la formal la imprime y firma todo el mundo, y la de a mano solo
  // se conserva como antecedente (y es la que da la fecha de entrada a la fila).
  const urlDocumentoQR = rdc?.docSolicitudFormalUrl || null;
  const urlSolicitudAMano = cliente.docSolicitudDevolucion?.url || null;
  useEffect(() => {
    if (urlDocumentoQR && qrRef.current) {
      QRCode.toCanvas(qrRef.current, urlDocumentoQR, { width: 140, margin: 1 }).catch(() => {});
    }
  }, [urlDocumentoQR]);

  function tieneDoc(clave: string): boolean {
    const doc = docsExpediente.find((d) => d.clave === clave);
    if (!doc) return false;
    // Cuenta como "listo" si ya subió archivo, O si el documento tiene datos
    // capturados directamente (algunos slots son de datos, no de archivo).
    return doc.archivos.length > 0 || doc.estado === "existe" || !!doc.valor || !!doc.nota;
  }
  const obligatorios = obligatoriosDeCodigo(cliente.codigo);
  const documentosCompletos = obligatorios.every((o) => tieneDoc(o.clave));

  /**
   * Sube un documento obligatorio DIRECTO desde este formulario — escribe
   * en la misma tabla del Expediente (expediente_documentos), así se
   * refleja automáticamente en la pestaña "Expediente" de la ficha, sin
   * duplicar nada ni crear un lugar aparte.
   */
  async function subirDocumentoObligatorio(clave: string) {
    const archivo = archivosDocs[clave];
    if (!archivo) return;
    setSubiendoDoc(clave);
    try {
      const exp = await generarExpediente(cliente);
      if (!exp?.carpetaId) { alert("No se pudo abrir la carpeta de Drive."); return; }
      const base64 = await leerComoBase64(archivo);
      const up = await subirArchivoDrive({ carpetaId: exp.carpetaId, nombre: archivo.name, base64, subcarpeta: clave, mime: archivo.type, publico: true });
      if (!up.ok || !up.link) { alert("Falló la subida del documento."); return; }
      const ok = await guardarDoc(String(cliente.id), clave, {
        archivos: [{ nombre: up.nombre || archivo.name, link: up.link, driveId: up.id || "", mime: archivo.type, subidoPor: miRol || "Sistema", fecha: new Date().toISOString() }],
        validado: true, validadoPor: miRol || "Sistema",
      });
      if (ok) {
        setArchivosDocs((prev) => ({ ...prev, [clave]: null }));
        const docsNuevos = await fetchExpediente(cliente.id);
        setDocsExpediente(docsNuevos);
      } else alert("No se pudo guardar el documento.");
    } finally {
      setSubiendoDoc(null);
    }
  }

  async function confirmarValidacionSucursal() {
    setValidando(true);
    try {
      // 👇 Si la DGE levantó el candado, se guarda así en el registro de quién
      // validó — para que después se pueda saber que faltaban documentos.
      const quien = candadoLevantado ? `${miRol || "DGE"} (desbloqueo DGE, sin documentos completos)` : (miRol || "Sistema");
      const ok = await marcarDatosValidadosSucursal(cliente.id, quien);
      if (ok) setCliente({ ...cliente, datosValidadosSucursal: true, validadoSucursalPor: miRol || "Sistema", fechaValidadoSucursal: new Date().toISOString() });
      else alert("No se pudo guardar la validación.");
    } finally {
      setValidando(false);
    }
  }

  async function enviarLlenadoSucursal() {
    if (!fFechaFirma || !fFechaVencimiento) { alert("Captura al menos las fechas de firma y vencimiento."); return; }
    if (!documentosCompletos && !candadoLevantado) { alert("Faltan documentos obligatorios por subir en la pestaña Expediente."); return; }
    if (lineas.length === 0 || capitalTotal <= 0) { alert("Agrega al menos una línea de pago con monto."); return; }
    for (const l of lineas) {
      if (l.soporte === "sin_soporte" && !l.nota?.trim()) { alert("Toda línea sin soporte necesita una nota explicando por qué no lo tiene."); return; }
      if ((l.tipo === "cesion" || l.tipo === "escritura") && l.soporte !== "notarial_original" && l.soporte !== "sin_soporte") { alert("Un pago de cesión o escritura debe traer la solicitud de pago notarial original (o nota si no la tiene)."); return; }
      if (l.soporte === "efectivo_apoderado" && !l.doc && !l.archivo) { alert("El pago en efectivo necesita el comprobante de oficina firmado por el apoderado, adjunto."); return; }
    }
    setEnviandoLlenado(true);
    try {
      const exp = await generarExpediente(cliente);
      const carpetaId = exp?.carpetaId;
      const carpetaIdSegura: string | null = carpetaId || null;

      const lineasFinal: LineaPagoRdc[] = [];
      for (const l of lineas) {
        let doc: { url: string; nombre: string } | null | undefined = l.doc;
        if (l.archivo && carpetaIdSegura) {
          const base64 = await leerComoBase64(l.archivo);
          const up = await subirArchivoDrive({ carpetaId: carpetaIdSegura, nombre: l.archivo.name, base64, subcarpeta: "Soportes de pago RDC", mime: l.archivo.type, publico: true });
          if (up.ok) doc = { url: up.link!, nombre: up.nombre || l.archivo.name };
        }
        lineasFinal.push({ tipo: l.tipo, monto: Number(l.monto) || 0, soporte: l.soporte, nota: l.nota, doc: doc ?? null });
      }

      const ok = await guardarDatosSucursalRdc(cliente.id, {
        capital: String(capitalTotal), direccionGarantia: fDireccion || undefined, fechaFirma: fFechaFirma, fechaVencimiento: fFechaVencimiento,
        telefono: fTelefono || undefined, celular: fCelular || undefined, domicilio: fDomicilio || undefined,
        lineasPago: lineasFinal,
      }, miRol || "Sistema");

      // 👇 Mismo dato, mismo lugar: se escribe también en los documentos
      // "Contrato" y "Apartado" del Expediente — no queda un formulario
      // aparte y desconectado.
      const apartadoLinea = lineasFinal.find((l) => l.tipo === "apartado");
      await Promise.all([
        guardarDoc(String(cliente.id), "contrato", { valor: capitalTotal, valorFirma: capitalTotal, fecha: fFechaFirma, validado: true, validadoPor: miRol || "Sistema" }),
        apartadoLinea ? guardarDoc(String(cliente.id), "apartado", { valor: apartadoLinea.monto, validado: true, validadoPor: miRol || "Sistema" }) : Promise.resolve(null),
      ]);

      if (ok) {
        setCliente({ ...cliente, datosLlenadosSucursalEn: new Date().toISOString(), datosLlenadosSucursalPor: miRol || "Sistema" });
        alert("Datos enviados. Ahora RAC/sub-RAC deben confirmarlos.");
      } else {
        alert("No se pudieron guardar los datos.");
      }
    } finally {
      setEnviandoLlenado(false);
    }
  }

  async function generar() {
    setGenerando(true);
    try {
      const nueva = await registrarSolicitudFormal(cliente.id, miRol || "Sistema");
      if (!nueva) { alert("No se pudo registrar la solicitud."); return; }
      setRdc(nueva);
    } finally {
      setGenerando(false);
    }
  }

  async function elegir(quiereCompensacion: boolean) {
    try {
      const ok = await guardarEleccionCompensacion(cliente.id, quiereCompensacion, miRol || "Sistema");
      if (ok) await cargar();
      else alert("No se pudo guardar la elección.");
    } finally {
      setGuardandoEleccion(false);
    }
  }

  async function guardarPeticionesEspeciales() {
    if (!peticionesEspeciales.trim() && !docPeticion) return;
    setGuardandoPeticion(true);
    try {
      let doc: { url: string; nombre: string } | null = null;
      if (docPeticion) {
        const exp = await generarExpediente(cliente);
        if (exp?.carpetaId) {
          const base64 = await leerComoBase64(docPeticion);
          const up = await subirArchivoDrive({ carpetaId: exp.carpetaId, nombre: docPeticion.name, base64, subcarpeta: "Peticiones especiales", mime: docPeticion.type, publico: true });
          if (up.ok) doc = { url: up.link!, nombre: up.nombre || docPeticion.name };
        }
      }
      const ok = await guardarTerminosEspeciales(cliente.id, peticionesEspeciales.trim() || "(solo documento adjunto)", miRol || "Sistema", doc);
      if (ok) { setPeticionesEspeciales(""); setDocPeticion(null); await cargar(); alert("Petición guardada."); }
      else alert("No se pudo guardar la petición.");
    } finally {
      setGuardandoPeticion(false);
    }
  }

  // ── El documento que firma el cliente ─────────────────────────────────
  // Versión fiel del machote autorizado por la DGE
  // ("1-Solicitud-Formal-Eleccion-Modalidad.docx"), con las correcciones que
  // la DGE indicó el 01-sep-2026. Los datos entre negritas los llena el
  // sistema; el resto es texto fijo del machote y NO se edita aquí sin
  // autorización, porque es un documento que el cliente firma.
  //
  // OJO — este documento NO trae ningún monto de devolución. Solo advierte
  // que puede haber descuentos (10% o 35%) y que los confirma jurídico. El
  // número exacto se define hasta el Convenio, ya con esa validación.
  function construirHtml(): string {
    const nombreCli = (cliente.nombre || "____________________________").toUpperCase();
    // Plaza donde se presenta: la sucursal del cliente, porque la solicitud se
    // entrega en persona ahí. Se le agrega el estado con la misma función que
    // ya usa el cálculo de días hábiles, para que no salga solo la ciudad.
    const ciudad = cliente.sucursal || "Mazatl\u00e1n";
    const lugar = `${ciudad}, ${estadoDeSucursal(cliente.sucursal)}`;
    const hoy = new Date();
    const diaHoy = hoy.getDate();
    const mesHoy = hoy.toLocaleDateString("es-MX", { month: "long" });
    const anioHoy = hoy.getFullYear();

    // Vigente/Vencido — mismo criterio que el resto del sistema: la fecha de
    // vencimiento del contrato contra hoy. Vencido SUMA el 5% de terminación;
    // vigente RESTA el 10% de penalización por terminación anticipada.
    const hoyIso = hoy.toISOString().slice(0, 10);
    const contratoVencido = !!cliente.fechaVencimiento && cliente.fechaVencimiento <= hoyIso;
    const marcaVigente = !contratoVencido ? "&#9746;" : "&#9744;";
    const marcaVencido = contratoVencido ? "&#9746;" : "&#9744;";

    // Modalidad elegida — tres opciones excluyentes. R3 (cambio de garantía)
    // se lee del código del cliente, que ya existe; M1 y M2 salen de la
    // elección guardada. Si el cliente va a R3, ni M1 ni M2 se marcan.
    const esR3 = cliente.codigo === "R3";
    const marcaM1 = !esR3 && rdc?.solicitaCompensacion === true ? "&#9746;" : "&#9744;";
    const marcaM2 = !esR3 && rdc?.solicitaCompensacion === false ? "&#9746;" : "&#9744;";
    const marcaR3 = esR3 ? "&#9746;" : "&#9744;";

    // Los tres datos que la sucursal valida contra los documentos originales.
    const capitalValidado = capitalTotal > 0 ? money(capitalTotal) : "$__________";
    const fechaFirmaValidada = fFechaFirma ? fechaLarga(fFechaFirma) : cliente.fechaFirma ? fechaLarga(cliente.fechaFirma) : "____________________________";
    const domicilioValidado = fDireccion || cliente.direccionGarantia || "____________________________";

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Solicitud Formal de Devoluci&oacute;n</title>
<style>body{margin:0;padding:40px 50px;font-family:"Times New Roman",serif;font-size:12pt;line-height:1.6;color:#000;background:#fff}
table{border-collapse:collapse;width:100%}
h2{font-size:12pt;text-transform:uppercase;margin:22px 0 8px;border-bottom:1px solid #000;padding-bottom:3px}
.op{margin:0 0 12px;text-align:justify}
.aviso{border:1px solid #000;padding:10px 14px;margin:12px 0;text-align:justify;font-size:11pt}
@media print{body{padding:20mm 25mm}@page{margin:0;size:letter}}</style></head><body>

<p style="text-align:center;font-weight:800;font-size:14pt;text-transform:uppercase;margin:0 0 2px">Solicitud formal de devoluci&oacute;n</p>
<p style="text-align:center;font-style:italic;margin:0 0 18px">Hoja de elecci&oacute;n de modalidad</p>
<p style="text-align:center;font-weight:700;margin:0 0 22px">DESARROLLOS INTELIGENTES DE INMUEBLES Y PROPIEDADES ACCESIBLES, S.A. DE C.V.</p>

<p style="margin-bottom:16px">${lugar}, a <strong>${diaHoy}</strong> de <strong>${mesHoy}</strong> de <strong>${anioHoy}</strong></p>

<p style="text-align:justify;margin-bottom:12px">Por medio de la presente, yo, <strong style="border-bottom:1px solid #000;padding:0 4px">${nombreCli}</strong>, en mi car&aacute;cter de CLIENTE, solicito formalmente la devoluci&oacute;n de mi capital, en pleno uso de mi derecho y por voluntad propia, y manifiesto la modalidad que elijo para recibirla.</p>

<p style="text-align:justify;margin-bottom:12px">Presento esta solicitud de manera personal en sucursal, exhibiendo mi identificaci&oacute;n oficial vigente, y recibo en este acto acuse sellado y fechado.</p>

<h2>Datos a validar contra los documentos originales</h2>
<table style="font-size:11.5pt">
<tr><td style="padding:5px 0;width:36%"><strong>Capital</strong></td><td style="padding:5px 0;border-bottom:1px solid #000">${capitalValidado}</td></tr>
<tr><td style="padding:5px 0"><strong>Fecha de firma del contrato</strong></td><td style="padding:5px 0;border-bottom:1px solid #000">${fechaFirmaValidada}</td></tr>
<tr><td style="padding:5px 0"><strong>Domicilio de la garant&iacute;a</strong></td><td style="padding:5px 0;border-bottom:1px solid #000">${domicilioValidado}</td></tr>
</table>

<h2>Estado del contrato original</h2>
<p class="op">${marcaVigente}&nbsp;&nbsp;Contrato <strong>VIGENTE</strong></p>
<p class="op">${marcaVencido}&nbsp;&nbsp;Contrato <strong>VENCIDO</strong> &mdash; genera Compensaci&oacute;n por Terminaci&oacute;n del 5%</p>

<h2>Elijo la siguiente modalidad</h2>
<p class="op">${marcaM1}&nbsp;&nbsp;<strong>MODALIDAD 1 &mdash; Espero y recibo compensaci&oacute;n.</strong> 4% el primer a&ntilde;o y 5% el segundo, sobre mi capital. Mi primer abono, a los ${PLAZO_MESES_PRIMER_ABONO()} meses, es de compensaci&oacute;n; el capital viene despu&eacute;s, en el turno que me corresponda por antig&uuml;edad. Si mi contrato est&aacute; vencido, se me suma la Compensaci&oacute;n por Terminaci&oacute;n del 5%; si sigue vigente, se me descuenta el 10% de penalizaci&oacute;n por terminaci&oacute;n anticipada.</p>
<p class="op">${marcaM2}&nbsp;&nbsp;<strong>MODALIDAD 2 &mdash; No espero compensaci&oacute;n.</strong> Recibo &uacute;nicamente mi capital, sin el 4% ni el 5%. Si mi contrato est&aacute; vencido, se me suma la Compensaci&oacute;n por Terminaci&oacute;n del 5%; si sigue vigente, se me descuenta el 10% de penalizaci&oacute;n por terminaci&oacute;n anticipada. Mi primer abono, a los ${PLAZO_MESES_PRIMER_ABONO()} meses, es de capital, y los pagos siguientes se realizan aproximadamente cada ${MESES_ENTRE_ABONOS_TEXTO()} meses. Los recursos disponibles se reparten por mitad entre ambas modalidades.</p>
<p class="op">${marcaR3}&nbsp;&nbsp;<strong>CAMBIO DE GARANT&Iacute;A (R3) &mdash; No quiero efectivo.</strong> Solicito que lo pagado se aplique al valor de una nueva garant&iacute;a. A ese monto se le suma la Compensaci&oacute;n por Terminaci&oacute;n del 5% si mi contrato anterior estaba vencido, de modo que la nueva garant&iacute;a se recibe ya con esa compensaci&oacute;n incorporada. Entiendo que estas solicitudes se atienden con prioridad y que se formalizan en un contrato de cambio por separado.</p>
<p style="font-style:italic;margin:0 0 12px">Puedo cambiar de modalidad avisando por escrito en sucursal antes de firmar mi convenio.</p>

<div class="aviso">
<p style="font-weight:800;margin:0 0 6px">ADVERTENCIA SOBRE HONORARIOS DEVENGADOS</p>
<p style="margin:0">El monto final de mi devoluci&oacute;n depende de la etapa en que se encuentre mi garant&iacute;a y est&aacute; sujeto a la validaci&oacute;n del &aacute;rea jur&iacute;dica de DIIPA, conforme a la Cl&aacute;usula D&eacute;cima Octava de mi Contrato de Prestaci&oacute;n de Servicios Profesionales. Si a&uacute;n no se emiten dict&aacute;menes, se descuenta el 10% de lo pagado a la fecha; si mi garant&iacute;a ya cuenta con dictamen jur&iacute;dico positivo, se retienen honorarios legales devengados de hasta el 35% del valor de la operaci&oacute;n. El apartado de $10,000.00 no es reembolsable en ning&uacute;n caso. <strong>El porcentaje que me corresponde se confirma por escrito con el &aacute;rea jur&iacute;dica antes de la firma de mi convenio, y se me informa junto con el monto y el calendario.</strong></p>
</div>

<h2>Qu&eacute; sigue despu&eacute;s de esta solicitud</h2>
<ul style="margin:0 0 12px;padding-left:22px">
<li style="margin-bottom:7px;text-align:justify">Recibo acuse sellado y fechado en el acto.</li>
<li style="margin-bottom:7px;text-align:justify">Una vez validados mis datos contra los documentos originales, dentro de los ${PLAZO_REVISION_MIN_DIAS()} d&iacute;as naturales siguientes se habilita y se me entrega mi Solicitud Formal.</li>
<li style="margin-bottom:7px;text-align:justify"><strong>Transcurridos ${PLAZO_DEFINICION_DIAS()} d&iacute;as naturales desde esta solicitud, y una vez que ella quede cargada y firmada en el sistema, podr&eacute; descargar el convenio de la modalidad que eleg&iacute;.</strong></li>
<li style="margin-bottom:7px;text-align:justify">DIIPA cuenta con ${PLAZO_MESES_REVISION_EXPEDIENTE()} meses para revisar mi expediente y confirmarme por escrito monto y calendario.</li>
<li style="margin-bottom:7px;text-align:justify">El primer abono se realiza ${PLAZO_MESES_PRIMER_ABONO()} meses despu&eacute;s de la firma del convenio.</li>
<li style="text-align:justify"><strong>Desde el momento en que presento esta Solicitud Formal quedo desvinculado de mi garant&iacute;a</strong>, ya que mi asunto entra como devoluci&oacute;n y DIIPA nunca me niega esa solicitud.</li>
</ul>

<h2>Manifestaciones</h2>
<p style="text-align:justify;margin-bottom:12px">Declaro que presento esta solicitud de buena fe, sin que medie enga&ntilde;o alguno, en t&eacute;rminos del art&iacute;culo 1815 del C&oacute;digo Civil Federal.</p>
<p style="text-align:justify;margin-bottom:12px">Declaro que recib&iacute; y le&iacute; el documento informativo &ldquo;Qu&eacute; pasa con tu capital si pides tu devoluci&oacute;n&rdquo;, que entiendo que los pagos se cubren con los ingresos de la empresa, y que el calendario que se me confirme es una estimaci&oacute;n de buena fe.</p>

<table style="margin-top:55px;width:100%"><tr>
<td style="text-align:center;border-top:1px solid #000;padding-top:6px;width:45%"><strong>${nombreCli}</strong><br><span style="font-size:10.5pt">Nombre y firma del CLIENTE</span></td>
<td style="width:10%"></td>
<td style="text-align:center;border-top:1px solid #000;padding-top:6px;width:45%"><strong>${miRol || "____________________________"}</strong><br><span style="font-size:10.5pt">RAC / Sub-RAC &middot; DIIPA</span></td>
</tr></table>

<p style="font-style:italic;font-size:10.5pt;margin-top:24px">Acuse: el CLIENTE conserva copia sellada y fechada de esta solicitud.</p>
</body></html>`;
  }

  function imprimir() {
    const win = window.open("", "_blank", "width=820,height=900");
    if (!win) { alert("Tu navegador bloque\u00f3 la ventana. Permite popups para esta p\u00e1gina."); return; }
    win.document.write(construirHtml() + "<script>window.onload=function(){setTimeout(function(){window.print();},300)};<\/script>");
    win.document.close();
  }

  if (cargando) {
    return (
      <div className="rounded-xl border border-black/10 bg-white p-3 text-[13px] text-humo">
        Cargando la Solicitud Formal…
      </div>
    );
  }

  // 👇 Nunca dejar la pantalla en blanco: si la lectura falló, se dice y se
  // ofrece reintentar. Un panel vacío hace creer que el cliente no tiene
  // proceso, y sí lo tiene.
  if (errorCarga) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-[13px]">
        <p className="mb-1 font-semibold text-rose-800">No se pudo abrir la Solicitud Formal de este cliente</p>
        <p className="mb-2 text-rose-700">Su proceso de devolución sigue ahí; lo que falló fue la lectura. Vuelve a intentar.</p>
        <p className="mb-2 rounded-lg bg-white/70 px-2 py-1 font-mono text-[11.5px] text-rose-800">{errorCarga}</p>
        <button onClick={() => { setCargando(true); cargar(); }} className="rounded-lg bg-rose-700 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-rose-800">
          Reintentar
        </button>
      </div>
    );
  }

  // ── Cuándo deja de mostrarse la Solicitud Formal ─────────────────────
  //
  // 👇 AQUÍ ESTABA EL "NO PUEDO LLENAR DATOS". Esta línea decía
  // `if (rdc?.folio) return null;` creyendo que `folio` significaba "ya hay
  // Convenio". No: `folio` (RDC-2026-XXXXXX) se asigna en el momento en que se
  // PIDE la devolución —estado "solicitada"—, así que lo tiene casi todo el
  // mundo desde el día 1. Resultado: la Solicitud Formal se devolvía en blanco
  // para 110 de los 112 expedientes con folio y sin Convenio, y el proceso se
  // veía "bloqueado" sin decir por qué.
  //
  // Tampoco sirve `docConvenio`: hay convenios generados FUERA DE ORDEN, con
  // el expediente todavía en "solicitada", sin validar datos en sucursal y sin
  // Solicitud Formal. Esos clientes se saltaron el paso, no lo cumplieron.
  //
  // REGLA DE LA DGE: todos los clientes pasan por el proceso completo desde
  // validar datos, y todos imprimen y firman su Solicitud Formal. Por eso la
  // única prueba de que esta pantalla ya cumplió su propósito es que la
  // Solicitud Formal esté FIRMADA y confirmada.
  if (rdc?.solicitudFirmadaEn) return null;

  // ── Faltan datos por validar en sucursal contra el contrato físico ───
  if (!cliente.datosValidadosSucursal) {
    const yaLlenado = !!cliente.datosLlenadosSucursalEn;

    // Paso 2: RAC/sub-RAC confirman lo que ya se llenó.
    if (yaLlenado) {
      return (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-[12.5px]">
          <p className="mb-2 font-semibold text-amber-800">📋 Solicitud Formal de Devolución</p>
          <div className="mb-2 flex gap-2 rounded-lg bg-blue-100 p-2.5">
            <span className="text-[16px]">📎</span>
            <div>
              <p className="font-semibold text-blue-800">Datos ya llenados, falta confirmar</p>
              <p className="mt-0.5 text-[11.5px] text-blue-700">Llenados por {cliente.datosLlenadosSucursalPor} — {cliente.datosLlenadosSucursalEn ? fechaCorta(cliente.datosLlenadosSucursalEn) : ""}.</p>
            </div>
          </div>
          <div className="mb-2 grid grid-cols-2 gap-1 rounded-lg bg-white p-2 text-[11px] text-tinta">
            <span>Capital: <strong>{cliente.valorFirma || "—"}</strong></span>
            <span>Vencimiento: <strong>{cliente.fechaVencimiento ? fechaCorta(cliente.fechaVencimiento) : "—"}</strong></span>
          </div>
          {/* 👇 Documentos reales — conectados a expediente_documentos (lo
              mismo que se sube en el paso 2), no al campo viejo del cliente
              que nunca se actualizaba. RAC/Sub-RAC ven el link de cada uno
              para revisarlo de verdad, no solo un check. */}
          <div className="mb-2 rounded-lg bg-white p-2">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-humo">Documentos para validar</p>
            <div className="space-y-1">
              {obligatorios.map((o) => {
                const doc = docsExpediente.find((d) => d.clave === o.clave);
                const archivo = doc?.archivos?.[doc.archivos.length - 1];
                return (
                  <div key={o.clave} className="flex items-center justify-between gap-2 text-[11.5px]">
                    <span className="text-tinta">{o.titulo}</span>
                    {archivo?.link ? (
                      <a href={archivo.link} target="_blank" rel="noreferrer" className="font-semibold text-teal hover:underline">✓ Ver documento</a>
                    ) : (
                      <span className="font-semibold text-rose-700">falta</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {puedeHabilitar ? (
            <>
              {/* 👇 Solo la DGE ve este botón, y solo cuando faltan documentos. */}
              {!documentosCompletos && esDGE && !candadoLevantado && (
                <button
                  onClick={() => { if (confirm("Vas a validar SIN los documentos obligatorios completos.\n\nEsto queda registrado a tu nombre como DGE. ¿Continuamos?")) setCandadoLevantado(true); }}
                  className="mb-1.5 w-full rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-[12px] font-semibold text-amber-800 hover:bg-amber-50"
                >
                  🔓 Desbloquear validación (DGE)
                </button>
              )}
              {candadoLevantado && (
                <p className="mb-1.5 rounded-lg bg-amber-100 px-2 py-1 text-[11.5px] font-semibold text-amber-800">
                  🔓 Candado levantado por la DGE — se validará sin documentos completos.
                </p>
              )}
              <button onClick={confirmarValidacionSucursal} disabled={validando || (!documentosCompletos && !candadoLevantado)} title={!documentosCompletos && !candadoLevantado ? "Faltan documentos por subir" : ""} className="w-full rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
                {validando ? "Guardando…" : !documentosCompletos && !candadoLevantado ? "Faltan documentos por subir" : "✅ Confirmar datos validados"}
              </button>
            </>
          ) : (
            <p className="text-[11.5px] text-amber-700">Solo RAC/sub-RAC pueden confirmar esta validación.</p>
          )}
        </div>
      );
    }

    // Paso 1: colaborador/asesor/gerente de sucursal/gerente/DGC/RAC llenan los datos.
    if (!puedeLlenarSucursal) {
      return (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-[12.5px]">
          <p className="mb-2 font-semibold text-amber-800">📋 Solicitud Formal de Devolución</p>
          <div className="flex gap-2 rounded-lg bg-amber-100 p-2.5">
            <span className="text-[16px]">⚠️</span>
            <div>
              <p className="font-semibold text-amber-800">Faltan datos por validar en sucursal</p>
              <p className="mt-0.5 text-[11.5px] text-amber-700">Este cliente aún no pasó por la validación contra su contrato físico y sus documentos obligatorios. No se puede continuar hasta que RAC o sub-RAC confirmen los datos.</p>
            </div>
          </div>
        </div>
      );
    }

    const prev = previsualizarRDC(cliente);
    const pasos = [
      { n: 1, nombre: "Contacto y garantía" },
      { n: 2, nombre: "Documentos" },
      { n: 3, nombre: "Líneas de pago" },
      { n: 4, nombre: "Confirmar" },
    ];
    const paso1Completo = !!fFechaFirma && !!fFechaVencimiento;
    const paso2Completo = documentosCompletos;
    const paso3Completo = lineas.length > 0 && capitalTotal > 0;

    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-[14px]">
        <p className="mb-2 text-[16px] font-semibold text-amber-800">📋 Solicitud Formal de Devolución</p>
        <div className="mb-3 flex gap-2 rounded-lg bg-amber-100 p-2.5">
          <span className="text-[16px]">⚠️</span>
          <div>
            <p className="font-semibold text-amber-800">Faltan datos por validar en sucursal</p>
            <p className="mt-0.5 text-[13px] text-amber-700">Este cliente aún no pasó por la validación contra su contrato físico y sus documentos obligatorios.</p>
          </div>
        </div>

        {/* Barra de progreso */}
        <div className="mb-3 flex gap-1.5">
          {pasos.map((p) => (
            <div key={p.n} className={"h-[5px] flex-1 rounded-full " + (p.n < paso ? "bg-emerald-500" : p.n === paso ? "bg-blue-600" : "bg-black/10")} />
          ))}
        </div>
        <p className="mb-3 text-[13px] text-humo">Paso {paso} de 4 · {pasos[paso - 1].nombre}</p>

        {/* Ganancia proyectada — visible desde el primer paso */}
        {capitalTotal > 0 && (
          <div className="mb-4 rounded-lg bg-emerald-50 px-3 py-2.5">
            <p className="text-[14px] text-emerald-800">💰 Si completa este trámite, el cliente puede ganar hasta <strong>{money(prev.totalAnio2 - prev.capital)}</strong> ({money(capitalTotal)} de capital)</p>
          </div>
        )}

        {/* Paso 1: Contacto y garantía */}
        {paso === 1 && (
          <div className="mb-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div>
              <label className="mb-0.5 block text-[13px] text-humo">Teléfono</label>
              <input type="text" value={fTelefono} onChange={(e) => setFTelefono(e.target.value)} className="w-full rounded-lg border border-black/10 px-2.5 py-2 text-[14px]" />
            </div>
            <div>
              <label className="mb-0.5 block text-[13px] text-humo">Celular</label>
              <input type="text" value={fCelular} onChange={(e) => setFCelular(e.target.value)} className="w-full rounded-lg border border-black/10 px-2.5 py-2 text-[14px]" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-0.5 block text-[13px] text-humo">Domicilio del cliente (según comprobante)</label>
              <input type="text" value={fDomicilio} onChange={(e) => setFDomicilio(e.target.value)} className="w-full rounded-lg border border-black/10 px-2.5 py-2 text-[14px]" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-0.5 block text-[13px] text-humo">Dirección de la garantía</label>
              <input type="text" value={fDireccion} onChange={(e) => setFDireccion(e.target.value)} className="w-full rounded-lg border border-black/10 px-2.5 py-2 text-[14px]" />
            </div>
            <div>
              <label className="mb-0.5 block text-[13px] text-humo">Fecha de firma</label>
              <input type="date" value={fFechaFirma} onChange={(e) => setFFechaFirma(e.target.value)} className="w-full rounded-lg border border-black/10 px-2.5 py-2 text-[14px]" />
            </div>
            <div>
              <label className="mb-0.5 block text-[13px] text-humo">Fecha de vencimiento (calculada, 12 meses hábiles)</label>
              <input type="date" value={fFechaVencimiento} onChange={(e) => setFFechaVencimiento(e.target.value)} className="w-full rounded-lg border border-black/10 bg-nube/40 px-2.5 py-2 text-[14px]" />
            </div>
            {(() => {
              const docContrato = docsExpediente.find((d) => d.clave === "contrato");
              const docApartado = docsExpediente.find((d) => d.clave === "apartado");
              if (!docContrato?.valor && !docApartado?.valor) return null;
              return (
                <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-2.5 text-[13px] sm:col-span-2">
                  <p className="mb-1 font-semibold text-blue-800">📋 Ya hay valores capturados en Expediente</p>
                  {docContrato?.valor != null && <p className="text-blue-700">Contrato: {money(docContrato.valor)} {docContrato.fecha ? `· ${fechaCorta(docContrato.fecha)}` : ""}</p>}
                  {docApartado?.valor != null && <p className="text-blue-700">Apartado: {money(docApartado.valor)}</p>}
                  <p className="mt-1 text-blue-600">Al guardar, se actualizan esos mismos documentos — no se duplica.</p>
                </div>
              );
            })()}
          </div>
        )}

        {/* Paso 2: Documentos obligatorios — se suben directo aquí, van al Expediente */}
        {paso === 2 && (
          <div className="mb-3 space-y-2">
            {obligatorios.map((o) => {
              const listo = tieneDoc(o.clave);
              return (
                <div key={o.clave} className={"rounded-lg p-2.5 " + (listo ? "bg-emerald-50" : "bg-rose-50")}>
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] font-semibold text-tinta">{o.titulo}</span>
                    <span className={"text-[13px] font-semibold " + (listo ? "text-emerald-700" : "text-rose-700")}>{listo ? "✓ subido" : "✗ falta"}</span>
                  </div>
                  {!listo && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <input type="file" onChange={(e) => setArchivosDocs((prev) => ({ ...prev, [o.clave]: e.target.files?.[0] || null }))} className="flex-1 text-[13px] file:mr-1 file:rounded file:border-0 file:bg-rose-100 file:px-1.5 file:py-1 file:text-[13px] file:font-semibold file:text-rose-700" />
                      <button onClick={() => subirDocumentoObligatorio(o.clave)} disabled={!archivosDocs[o.clave] || subiendoDoc === o.clave} className="rounded-lg bg-rose-600 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
                        {subiendoDoc === o.clave ? "Subiendo…" : "Subir"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            <p className="text-[12.5px] text-humo">Estos documentos quedan guardados en la pestaña "Expediente" de la ficha — no se duplican.</p>
          </div>
        )}

        {/* Paso 3: Líneas de pago */}
        {paso === 3 && (
          <div className="mb-3">
            <div className="mb-2 space-y-2">
              {lineas.map((l, i) => (
                <div key={i} className="rounded-lg border border-black/10 bg-white p-2.5">
                  <div className="mb-1.5 grid grid-cols-2 gap-1.5">
                    <select value={l.tipo} onChange={(e) => actualizarLinea(i, { tipo: e.target.value as LineaPagoRdc["tipo"] })} className="rounded-lg border border-black/10 px-2 py-1.5 text-[13px]">
                      <option value="contrato">Contrato</option>
                      <option value="apartado">Apartado</option>
                      <option value="segundo_pago">Segundo pago</option>
                      <option value="cesion">Cesión</option>
                      <option value="escritura">Escritura</option>
                      <option value="otro">Otro pago</option>
                    </select>
                    <input type="number" placeholder="Monto" value={l.monto || ""} onChange={(e) => actualizarLinea(i, { monto: Number(e.target.value) })} className="rounded-lg border border-black/10 px-2 py-1.5 text-[13px]" />
                  </div>
                  <select value={l.soporte} onChange={(e) => actualizarLinea(i, { soporte: e.target.value as LineaPagoRdc["soporte"] })} className="mb-1.5 w-full rounded-lg border border-black/10 px-2 py-1.5 text-[13px]">
                    {(l.tipo === "cesion" || l.tipo === "escritura") ? (
                      <option value="notarial_original">Solicitud de pago notarial original</option>
                    ) : (
                      <option value="documento_original">Documento original</option>
                    )}
                    <option value="efectivo_apoderado">Efectivo — comprobante de oficina firmado por el apoderado</option>
                    <option value="correo">Correo donde llegó</option>
                    <option value="sin_soporte">No trae soporte (requiere nota)</option>
                  </select>
                  {l.soporte === "sin_soporte" ? (
                    <textarea rows={2} placeholder="¿Por qué no trae el soporte?" value={l.nota || ""} onChange={(e) => actualizarLinea(i, { nota: e.target.value })} className="w-full rounded-lg border border-black/10 px-2 py-1.5 text-[13px]" />
                  ) : (
                    <input type="file" onChange={(e) => actualizarLinea(i, { archivo: e.target.files?.[0] || null })} className="w-full text-[13px] file:mr-1 file:rounded file:border-0 file:bg-amber-100 file:px-1.5 file:py-1 file:text-[13px] file:font-semibold file:text-amber-700" />
                  )}
                  {lineas.length > 1 && <button onClick={() => quitarLinea(i)} className="mt-1 text-[13px] text-rose-600 hover:underline">Quitar línea</button>}
                </div>
              ))}
              <button onClick={agregarLinea} className="w-full rounded-lg border border-dashed border-black/15 py-2 text-[13px] font-semibold text-humo hover:bg-nube/40">+ Agregar otro pago</button>
            </div>
            <p className="text-[14px] font-semibold text-tinta">Capital total: {money(capitalTotal)}</p>
          </div>
        )}

        {/* Paso 4: Confirmar y enviar */}
        {paso === 4 && (
          <div className="mb-3 space-y-2">
            <div className="rounded-lg bg-white p-3 text-[14px]">
              <p className="mb-1"><span className="text-humo">Capital:</span> <strong>{money(capitalTotal)}</strong></p>
              <p className="mb-1"><span className="text-humo">Domicilio:</span> <strong>{fDomicilio || "—"}</strong></p>
              <p className="mb-1"><span className="text-humo">Garantía:</span> <strong>{fDireccion || "—"}</strong></p>
              <p><span className="text-humo">Vencimiento:</span> <strong>{fFechaVencimiento ? fechaCorta(fFechaVencimiento) : "—"}</strong></p>
            </div>
            <div className="rounded-lg bg-emerald-50 p-3 text-[14px] text-emerald-800">
              💰 Ganancia proyectada a 2 años: <strong>{money(prev.totalAnio2 - prev.capital)}</strong>
            </div>
            <button onClick={enviarLlenadoSucursal} disabled={enviandoLlenado} className="w-full rounded-lg bg-amber-600 px-4 py-2.5 text-[15px] font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
              {enviandoLlenado ? "Guardando…" : "Enviar a validar con RAC/sub-RAC"}
            </button>
          </div>
        )}

        {/* Autoguardado — ya no hace falta botón ni salir a comprobar.
            Se guarda solo 1.5s después de que dejas de escribir. */}
        {paso < 4 && (
          <div className="mb-2 flex items-center justify-center gap-1.5 rounded-lg bg-teal-soft/20 px-4 py-2 text-[12.5px] font-semibold text-teal-dark">
            {guardandoAvance ? (
              <>⏳ Guardando…</>
            ) : ultimoGuardado ? (
              <>✓ Guardado automáticamente — {ultimoGuardado.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" })}</>
            ) : (
              <>Se guarda solo mientras escribes</>
            )}
          </div>
        )}

        {/* Navegación */}
        <div className="flex gap-2">
          {paso > 1 && (
            <button onClick={() => setPaso(paso - 1)} className="flex-1 rounded-lg border border-black/10 bg-white px-4 py-2.5 text-[14px] font-semibold text-tinta hover:bg-nube">← Atrás</button>
          )}
          {paso < 4 && (
            <button
              onClick={() => setPaso(paso + 1)}
              disabled={(paso === 1 && !paso1Completo) || (paso === 2 && !paso2Completo) || (paso === 3 && !paso3Completo)}
              className="flex-1 rounded-lg bg-blue-700 px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {paso === 1 && !paso1Completo ? "Siguiente (faltan fechas)" : paso === 2 && !paso2Completo ? "Siguiente (faltan documentos)" : paso === 3 && !paso3Completo ? "Siguiente (falta capital)" : "Siguiente →"}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Caso: aún no existe ningún registro ──────────────────────────────
  if (!rdc) {
    if (puedeHabilitar) {
      return (
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 text-[12.5px]">
          <p className="mb-2 font-semibold text-blue-800">📋 Solicitud Formal de Devolución</p>
          <p className="mb-2 text-[11.5px] text-humo">Aún no se ha registrado la solicitud de este cliente.</p>
          <button onClick={generar} disabled={generando} className="rounded-lg bg-blue-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
            {generando ? "Registrando…" : "Registrar solicitud formal"}
          </button>
        </div>
      );
    }
    if (puedeSolicitarFormal) {
      if (verEspacio) {
        return (
          <div className="rounded-xl border border-purple-200 bg-white">
            <EspacioSolicitudDevolucion cliente={cliente} onCerrar={() => setVerEspacio(false)} onAbrioR3={() => setVerEspacio(false)} />
          </div>
        );
      }
      return (
        <div className="rounded-xl border border-purple-200 bg-purple-50/60 p-3 text-[12.5px]">
          <p className="mb-2 font-semibold text-purple-800">📋 Solicitud Formal de Devolución</p>
          <p className="mb-2 text-[11.5px] text-humo">Aún no se ha iniciado el proceso de este cliente.</p>
          <button onClick={() => setVerEspacio(true)} className="w-full rounded-lg bg-purple-700 px-3 py-2 text-sm font-semibold text-white hover:bg-purple-800">
            Solicitar devolución formal →
          </button>
        </div>
      );
    }
    return null;
  }

  // ── Caso: ya se pidió/registró, pero aún no hay folio (Convenio) ─────
  const pedidaPorGerente = !!rdc.solicitadoIniciarPor && !rdc.revisadoPor;

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 text-[12.5px]">
      <p className="mb-2 font-semibold text-blue-800">📋 Solicitud Formal de Devolución</p>

      {/* 👇 Resumen de QUÉ solicitud es y PARA QUÉ sirve. Antes solo decía la
          fecha suelta: no se veía si el documento era el generado por el
          sistema o el que el cliente trajo a mano, ni quedaba dicho que este
          paso es el que mete al cliente a la fila de pagos. */}
      <div className="mb-3 rounded-lg border border-blue-200 bg-white p-2.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
          <span className="text-humo">
            Solicitada el <strong className="text-tinta">{fechaCorta(rdc.fechaSolicitudDev) || "— sin fecha —"}</strong>
          </span>
          <span className="text-humo">
            Documento:{" "}
            <strong className="text-tinta">
              {rdc.docSolicitudFormalUrl
                ? `generado por el sistema · ${rdc.folioSolicitud || "sin folio"}`
                : cliente.docSolicitudDevolucion?.url
                  ? "subido a mano por sucursal"
                  : "todavía no existe"}
            </strong>
          </span>
          {rdc.solicitadoIniciarPor && (
            <span className="text-humo">Pedida por <strong className="text-tinta">{rdc.solicitadoIniciarPor}</strong></span>
          )}
        </div>
        <p className="mt-1.5 text-[11.5px] text-blue-800">
          Al firmarse esta Solicitud, el cliente <strong>entra a la fila de pagos</strong> con su turno
          por fecha de solicitud. Sin ella firmada no se genera el Convenio ni se programa ningún abono.
        </p>
        {!rdc.fechaSolicitudDev && (
          <p className="mt-1.5 text-[11.5px] font-semibold text-amber-800">
            ⚠️ No tiene fecha de solicitud registrada. Sin fecha no se le puede asignar turno en la fila.
          </p>
        )}
      </div>

      {pedidaPorGerente && (
        <p className="mb-2 rounded-lg bg-amber-100 px-2 py-1.5 text-[11.5px] font-semibold text-amber-800">
          ⏳ Pedida por {rdc.solicitadoIniciarPor} · pendiente de que RAC/SRAC/DGE la revisen
          {rdc.fechaLimiteRevision && ` (vence ${fechaCorta(rdc.fechaLimiteRevision)})`}
        </p>
      )}

      {(() => {
        // 👇 Guarda de tipo: dentro de este bloque `rdc` ya existe. Se deja
        // explícita para que TypeScript lo sepa (tsc corre en el build de
        // Netlify y sin esto marca "rdc is possibly null").
        if (!rdc) return null;

        // 👇 Bloque del documento subido a mano. Se muestra SIEMPRE que exista,
        // esté o no generada la Solicitud Formal: son dos documentos, no uno.
        const bloqueAMano = urlSolicitudAMano ? (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-left">
            <p className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-amber-800">
              📎 Solicitud a mano (antecedente)
            </p>
            <p className="mb-1.5 text-[11.5px] text-amber-800">
              La entregó el cliente en papel antes del sistema. No sustituye a la Solicitud Formal:
              se conserva como antecedente y es la que le da su <strong>fecha de entrada a la fila</strong>.
              {cliente.docSolicitudDevolucion?.nombre && (
                <> Archivo: <strong>{cliente.docSolicitudDevolucion.nombre}</strong>.</>
              )}
            </p>
            <a href={urlSolicitudAMano} target="_blank" rel="noreferrer" className="text-[13px] font-semibold text-amber-900 underline">
              Ver la solicitud a mano →
            </a>
          </div>
        ) : null;

        if (urlDocumentoQR) {
          return (
            <>
            {bloqueAMano}
            <div className="mb-3 rounded-lg border border-blue-200 bg-white p-3 text-center">
              <p className="mb-1.5 text-[13px] font-semibold uppercase tracking-wide text-humo">
                Solicitud Formal · {rdc.folioSolicitud}
              </p>
              <canvas ref={qrRef} width={140} height={140} className="mx-auto" style={{ width: 140, height: 140, maxWidth: 140 }} />
              <a href={urlDocumentoQR} target="_blank" rel="noreferrer" className="mt-1.5 block text-[13px] font-semibold text-teal hover:underline">
                Al leer el QR se abre el documento →
              </a>
              {rdc.solicitudFirmadaEn ? (
                <div className="mt-2 rounded-lg bg-emerald-100 px-3 py-2 text-left">
                  <p className="text-[13px] font-semibold text-emerald-800">✅ Firmada el {fechaCorta(rdc.solicitudFirmadaEn.slice(0, 10))}</p>
                  {rdc.solicitudFirmadaDocUrl && <a href={rdc.solicitudFirmadaDocUrl} target="_blank" rel="noreferrer" className="text-[13px] font-semibold text-emerald-700 underline">📎 Ver documento físico firmado</a>}
                </div>
              ) : puedeHabilitar ? (
                <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50/50 p-3 text-left">
                  <p className="mb-2 text-[13px] font-semibold text-blue-800">El cliente trae la Solicitud física, en persona:</p>

                  <label className="mb-1 block text-[13px] font-semibold text-humo">Adjuntar documento firmado</label>
                  <input type="file" onChange={(e) => setArchivoFirmado(e.target.files?.[0] || null)} className="mb-3 w-full text-[13px] file:mr-1 file:rounded file:border-0 file:bg-blue-100 file:px-2 file:py-1 file:text-[13px] file:font-semibold file:text-blue-700" />

                  {rdc.solicitaCompensacion === null ? (
                    <p className="rounded-lg bg-amber-100 px-3 py-2 text-[13px] font-semibold text-amber-800">⚠️ Primero elige la modalidad del cliente (más abajo, "Elección del cliente") antes de marcar como firmada.</p>
                  ) : (
                    <p className="mb-2 text-[13px] text-humo">Modalidad elegida: <strong>{rdc.solicitaCompensacion ? "Sí quiere compensación" : "No, solo su capital"}</strong> — se envía junto con la firma.</p>
                  )}

                  <button
                    onClick={async () => {
                      setMarcandoFirma(true);
                      try {
                        let docUrl: string | null = null;
                        if (archivoFirmado) {
                          const exp = await generarExpediente(cliente);
                          if (exp?.carpetaId) {
                            const base64 = await leerComoBase64(archivoFirmado);
                            const up = await subirArchivoDrive({ carpetaId: exp.carpetaId, nombre: archivoFirmado.name, base64, subcarpeta: "Solicitud Formal firmada", mime: archivoFirmado.type, publico: true });
                            if (up.ok) docUrl = up.link || null;
                          }
                        }
                        // 👇 CANDADO: no se puede marcar como firmada una
                        // Solicitud que nunca se generó. Sin folio no hay
                        // documento que el cliente haya podido firmar.
                        if (!rdc.folioSolicitud && !cliente.docSolicitudDevolucion?.url) {
                          alert("No se puede marcar como firmada: esta Solicitud todavía no se genera.\n\nPrimero habilítala para que tenga folio y documento.");
                          return;
                        }
                        const ok = await marcarSolicitudFirmada(cliente.id, miRol || "Sistema", docUrl);
                        if (ok) { setArchivoFirmado(null); await cargar(); }
                        else alert("No se pudo guardar.");
                      } finally { setMarcandoFirma(false); }
                    }}
                    disabled={marcandoFirma || rdc.solicitaCompensacion === null}
                    className="w-full rounded-lg bg-blue-700 px-4 py-2.5 text-[15px] font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                  >
                    {marcandoFirma ? "Guardando…" : "Marcar como firmada y subir"}
                  </button>
                </div>
              ) : (
                <p className="mt-2 text-[13px] font-semibold text-amber-700">⏳ Aún sin firmar</p>
              )}
            </div>
            </>
          );
        }

        if (puedeHabilitar && rdc.revisadoPor && !rdc.folioSolicitud) {
          return (
            <>
            {bloqueAMano}
            <div className="mb-3 rounded-lg bg-amber-100 p-2.5">
              <p className="mb-1.5 text-[11.5px] font-semibold text-amber-800">✅ Ya se revisó — habilita la Solicitud Formal para generar su folio y QR.</p>
              <button
                onClick={async () => {
                  setHabilitando(true);
                  try {
                    const r = await habilitarYSubirSolicitud(cliente, construirHtml(), miRol || "Sistema");
                    if (r) await cargar();
                    else alert("No se pudo habilitar la Solicitud.");
                  } finally { setHabilitando(false); }
                }}
                disabled={habilitando}
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {habilitando ? "Generando…" : "Habilitar y generar QR"}
              </button>
            </div>
            </>
          );
        }

        // Sin Solicitud Formal todavía. Se muestra la de a mano (si la hay) y
        // se recuerda que la formal la imprime y firma TODO cliente.
        return (
          <>
            {bloqueAMano}
            <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-[12.5px] text-blue-800">
              <p className="font-semibold">Falta generar la Solicitud Formal</p>
              <p className="mt-0.5 text-blue-700">
                Todos los clientes imprimen y firman la Solicitud Formal del sistema, traigan o no
                solicitud a mano. Se habilita al terminar la validación de datos.
              </p>
            </div>
          </>
        );
      })()}

      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-humo">Elección del cliente</p>
      {puedeHabilitar ? (
        <div className="mb-2 flex flex-wrap gap-2">
          <button onClick={() => elegir(true)} disabled={guardandoEleccion} className={"rounded-lg border px-2.5 py-1.5 text-[11.5px] font-semibold " + (rdc.solicitaCompensacion === true ? "border-emerald-400 bg-emerald-100 text-emerald-800" : "border-black/10 bg-white text-tinta hover:bg-nube")}>
            ☑ Sí quiere la compensación 5%
          </button>
          <button onClick={() => elegir(false)} disabled={guardandoEleccion} className={"rounded-lg border px-2.5 py-1.5 text-[11.5px] font-semibold " + (rdc.solicitaCompensacion === false ? "border-amber-400 bg-amber-100 text-amber-800" : "border-black/10 bg-white text-tinta hover:bg-nube")}>
            ☐ NO, solo su capital
          </button>
        </div>
      ) : (
        <p className="mb-2 text-[12px] text-tinta">{rdc.solicitaCompensacion === null ? "Aún sin elección." : rdc.solicitaCompensacion ? "Eligió esperar la compensación." : "Eligió solo su capital."}</p>
      )}

      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-humo">Peticiones especiales del cliente (opcional)</p>
      {puedeHabilitar ? (
        <>
          <textarea
            rows={2}
            value={peticionesEspeciales}
            onChange={(e) => setPeticionesEspeciales(e.target.value)}
            placeholder="Si el cliente trae algo por escrito o pide algo distinto, anótalo aquí…"
            className="mb-1.5 w-full rounded-lg border border-black/10 px-2 py-1.5 text-[12px]"
          />
          <input type="file" onChange={(e) => setDocPeticion(e.target.files?.[0] || null)} className="mb-2 w-full text-[11px] file:mr-1 file:rounded file:border-0 file:bg-blue-100 file:px-1.5 file:py-0.5 file:text-[11px] file:font-semibold file:text-blue-700" />
          <button onClick={guardarPeticionesEspeciales} disabled={guardandoPeticion} className="mb-2 rounded-lg border border-blue-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-blue-800 hover:bg-blue-50 disabled:opacity-50">
            {guardandoPeticion ? "Guardando…" : "Guardar petición"}
          </button>
        </>
      ) : (
        rdc.terminosEspeciales && <p className="mb-2 rounded-lg bg-blue-50 p-2 text-[12px] text-blue-800">{rdc.terminosEspeciales}</p>
      )}

      {puedeHabilitar && (
        <button onClick={imprimir} className="rounded-lg border border-blue-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-blue-800 hover:bg-blue-50">
          🖨️ Imprimir / PDF
        </button>
      )}
    </div>
  );
}
