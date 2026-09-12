import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import LlamadaChat from "../ChatInterno/LlamadaChat";
import { escucharMensajes } from "../../data/chatRealtime";
import { intervaloVisible } from "../../lib/intervaloVisible";

type Entrante = { canalId: string; autor: string; soloAudio: boolean };

export default function LlamadaEntrante({ nombre }: { nombre: string }) {
  const [entrante, setEntrante] = useState<Entrante | null>(null);
  const [enLlamada, setEnLlamada] = useState<{ sala: string; soloAudio: boolean } | null>(null);
  const misCanales = useRef<Set<string>>(new Set());
  const audioRef = useRef<AudioContext | null>(null);
  const ringRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ocupadoRef = useRef(false);

  // Desbloquea el sonido con el primer toque (regla de los navegadores)
  useEffect(() => {
    function desbloquear() {
      try {
        if (!audioRef.current) {
          const AC = window.AudioContext || (window as any).webkitAudioContext;
          audioRef.current = new AC();
        }
        const ctx = audioRef.current;
        if (ctx.state === "suspended") ctx.resume();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        g.gain.value = 0.0001;
        o.connect(g); g.connect(ctx.destination);
        o.start(); o.stop(ctx.currentTime + 0.02);
      } catch {}
    }
    window.addEventListener("pointerdown", desbloquear, { once: true });
    window.addEventListener("touchstart", desbloquear, { once: true });
    window.addEventListener("click", desbloquear, { once: true });
    return () => {
      window.removeEventListener("pointerdown", desbloquear);
      window.removeEventListener("touchstart", desbloquear);
      window.removeEventListener("click", desbloquear);
    };
  }, []);

  function unBeep() {
    try {
      if (!audioRef.current) {
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        audioRef.current = new AC();
      }
      const ctx = audioRef.current;
      if (ctx.state === "suspended") ctx.resume();
      const t0 = ctx.currentTime;
      const notas = [1047, 1319, 1047, 1319, 1047, 1319, 1047, 1568, 1319, 1047];
      const dur = 0.085;
      notas.forEach((freq, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "triangle";
        o.frequency.value = freq;
        o.connect(g); g.connect(ctx.destination);
        const ini = t0 + i * dur;
        g.gain.setValueAtTime(0.0001, ini);
        g.gain.exponentialRampToValueAtTime(0.55, ini + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, ini + dur * 0.95);
        o.start(ini); o.stop(ini + dur);
      });
    } catch {}
  }

  function empezarRing() {
    unBeep();
    try { navigator.vibrate?.([400, 200, 400, 200, 400]); } catch {}
    ringRef.current = setInterval(() => {
      unBeep();
      try { navigator.vibrate?.([400, 200, 400]); } catch {}
    }, 2500);
  }
  function pararRing() {
    if (ringRef.current) { clearInterval(ringRef.current); ringRef.current = null; }
    try { navigator.vibrate?.(0); } catch {}
  }

  async function cargarMisCanales() {
    const set = new Set<string>();
    const { data: dmA } = await supabase.from("chat_canales").select("id").eq("tipo", "directo").eq("dm_a", nombre);
    (dmA || []).forEach((c: any) => set.add(c.id));
    const { data: dmB } = await supabase.from("chat_canales").select("id").eq("tipo", "directo").eq("dm_b", nombre);
    (dmB || []).forEach((c: any) => set.add(c.id));
    const { data: mem } = await supabase.from("chat_miembros").select("canal_id").eq("nombre", nombre);
    (mem || []).forEach((m: any) => set.add(m.canal_id));
    misCanales.current = set;
  }

  useEffect(() => {
    if (!nombre) return;
    cargarMisCanales();
    const refresco = intervaloVisible(cargarMisCanales, 5 * 60 * 1000);

    const desuscribir = escucharMensajes(async (m: any) => {
      if (!m || m.autor_nombre === nombre) return;
      const texto: string = m.texto || "";
      const esLlamada = texto.startsWith("📞 Llamada") || texto.startsWith("🎥 Videollamada");
      if (!esLlamada) return;
      const edad = Date.now() - new Date(m.created_at).getTime();
      if (edad > 60000) return;
      if (ocupadoRef.current) return;
      let mio = misCanales.current.has(m.canal_id);
      if (!mio) {
        const { data: c } = await supabase.from("chat_canales").select("id,tipo,dm_a,dm_b").eq("id", m.canal_id).maybeSingle();
        if (c && c.tipo === "directo" && (c.dm_a === nombre || c.dm_b === nombre)) { misCanales.current.add(c.id); mio = true; }
      }
      if (!mio) return;
      ocupadoRef.current = true;
      setEntrante({ canalId: m.canal_id, autor: m.autor_nombre || "Alguien", soloAudio: texto.startsWith("📞") });
    });

    return () => {
      refresco();
      desuscribir();
      pararRing();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nombre]);

  useEffect(() => {
    if (entrante) {
      empezarRing();
      timeoutRef.current = setTimeout(() => { pararRing(); ocupadoRef.current = false; setEntrante(null); }, 35000);
    }
    return () => {
      pararRing();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entrante]);

  function contestar() {
    if (!entrante) return;
    pararRing();
    setEnLlamada({ sala: `JurisConecta-${entrante.canalId}`, soloAudio: entrante.soloAudio });
    setEntrante(null);
  }
  function rechazar() {
    pararRing();
    ocupadoRef.current = false;
    setEntrante(null);
  }

  if (enLlamada) {
    return <LlamadaChat sala={enLlamada.sala} nombre={nombre} soloAudio={enLlamada.soloAudio} onCerrar={() => { ocupadoRef.current = false; setEnLlamada(null); }} />;
  }
  if (!entrante) return null;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col items-center justify-between bg-gradient-to-b from-teal-dark to-tinta px-6 py-16 text-white">
      <div className="mt-10 flex flex-col items-center gap-3 text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/15 text-5xl">
          {entrante.soloAudio ? "📞" : "🎥"}
        </div>
        <p className="text-sm text-white/70">{entrante.soloAudio ? "Llamada entrante" : "Videollamada entrante"}</p>
        <p className="text-2xl font-bold">{entrante.autor}</p>
        <p className="animate-pulse text-sm text-white/60">Sonando…</p>
      </div>
      <div className="mb-6 flex w-full max-w-xs items-center justify-around">
        <button onClick={rechazar} className="flex flex-col items-center gap-2">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-2xl shadow-lg">✕</span>
          <span className="text-xs">Rechazar</span>
        </button>
        <button onClick={contestar} className="flex flex-col items-center gap-2">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500 text-2xl shadow-lg">📞</span>
          <span className="text-xs">Contestar</span>
        </button>
      </div>
    </div>
  );
}
