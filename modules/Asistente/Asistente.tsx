import { useState, useRef, useEffect } from "react";

type Msg = { rol: "user" | "model"; texto: string };

export default function Asistente() {
  const [mensajes, setMensajes] = useState<Msg[]>([]);
  const [entrada, setEntrada] = useState("");
  const [cargando, setCargando] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes, cargando]);

  const enviar = async () => {
    const texto = entrada.trim();
    if (!texto || cargando) return;
    const nuevos: Msg[] = [...mensajes, { rol: "user", texto }];
    setMensajes(nuevos);
    setEntrada("");
    setCargando(true);
    try {
      const r = await fetch("/.netlify/functions/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensajes: nuevos }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Error");
      setMensajes((prev) => [...prev, { rol: "model", texto: data.texto }]);
    } catch (e: any) {
      setMensajes((prev) => [...prev, { rol: "model", texto: "⚠️ No pude responder: " + (e?.message || "error") }]);
    } finally {
      setCargando(false);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  };

  const sugerencias = [
    "Redáctame un correo para un cliente que no ha pagado su apartado.",
    "Explícame en simple qué es una cesión de derechos.",
    "Hazme un resumen corto de este texto: …",
  ];

  return (
    <div className="flex h-[calc(100vh-150px)] min-h-[380px] w-full flex-col px-4 py-4 sm:px-6">
      <div className="mb-3">
        <h1 className="font-display text-xl font-extrabold text-tinta">🤖 Asistente DIIPA</h1>
        <p className="text-sm text-humo">Tu ayudante con IA: redacta correos, contesta dudas y resume textos.</p>
      </div>

      <div className="flex-1 overflow-y-auto rounded-2xl border border-black/5 bg-white p-3 sm:p-4">
        {mensajes.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="text-3xl">🤖</div>
            <p className="text-sm text-humo">Escríbeme lo que necesites. Por ejemplo:</p>
            <div className="flex flex-col gap-2">
              {sugerencias.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setEntrada(s)}
                  className="rounded-xl border border-black/10 bg-nube px-3 py-2 text-left text-[13px] text-tinta transition hover:bg-teal-soft"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {mensajes.map((m, i) => (
              <div key={i} className={m.rol === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed " +
                    (m.rol === "user" ? "bg-teal text-white" : "bg-nube text-tinta")
                  }
                >
                  {m.texto}
                </div>
              </div>
            ))}
            {cargando && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-nube px-3.5 py-2.5 text-sm text-humo">Escribiendo…</div>
              </div>
            )}
            <div ref={finRef} />
          </div>
        )}
      </div>

      <div className="mt-3 flex items-end gap-2">
        <textarea
          value={entrada}
          onChange={(e) => setEntrada(e.target.value)}
          onKeyDown={onKey}
          rows={1}
          placeholder="Escribe tu pregunta o pídeme un correo…"
          className="flex-1 resize-none rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
        />
        <button
          onClick={enviar}
          disabled={cargando || !entrada.trim()}
          className="shrink-0 rounded-2xl bg-teal px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-dark disabled:opacity-40"
        >
          Enviar
        </button>
      </div>
      <p className="mt-1.5 text-center text-[11px] text-humo">El asistente puede equivocarse. Verifica la información importante.</p>
    </div>
  );
}
