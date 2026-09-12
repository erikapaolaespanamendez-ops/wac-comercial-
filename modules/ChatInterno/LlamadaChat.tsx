import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

// =====================================================================
//  LLAMADA DEL CHAT INTERNO — estilo WhatsApp (voz y video, 1 a 1)
//  - Suena "tirrr tirrr" mientras llama (ringback).
//  - Voz: inicial grande + nombre + "Llamando…/En llamada 00:12".
//    Botones: Silenciar · Colgar. NADA de chat, reacciones ni reunión.
//  - Video: el otro a pantalla completa, tú en una esquina.
//  - WebRTC directo (cifrado) + Supabase para conectar + TURN de Twilio.
//  - NO toca el módulo de Videollamadas.
// =====================================================================

type Senal =
  | { kind: "hello"; from: string; nombre: string }
  | { kind: "offer"; from: string; to: string; nombre: string; sdp: RTCSessionDescriptionInit }
  | { kind: "answer"; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { kind: "ice"; from: string; to: string; candidate: RTCIceCandidateInit }
  | { kind: "bye"; from: string };

// Barras de señal de internet (verde=buena, amarillo=media, rojo=mala).
function BarrasSenal({ calidad }: { calidad: "buena" | "media" | "mala" }) {
  const color = calidad === "buena" ? "#22c55e" : calidad === "media" ? "#f59e0b" : "#ef4444";
  const activas = calidad === "buena" ? 3 : calidad === "media" ? 2 : 1;
  const etiqueta = calidad === "buena" ? "Buena" : calidad === "media" ? "Regular" : "Débil";
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-black/30 px-2 py-1" title={"Conexión: " + etiqueta}>
      <span className="flex items-end gap-0.5" style={{ height: 16 }}>
        {[1, 2, 3].map((n) => (
          <span key={n} className="w-1 rounded-sm" style={{ height: 4 + n * 4, background: n <= activas ? color : "rgba(255,255,255,0.25)" }} />
        ))}
      </span>
      <span className="text-[11px] font-medium" style={{ color }}>{etiqueta}</span>
    </div>
  );
}

export default function LlamadaChat({
  sala, nombre, soloAudio, onCerrar,
}: { sala: string; nombre: string; soloAudio?: boolean; onCerrar: () => void }) {
  const localRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<any>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const myId = useRef<string>(Math.random().toString(36).slice(2));
  const peerId = useRef<string | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const remoteSet = useRef<boolean>(false);
  const iceServersRef = useRef<RTCIceServer[]>([
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ]);
  const ringCtxRef = useRef<AudioContext | null>(null);
  const ringbackRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconectandoRef = useRef<boolean>(false);
  const reconnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultStatsRef = useRef<{ lost: number; total: number } | null>(null);
  const malasRef = useRef<number>(0);
  const autoApagoRef = useRef<boolean>(false);

  const [estado, setEstado] = useState<"pidiendo" | "llamando" | "en_llamada" | "error">("pidiendo");
  const [errorMsg, setErrorMsg] = useState("");
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(!soloAudio);
  const [peerNombre, setPeerNombre] = useState("");
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [segundos, setSegundos] = useState(0);
  const [redMala, setRedMala] = useState(false);
  const [calidad, setCalidad] = useState<"buena" | "media" | "mala">("buena");
  const [reconectando, setReconectando] = useState(false);

  function enviar(s: Senal) {
    channelRef.current?.send({ type: "broadcast", event: "senal", payload: s });
  }

  // --- Tono de "tirrr tirrr" (ringback) mientras llama ---
  function tocarRingback() {
    try {
      if (!ringCtxRef.current) {
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        ringCtxRef.current = new AC();
      }
      const ctx = ringCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();
      const t = ctx.currentTime;
      [440, 480].forEach((freq) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = freq;
        o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.16, t + 0.05);
        g.gain.setValueAtTime(0.16, t + 1.0);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.15);
        o.start(t); o.stop(t + 1.2);
      });
    } catch {}
  }
  function pararRingback() {
    if (ringbackRef.current) { clearInterval(ringbackRef.current); ringbackRef.current = null; }
  }

  function crearPC(): RTCPeerConnection {
    const pc = new RTCPeerConnection({
      iceCandidatePoolSize: 10,
      iceServers: iceServersRef.current,
    });
    const stream = localStreamRef.current;
    if (stream) stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    pc.onicecandidate = (e) => {
      if (e.candidate && peerId.current) {
        enviar({ kind: "ice", from: myId.current, to: peerId.current, candidate: e.candidate.toJSON() });
      }
    };
    pc.ontrack = (e) => {
      if (e.streams[0]) setRemoteStream(e.streams[0]);
      setEstado("en_llamada");
    };
    pc.oniceconnectionstatechange = () => {
      const st = pc.iceConnectionState;
      if (st === "connected" || st === "completed") {
        setEstado("en_llamada");
        setReconectando(false);
        if (reconnTimerRef.current) { clearTimeout(reconnTimerRef.current); reconnTimerRef.current = null; }
      } else if (st === "failed") {
        setReconectando(true);
        intentarReconectar();
      } else if (st === "disconnected") {
        setReconectando(true);
        // a veces se recupera solo; si en 3s sigue caída, reconectamos
        if (reconnTimerRef.current) clearTimeout(reconnTimerRef.current);
        reconnTimerRef.current = setTimeout(() => {
          const cur = pcRef.current?.iceConnectionState;
          if (cur === "disconnected" || cur === "failed") intentarReconectar();
        }, 3000);
      }
    };
    pcRef.current = pc;
    return pc;
  }

  async function flushIce() {
    const pc = pcRef.current;
    if (!pc) return;
    for (const c of pendingIce.current) { try { await pc.addIceCandidate(c); } catch {} }
    pendingIce.current = [];
  }

  async function manejar(s: Senal) {
    if (s.from === myId.current) return;
    if ((s.kind === "offer" || s.kind === "answer" || s.kind === "ice") && s.to !== myId.current) return;

    if (s.kind === "hello") {
      if (s.nombre) setPeerNombre(s.nombre);
      if (!peerId.current) {
        peerId.current = s.from;
        enviar({ kind: "hello", from: myId.current, nombre });
        if (myId.current > s.from) {
          const pc = crearPC();
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          enviar({ kind: "offer", from: myId.current, to: s.from, nombre, sdp: offer });
        }
      }
      return;
    }
    if (s.kind === "offer") {
      peerId.current = s.from;
      if (s.nombre) setPeerNombre(s.nombre);
      const pc = pcRef.current || crearPC();
      await pc.setRemoteDescription(s.sdp);
      remoteSet.current = true;
      await flushIce();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      enviar({ kind: "answer", from: myId.current, to: s.from, sdp: answer });
      return;
    }
    if (s.kind === "answer") {
      const pc = pcRef.current;
      if (pc) { await pc.setRemoteDescription(s.sdp); remoteSet.current = true; await flushIce(); }
      return;
    }
    if (s.kind === "ice") {
      const pc = pcRef.current;
      if (pc && remoteSet.current) { try { await pc.addIceCandidate(s.candidate); } catch {} }
      else pendingIce.current.push(s.candidate);
      return;
    }
    if (s.kind === "bye") {
      if (s.from === peerId.current) {
        setRemoteStream(null);
        peerId.current = null; remoteSet.current = false;
        try { pcRef.current?.close(); } catch {}
        pcRef.current = null;
        setEstado("llamando");
      }
      return;
    }
  }

  useEffect(() => {
    let cancelado = false;
    async function iniciar() {
      try {
        const r = await fetch("/.netlify/functions/turn");
        const j = await r.json();
        if (j.iceServers && j.iceServers.length) iceServersRef.current = [...iceServersRef.current, ...j.iceServers];
      } catch {}
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: !soloAudio, audio: true });
        if (cancelado) { stream.getTracks().forEach((t) => t.stop()); return; }
        localStreamRef.current = stream;
        if (localRef.current) { localRef.current.srcObject = stream; localRef.current.play?.().catch(() => {}); }
      } catch {
        setErrorMsg("No pudimos usar tu micrófono. Da permiso en el navegador e intenta otra vez.");
        setEstado("error");
        return;
      }
      const ch = supabase.channel("rtc_" + sala, { config: { broadcast: { self: false } } });
      channelRef.current = ch;
      ch.on("broadcast", { event: "senal" }, ({ payload }: any) => { manejar(payload as Senal); });
      ch.subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          setEstado("llamando");
          enviar({ kind: "hello", from: myId.current, nombre });
        }
      });
    }
    iniciar();
    return () => {
      cancelado = true;
      pararRingback();
      if (reconnTimerRef.current) { clearTimeout(reconnTimerRef.current); reconnTimerRef.current = null; }
      try { ringCtxRef.current?.close(); } catch {}
      ringCtxRef.current = null;
      try { enviar({ kind: "bye", from: myId.current }); } catch {}
      try { pcRef.current?.close(); } catch {}
      pcRef.current = null;
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sala]);

  // Tono de "tirrr tirrr" mientras está llamando (no conectado).
  useEffect(() => {
    if (estado === "llamando") {
      tocarRingback();
      ringbackRef.current = setInterval(tocarRingback, 3000);
    } else {
      pararRingback();
    }
    return () => pararRingback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  // Cronómetro de la llamada.
  useEffect(() => {
    if (estado !== "en_llamada") { setSegundos(0); return; }
    const id = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [estado]);

  // VIGILANTE DE RED (getStats): mide la calidad de la conexión (para el
  // indicador de barras) y, SOLO en video, si va MUY lenta apaga el video
  // para que la llamada no se corte (queda el audio). Al mejorar, lo reactiva.
  useEffect(() => {
    if (estado !== "en_llamada") { setRedMala(false); setCalidad("buena"); return; }
    const id = setInterval(async () => {
      const pc = pcRef.current;
      if (!pc) return;
      try {
        const stats = await pc.getStats();
        let lost = 0, recv = 0, rtt = 0;
        stats.forEach((r: any) => {
          if (r.type === "inbound-rtp" && (r.kind === "video" || r.kind === "audio")) {
            lost += r.packetsLost || 0;
            recv += r.packetsReceived || 0;
          }
          if (r.type === "candidate-pair" && r.state === "succeeded" && r.currentRoundTripTime != null) {
            rtt = r.currentRoundTripTime;
          }
        });
        const prev = ultStatsRef.current;
        let perdidaPct = 0;
        if (prev) {
          const dLost = lost - prev.lost;
          const dTotal = (recv + lost) - prev.total;
          if (dTotal > 0) perdidaPct = (dLost / dTotal) * 100;
        }
        ultStatsRef.current = { lost, total: recv + lost };

        // Calidad para el indicador de barras (buena / media / mala)
        const cal: "buena" | "media" | "mala" =
          (perdidaPct > 8 || rtt > 0.6) ? "mala" :
          (perdidaPct > 3 || rtt > 0.3) ? "media" : "buena";
        setCalidad(cal);

        // SOLO en video: si va mala sostenido, apagamos el video para salvar la llamada
        if (!soloAudio) {
          const malaAhora = cal === "mala";
          malasRef.current = malaAhora ? Math.min(malasRef.current + 1, 5) : Math.max(malasRef.current - 1, 0);
          if (malasRef.current >= 3 && !autoApagoRef.current && camOn) {
            localStreamRef.current?.getVideoTracks().forEach((t) => (t.enabled = false));
            autoApagoRef.current = true;
            setCamOn(false);
            setRedMala(true);
          }
          if (malasRef.current === 0 && autoApagoRef.current) {
            localStreamRef.current?.getVideoTracks().forEach((t) => (t.enabled = true));
            autoApagoRef.current = false;
            setCamOn(true);
            setRedMala(false);
          }
        }
      } catch {}
    }, 4000);
    return () => { clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado, soloAudio]);

  // Conecta el audio/video del otro al elemento correcto.
  useEffect(() => {
    if (soloAudio) {
      if (remoteAudioRef.current) { remoteAudioRef.current.srcObject = remoteStream; remoteAudioRef.current.play?.().catch(() => {}); }
    } else {
      if (remoteVideoRef.current) { remoteVideoRef.current.srcObject = remoteStream; remoteVideoRef.current.play?.().catch(() => {}); }
    }
  }, [remoteStream, soloAudio]);

  function toggleMic() {
    const s = localStreamRef.current; if (!s) return;
    const on = !micOn; s.getAudioTracks().forEach((t) => (t.enabled = on)); setMicOn(on);
  }
  function toggleCam() {
    const s = localStreamRef.current; if (!s) return;
    const on = !camOn; s.getVideoTracks().forEach((t) => (t.enabled = on)); setCamOn(on);
  }

  // RECONEXIÓN AUTOMÁTICA (ICE Restart): si la red cambia (WiFi↔datos) y la
  // llamada se cae, volvemos a conectar SOLOS sin colgar. Solo el "ofertante"
  // (id mayor) reinicia, para que los dos no choquen.
  async function intentarReconectar() {
    const pc = pcRef.current;
    if (!pc || reconectandoRef.current) return;
    if (!peerId.current || myId.current <= peerId.current) return;
    reconectandoRef.current = true;
    try {
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      enviar({ kind: "offer", from: myId.current, to: peerId.current, nombre, sdp: offer });
    } catch {}
    setTimeout(() => { reconectandoRef.current = false; }, 5000);
  }

  function mmss(n: number) {
    const m = Math.floor(n / 60).toString().padStart(2, "0");
    const s = (n % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  const quien = peerNombre || "Contacto";
  const iniciales = quien.trim().slice(0, 2).toUpperCase();
  const estadoTexto =
    reconectando && estado === "en_llamada" ? "Reconectando…" :
    estado === "pidiendo" ? "Conectando…" :
    estado === "llamando" ? "Llamando…" :
    estado === "en_llamada" ? (remoteStream ? `En llamada · ${mmss(segundos)}` : "Conectando…") : "";

  if (estado === "error") {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-slate-900 px-6 text-center text-white">
        <div className="mb-3 text-4xl">🎤</div>
        <p className="max-w-xs text-sm text-white/80">{errorMsg}</p>
        <button onClick={onCerrar} className="mt-5 rounded-xl bg-white/15 px-5 py-2 text-sm font-semibold">Cerrar</button>
      </div>
    );
  }

  // ===================== LLAMADA DE VOZ (estilo WhatsApp) =====================
  if (soloAudio) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col items-center justify-between bg-gradient-to-b from-[#10417C] to-[#0c2f5a] px-6 py-12 text-white">
        <audio ref={remoteAudioRef} autoPlay playsInline />
        <div className="mt-10 flex flex-col items-center gap-4">
          <div className="flex h-32 w-32 items-center justify-center rounded-full bg-white/15 text-5xl font-bold shadow-2xl ring-4 ring-white/10">
            {iniciales}
          </div>
          <p className="text-2xl font-semibold">{quien}</p>
          <p className="text-sm text-white/70">{estadoTexto}</p>
          {estado === "en_llamada" && remoteStream && <BarrasSenal calidad={calidad} />}
        </div>
        <div className="mb-6 flex items-center justify-center gap-8">
          <button onClick={toggleMic} className="flex flex-col items-center gap-1 text-xs">
            <span className={"flex h-14 w-14 items-center justify-center rounded-full text-2xl " + (micOn ? "bg-white/15" : "bg-white text-slate-900")}>
              {micOn ? "🎙️" : "🔇"}
            </span>
            {micOn ? "Silenciar" : "Activar"}
          </button>
          <button onClick={onCerrar} className="flex flex-col items-center gap-1 text-xs">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-2xl shadow-lg">📞</span>
            Colgar
          </button>
        </div>
      </div>
    );
  }

  // ===================== VIDEOLLAMADA (estilo WhatsApp) =====================
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      <div className="relative flex-1 overflow-hidden">
        {reconectando && estado === "en_llamada" && (
          <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs font-medium text-white shadow-lg">
            🔄 Reconectando…
          </div>
        )}
        {estado === "en_llamada" && remoteStream && (
          <div className="absolute left-3 top-3 z-10"><BarrasSenal calidad={calidad} /></div>
        )}
        {redMala && (
          <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-amber-500/90 px-3 py-1 text-xs font-medium text-white shadow-lg">
            📶 Red lenta — video pausado para no cortar la llamada
          </div>
        )}
        <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full bg-black object-cover" />
        {(estado !== "en_llamada" || !remoteStream) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-[#10417C] to-[#0c2f5a] text-white">
            <div className="flex h-28 w-28 items-center justify-center rounded-full bg-white/15 text-4xl font-bold ring-4 ring-white/10">{iniciales}</div>
            <p className="text-xl font-semibold">{quien}</p>
            <p className="text-sm text-white/70">{estadoTexto}</p>
          </div>
        )}
        <div className="absolute bottom-4 right-4 h-40 w-28 overflow-hidden rounded-2xl border border-white/20 shadow-lg">
          <video ref={localRef} autoPlay playsInline muted className="h-full w-full bg-black object-cover" />
        </div>
      </div>
      <div className="flex items-center justify-center gap-6 bg-slate-900 px-4 py-5">
        <button onClick={toggleMic} className={"flex h-14 w-14 items-center justify-center rounded-full text-2xl " + (micOn ? "bg-white/15 text-white" : "bg-white text-slate-900")}>
          {micOn ? "🎙️" : "🔇"}
        </button>
        <button onClick={toggleCam} className={"flex h-14 w-14 items-center justify-center rounded-full text-2xl " + (camOn ? "bg-white/15 text-white" : "bg-white text-slate-900")}>
          {camOn ? "📷" : "🚫"}
        </button>
        <button onClick={onCerrar} className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-2xl text-white shadow-lg">📞</button>
      </div>
    </div>
  );
}
