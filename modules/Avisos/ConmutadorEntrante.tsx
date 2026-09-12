import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { suscribirLlamadas, miPuestoConmutador, type LlamadaConmutador } from "../../data/conmutador";
import { intervaloVisible } from "../../lib/intervaloVisible";

// Suena SOLO si la llamada va a mi extensión o a mi área (y estoy activo).
export default function ConmutadorEntrante({ nombre }: { nombre: string }) {
  const [entrante, setEntrante] = useState<LlamadaConmutador | null>(null);
  const [enLlamada, setEnLlamada] = useState(false);
  const puesto = useRef<{ extension: string; area: string; activo: boolean }>({ extension: "", area: "", activo: true });
  const audioRef = useRef<AudioContext | null>(null);
  const ringRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ocupadoRef = useRef(false);

  // Desbloquea el sonido con el primer toque (regla de los navegadores).
  useEffect(() => {
    function desbloquear() {
      try {
        if (!audioRef.current) {
          const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          audioRef.current = new AC();
        }
        const ctx = audioRef.current;
        if (ctx && ctx.state === "suspended") ctx.resume();
      } catch { /* ignore */ }
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

  function beep() {
    try {
      if (!audioRef.current) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioRef.current = new AC();
      }
      const ctx = audioRef.current;
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume();
      const t0 = ctx.currentTime;
      const notas = [880, 1175, 880, 1175];
      const dur = 0.13;
      notas.forEach((freq, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "triangle";
        o.frequency.value = freq;
        o.connect(g); g.connect(ctx.destination);
        const ini = t0 + i * dur;
        g.gain.setValueAtTime(0.0001, ini);
        g.gain.exponentialRampToValueAtTime(0.5, ini + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, ini + dur * 0.95);
        o.start(ini); o.stop(ini + dur);
      });
    } catch { /* ignore */ }
  }
  function empezarRing() {
    beep();
    try { navigator.vibrate?.([400, 200, 400]); } catch { /* ignore */ }
    ringRef.current = setInterval(() => {
      beep();
      try { navigator.vibrate?.([400, 200, 400]); } catch { /* ignore */ }
    }, 2500);
  }
  function pararRing() {
    if (ringRef.current) { clearInterval(ringRef.current); ringRef.current = null; }
    try { navigator.vibrate?.(0); } catch { /* ignore */ }
  }

  useEffect(() => {
    if (!nombre) return;
    let correo = "";
    supabase.auth.getUser().then(({ data }) => {
      correo = data.user?.email || "";
      miPuestoConmutador(correo, nombre).then((p) => { puesto.current = p; });
    });
    const refresco = intervaloVisible(() => { miPuestoConmutador(correo, nombre).then((p) => { puesto.current = p; }); }, 10 * 60 * 1000);

    const off = suscribirLlamadas((l) => {
      if (ocupadoRef.current) return;
      const p = puesto.current;
      if (!p.activo) return;
      const mia =
        (!!l.paraExtension && l.paraExtension === p.extension) ||
        (!!l.paraArea && l.paraArea === p.area);
      if (!mia) return;
      ocupadoRef.current = true;
      setEntrante(l);
    });

    return () => {
      refresco();
      off();
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

  function contestar() { pararRing(); setEnLlamada(true); setEntrante(null); }
  function colgar() { pararRing(); ocupadoRef.current = false; setEnLlamada(false); setEntrante(null); }
  function rechazar() { pararRing(); ocupadoRef.current = false; setEntrante(null); }

  if (enLlamada) {
    return (
      <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-teal-dark to-tinta px-6 text-white">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/15 text-5xl">📞</div>
        <p className="text-lg font-bold">En llamada</p>
        <p className="max-w-xs text-center text-sm text-white/70">El audio en vivo se conectará cuando el número de Twilio esté activo.</p>
        <button onClick={colgar} className="mt-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-2xl shadow-lg">✕</button>
      </div>
    );
  }
  if (!entrante) return null;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col items-center justify-between bg-gradient-to-b from-teal-dark to-tinta px-6 py-16 text-white">
      <div className="mt-10 flex flex-col items-center gap-3 text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/15 text-5xl">☎️</div>
        <p className="text-sm text-white/70">Llamada al conmutador</p>
        <p className="text-2xl font-bold">{entrante.deNumero}</p>
        <p className="text-sm text-white/80">
          {entrante.paraExtension ? `Ext. ${entrante.paraExtension}` : `Área: ${entrante.paraArea}`}
        </p>
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
