// LINEA TELEFONICA EN LA APP (Twilio) -> va en: src/modules/ChatInterno/LineaTwilio.tsx
// Vive dentro del chat, registrada con el CORREO de la persona.
// Cuando entra una llamada (porque alguien marco a su app), muestra la
// pantalla azul de "Llamada entrante" con Contestar / Rechazar.
import { useEffect, useRef, useState } from "react";
import { Device, type Call } from "@twilio/voice-sdk";
import { supabase } from "../../lib/supabase";

// Convierte el correo en un identificador que Twilio acepta sin problemas
// (sin @ ni puntos). DEBE ser igual al que usa el servidor al timbrar.
function idTwilio(correo: string): string {
  return (correo || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "_");
}

type Props = { correo?: string };

export default function LineaTwilio({ correo = "" }: Props) {
  const [fase, setFase] = useState<"idle" | "entrante" | "en_llamada">("idle");
  const [aceptada, setAceptada] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [micOn, setMicOn] = useState(true);
  const [quien, setQuien] = useState("Llamada entrante");

  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);

  async function pedirToken(identidad: string): Promise<string> {
    const r = await fetch("/.netlify/functions/token-voz?identidad=" + encodeURIComponent(identidad));
    const d = await r.json();
    if (!d.token) throw new Error("sin token");
    return d.token;
  }

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        let id = correo;
        if (!id) {
          try {
            const { data: ses } = await supabase.auth.getSession();
            id = ses?.session?.user?.email || "";
          } catch {}
        }
        if (!id) return; // sin correo no hay linea
        const identidad = idTwilio(id);

        const token = await pedirToken(identidad);
        if (!vivo) return;

        const device = new Device(token, { logLevel: "error" });
        deviceRef.current = device;

        // Renueva el token antes de que caduque para no perder la linea
        device.on("tokenWillExpire", async () => {
          try {
            const t = await pedirToken(identidad);
            device.updateToken(t);
          } catch {}
        });

        device.on("incoming", (call: Call) => {
          callRef.current = call;
          const from =
            (call.parameters && (call.parameters.nombre || call.parameters.From)) ||
            "Llamada entrante";
          setQuien(String(from));
          setFase("entrante");
          try { navigator.vibrate?.([600, 300, 600, 300, 600]); } catch {}

          const fin = () => {
            setFase("idle");
            setAceptada(false);
            setSegundos(0);
            setMicOn(true);
            callRef.current = null;
            try { navigator.vibrate?.(0); } catch {}
          };
          call.on("accept", () => {
            setFase("en_llamada");
            setAceptada(true);
            setSegundos(0);
            try { navigator.vibrate?.(0); } catch {}
          });
          call.on("disconnect", fin);
          call.on("cancel", fin);
          call.on("reject", fin);
          call.on("error", fin);
        });

        await device.register();
      } catch {}
    })();
    return () => {
      vivo = false;
      try { deviceRef.current?.destroy(); } catch {}
    };
  }, [correo]);

  useEffect(() => {
    if (!aceptada) return;
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [aceptada]);

  function mmss(n: number) {
    const m = Math.floor(n / 60).toString().padStart(2, "0");
    const s = (n % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }
  function contestar() { try { callRef.current?.accept(); } catch {} }
  function rechazar() {
    try { callRef.current?.reject(); } catch {}
    try { navigator.vibrate?.(0); } catch {}
    setFase("idle");
  }
  function colgar() { try { callRef.current?.disconnect(); } catch {} }
  function toggleMic() {
    const c = callRef.current;
    if (!c) return;
    const nuevo = !micOn;
    try { c.mute(!nuevo); } catch {}
    setMicOn(nuevo);
  }

  if (fase === "idle") return null;

  const estadoTexto =
    fase === "entrante" ? "Llamada entrante…" : aceptada ? `En llamada · ${mmss(segundos)}` : "Conectando…";

  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-between bg-gradient-to-b from-[#10417C] to-[#0c2f5a] px-6 py-12 text-white">
      <div className="mt-12 flex flex-col items-center gap-4">
        <div className="flex h-32 w-32 items-center justify-center rounded-full bg-white/15 text-6xl shadow-2xl ring-4 ring-white/10">📞</div>
        <p className="text-2xl font-semibold tracking-wide">{quien}</p>
        <p className="text-sm text-white/70">{estadoTexto}</p>
      </div>

      {fase === "entrante" ? (
        <div className="mb-6 flex items-center justify-center gap-12">
          <button onClick={rechazar} className="flex flex-col items-center gap-1 text-xs">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-2xl shadow-lg">📵</span>
            Rechazar
          </button>
          <button onClick={contestar} className="flex flex-col items-center gap-1 text-xs">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-2xl shadow-lg">📞</span>
            Contestar
          </button>
        </div>
      ) : (
        <div className="mb-6 flex items-center justify-center gap-8">
          <button onClick={toggleMic} disabled={!aceptada} className="flex flex-col items-center gap-1 text-xs disabled:opacity-40">
            <span className={"flex h-14 w-14 items-center justify-center rounded-full text-2xl " + (micOn ? "bg-white/15" : "bg-white text-slate-900")}>
              {micOn ? "🎙️" : "🔇"}
            </span>
            {micOn ? "Silenciar" : "Activar"}
          </button>
          <button onClick={colgar} className="flex flex-col items-center gap-1 text-xs">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-2xl shadow-lg">📞</span>
            Colgar
          </button>
        </div>
      )}
    </div>
  );
}
