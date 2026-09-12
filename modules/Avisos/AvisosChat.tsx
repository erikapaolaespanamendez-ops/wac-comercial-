import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { intervaloVisible } from "../../lib/intervaloVisible";
type Aviso = { id: string; autor: string; texto: string };
export default function AvisosChat({ nombre, onAbrir }: { nombre: string; onAbrir?: () => void }) {
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const misCanales = useRef<Set<string>>(new Set());
  const audioRef = useRef<AudioContext | null>(null);
  const ocultarT = useRef<ReturnType<typeof setTimeout> | null>(null);
  function sonar() {
    try {
      if (!audioRef.current) {
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        audioRef.current = new AC();
      }
      const ctx = audioRef.current;
      if (ctx.state === "suspended") ctx.resume();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 880;
      o.connect(g);
      g.connect(ctx.destination);
      const t = ctx.currentTime;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.start(t);
      o.stop(t + 0.36);
    } catch {}
  }
  async function cargarMisCanales() {
    const meta = (nombre || "").trim().toLowerCase();
    const set = new Set<string>();
    const { data: dms } = await supabase.from("chat_canales").select("id,dm_a,dm_b").eq("tipo", "directo");
    (dms || []).forEach((c: any) => {
      const a = (c.dm_a || "").trim().toLowerCase();
      const b = (c.dm_b || "").trim().toLowerCase();
      if (a === meta || b === meta) set.add(c.id);
    });
    const { data: mem } = await supabase.from("chat_miembros").select("canal_id,nombre");
    (mem || []).forEach((m: any) => { if ((m.nombre || "").trim().toLowerCase() === meta) set.add(m.canal_id); });
    misCanales.current = set;
  }
  useEffect(() => {
    if (!nombre) return;
    cargarMisCanales();
    const refresco = intervaloVisible(cargarMisCanales, 5 * 60 * 1000);
    const canal = supabase
      .channel("avisos_chat_global")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_mensajes" },
        async (payload) => {
          const m: any = payload.new;
          if (!m) return;
          const meta = (nombre || "").trim().toLowerCase();
          if ((m.autor_nombre || "").trim().toLowerCase() === meta) return; // si soy yo, no avisa
          let mio = misCanales.current.has(m.canal_id);
          if (!mio) {
            const { data: c } = await supabase.from("chat_canales").select("id,tipo,dm_a,dm_b").eq("id", m.canal_id).maybeSingle();
            if (c && c.tipo === "directo") {
              const a = (c.dm_a || "").trim().toLowerCase();
              const b = (c.dm_b || "").trim().toLowerCase();
              if (a === meta || b === meta) { misCanales.current.add(c.id); mio = true; }
            }
          }
          if (!mio) return;
          sonar();
          const txt = m.texto ? String(m.texto) : (m.archivo_tipo ? "📎 archivo" : "mensaje");
          setAviso({ id: m.id, autor: m.autor_nombre || "Alguien", texto: txt });
          if (ocultarT.current) clearTimeout(ocultarT.current);
          ocultarT.current = setTimeout(() => setAviso(null), 6000);
        }
      )
      .subscribe();
    return () => {
      refresco();
      supabase.removeChannel(canal);
      if (ocultarT.current) clearTimeout(ocultarT.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nombre]);
  if (!aviso) return null;
  return (
    <button
      onClick={() => { setAviso(null); onAbrir && onAbrir(); }}
      className="fixed left-1/2 top-3 z-[70] flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-black/10 bg-white px-4 py-3 text-left shadow-2xl"
      style={{ maxWidth: "min(420px, calc(100vw - 24px))" }}
    >
      <span className="text-xl">💬</span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-tinta">{aviso.autor}</span>
        <span className="block truncate text-xs text-humo">{aviso.texto}</span>
      </span>
    </button>
  );
}
