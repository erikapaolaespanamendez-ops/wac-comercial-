import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

type Senal =
  | { kind: "hello"; from: string }
  | { kind: "offer"; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { kind: "answer"; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { kind: "ice"; from: string; to: string; candidate: RTCIceCandidateInit }
  | { kind: "bye"; from: string };

export default function LlamadaJitsi({ sala, nombre, soloAudio, onCerrar }: { sala: string; nombre: string; soloAudio?: boolean; onCerrar: () => void }) {
  const localRef = useRef<HTMLVideoElement | null>(null);
  const remoteRef = useRef<HTMLVideoElement | null>(null);
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
  const iceRelayRef = useRef<boolean>(false);
  const ringCtxRef = useRef<AudioContext | null>(null);
  const ringbackRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [estado, setEstado] = useState<"pidiendo" | "esperando" | "llamando" | "en_llamada" | "error">("pidiendo");
  const [errorMsg, setErrorMsg] = useState("");
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(!soloAudio);
  const [conexion, setConexion] = useState("");

  function enviar(s: Senal) {
    channelRef.current?.send({ type: "broadcast", event: "senal", payload: s });
  }

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
      iceTransportPolicy: iceRelayRef.current ? "relay" : "all",
    });
    const stream = localStreamRef.current;
    if (stream) stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    pc.onicecandidate = (e) => {
      if (e.candidate && peerId.current) {
        enviar({ kind: "ice", from: myId.current, to: peerId.current, candidate: e.candidate.toJSON() });
      }
    };
    pc.ontrack = (e) => {
      if (remoteRef.current && e.streams[0]) {
        remoteRef.current.srcObject = e.streams[0];
        remoteRef.current.play?.().catch(() => {});
      }
      setEstado("en_llamada");
    };
    pc.oniceconnectionstatechange = () => {
      const st = pc.iceConnectionState;
      setConexion(st);
      if (st === "connected" || st === "completed") setEstado("en_llamada");
    };
    pcRef.current = pc;
    return pc;
  }

  async function flushIce() {
    const pc = pcRef.current;
    if (!pc) return;
    for (const c of pendingIce.current) {
      try { await pc.addIceCandidate(c); } catch {}
    }
    pendingIce.current = [];
  }

  async function manejar(s: Senal) {
    if (s.from === myId.current) return;
    if ((s.kind === "offer" || s.kind === "answer" || s.kind === "ice") && s.to !== myId.current) return;

    if (s.kind === "hello") {
      if (!peerId.current) {
        peerId.current = s.from;
        enviar({ kind: "hello", from: myId.current });
        setEstado("llamando");
        if (myId.current > s.from) {
          const pc = crearPC();
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          enviar({ kind: "offer", from: myId.current, to: s.from, sdp: offer });
        }
      }
      return;
    }
    if (s.kind === "offer") {
      peerId.current = s.from;
      const pc = pcRef.current || crearPC();
      await pc.setRemoteDescription(s.sdp);
      remoteSet.current = true;
      await flushIce();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      enviar({ kind: "answer", from: myId.current, to: s.from, sdp: answer });
      setEstado("llamando");
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
        if (remoteRef.current) remoteRef.current.srcObject = null;
        peerId.current = null; remoteSet.current = false;
        try { pcRef.current?.close(); } catch {}
        pcRef.current = null;
        setEstado("esperando");
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
        if (j.iceServers && j.iceServers.length) {
          iceServersRef.current = [...iceServersRef.current, ...j.iceServers];
          iceRelayRef.current = true;
        }
      } catch {}

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: !soloAudio, audio: true });
        if (cancelado) { stream.getTracks().forEach((t) => t.stop()); return; }
        localStreamRef.current = stream;
        if (localRef.current) { localRef.current.srcObject = stream; localRef.current.play?.().catch(() => {}); }
      } catch {
        setErrorMsg("No pudimos usar tu cámara/micrófono. Da permiso en el navegador e intenta otra vez.");
        setEstado("error");
        return;
      }

      const ch = supabase.channel("rtc_" + sala, { config: { broadcast: { self: false } } });
      channelRef.current = ch;
      ch.on("broadcast", { event: "senal" }, ({ payload }) => { manejar(payload as Senal); });
      ch.subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          setEstado("esperando");
          enviar({ kind: "hello", from: myId.current });
        }
      });
    }
    iniciar();
    return () => {
      cancelado = true;
      pararRingback();
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

  useEffect(() => {
    const enEspera = estado === "esperando" || estado === "llamando";
    if (enEspera) {
      tocarRingback();
      ringbackRef.current = setInterval(tocarRingback, 3000);
    } else {
      pararRingback();
    }
    return () => pararRingback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  function toggleMic() {
    const s = localStreamRef.current; if (!s) return;
    const on = !micOn; s.getAudioTracks().forEach((t) => (t.enabled = on)); setMicOn(on);
  }
  function toggleCam() {
    const s = localStreamRef.current; if (!s) return;
    const on = !camOn; s.getVideoTracks().forEach((t) => (t.enabled = on)); setCamOn(on);
  }

  const texto =
    estado === "pidiendo" ? "Pidiendo cámara y micrófono…" :
    estado === "esperando" ? "Llamando…" :
    estado === "llamando" ? "Llamando…" :
    estado === "en_llamada" ? "En llamada" : "";
  const mostrarOverlay = estado !== "en_llamada" || !!soloAudio;

  if (estado === "error") {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black px-6 text-center text-white">
        <div className="mb-3 text-4xl">🎤</div>
        <p className="max-w-xs text-sm text-white/80">{errorMsg}</p>
        <button onClick={onCerrar} className="mt-5 rounded-xl bg-white/15 px-5 py-2 text-sm font-semibold">Cerrar</button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      <div className="flex items-center justify-between bg-slate-900 px-4 py-2 text-white">
        <span className="text-sm font-medium">📞 Llamada — JurisConecta</span>
        <button onClick={onCerrar} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold hover:bg-red-700">Colgar</button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={remoteRef} autoPlay playsInline className="h-full w-full bg-black object-cover" />
        {mostrarOverlay && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white">
            <div className="h-16 w-16 animate-pulse rounded-full bg-white/10" />
            <p className="text-sm text-white/80">{texto}</p>
            {conexion && <p className="text-xs text-white/40">{conexion}</p>}
          </div>
        )}
        <div className="absolute bottom-3 right-3 h-32 w-24 overflow-hidden rounded-xl border border-white/20 shadow-lg">
          <video ref={localRef} autoPlay playsInline muted className="h-full w-full bg-black object-cover" />
          <span className="absolute bottom-0 left-0 right-0 truncate bg-black/50 px-1 py-0.5 text-center text-[10px] text-white">{nombre}</span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 bg-slate-900 px-4 py-3">
        <button onClick={toggleMic} className={"rounded-full px-4 py-2 text-sm font-semibold " + (micOn ? "bg-white/15 text-white" : "bg-white text-slate-900")}>
          {micOn ? "🎙️ Mic" : "🔇 Mic"}
        </button>
        {!soloAudio && (
          <button onClick={toggleCam} className={"rounded-full px-4 py-2 text-sm font-semibold " + (camOn ? "bg-white/15 text-white" : "bg-white text-slate-900")}>
            {camOn ? "📷 Cámara" : "🚫 Cámara"}
          </button>
        )}
        <button onClick={onCerrar} className="rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white">Colgar</button>
      </div>
    </div>
  );
}
