import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { generarNotasIA, guardarNotasReunion } from "../../data/reuniones"; // 👈 NUEVO (Fase 2 · notas con IA)

// =====================================================================
//  VIDEOLLAMADA GRUPAL NATIVA  (WebRTC en malla, sin Jitsi)  — v2 estilo Zoom
//  - El video/audio viaja DIRECTO entre las personas (cifrado por WebRTC).
//  - La "señalización" (ponerse de acuerdo para conectar) va por Supabase.
//  - Sobre el mismo canal mandamos también: estado (mic/cam/mano), chat,
//    reacciones y órdenes del anfitrión.
//  - El "anfitrión" es automático: la PRIMERA persona que entró. Como no hay
//    un servidor central, el anfitrión no apaga el micro de otro a la fuerza:
//    le MANDA la orden y la app de esa persona se silencia sola (todos usan
//    esta misma app, así que se respeta). Si el anfitrión se sale, el mando
//    pasa solo al siguiente que entró primero.
// =====================================================================

// Mensajes de CONEXIÓN (WebRTC) que viajan por Supabase.
type Senal =
  | { kind: "hello"; from: string; nombre: string; to?: string }
  | { kind: "offer"; from: string; to: string; nombre: string; sdp: RTCSessionDescriptionInit }
  | { kind: "answer"; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { kind: "ice"; from: string; to: string; candidate: RTCIceCandidateInit }
  | { kind: "bye"; from: string };

// Mensajes de la APP (no son WebRTC): estado, chat, reacciones, mando.
type AppMsg =
  | { t: "estado"; from: string; nombre: string; mic: boolean; cam: boolean; mano: boolean; orden: number }
  | { t: "pedir"; from: string }
  | { t: "chat"; from: string; nombre: string; texto: string; ts: number }
  | { t: "reaccion"; from: string; nombre: string; emoji: string }
  | { t: "transcripcion"; from: string; nombre: string; texto: string; ts: number } // 👈 NUEVO (notas)
  | { t: "mute"; to: string }
  | { t: "mute-todos"; from: string }
  | { t: "sacar"; to: string };

type Peer = { pc: RTCPeerConnection; nombre: string; pendingIce: RTCIceCandidateInit[]; remoteSet: boolean };
type Remoto = { id: string; nombre: string; stream: MediaStream | null };
type EstadoPeer = { mic: boolean; cam: boolean; mano: boolean; nombre: string; orden: number };
type ChatMsg = { id: string; from: string; nombre: string; texto: string; ts: number };
type FraseNota = { id: string; nombre: string; texto: string; ts: number }; // 👈 NUEVO (notas)
type Reaccion = { id: string; nombre: string; emoji: string; x: number };

const EMOJIS = ["👍", "❤️", "😂", "👏", "🎉", "✋", "🔥", "😮"];

// Cada recuadro de video (uno por persona).
function VideoTile({ stream, nombre, local, mic, mano, compartiendo }: {
  stream: MediaStream | null; nombre: string; local?: boolean; mic?: boolean; mano?: boolean; compartiendo?: boolean;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (ref.current && stream) { ref.current.srcObject = stream; ref.current.play?.().catch(() => {}); }
  }, [stream]);
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black">
      <video ref={ref} autoPlay playsInline muted={local} className={"h-full w-full " + (compartiendo ? "object-contain" : "object-cover")} />
      {!stream && <div className="absolute inset-0 flex items-center justify-center text-xs text-white/50">conectando…</div>}
      {mano && <span className="absolute right-1.5 top-1.5 text-lg">✋</span>}
      <span className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-1 bg-black/50 px-2 py-0.5 text-center text-[11px] text-white">
        {mic === false && <span>🔇</span>}
        <span className="truncate">{nombre}{local ? " (tú)" : ""}</span>
      </span>
    </div>
  );
}

export default function LlamadaGrupo({
  sala, nombre, soloAudio, onCerrar,
}: { sala: string; nombre: string; soloAudio?: boolean; onCerrar: () => void }) {
  const localStreamRef = useRef<MediaStream | null>(null);
  const pantallaStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const myId = useRef<string>(Math.random().toString(36).slice(2));
  const ordenRef = useRef<number>(Date.now());
  const peersRef = useRef<Map<string, Peer>>(new Map());
  const iceServersRef = useRef<RTCIceServer[]>([
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ]);

  // refs espejo del estado (para mandarlo sin datos viejos dentro de los handlers)
  const micRef = useRef(true);
  const camRef = useRef(!soloAudio);
  const manoRef = useRef(false);
  const nombreRef = useRef(nombre);
  const soyHostRef = useRef(false);
  const panelRef = useRef<"none" | "part" | "chat" | "notas">("none");

  const [remotos, setRemotos] = useState<Remoto[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [estados, setEstados] = useState<Record<string, EstadoPeer>>({});
  const [conexion, setConexion] = useState<"pidiendo" | "en_sala" | "error">("pidiendo");
  const [errorMsg, setErrorMsg] = useState("");

  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(!soloAudio);
  const [mano, setMano] = useState(false);
  const [miNombre, setMiNombre] = useState(nombre);
  const [compartiendo, setCompartiendo] = useState(false);

  const [panel, setPanel] = useState<"none" | "part" | "chat" | "notas">("none");
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [noLeidos, setNoLeidos] = useState(0);
  const [reacciones, setReacciones] = useState<Reaccion[]>([]);
  const [emojiAbierto, setEmojiAbierto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // ---- NOTAS CON IA (Fase 2) ----
  const [tomandoNotas, setTomandoNotas] = useState(false);     // ¿el puntito rojo está prendido?
  const [frasesNotas, setFrasesNotas] = useState<FraseNota[]>([]); // lo que se va escribiendo en vivo
  const [guardandoNotas, setGuardandoNotas] = useState(false); // mostrando "Generando notas…"
  const recognitionRef = useRef<any>(null);                    // el "oído" del navegador
  const frasesRef = useRef<FraseNota[]>([]);                   // espejo (para usarlo al colgar)
  const tomandoNotasRef = useRef(false);                       // espejo para reiniciar el oído
  const huboNotasRef = useRef(false);                          // ¿yo prendí notas en algún momento?
  const notasEndRef = useRef<HTMLDivElement | null>(null);

  panelRef.current = panel;

  function enviar(s: Senal) { channelRef.current?.send({ type: "broadcast", event: "senal", payload: s }); }
  function enviarApp(m: AppMsg) { channelRef.current?.send({ type: "broadcast", event: "app", payload: m }); }

  function difundirEstado() {
    enviarApp({ t: "estado", from: myId.current, nombre: nombreRef.current, mic: micRef.current, cam: camRef.current, mano: manoRef.current, orden: ordenRef.current });
  }

  function setRemoto(id: string, cambios: Partial<Remoto>) {
    setRemotos((prev) => {
      const i = prev.findIndex((r) => r.id === id);
      if (i === -1) return [...prev, { id, nombre: cambios.nombre || "Invitado", stream: cambios.stream ?? null }];
      const copia = [...prev]; copia[i] = { ...copia[i], ...cambios }; return copia;
    });
  }
  function quitarRemoto(id: string) {
    setRemotos((prev) => prev.filter((r) => r.id !== id));
    setEstados((prev) => { const c = { ...prev }; delete c[id]; return c; });
  }

  function obtenerPeer(id: string, nombrePeer: string): Peer {
    const existente = peersRef.current.get(id);
    if (existente) return existente;
    const pc = new RTCPeerConnection({ iceCandidatePoolSize: 10, iceServers: iceServersRef.current });
    const stream = localStreamRef.current;
    if (stream) stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    pc.onicecandidate = (e) => { if (e.candidate) enviar({ kind: "ice", from: myId.current, to: id, candidate: e.candidate.toJSON() }); };
    pc.ontrack = (e) => { if (e.streams[0]) setRemoto(id, { stream: e.streams[0], nombre: nombrePeer }); };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === "failed" || st === "closed") { try { pc.close(); } catch {} peersRef.current.delete(id); quitarRemoto(id); }
    };
    const peer: Peer = { pc, nombre: nombrePeer, pendingIce: [], remoteSet: false };
    peersRef.current.set(id, peer);
    setRemoto(id, { nombre: nombrePeer, stream: null });
    return peer;
  }

  async function flushIce(peer: Peer) {
    for (const c of peer.pendingIce) { try { await peer.pc.addIceCandidate(c); } catch {} }
    peer.pendingIce = [];
  }

  async function manejar(s: Senal) {
    if (s.from === myId.current) return;
    if (s.kind === "hello") {
      if (s.to && s.to !== myId.current) return;
      if (peersRef.current.has(s.from)) return;
      const peer = obtenerPeer(s.from, s.nombre);
      enviar({ kind: "hello", from: myId.current, nombre: nombreRef.current, to: s.from });
      difundirEstado();
      if (myId.current > s.from) {
        const offer = await peer.pc.createOffer();
        await peer.pc.setLocalDescription(offer);
        enviar({ kind: "offer", from: myId.current, to: s.from, nombre: nombreRef.current, sdp: offer });
      }
      return;
    }
    if (s.kind === "offer") {
      if (s.to !== myId.current) return;
      const peer = obtenerPeer(s.from, s.nombre);
      await peer.pc.setRemoteDescription(s.sdp); peer.remoteSet = true; await flushIce(peer);
      const answer = await peer.pc.createAnswer(); await peer.pc.setLocalDescription(answer);
      enviar({ kind: "answer", from: myId.current, to: s.from, sdp: answer });
      return;
    }
    if (s.kind === "answer") {
      if (s.to !== myId.current) return;
      const peer = peersRef.current.get(s.from);
      if (peer) { await peer.pc.setRemoteDescription(s.sdp); peer.remoteSet = true; await flushIce(peer); }
      return;
    }
    if (s.kind === "ice") {
      if (s.to !== myId.current) return;
      const peer = peersRef.current.get(s.from);
      if (peer && peer.remoteSet) { try { await peer.pc.addIceCandidate(s.candidate); } catch {} }
      else if (peer) peer.pendingIce.push(s.candidate);
      return;
    }
    if (s.kind === "bye") {
      const peer = peersRef.current.get(s.from);
      if (peer) { try { peer.pc.close(); } catch {} peersRef.current.delete(s.from); quitarRemoto(s.from); }
      return;
    }
  }

  function mostrarReaccion(nom: string, emoji: string) {
    const id = Math.random().toString(36).slice(2);
    const x = Math.round(Math.random() * 70 + 10);
    setReacciones((p) => [...p, { id, nombre: nom, emoji, x }]);
    setTimeout(() => setReacciones((p) => p.filter((r) => r.id !== id)), 3400);
  }

  function aplicarMute() {
    const s = localStreamRef.current; if (!s) return;
    s.getAudioTracks().forEach((t) => (t.enabled = false));
    micRef.current = false; setMicOn(false); difundirEstado();
  }

  // ---- NOTAS CON IA: funciones (Fase 2) ----
  // Suma una frase a las notas en vivo (estado para verlo + espejo para usarlo al colgar).
  function pushFrase(f: FraseNota) {
    frasesRef.current = [...frasesRef.current, f];
    setFrasesNotas((p) => [...p, f]);
  }

  // Prende el "oído" del navegador (Web Speech API). Solo Chrome/Edge de escritorio.
  function iniciarReconocimiento(): boolean {
    const SR: any = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) {
      alert("Tu navegador no puede tomar notas por voz. Usa Chrome o Edge en computadora.");
      return false;
    }
    const rec = new SR();
    rec.lang = "es-MX";
    rec.continuous = true;       // escucha seguido
    rec.interimResults = false;  // solo frases ya terminadas (más limpias)
    rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (!e.results[i].isFinal) continue;
        const texto = String(e.results[i][0]?.transcript || "").trim();
        if (!texto) continue;
        const ts = Date.now();
        // 1) la guardo yo  2) la mando a los demás para que se junte "quién dijo qué"
        pushFrase({ id: Math.random().toString(36).slice(2), nombre: nombreRef.current, texto, ts });
        enviarApp({ t: "transcripcion", from: myId.current, nombre: nombreRef.current, texto, ts });
      }
    };
    // El navegador corta el oído solo cada rato: si seguimos tomando notas, lo reiniciamos.
    rec.onend = () => { if (tomandoNotasRef.current) { try { rec.start(); } catch {} } };
    rec.onerror = () => {};
    try { rec.start(); } catch {}
    recognitionRef.current = rec;
    return true;
  }
  function detenerReconocimiento() {
    const rec = recognitionRef.current;
    if (rec) { try { rec.onend = null; rec.stop(); } catch {} }
    recognitionRef.current = null;
  }

  // Botón 📝 Tomar notas: prende/apaga el puntito rojo.
  function toggleNotas() {
    if (tomandoNotas) {
      tomandoNotasRef.current = false;
      detenerReconocimiento();
      setTomandoNotas(false);
    } else {
      tomandoNotasRef.current = true;
      const ok = iniciarReconocimiento();
      if (ok) { huboNotasRef.current = true; setTomandoNotas(true); setPanel("notas"); }
      else { tomandoNotasRef.current = false; }
    }
  }

  // Al salir: si yo tomé notas, mando todo a la IA, guardo y luego cierro.
  async function salir() {
    detenerReconocimiento();
    tomandoNotasRef.current = false;
    const frases = frasesRef.current;
    if (huboNotasRef.current && frases.length > 0) {
      const orden = [...frases].sort((a, b) => a.ts - b.ts);
      const transcripcion = orden.map((f) => `${f.nombre}: ${f.texto}`).join("\n");
      setGuardandoNotas(true);
      try {
        const notas = await generarNotasIA(transcripcion);
        await guardarNotasReunion(sala, { transcripcion, notas });
      } catch {
        // Si la IA falla, al menos dejamos guardada la transcripción.
        try { await guardarNotasReunion(sala, { transcripcion }); } catch {}
      }
      setGuardandoNotas(false);
    }
    onCerrar();
  }

  function manejarApp(m: AppMsg) {
    if ("from" in m && m.from === myId.current) return;
    if (m.t === "estado") {
      setEstados((p) => ({ ...p, [m.from]: { mic: m.mic, cam: m.cam, mano: m.mano, nombre: m.nombre, orden: m.orden } }));
      setRemoto(m.from, { nombre: m.nombre });
    } else if (m.t === "pedir") {
      difundirEstado();
    } else if (m.t === "chat") {
      setChat((p) => [...p, { id: Math.random().toString(36).slice(2), from: m.from, nombre: m.nombre, texto: m.texto, ts: m.ts }]);
      if (panelRef.current !== "chat") setNoLeidos((n) => n + 1);
    } else if (m.t === "reaccion") {
      mostrarReaccion(m.nombre, m.emoji);
    } else if (m.t === "transcripcion") {
      // Llega una frase dicha por OTRA persona: la sumamos a las notas en vivo.
      pushFrase({ id: Math.random().toString(36).slice(2), nombre: m.nombre, texto: m.texto, ts: m.ts });
    } else if (m.t === "mute") {
      if (m.to === myId.current) aplicarMute();
    } else if (m.t === "mute-todos") {
      if (!soyHostRef.current) aplicarMute();
    } else if (m.t === "sacar") {
      if (m.to === myId.current) { alert("El anfitrión te sacó de la reunión."); onCerrar(); }
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
        setLocalStream(stream);
      } catch {
        setErrorMsg("No pudimos usar tu cámara/micrófono. Da permiso en el navegador e intenta otra vez.");
        setConexion("error"); return;
      }
      const ch = supabase.channel("rtc_" + sala, { config: { broadcast: { self: false } } });
      channelRef.current = ch;
      ch.on("broadcast", { event: "senal" }, ({ payload }) => { manejar(payload as Senal); });
      ch.on("broadcast", { event: "app" }, ({ payload }) => { manejarApp(payload as AppMsg); });
      ch.subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          setConexion("en_sala");
          enviar({ kind: "hello", from: myId.current, nombre: nombreRef.current });
          enviarApp({ t: "pedir", from: myId.current });
          difundirEstado();
        }
      });
    }
    iniciar();
    return () => {
      cancelado = true;
      try { detenerReconocimiento(); } catch {}
      try { enviar({ kind: "bye", from: myId.current }); } catch {}
      peersRef.current.forEach((p) => { try { p.pc.close(); } catch {} });
      peersRef.current.clear();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      pantallaStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sala]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chat]);
  useEffect(() => { notasEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [frasesNotas]);

  function toggleMic() {
    const s = localStreamRef.current; if (!s) return;
    const on = !micOn; s.getAudioTracks().forEach((t) => (t.enabled = on));
    micRef.current = on; setMicOn(on); difundirEstado();
  }
  function toggleCam() {
    const s = localStreamRef.current; if (!s) return;
    const on = !camOn; s.getVideoTracks().forEach((t) => (t.enabled = on));
    camRef.current = on; setCamOn(on); difundirEstado();
  }
  function toggleMano() {
    const on = !mano; manoRef.current = on; setMano(on); difundirEstado();
  }
  function cambiarNombre() {
    const nuevo = window.prompt("Tu nombre en la reunión:", nombreRef.current);
    if (nuevo && nuevo.trim()) {
      const n = nuevo.trim(); nombreRef.current = n; setMiNombre(n); difundirEstado();
      try { const g = localStorage.getItem("chat_yo"); const o = g ? JSON.parse(g) : {}; o.nombre = n; localStorage.setItem("chat_yo", JSON.stringify(o)); } catch {}
    }
  }

  async function compartirPantalla() {
    if (soloAudio) return;
    if (compartiendo) { detenerCompartir(); return; }
    try {
      const ds = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = ds.getVideoTracks()[0]; if (!track) return;
      pantallaStreamRef.current = ds;
      peersRef.current.forEach((p) => {
        const sender = p.pc.getSenders().find((s) => s.track && s.track.kind === "video");
        if (sender) sender.replaceTrack(track).catch(() => {});
      });
      setLocalStream(ds);
      track.onended = () => detenerCompartir();
      setCompartiendo(true);
    } catch {}
  }
  function detenerCompartir() {
    const cam = localStreamRef.current;
    const camTrack = cam?.getVideoTracks()[0] || null;
    peersRef.current.forEach((p) => {
      const sender = p.pc.getSenders().find((s) => s.track && s.track.kind === "video");
      if (sender && camTrack) sender.replaceTrack(camTrack).catch(() => {});
    });
    pantallaStreamRef.current?.getTracks().forEach((t) => t.stop());
    pantallaStreamRef.current = null;
    if (cam) setLocalStream(cam);
    setCompartiendo(false);
  }

  function enviarReaccion(emoji: string) {
    enviarApp({ t: "reaccion", from: myId.current, nombre: nombreRef.current, emoji });
    mostrarReaccion(nombreRef.current, emoji); setEmojiAbierto(false);
  }
  function enviarChat() {
    const txt = chatInput.trim(); if (!txt) return;
    const ts = Date.now();
    enviarApp({ t: "chat", from: myId.current, nombre: nombreRef.current, texto: txt, ts });
    setChat((p) => [...p, { id: Math.random().toString(36).slice(2), from: myId.current, nombre: nombreRef.current, texto: txt, ts }]);
    setChatInput("");
  }
  function togglePanel(p: "part" | "chat" | "notas") {
    setPanel((cur) => { const next = cur === p ? "none" : p; if (next === "chat") setNoLeidos(0); return next; });
  }
  function invitar() {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://jurisconecta.netlify.app";
    try { navigator.clipboard.writeText(`${origin}/?sala=${encodeURIComponent(sala)}`); setCopiado(true); setTimeout(() => setCopiado(false), 1600); } catch {}
  }

  function silenciarTodos() { enviarApp({ t: "mute-todos", from: myId.current }); }
  function silenciar(id: string) { enviarApp({ t: "mute", to: id }); }
  function sacar(id: string) { if (confirm("¿Sacar a esta persona de la reunión?")) enviarApp({ t: "sacar", to: id }); }

  if (conexion === "error") {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black px-6 text-center text-white">
        <div className="mb-3 text-4xl">🎤</div>
        <p className="max-w-xs text-sm text-white/80">{errorMsg}</p>
        <button onClick={onCerrar} className="mt-5 rounded-xl bg-white/15 px-5 py-2 text-sm font-semibold">Cerrar</button>
      </div>
    );
  }

  // ¿Quién es anfitrión? El de "orden" más chico (el que entró primero).
  const conocidos = [{ id: myId.current, orden: ordenRef.current }, ...remotos.map((r) => ({ id: r.id, orden: estados[r.id]?.orden ?? Number.MAX_SAFE_INTEGER }))];
  conocidos.sort((a, b) => a.orden - b.orden || (a.id < b.id ? -1 : 1));
  const soyHost = conocidos.length > 0 && conocidos[0].id === myId.current;
  soyHostRef.current = soyHost;

  const total = remotos.length + 1;
  const cols = total <= 1 ? "grid-cols-1" : total <= 4 ? "grid-cols-2" : "grid-cols-3";

  const lista = [
    { id: myId.current, nombre: miNombre, mic: micOn, mano, yo: true },
    ...remotos.map((r) => ({ id: r.id, nombre: estados[r.id]?.nombre || r.nombre, mic: estados[r.id]?.mic ?? true, mano: estados[r.id]?.mano ?? false, yo: false })),
  ];

  const btn = "flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-[11px] font-semibold transition";

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      <style>{`@keyframes flotar{0%{transform:translateY(0);opacity:0}15%{opacity:1}100%{transform:translateY(-130px);opacity:0}}`}</style>

      {guardandoNotas && (
        <div className="absolute inset-0 z-[70] flex flex-col items-center justify-center gap-3 bg-black/80 text-white">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-teal" />
          <p className="text-sm font-semibold">📝 Generando notas con IA…</p>
          <p className="text-xs text-white/60">Un momento, estamos guardando el resumen de la reunión.</p>
        </div>
      )}

      {/* BARRA SUPERIOR */}
      <div className="flex items-center justify-between bg-slate-900 px-4 py-2 text-white">
        <span className="text-sm font-medium">📹 Reunión · JurisConecta — {total} en sala{soyHost ? " · eres anfitrión" : ""}</span>
        <button onClick={salir} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold hover:bg-red-700">Salir</button>
      </div>

      {/* CUERPO: videos + panel lateral */}
      <div className="flex min-h-0 flex-1">
        <div className="relative flex-1">
          <div className={`grid h-full gap-2 overflow-auto p-2 ${cols}`}>
            <VideoTile stream={localStream} nombre={miNombre} local mic={micOn} mano={mano} compartiendo={compartiendo} />
            {remotos.map((r) => (
              <VideoTile key={r.id} stream={r.stream} nombre={estados[r.id]?.nombre || r.nombre} mic={estados[r.id]?.mic ?? true} mano={estados[r.id]?.mano ?? false} />
            ))}
          </div>
          {/* reacciones flotando */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {reacciones.map((r) => (
              <div key={r.id} className="absolute bottom-4 text-3xl" style={{ left: r.x + "%", animation: "flotar 3.4s ease-out forwards" }}>
                <div className="flex flex-col items-center">
                  <span>{r.emoji}</span>
                  <span className="rounded bg-black/50 px-1 text-[10px] text-white">{r.nombre}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* PANEL: participantes o chat */}
        {panel !== "none" && (
          <aside className="flex w-80 max-w-[85vw] shrink-0 flex-col border-l border-white/10 bg-slate-900 text-white">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
              <span className="text-sm font-semibold">{panel === "part" ? `Participantes (${total})` : panel === "notas" ? "📝 Notas en vivo" : "Chat de la reunión"}</span>
              <button onClick={() => setPanel("none")} className="rounded-lg px-2 py-1 text-white/60 hover:bg-white/10">✕</button>
            </div>

            {panel === "part" && (
              <div className="flex-1 overflow-auto p-2">
                {soyHost && (
                  <button onClick={silenciarTodos} className="mb-2 w-full rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/20">🔇 Silenciar a todos</button>
                )}
                {lista.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-teal text-[11px] font-bold">{p.nombre.slice(0, 2).toUpperCase()}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">{p.nombre}{p.yo ? " (tú)" : ""}</span>
                    {p.mano && <span title="Mano levantada">✋</span>}
                    <span title={p.mic ? "Micrófono abierto" : "Silenciado"}>{p.mic ? "🎙️" : "🔇"}</span>
                    {p.yo && <button onClick={cambiarNombre} title="Cambiar mi nombre" className="rounded px-1 text-white/60 hover:bg-white/10">✏️</button>}
                    {soyHost && !p.yo && (
                      <>
                        <button onClick={() => silenciar(p.id)} title="Silenciar" className="rounded px-1 text-white/60 hover:bg-white/10">🔇</button>
                        <button onClick={() => sacar(p.id)} title="Sacar" className="rounded px-1 text-red-400 hover:bg-white/10">⛔</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {panel === "chat" && (
              <>
                <div className="flex-1 space-y-2 overflow-auto p-3">
                  {chat.length === 0 && <p className="text-center text-xs text-white/40">Aún no hay mensajes.</p>}
                  {chat.map((m) => (
                    <div key={m.id} className={m.from === myId.current ? "text-right" : ""}>
                      <p className="text-[10px] text-white/50">{m.from === myId.current ? "Tú" : m.nombre}</p>
                      <p className="inline-block rounded-xl bg-white/10 px-3 py-1.5 text-sm">{m.texto}</p>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
                <div className="flex gap-2 border-t border-white/10 p-2">
                  <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") enviarChat(); }} placeholder="Escribe un mensaje…" className="flex-1 rounded-lg bg-white/10 px-3 py-2 text-sm outline-none placeholder:text-white/40" />
                  <button onClick={enviarChat} className="rounded-lg bg-teal px-3 py-2 text-sm font-semibold">Enviar</button>
                </div>
              </>
            )}

            {panel === "notas" && (
              <>
                <div className="border-b border-white/10 px-3 py-2 text-[11px] text-white/60">
                  {tomandoNotas
                    ? <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" /> Escuchando… se irá escribiendo solo.</span>
                    : "Las notas están apagadas. Préndelas con el botón 📝 de abajo."}
                </div>
                <div className="flex-1 space-y-2 overflow-auto p-3">
                  {frasesNotas.length === 0 && <p className="text-center text-xs text-white/40">Aún no se ha escrito nada.</p>}
                  {frasesNotas.map((f) => (
                    <div key={f.id}>
                      <p className="text-[10px] text-white/50">{f.nombre}</p>
                      <p className="inline-block rounded-xl bg-white/10 px-3 py-1.5 text-sm">{f.texto}</p>
                    </div>
                  ))}
                  <div ref={notasEndRef} />
                </div>
                <div className="border-t border-white/10 p-2 text-center text-[11px] text-white/50">
                  Al salir de la reunión, la IA arma el resumen y queda en el registro.
                </div>
              </>
            )}
          </aside>
        )}
      </div>

      {/* BARRA INFERIOR DE ACCIONES */}
      <div className="relative flex flex-wrap items-center justify-center gap-2 bg-slate-900 px-3 py-2 text-white">
        <button onClick={toggleMic} className={btn + (micOn ? " bg-white/10 hover:bg-white/20" : " bg-white text-slate-900")}>
          <span className="text-base">{micOn ? "🎙️" : "🔇"}</span>{micOn ? "Silenciar" : "Activar"}
        </button>
        {!soloAudio && (
          <button onClick={toggleCam} className={btn + (camOn ? " bg-white/10 hover:bg-white/20" : " bg-white text-slate-900")}>
            <span className="text-base">{camOn ? "📷" : "🚫"}</span>{camOn ? "Detener" : "Iniciar"}
          </button>
        )}
        {!soloAudio && (
          <button onClick={compartirPantalla} className={btn + (compartiendo ? " bg-aqua text-white" : " bg-white/10 hover:bg-white/20")}>
            <span className="text-base">🖥️</span>{compartiendo ? "Dejar de compartir" : "Compartir"}
          </button>
        )}
        <div className="relative">
          <button onClick={() => setEmojiAbierto((v) => !v)} className={btn + " bg-white/10 hover:bg-white/20"}>
            <span className="text-base">😀</span>Reaccionar
          </button>
          {emojiAbierto && (
            <div className="absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 gap-1 rounded-xl bg-slate-800 p-2 shadow-lg">
              {EMOJIS.map((e) => (
                <button key={e} onClick={() => enviarReaccion(e)} className="rounded-lg px-1.5 py-1 text-xl hover:bg-white/10">{e}</button>
              ))}
            </div>
          )}
        </div>
        <button onClick={toggleMano} className={btn + (mano ? " bg-amber-400 text-slate-900" : " bg-white/10 hover:bg-white/20")}>
          <span className="text-base">✋</span>{mano ? "Bajar mano" : "Levantar mano"}
        </button>
        <button onClick={toggleNotas} className={btn + (tomandoNotas ? " bg-red-500 text-white" : " bg-white/10 hover:bg-white/20") + " relative"}>
          <span className="text-base">📝</span>{tomandoNotas ? "Grabando notas" : "Tomar notas"}
          {tomandoNotas && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-pulse rounded-full bg-red-400 ring-2 ring-slate-900" />}
        </button>
        <button onClick={() => togglePanel("chat")} className={btn + (panel === "chat" ? " bg-aqua text-white" : " bg-white/10 hover:bg-white/20") + " relative"}>
          <span className="text-base">💬</span>Chat
          {noLeidos > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px]">{noLeidos}</span>}
        </button>
        <button onClick={() => togglePanel("part")} className={btn + (panel === "part" ? " bg-aqua text-white" : " bg-white/10 hover:bg-white/20")}>
          <span className="text-base">👥</span>Participantes
        </button>
        <button onClick={invitar} className={btn + " bg-white/10 hover:bg-white/20"}>
          <span className="text-base">🔗</span>{copiado ? "¡Copiado!" : "Invitar"}
        </button>
        <button onClick={salir} className={btn + " bg-red-600 hover:bg-red-700"}>
          <span className="text-base">📞</span>Salir
        </button>
      </div>
    </div>
  );
}
