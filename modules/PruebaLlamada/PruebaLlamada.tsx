import { useEffect, useRef, useState } from "react";
import { Device, type Call } from "@twilio/voice-sdk";
import { supabase } from "../../lib/supabase";

// Convierte un telefono escrito de cualquier forma a formato +52...
function aE164(raw: string): string {
  let s = (raw || "").replace(/[^\d+]/g, "");
  if (!s) return "";
  if (s.startsWith("+")) return s;
  if (s.startsWith("52")) return "+" + s;
  if (s.length === 10) return "+52" + s;
  return "+" + s;
}

type Props = {
  telefonoInicial?: string;
  nombreContacto?: string;
  miCorreo?: string;
  correoColega?: string;
  nombreLlamante?: string;
  onCerrar?: () => void;
};

export default function PruebaLlamada({
  telefonoInicial = "",
  nombreContacto = "",
  miCorreo = "",
  correoColega = "",
  nombreLlamante = "",
  onCerrar,
}: Props = {}) {
  const [estado, setEstado] = useState("Iniciando...");
  const [listo, setListo] = useState(false);
  const [enLlamada, setEnLlamada] = useState(false);
  const [aceptada, setAceptada] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [micOn, setMicOn] = useState(true);
  const [numero, setNumero] = useState(telefonoInicial);
  const [grabando, setGrabando] = useState(false);

  // Modos: directo = colega con telefono (marca solo);
  //        sinTelefono = colega sin telefono (advertencia);
  //        si no, marcador manual.
  const modoDirecto = !!(nombreContacto && telefonoInicial);
  const sinTelefono = !!(nombreContacto && !telefonoInicial);

  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);
  const inicioRef = useRef<number>(0);
  const numeroLlamadoRef = useRef<string>("");
  const yaMarcoRef = useRef(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        if (sinTelefono) return; // no preparamos linea si no hay a quien llamar
        setEstado("Pidiendo permiso del microfono...");
        await navigator.mediaDevices.getUserMedia({ audio: true });

        // Identidad por CORREO: asi Twilio relaciona esta app con la persona
        let correo = miCorreo;
        if (!correo) {
          try {
            const { data: ses } = await supabase.auth.getSession();
            correo = ses?.session?.user?.email || "";
          } catch {}
        }
        const identidad = correo || "asesor_" + Date.now();

        setEstado("Obteniendo token...");
        const r = await fetch("/.netlify/functions/token-voz?identidad=" + encodeURIComponent(identidad));
        const data = await r.json();
        if (!data.token) throw new Error("No vino token del servidor");
        if (cancelado) return;

        const device = new Device(data.token, { logLevel: "error" });
        deviceRef.current = device;
        device.on("registered", () => setEstado("Listo para llamar"));
        device.on("error", (e: any) => setEstado("Error del dispositivo: " + (e?.message || e)));

        await device.register();
        if (!cancelado) setListo(true);
      } catch (e: any) {
        setEstado("Error al preparar: " + (e?.message || e));
      }
    })();
    return () => {
      cancelado = true;
      try { deviceRef.current?.destroy(); } catch {}
    };
  }, []);

  // Cronometro: corre solo mientras la llamada esta aceptada (contestaron)
  useEffect(() => {
    if (!aceptada) return;
    const id = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [aceptada]);

  // LLAMADA DIRECTA: en cuanto la linea este lista, marca solita una vez
  useEffect(() => {
    if (modoDirecto && listo && !yaMarcoRef.current && !enLlamada) {
      yaMarcoRef.current = true;
      llamar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoDirecto, listo, enLlamada]);

  function mmss(n: number) {
    const m = Math.floor(n / 60).toString().padStart(2, "0");
    const s = (n % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  function toggleMic() {
    const call = callRef.current;
    if (!call) return;
    const nuevo = !micOn;
    try { call.mute(!nuevo); } catch {}
    setMicOn(nuevo);
  }

  function blobABase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result).split(",")[1] || "");
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function guardarEnBitacora(link: string, duracion: number) {
    try {
      let correo = "prueba";
      try {
        const { data: ses } = await supabase.auth.getSession();
        correo = ses?.session?.user?.email || "prueba";
      } catch {}

      await supabase.from("llamadas").insert({
        telefono: numeroLlamadoRef.current,
        fecha: new Date().toISOString(),
        duracion,
        tipo: "Saliente",
        nombre: nombreContacto || "Llamada",
        registrado_por: correo,
        grabacion_url: link,
      });
    } catch {}
  }

  async function subirADrive(blob: Blob, mime: string) {
    try {
      const base64 = await blobABase64(blob);
      const sello = new Date().toISOString().replace(/[:.]/g, "-");
      const nombre = "llamada_" + sello + "." + (mime.includes("ogg") ? "ogg" : "webm");
      const r = await fetch("/.netlify/functions/subir-grabacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archivo: base64, nombre, tipo: mime }),
      });
      const data = await r.json();
      if (data.ok && data.link) {
        const dur = inicioRef.current ? Math.round((Date.now() - inicioRef.current) / 1000) : 0;
        guardarEnBitacora(data.link, dur);
      }
    } catch {}
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
      if (!local || !remoto) return;

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

      const rec = mime
        ? new MediaRecorder(dest.stream, { mimeType: mime })
        : new MediaRecorder(dest.stream);
      recorderRef.current = rec;
      chunksRef.current = [];

      rec.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data); };
      rec.onstop = () => {
        const tipoFinal = rec.mimeType || mime || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: tipoFinal });
        setGrabando(false);
        subirADrive(blob, tipoFinal);
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
    const objetivo = aE164(numero || telefonoInicial);
    if (!device || !objetivo) return;
    try {
      setMicOn(true);
      setSegundos(0);
      setAceptada(false);
      setEstado("Llamando...");
      numeroLlamadoRef.current = objetivo;
      const params: Record<string, string> = { To: objetivo };
      if (correoColega) params.correoColega = correoColega;
      if (nombreLlamante) params.nombreLlamante = nombreLlamante;
      const call = await device.connect({ params });
      callRef.current = call;
      setEnLlamada(true);

      call.on("accept", () => {
        inicioRef.current = Date.now();
        setEstado("En llamada (grabando)");
        setSegundos(0);
        setAceptada(true);
        iniciarGrabacion(call);
      });
      const terminar = () => {
        setEstado("Listo para llamar");
        setEnLlamada(false);
        setAceptada(false);
        setSegundos(0);
        setMicOn(true);
        detenerGrabacion();
        callRef.current = null;
        if (modoDirecto) onCerrar?.(); // en llamada directa, al colgar se cierra
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
    // si es directo y todavia no se conecta, cerramos el popup
    if (modoDirecto && !callRef.current) onCerrar?.();
  }

  // ===================== ADVERTENCIA: COLEGA SIN TELEFONO =====================
  if (sinTelefono) {
    return (
      <div className="fixed bottom-4 right-4 z-[80] w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-amber-200 bg-white p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="text-2xl">⚠️</div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-tinta">{nombreContacto} no tiene teléfono</p>
            <p className="mt-1 text-xs text-humo">Llene sus <b>datos completos en Colaboradores</b> (teléfono y correo) para poder llamarle.</p>
          </div>
        </div>
        <button onClick={() => onCerrar?.()} className="mt-3 w-full rounded-xl bg-teal py-2 text-xs font-semibold text-white hover:bg-teal-dark">Entendido</button>
      </div>
    );
  }

  // ===================== PANTALLA AZUL (directo o en llamada) =====================
  const mostrarAzul = modoDirecto || enLlamada;
  const estadoTexto = enLlamada
    ? (!aceptada ? "Llamando…" : `En llamada · ${mmss(segundos)}`)
    : (listo ? "Llamando…" : "Preparando…");
  const etiquetaGrande = nombreContacto || numeroLlamadoRef.current || numero || "Llamada";

  if (mostrarAzul) {
    return (
      <div className="fixed bottom-4 right-4 z-[80] w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-gradient-to-br from-[#10417C] to-[#0c2f5a] p-4 text-white shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 text-xl">📞</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{etiquetaGrande}</p>
            <p className="truncate text-[11px] text-white/70">{estadoTexto}{grabando ? " · ● Grabando" : ""}</p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={toggleMic} disabled={!aceptada} className="flex-1 rounded-xl bg-white/15 py-2 text-xs font-semibold hover:bg-white/25 disabled:opacity-40">{micOn ? "🎙️ Silenciar" : "🔇 Activar"}</button>
          <button onClick={colgar} className="flex-1 rounded-xl bg-red-600 py-2 text-xs font-semibold hover:bg-red-700">📞 Colgar</button>
        </div>
      </div>
    );
  }

  // ===================== MARCADOR MANUAL (sin contacto) =====================
  return (
    <div className="fixed bottom-4 right-4 z-[80] w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-black/10 bg-white p-4 shadow-2xl">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-tinta">Llamar a teléfono</p>
        <button onClick={() => onCerrar?.()} className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200">✕</button>
      </div>
      <p className="mt-0.5 text-[11px] text-humo">{estado}</p>
      <input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="+523312345678" disabled={!listo || enLlamada} className="mt-2 w-full rounded-xl border border-black/10 px-3 py-2 text-center text-sm tracking-wide outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 disabled:opacity-50" />
      <button onClick={llamar} disabled={!listo || enLlamada || !numero.trim()} className="mt-2 w-full rounded-xl bg-teal py-2.5 text-sm font-semibold text-white hover:bg-teal-dark disabled:opacity-50">📞 Llamar</button>
    </div>
  );
}
