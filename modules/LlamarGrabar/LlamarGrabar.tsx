// VENTANITA LLAMAR Y GRABAR → va en: src/modules/LlamarGrabar/LlamarGrabar.tsx
import { useEffect, useRef, useState } from "react";
import { Device, type Call } from "@twilio/voice-sdk";
import { supabase } from "../../lib/supabase";
import { fetchColaboradores, type Colaborador } from "../../data/colaboradores";
import { listarColaboradoresJF, plataformaDeArea } from "../../lib/justiciaFacil";
import { agregarTarea } from "../../data/tareas";
import { fetchClientes, registrarCliente, CODIGO, origenCliente, type Cliente, type Area } from "../../data/clientes";
import { generarExpediente, type TipoExpediente } from "../../data/expediente";
import { generarExpedienteColaborador } from "../../data/expedienteColaborador";
import { invalidarClientes } from "../../data/clientes";

const MOTIVOS = ["Consulta general", "Información de su caso", "Documentos/papeles", "Pago/cobranza", "Agendar cita", "Queja/aclaración", "Otro"];
const RESULTADOS = ["Resuelta al 1er contacto", "En seguimiento", "Pendiente de documentos", "No contestó", "Buzón/no disponible", "Volver a llamar", "Número equivocado"];
const FASES = ["Nueva", "En proceso", "Esperando al cliente", "Esperando documentos", "En revisión jurídica", "Resuelta"];
const AREAS: Area[] = ["Comercial", "RAC", "Admin", "Jurídico", "UFC"];

const ASUNTOS_INTERNOS = [
  "Coordinar caso de un cliente",
  "Pasar / asignar una tarea",
  "Consultar estatus jurídico (URRJ / UCP / UCM)",
  "Pre-dictamen / dictamen (firmas)",
  "Cobranza / pago de fase (GAD)",
  "Comisión / convenio",
  "Cambio de garantía (R3)",
  "Devolución compensada (RDC)",
  "Escalamiento (conflicto → DIL)",
  "Autorización (DGE / GAD)",
  "Documentación / expediente",
  "Agenda / cita / recordatorio",
  "Otros (especificar)",
];

const AREA_NOMBRE: Record<string, string> = {
  juridico: "Jurídico", comercial: "Comercial", atencion: "Atención al Cliente",
  administracion: "Administración", contabilidad: "Contabilidad", tecnologia: "Tecnología", direccion: "Dirección",
};
function carpetaArea(a?: string | null): string {
  const k = (a || "").trim();
  return AREA_NOMBRE[k] || k || "General";
}
function normalizar(n: string): string {
  const limpio = (n || "").replace(/[^\d+]/g, "");
  if (limpio.startsWith("+")) return limpio;
  const soloDigitos = limpio.replace(/\D/g, "");
  if (soloDigitos.length === 10) return "+52" + soloDigitos;
  if (soloDigitos.length === 12 && soloDigitos.startsWith("52")) return "+" + soloDigitos;
  return "+" + soloDigitos;
}
function digitos(s: string): string {
  let d = (s || "").replace(/\D/g, "");
  if (d.length === 10) d = "52" + d;
  return d;
}

export default function LlamarGrabar({
  numero,
  nombre,
  area,
  interno = false,
  rol,
  colaborador,
  clienteIdVincular,
  onContactoReal,
  onCerrar,
}: {
  numero: string;
  nombre: string;
  area?: string | null;
  interno?: boolean;
  rol?: string;
  colaborador?: Colaborador;
  clienteIdVincular?: string;
  // Se dispara SOLO cuando hubo llamada conectada (grabada/subida a Drive) Y
  // se guardó el seguimiento ("Guardar detalles"). Sirve para que Seguimiento
  // marque la tarea como hecha de verdad. Si nadie lo pasa, no hace nada.
  onContactoReal?: (info: { telefono: string; clienteId?: string; link: string | null }) => void;
  onCerrar: () => void;
}) {
  const yo = (() => { try { return JSON.parse(localStorage.getItem("chat_yo") || "null"); } catch { return null; } })();
  const miNombre: string = yo?.nombre || "";
  const miArea: string = yo?.area || "";
  const [miCorreo, setMiCorreo] = useState("");

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [vinculado, setVinculado] = useState<Cliente | null>(null);
  const [tipoExp, setTipoExp] = useState<TipoExpediente>("Clientes");
  const [tel, setTel] = useState(numero || "");
  const [busca, setBusca] = useState("");
  const [modo, setModo] = useState<"vincular" | "nuevo">("vincular");

  const [nvNombre, setNvNombre] = useState("");
  const [nvTel, setNvTel] = useState(numero || "");
  const [nvCorreo, setNvCorreo] = useState("");
  const [nvArea, setNvArea] = useState<Area>("Comercial");
  const [nvTipo, setNvTipo] = useState<"Prospectos" | "Otras">("Prospectos");
  const [creando, setCreando] = useState(false);
  const [nvError, setNvError] = useState("");

  const [estado, setEstado] = useState("Preparando...");
  const [listo, setListo] = useState(false);
  const [enLlamada, setEnLlamada] = useState(false);
  const [grabando, setGrabando] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [ext, setExt] = useState("webm");
  const [estadoSubida, setEstadoSubida] = useState("");
  const [linkDrive, setLinkDrive] = useState<string | null>(null);
  const [subiendoDrive, setSubiendoDrive] = useState(false); // la grabación se está subiendo a Drive
  const [driveResuelto, setDriveResuelto] = useState(false); // ya terminó (con éxito o error)
  const [estadoBitacora, setEstadoBitacora] = useState("");

  const [llamadaId, setLlamadaId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [resultado, setResultado] = useState(RESULTADOS[0]);
  const [notaDetalle, setNotaDetalle] = useState("");
  const [guardandoDetalles, setGuardandoDetalles] = useState(false);
  const [estadoDetalles, setEstadoDetalles] = useState("");

  const [expUrl, setExpUrl] = useState<string | null>(null);
  const [generandoExp, setGenerandoExp] = useState(false);
  const [expEstado, setExpEstado] = useState("");

  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [asignarA, setAsignarA] = useState("");
  const [fase, setFase] = useState(FASES[0]);
  const [cuandoTarea, setCuandoTarea] = useState("");
  const [asunto, setAsunto] = useState(ASUNTOS_INTERNOS[0]);
  const [asuntoOtro, setAsuntoOtro] = useState("");
  const [resuelto, setResuelto] = useState("");

  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);
  const inicioRef = useRef<number>(0);
  const marcadoRef = useRef<{ tel: string; nombre: string; area: string | null; rol: string }>({ tel: "", nombre: "", area: null, rol: "" });

  const audioCtxRef = useRef<AudioContext | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    Promise.all([fetchColaboradores(), listarColaboradoresJF()]).then(([jc, jf]) => {
      const porCorreo = new Map<string, Colaborador>();
      for (const c of jc) if (c.activo !== false && c.correo) porCorreo.set(c.correo.trim().toLowerCase(), c);
      for (const c of jf) {
        const k = c.correo.trim().toLowerCase();
        if (!porCorreo.has(k)) {
          porCorreo.set(k, {
            id: "jf-" + k, nombre: c.nombre, puesto: c.rol || null, area: "juridico",
            extension: null, telefono: null, whatsapp: null, correo: c.correo, foto_url: null,
            numero_oficial: null, rol_sistema: null, rol_telefonia: null, activo: true, orden: 999,
            created_at: new Date().toISOString(),
          } as Colaborador);
        }
      }
      setColaboradores(Array.from(porCorreo.values()).sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "")));
    }).catch(() => {});
    fetchClientes().then((cs) => {
      setClientes(cs);
      if (!interno) {
        let m = clienteIdVincular ? (cs.find((c) => String(c.id) === String(clienteIdVincular)) || null) : null;
        if (!m && numero) { const d = digitos(numero); m = cs.find((c) => c.telefono && digitos(c.telefono) === d) || null; }
        if (m) { setVinculado(m); setTipoExp("Clientes"); }
      }
    }).catch(() => {});
    supabase.auth.getSession().then((r: any) => setMiCorreo(r?.data?.session?.user?.email || "")).catch(() => {});
  }, [numero, interno, clienteIdVincular]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        setEstado("Pidiendo permiso del micrófono...");
        await navigator.mediaDevices.getUserMedia({ audio: true });
        setEstado("Conectando...");
        const r = await fetch("/.netlify/functions/token-voz?identidad=dir_" + Date.now());
        const data = await r.json();
        if (!data.token) throw new Error("No vino token del servidor");
        if (cancelado) return;
        const device = new Device(data.token, { logLevel: "error" });
        deviceRef.current = device;
        device.on("registered", () => setEstado("Listo para llamar"));
        device.on("error", (e: any) => setEstado("Error: " + (e?.message || e)));
        await device.register();
        if (!cancelado) setListo(true);
      } catch (e: any) {
        setEstado("Error al preparar: " + (e?.message || e));
      }
    })();
    return () => {
      cancelado = true;
      try { callRef.current?.disconnect(); } catch {}
      try { deviceRef.current?.destroy(); } catch {}
    };
  }, []);

  function vincular(c: Cliente) {
    setVinculado(c);
    setTipoExp("Clientes");
    setTel(c.telefono || tel);
    setBusca("");
  }
  function desvincular() {
    setVinculado(null);
    setTipoExp("Clientes");
  }
  function vincularClienteInterno(c: Cliente) {
    setVinculado(c);
    setBusca("");
  }
  function quitarCliente() {
    setVinculado(null);
  }
  async function crearContacto() {
    if (!nvNombre.trim() || !nvTel.trim()) { setNvError("Pon al menos nombre y teléfono."); return; }
    setNvError("");
    setCreando(true);
    try {
      const nuevo = await registrarCliente({
        nombre: nvNombre.trim(),
        telefono: nvTel.trim(),
        email: nvCorreo.trim(),
        area: nvArea,
        expediente: "(nuevo desde llamada)",
        prospecto: nvTipo === "Prospectos" ? "PROSPECTO" : "OTRO",
      });
      setClientes((prev) => [...prev, nuevo]);
      setVinculado(nuevo);
      setTipoExp(nvTipo);
      setTel(nuevo.telefono || nvTel);
      setModo("vincular");
    } catch (e: any) {
      setNvError("No se pudo crear: " + (e?.message || e));
    } finally {
      setCreando(false);
    }
  }

  function blobABase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result).split(",")[1] || "");
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function asuntoFinalCalc(): string {
    return asunto === "Otros (especificar)" ? (asuntoOtro.trim() || "Otros") : asunto;
  }
  function notaInternaTxt(): string {
    const cli = vinculado ? "Cliente: " + vinculado.nombre + (vinculado.codigo ? " (" + vinculado.codigo + ")" : "") : "";
    const af = asuntoFinalCalc();
    return ["Llamada interna", rol || "", cli, af ? "Asunto: " + af : "", resuelto.trim() ? "Resuelto: " + resuelto.trim() : ""].filter(Boolean).join(" · ");
  }

  async function crearEnBitacora(duracion: number): Promise<{ id: string; folio: string } | null> {
    try {
      setEstadoBitacora("Guardando en bitácora...");
      const quienAtiende = miNombre + (miCorreo ? " · " + miCorreo : "");
      const { data, error } = await supabase.from("llamadas").insert({
        telefono: marcadoRef.current.tel || normalizar(tel),
        fecha: new Date().toISOString(),
        duracion,
        tipo: "saliente",
        nombre: marcadoRef.current.nombre || vinculado?.nombre || nombre,
        area: marcadoRef.current.area || miArea || area || null,
        motivo: interno ? asuntoFinalCalc() : null,
        nota: interno ? notaInternaTxt() : (notaDetalle.trim() || "Llamada grabada (por compu)"),
        registrado_por: quienAtiende || "sistema",
        // 👇 La ficha del cliente al que se le llamó. Sin este dato la llamada
        // se queda en el conmutador y NO llega al expediente ni cuenta para el
        // semáforo de seguimiento. El disparador trg_espejar_llamada de la base
        // la copia sola a comunicaciones_cliente en cuanto ve este campo lleno.
        cliente_id: vinculado ? Number(vinculado.id) : null,
        cliente_nombre: vinculado?.nombre ?? null,
      }).select("id, folio").single();
      if (error) { setEstadoBitacora("Error en bitácora: " + error.message); return null; }
      setEstadoBitacora("Registrada en bitácora");
      if (data?.id) setLlamadaId(String(data.id));
      return { id: String(data.id), folio: data.folio || "" };
    } catch (e: any) {
      setEstadoBitacora("Error en bitácora: " + (e?.message || e));
      return null;
    }
  }

  async function guardarDetalles() {
    if (!llamadaId) { onCerrar(); return; }
    setGuardandoDetalles(true);
    setEstadoDetalles("");
    const quienAtiende = miNombre + (miCorreo ? " · " + miCorreo : "");
    const cambios: any = interno
      ? {
          motivo: asuntoFinalCalc() || null,
          resultado: resuelto.trim() || null,
          nota: notaInternaTxt(),
          registrado_por: quienAtiende || "sistema",
        }
      : {
          motivo: motivo || null,
          resultado: resultado || null,
          nota: notaDetalle.trim() || "Llamada grabada (por compu)",
          registrado_por: quienAtiende || "sistema",
        };
    if (asignarA) {
      cambios.responsable = asignarA;
      cambios.fase = fase;
      cambios.devolver = true;
    }
    try {
      const { error } = await supabase.from("llamadas").update(cambios).eq("id", llamadaId);
      if (error) {
        setEstadoDetalles("Error al guardar: " + error.message);
      } else {
        setEstadoDetalles(asignarA ? `Guardado y asignado a ${asignarA} (${fase})` : "Detalles guardados ✓");

        // 👇 Crea la tarea en la AGENDA de la persona asignada (MiAgenda + MiCalendario).
        // Es independiente del flujo de Drive/Seguimiento de abajo.
        if (asignarA) {
          const colAsignado = colaboradores.find((c) => c.nombre === asignarA);
          const correoDest = (colAsignado?.correo || "").trim();
          if (correoDest) {
            const tituloTarea = vinculado?.nombre
              ? "Seguimiento: " + vinculado.nombre
              : (asuntoFinalCalc() || motivo || "Tarea asignada");
            const fechaTarea = cuandoTarea
              ? new Date(cuandoTarea + "T09:00:00").toISOString()
              : new Date().toISOString();
            await agregarTarea({
              autorEmail: correoDest,
              autorNombre: colAsignado?.nombre,
              tipo: "tarea",
              titulo: tituloTarea,
              detalle: `Asignada por ${miNombre || "Dirección"}${fase ? " · " + fase : ""}`,
              fecha: fechaTarea,
              clienteId: vinculado ? String(vinculado.id) : undefined,
              clienteNombre: vinculado?.nombre,
            }).catch(() => {});
          }
        }

        if (onContactoReal) {
          // Flujo de Seguimiento: la tarea SOLO se cierra si la grabación ya
          // quedó en Drive (igual que el correo exige su evidencia en Drive).
          if (linkDrive) {
            try {
              onContactoReal({
                telefono: marcadoRef.current.tel || normalizar(tel),
                clienteId: vinculado?.id != null ? String(vinculado.id) : clienteIdVincular,
                link: linkDrive,
              });
            } catch {}
            setTimeout(() => onCerrar(), 700);
          } else if (subiendoDrive || !driveResuelto) {
            setEstadoDetalles("⏳ La grabación todavía se está guardando en Drive. Espera un momento y vuelve a darle a “Guardar detalles”.");
          } else {
            setEstadoDetalles("⚠️ La tarea NO se cerró: la grabación no llegó a Drive (revisa el error de subida de arriba). Intenta la llamada de nuevo.");
          }
        } else {
          // Otros módulos (Clientes, Llamadas, Directorio): comportamiento normal.
          setTimeout(() => onCerrar(), 700);
        }
      }
    } catch (e: any) {
      setEstadoDetalles("Error al guardar: " + (e?.message || e));
    } finally {
      setGuardandoDetalles(false);
    }
  }

  async function generarOAbrirExpediente() {
    if (!vinculado) { setExpEstado("Primero vincula o crea un contacto."); return; }
    setGenerandoExp(true);
    setExpEstado("");
    try {
      const { data } = await supabase.from("clientes").select("expediente_url").eq("id", vinculado.id).single();
      const yaTiene: string | null = data?.expediente_url || null;
      if (yaTiene) {
        setExpUrl(yaTiene);
        setExpEstado("Ya tenía expediente — vinculado ✓");
        return;
      }
      const r = await generarExpediente(vinculado, tipoExp);
      if (r.ok && r.link) {
        await supabase.from("clientes").update({ expediente_url: r.link }).eq("id", vinculado.id);
        invalidarClientes();
        setExpUrl(r.link);
        setExpEstado("Expediente creado y guardado ✓");
      } else {
        setExpEstado("No se pudo: " + (r.error || "intenta de nuevo"));
      }
    } catch (e: any) {
      setExpEstado("Error: " + (e?.message || e));
    } finally {
      setGenerandoExp(false);
    }
  }

  async function generarExpColab() {
    if (!colaborador) { setExpEstado("Sin datos del colaborador."); return; }
    setGenerandoExp(true);
    setExpEstado("");
    try {
      const r = await generarExpedienteColaborador(colaborador);
      if (r.ok && r.link) { setExpUrl(r.link); setExpEstado("Expediente del colaborador listo ✓"); }
      else setExpEstado("No se pudo: " + (r.error || "intenta de nuevo"));
    } catch (e: any) {
      setExpEstado("Error: " + (e?.message || e));
    } finally {
      setGenerandoExp(false);
    }
  }

  async function subirADrive(blob: Blob, mime: string, folio: string, id: string | null) {
    setSubiendoDrive(true);
    setDriveResuelto(false);
    try {
      setLinkDrive(null);
      setEstadoSubida("Subiendo a Drive...");
      const base64 = await blobABase64(blob);
      const ext2 = mime.includes("ogg") ? "ogg" : "webm";
      const limpioNombre = (marcadoRef.current.nombre || "colaborador").replace(/[^\w]+/g, "_");
      const sello = new Date().toISOString().replace(/[:.]/g, "-");
      const base = folio ? `${folio}_${limpioNombre}` : `llamada_${limpioNombre}_${sello}`;
      const archivo = base + "." + ext2;

      // Carpeta del CLIENTE (su expediente). Consultamos la carpeta ACTUAL
      // (no la de memoria, que puede estar vieja). Si el cliente aún no tiene
      // carpeta, se la creamos en ese momento y la reusamos.
      // 🔎 CHIVATO: vamos anotando qué pasa en cada paso (diag) para verlo en pantalla.
      let carpetaCliente = "";
      let diag = "";
      if (interno) {
        diag = "modo interno (colaborador)";
      } else if (!vinculado) {
        diag = "⚠️ NO hay cliente vinculado (vinculado=null)";
      } else {
        try {
          const sel = await supabase.from("clientes").select("carpeta_drive_id").eq("id", vinculado.id).single();
          if (sel.error) diag = "⚠️ error leyendo carpeta: " + sel.error.message;
          carpetaCliente = sel.data?.carpeta_drive_id || "";
          if (!carpetaCliente) {
            setEstadoSubida("Creando carpeta del cliente…");
            const g = await generarExpediente(vinculado, tipoExp);
            // 👇 Usamos el id que REGRESA generarExpediente (no la base de datos,
            // que es donde se estaba perdiendo). Si por algo no vino, releemos la BD.
            carpetaCliente = g?.carpetaId || "";
            if (!carpetaCliente) {
              const sel2 = await supabase.from("clientes").select("carpeta_drive_id").eq("id", vinculado.id).single();
              carpetaCliente = sel2.data?.carpeta_drive_id || "";
            }
            if (!carpetaCliente) diag = "⚠️ no se creó carpeta del cliente: " + (g?.error || "(sin id)");
            else diag = "carpeta creada al momento";
          } else {
            diag = "carpeta del cliente ya existía";
          }
        } catch (e: any) {
          diag = "⚠️ excepción buscando carpeta: " + (e?.message || e);
        }
      }

      const destinoTxt = carpetaCliente
        ? "carpeta del CLIENTE · Evidencia voz"
        : (interno
            ? "carpeta del colaborador"
            : "carpeta del ÁREA " + carpetaArea(marcadoRef.current.area || miArea || area));

      const cuerpo = carpetaCliente
        ? { archivo: base64, nombre: archivo, tipo: mime, carpetaId: carpetaCliente, subcarpeta: "Evidencia voz" }
        : (interno
            ? { archivo: base64, nombre: archivo, tipo: mime, ruta: [carpetaArea(marcadoRef.current.area || area), marcadoRef.current.nombre || "Colaborador"] }
            : { archivo: base64, nombre: archivo, tipo: mime, area: carpetaArea(marcadoRef.current.area || miArea || area) });
      const r = await fetch("/.netlify/functions/subir-grabacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const data = await r.json();
      if (data.ok && data.link) {
        setLinkDrive(data.link);
        setEstadoSubida("📂 Guardado en: " + destinoTxt + (diag ? "  ·  (" + diag + ")" : ""));
        if (id) {
          await supabase.from("llamadas").update({ grabacion_url: data.link }).eq("id", id);
        }
      } else {
        const detalle = data.detalle ? " · " + JSON.stringify(data.detalle).slice(0, 300) : "";
        setEstadoSubida("Error al subir (intento: " + destinoTxt + "): " + (data.error || "desconocido") + detalle + (diag ? " · " + diag : ""));
      }
    } catch (e: any) {
      setEstadoSubida("Error al subir: " + (e?.message || e));
    } finally {
      setSubiendoDrive(false);
      setDriveResuelto(true);
    }
  }

  async function procesarYsubir(blob: Blob, mime: string) {
    const dur = inicioRef.current ? Math.round((Date.now() - inicioRef.current) / 1000) : 0;
    const reg = await crearEnBitacora(dur);
    await subirADrive(blob, mime, reg?.folio || "", reg?.id || null);
  }

  async function iniciarGrabacion(call: Call) {
    try {
      const local = call.getLocalStream();
      let remoto = call.getRemoteStream();
      let intentos = 0;
      while (!remoto && intentos < 20) {
        await new Promise((res) => setTimeout(res, 150));
        remoto = call.getRemoteStream();
        intentos++;
      }
      if (!local || !remoto) { console.warn("No hay las dos voces para grabar"); return; }
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      await ctx.resume();
      const dest = ctx.createMediaStreamDestination();
      ctx.createMediaStreamSource(local).connect(dest);
      ctx.createMediaStreamSource(remoto).connect(dest);
      let mime = "";
      for (const c of ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg"]) {
        if (MediaRecorder.isTypeSupported(c)) { mime = c; break; }
      }
      setExt(mime.includes("ogg") ? "ogg" : "webm");
      const rec = mime ? new MediaRecorder(dest.stream, { mimeType: mime }) : new MediaRecorder(dest.stream);
      recorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data); };
      rec.onstop = () => {
        const tipoFinal = rec.mimeType || mime || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: tipoFinal });
        setAudioUrl(URL.createObjectURL(blob));
        setGrabando(false);
        procesarYsubir(blob, tipoFinal);
      };
      rec.start();
      setGrabando(true);
    } catch (e) {
      console.error("Error iniciando grabacion", e);
    }
  }

  function detenerGrabacion() {
    try {
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") rec.stop();
    } catch {}
    try { audioCtxRef.current?.close(); } catch {}
    audioCtxRef.current = null;
    recorderRef.current = null;
  }

  async function llamar() {
    const device = deviceRef.current;
    if (!device) return;
    const destino = normalizar(interno ? tel : (vinculado?.telefono || tel));
    if (!destino || destino.length < 6) { setEstado("Pon un número o vincula un contacto."); return; }
    marcadoRef.current = {
      tel: destino,
      nombre: interno ? (nombre || "Colaborador") : (vinculado?.nombre || nombre || "Contacto"),
      area: interno ? (area || null) : (miArea || area || null),
      rol: rol || "",
    };
    try {
      setAudioUrl(null);
      setLinkDrive(null);
      setEstadoSubida("");
      setEstadoBitacora("");
      setLlamadaId(null);
      setEstadoDetalles("");
      setExpUrl(null);
      setExpEstado("");
      setEstado("Llamando...");
      const call = await device.connect({ params: { To: destino } });
      callRef.current = call;
      setEnLlamada(true);
      call.on("accept", () => {
        inicioRef.current = Date.now();
        setEstado("En llamada (grabando)");
        iniciarGrabacion(call);
      });
      const terminar = () => {
        setEstado("Llamada terminada");
        setEnLlamada(false);
        detenerGrabacion();
        callRef.current = null;
      };
      call.on("disconnect", terminar);
      call.on("cancel", terminar);
      call.on("error", (e: any) => { setEstado("Error en llamada: " + (e?.message || e)); terminar(); });
    } catch (e: any) {
      setEstado("No se pudo llamar: " + (e?.message || e));
      setEnLlamada(false);
    }
  }

  function colgar() {
    try { callRef.current?.disconnect(); } catch {}
  }

  const numeroMostrar = normalizar(interno ? (tel || "") : (vinculado?.telefono || tel || ""));
  const yaLlamada = !!audioUrl || !!llamadaId;
  // 🔒 Parte B: si el cliente vinculado YA tiene carpeta (rastro de su nombre),
  // mostramos "Abrir expediente" y NO invitamos a generar uno nuevo.
  const expExistenteUrl = (!interno && vinculado?.carpetaDriveId)
    ? "https://drive.google.com/drive/folders/" + vinculado.carpetaDriveId
    : null;
  const expUrlMostrar = expUrl || expExistenteUrl;
  const resultados = clientes.filter((c) => {
    const q = busca.trim().toLowerCase();
    if (!q) return false;
    return c.nombre.toLowerCase().includes(q) || (c.telefono || "").includes(q) || (c.folio || "").toLowerCase().includes(q);
  }).slice(0, 6);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCerrar}>
      <div className="max-h-[92vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-display text-lg font-extrabold text-tinta">Llamar y grabar</h3>
            {interno && nombre && <p className="text-sm font-semibold text-tinta">{nombre}{rol ? " · " + rol : ""}</p>}
            <p className="text-xs text-humo">{numeroMostrar || "—"}{interno ? " · Llamada interna" : ""}</p>
          </div>
          <button onClick={onCerrar} className="rounded-lg px-2 py-1 text-sm text-humo hover:bg-nube">Cerrar</button>
        </div>

        {(miNombre || miCorreo) && (
          <p className="mt-2 rounded-lg bg-teal-soft px-3 py-1.5 text-xs font-semibold text-teal-dark">
            Atiende: {miNombre || "—"}{miCorreo ? " · " + miCorreo : ""}
          </p>
        )}

        {interno && (
          <div className="mt-3 space-y-3 rounded-xl border border-black/10 p-3">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-humo">Cliente del que hablan (opcional)</span>
              {vinculado ? (
                <div className="mt-1 flex items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-emerald-800">✓ {vinculado.nombre}</p>
                    <p className="text-[11px] text-emerald-700">{vinculado.codigo ? vinculado.codigo + " · " + (CODIGO[vinculado.codigo] || "") : "Sin nomenclatura"}{vinculado.folio ? " · " + vinculado.folio : ""}</p>
                    <p className="text-[11px] text-emerald-700">{origenCliente(vinculado).enSiga ? "🟢 SIGA" : "⚠️ JurisConecta · falta info"}{(vinculado.folioSiga || vinculado.creditoSiga) ? " · " + (vinculado.folioSiga || vinculado.creditoSiga) : ""}</p>
                  </div>
                  <button onClick={quitarCliente} className="shrink-0 rounded-lg border border-emerald-300 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100">Quitar</button>
                </div>
              ) : (
                <div className="mt-1">
                  <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente por nombre o teléfono…" className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-teal" />
                  {resultados.length > 0 && (
                    <div className="mt-1.5 max-h-40 space-y-1 overflow-y-auto">
                      {resultados.map((c) => (
                        <button key={c.id} onClick={() => vincularClienteInterno(c)} className="block w-full rounded-lg border border-black/5 px-3 py-1.5 text-left text-sm hover:bg-teal-soft">
                          <span className="font-semibold text-tinta">{c.nombre}</span>
                          <span className="block text-[11px] text-humo">{c.codigo ? c.codigo + " · " + (CODIGO[c.codigo] || "") : "Sin nomenclatura"}{c.telefono ? " · " + c.telefono : ""}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {busca.trim() && resultados.length === 0 && <p className="mt-1.5 text-xs text-humo">Sin resultados.</p>}
                </div>
              )}
            </div>
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-humo">Asunto</span>
              <select value={asunto} onChange={(e) => setAsunto(e.target.value)} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-teal">
                {ASUNTOS_INTERNOS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              {asunto === "Otros (especificar)" && (
                <input value={asuntoOtro} onChange={(e) => setAsuntoOtro(e.target.value)} placeholder="Especifica el asunto…" className="mt-2 w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-teal" />
              )}
            </div>
          </div>
        )}

        {!interno && !yaLlamada && (
          <div className="mt-3 rounded-xl border border-black/10 p-3">
            {vinculado ? (
              <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-emerald-800">✓ {vinculado.nombre}</p>
                  <p className="text-[11px] text-emerald-700">{vinculado.telefono}{tipoExp !== "Clientes" ? " · " + tipoExp : " · Cliente"}</p>
                </div>
                <button onClick={desvincular} className="shrink-0 rounded-lg border border-emerald-300 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100">Cambiar</button>
              </div>
            ) : (
              <>
                <div className="mb-2 flex gap-1.5">
                  <button onClick={() => setModo("vincular")} className={modo === "vincular" ? "rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white" : "rounded-lg border border-black/10 px-3 py-1.5 text-xs font-medium text-humo"}>Vincular cliente</button>
                  <button onClick={() => setModo("nuevo")} className={modo === "nuevo" ? "rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white" : "rounded-lg border border-black/10 px-3 py-1.5 text-xs font-medium text-humo"}>Contacto nuevo</button>
                </div>

                {modo === "vincular" ? (
                  <div>
                    <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nombre o teléfono…" className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-teal" />
                    {resultados.length > 0 && (
                      <div className="mt-1.5 max-h-40 space-y-1 overflow-y-auto">
                        {resultados.map((c) => (
                          <button key={c.id} onClick={() => vincular(c)} className="block w-full rounded-lg border border-black/5 px-3 py-1.5 text-left text-sm hover:bg-teal-soft">
                            <span className="font-semibold text-tinta">{c.nombre}</span>
                            <span className="block text-[11px] text-humo">{c.telefono}{c.folio ? " · " + c.folio : ""}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {busca.trim() && resultados.length === 0 && <p className="mt-1.5 text-xs text-humo">Sin resultados. Prueba "Contacto nuevo".</p>}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input value={nvNombre} onChange={(e) => setNvNombre(e.target.value)} placeholder="Nombre completo *" className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-teal" />
                    <input value={nvTel} onChange={(e) => setNvTel(e.target.value)} placeholder="Teléfono *" className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-teal" />
                    <input value={nvCorreo} onChange={(e) => setNvCorreo(e.target.value)} placeholder="Correo del cliente" type="email" className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-teal" />
                    <div className="flex gap-2">
                      <select value={nvArea} onChange={(e) => setNvArea(e.target.value as Area)} className="flex-1 rounded-lg border border-black/10 px-2 py-2 text-sm outline-none focus:border-teal">
                        {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
                      </select>
                      <select value={nvTipo} onChange={(e) => setNvTipo(e.target.value as "Prospectos" | "Otras")} className="flex-1 rounded-lg border border-black/10 px-2 py-2 text-sm outline-none focus:border-teal">
                        <option value="Prospectos">Prospecto</option>
                        <option value="Otras">Otros</option>
                      </select>
                    </div>
                    {nvError && <p className="text-xs font-semibold text-rose-600">{nvError}</p>}
                    <button onClick={crearContacto} disabled={creando} className="w-full rounded-lg bg-dorado px-3 py-2 text-sm font-semibold text-tinta hover:brightness-95 disabled:opacity-50">{creando ? "Creando…" : "Crear y vincular"}</button>
                  </div>
                )}

                <div className="mt-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-humo">Teléfono a marcar</span>
                  <input value={tel} onChange={(e) => setTel(e.target.value)} placeholder="Número…" className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-teal" />
                </div>
              </>
            )}
          </div>
        )}

        {!interno && yaLlamada && vinculado && (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">✓ {vinculado.nombre} · {vinculado.telefono}</p>
        )}

        <p className="mt-3 text-sm text-humo">{estado}</p>

        <div className="mt-3 flex gap-2">
          <button onClick={llamar} disabled={!listo || enLlamada} className="flex-1 rounded-xl bg-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-dark disabled:opacity-50">Llamar</button>
          <button onClick={colgar} disabled={!enLlamada} className="flex-1 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50">Colgar</button>
        </div>

        {grabando && <p className="mt-3 text-sm font-semibold text-red-600">● Grabando...</p>}

        {interno && colaborador && (
          <div className="mt-3 rounded-lg bg-teal-soft/50 p-2.5">
            <button onClick={generarExpColab} disabled={generandoExp} className="w-full rounded-lg bg-teal px-3 py-2 text-sm font-semibold text-white hover:bg-teal-dark disabled:opacity-50">
              {generandoExp ? "Procesando…" : expUrl ? "📁 Abrir expediente del colaborador" : "📁 Generar expediente del colaborador"}
            </button>
            {expEstado && <p className="mt-1 text-[12px] font-semibold text-teal-dark">{expEstado}</p>}
            {expUrl && <a href={expUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[12px] font-semibold text-teal underline">Abrir carpeta del expediente</a>}
          </div>
        )}

        {(enLlamada || yaLlamada) && (
          <label className="mt-4 block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-teal-dark">{interno ? "Notas de la llamada" : "Notas — lo que dice el cliente"}</span>
            <textarea value={notaDetalle} onChange={(e) => setNotaDetalle(e.target.value)} rows={3} placeholder="Ve anotando aquí mientras hablas…" className="mt-1 w-full resize-none rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-teal" />
          </label>
        )}

        {audioUrl && (
          <div className="mt-4 rounded-xl bg-nube p-3">
            <audio controls src={audioUrl} className="w-full" />
            <a href={audioUrl} download={"llamada." + ext} className="mt-2 inline-block text-sm font-semibold text-tinta underline">Descargar audio</a>
            <div className="mt-3 border-t border-black/10 pt-2">
              {estadoSubida && <p className="text-sm font-semibold text-red-600">{estadoSubida}</p>}
              {linkDrive && <a href={linkDrive} target="_blank" rel="noreferrer" className="text-sm font-semibold text-teal underline">Abrir grabación en Google Drive</a>}
              {estadoBitacora && <p className="mt-1 text-sm font-semibold text-humo">{estadoBitacora}</p>}
            </div>
          </div>
        )}

        {llamadaId && (
          <div className="mt-4 rounded-xl border border-black/10 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-dark">Detalles de la llamada</p>

            {interno ? (
              <label className="mt-2 block">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-humo">¿Qué se resolvió?</span>
                <textarea value={resuelto} onChange={(e) => setResuelto(e.target.value)} rows={2} placeholder="Lo que se acordó o quedó pendiente…" className="mt-1 w-full resize-none rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-teal" />
              </label>
            ) : (
              <>
                <label className="mt-2 block">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-humo">Motivo</span>
                  <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-teal">
                    {MOTIVOS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
                <label className="mt-2 block">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-humo">Resultado</span>
                  <select value={resultado} onChange={(e) => setResultado(e.target.value)} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-teal">
                    {RESULTADOS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
              </>
            )}

            {!interno && (
              <div className="mt-3 rounded-lg bg-teal-soft/50 p-2.5">
                <button onClick={() => { if (expUrlMostrar) { window.open(expUrlMostrar, "_blank"); } else { generarOAbrirExpediente(); } }} disabled={generandoExp || !vinculado} className="w-full rounded-lg bg-teal px-3 py-2 text-sm font-semibold text-white hover:bg-teal-dark disabled:opacity-50">
                  {generandoExp ? "Procesando…" : expUrlMostrar ? "📁 Abrir expediente" : "📁 Generar expediente"}
                </button>
                {!vinculado && <p className="mt-1 text-[11px] text-humo">Vincula o crea un contacto arriba para su expediente.</p>}
                {expExistenteUrl && !expUrl && <p className="mt-1 text-[11px] font-semibold text-emerald-700">Ya tiene expediente — no se crea otro.</p>}
                {expEstado && <p className="mt-1 text-[12px] font-semibold text-teal-dark">{expEstado}</p>}
                {expUrlMostrar && <a href={expUrlMostrar} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[12px] font-semibold text-teal underline">Abrir carpeta del expediente</a>}
              </div>
            )}

            <div className="mt-3 rounded-lg bg-dorado/10 p-2.5">
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-dorado-dark">Asignar como tarea (opcional)</span>
                <select value={asignarA} onChange={(e) => setAsignarA(e.target.value)} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-teal">
                  <option value="">— Nadie (solo registrar) —</option>
                  {colaboradores.map((c) => <option key={c.id} value={c.nombre}>{c.nombre} — {plataformaDeArea(c.area)}</option>)}
                </select>
              </label>
              {asignarA && (
                <label className="mt-2 block">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-humo">Fase</span>
                  <select value={fase} onChange={(e) => setFase(e.target.value)} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-teal">
                    {FASES.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </label>
              )}
              {asignarA && (
                <label className="mt-2 block">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-humo">¿Para cuándo? (opcional)</span>
                  <input type="date" value={cuandoTarea} onChange={(e) => setCuandoTarea(e.target.value)} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-teal" />
                  <span className="mt-0.5 block text-[10.5px] text-humo">Si lo dejas vacío, se agenda para hoy.</span>
                </label>
              )}
            </div>

            <button onClick={guardarDetalles} disabled={guardandoDetalles || (!!onContactoReal && subiendoDrive)} className="mt-3 w-full rounded-xl bg-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-dark disabled:opacity-50">{guardandoDetalles ? "Guardando..." : (!!onContactoReal && subiendoDrive ? "Esperando grabación en Drive…" : "Guardar detalles")}</button>
            {estadoDetalles && <p className="mt-2 text-sm font-semibold text-humo">{estadoDetalles}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
