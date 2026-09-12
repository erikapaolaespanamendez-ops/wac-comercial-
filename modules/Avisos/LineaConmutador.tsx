import { useEffect, useRef, useState } from "react";
import { Device, type Call } from "@twilio/voice-sdk";
import { supabase } from "../../lib/supabase";
import { miPuestoConmutador } from "../../data/conmutador";

// API que comparte el "motor" de la línea con el botón y la pantalla.
export type LineaConmutadorAPI = {
  area: string;
  estado: string;
  lista: boolean;
  entrante: boolean;
  enLlamada: boolean;
  quien: string;      // nombre del cliente (si su número está registrado)
  tel: string;        // teléfono de quien llama
  esCliente: boolean; // true si el número está registrado como cliente
  contestar: () => void;
  colgar: () => void;
  rechazar: () => void;
  transferir: (ext: string) => Promise<{ ok: boolean; error?: string; nombre?: string }>;
};

// MOTOR: registra la "línea" de Twilio del navegador con la identidad del ÁREA
// del colaborador y maneja las llamadas entrantes. Se usa UNA vez en App.
export function useLineaConmutador(nombre: string): LineaConmutadorAPI {
  const [entrante, setEntrante] = useState(false);
  const [enLlamada, setEnLlamada] = useState(false);
  const [quien, setQuien] = useState("");
  const [tel, setTel] = useState("");
  const [esCliente, setEsCliente] = useState(false);
  const [area, setArea] = useState("");
  const [estado, setEstado] = useState("Iniciando…");
  const [lista, setLista] = useState(false);
  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);
  const sidRef = useRef("");

  useEffect(() => {
    if (!nombre) return;
    let cancelado = false;
    let device: Device | null = null;

    function limpiar() {
      callRef.current = null;
      sidRef.current = "";
      setEntrante(false);
      setEnLlamada(false);
      setQuien("");
      setTel("");
      setEsCliente(false);
    }

    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const correo = data.user?.email || "";
        const puesto = await miPuestoConmutador(correo, nombre);
        if (cancelado) return;

        if (!puesto.area) { setEstado("Sin área en tu ficha"); return; }
        if (!puesto.activo) { setEstado("Tu ficha está inactiva"); return; }
        setArea(puesto.area);

        setEstado("Pidiendo micrófono…");
        try {
          await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
          setEstado("Micrófono bloqueado (permítelo y recarga)");
          return;
        }

        setEstado("Conectando línea…");
        let tok: { token?: string; error?: string } = {};
        try {
          const r = await fetch("/.netlify/functions/token-voz?identidad=" + encodeURIComponent(puesto.area));
          tok = await r.json();
        } catch {
          setEstado("No se pudo pedir el token");
          return;
        }
        if (cancelado) return;
        if (!tok?.token) { setEstado("Sin token: " + (tok?.error || "faltan llaves Twilio")); return; }

        device = new Device(tok.token, { logLevel: "error" });
        deviceRef.current = device;

        device.on("registered", () => { setLista(true); setEstado("Lista ✓"); });
        device.on("unregistered", () => { setLista(false); setEstado("Desconectada"); });
        device.on("error", (e: any) => { setLista(false); setEstado("Error: " + (e?.message || "desconocido")); });

        device.on("incoming", (call: Call) => {
          callRef.current = call;
          // Lee QUIÉN llama (lo manda el conmutador en los parámetros del <Client>).
          try {
            const cp = call.customParameters;
            setTel(cp?.get("tel") || "");
            setQuien(cp?.get("quien") || "");
            setEsCliente((cp?.get("cliente") || "0") === "1");
            sidRef.current = cp?.get("sid") || "";
          } catch { /* ignore */ }
          setEntrante(true);
          call.on("cancel", limpiar);
          call.on("disconnect", limpiar);
          call.on("reject", limpiar);
          call.on("error", limpiar);
        });

        device.on("tokenWillExpire", async () => {
          try {
            const rr = await fetch("/.netlify/functions/token-voz?identidad=" + encodeURIComponent(puesto.area));
            const nt = await rr.json();
            if (nt?.token) device?.updateToken(nt.token);
          } catch { /* ignore */ }
        });

        setEstado("Registrando…");
        await device.register();
      } catch (e: any) {
        setEstado("Falló: " + (e?.message || "error"));
      }
    })();

    return () => {
      cancelado = true;
      try { device?.destroy(); } catch { /* ignore */ }
    };
  }, [nombre]);

  function contestar() {
    const call = callRef.current;
    if (!call) return;
    try { call.accept(); } catch { /* ignore */ }
    setEnLlamada(true);
    setEntrante(false);
  }
  function colgar() {
    const call = callRef.current;
    try { call?.disconnect(); } catch { /* ignore */ }
    callRef.current = null;
    setEnLlamada(false);
    setEntrante(false);
  }
  function rechazar() {
    const call = callRef.current;
    try { call?.reject(); } catch { /* ignore */ }
    callRef.current = null;
    setEntrante(false);
  }

  // Traspasa la llamada en curso a la extensión de otra persona (sin colgarle
  // al cliente). El servidor redirige la llamada del cliente al nuevo destino.
  async function transferir(ext: string): Promise<{ ok: boolean; error?: string; nombre?: string }> {
    const sid = sidRef.current;
    if (!sid || !ext) return { ok: false, error: "Sin llamada activa" };
    try {
      const r = await fetch("/.netlify/functions/transferir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callSid: sid, ext, quien, tel }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, error: data.error || "No se pudo transferir" };
      return { ok: true, nombre: data.nombre };
    } catch {
      return { ok: false, error: "Error de red" };
    }
  }

  return { area, estado, lista, entrante, enLlamada, quien, tel, esCliente, contestar, colgar, rechazar, transferir };
}

// BOTÓN redondo para la barra de arriba (junto a la campanita).
export function LineaConmutadorBoton({ linea }: { linea: LineaConmutadorAPI }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setAbierto((v) => !v)}
        aria-label="Línea de llamadas"
        title="Línea de llamadas"
        className="relative flex h-8 w-8 items-center justify-center rounded-full bg-teal-soft text-sm text-teal-dark ring-1 ring-black/5"
      >
        ☎️
        <span className={"absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white " + (linea.lista ? "bg-green-500" : "bg-amber-400")} />
      </button>
      {abierto && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)} />
          <div className="absolute right-0 top-10 z-50 w-64 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-black/10 bg-white shadow-xl">
            <div className="border-b border-black/5 px-4 py-3">
              <div className="text-sm font-semibold text-tinta">Línea de llamadas</div>
              <div className="text-[11px] text-humo">Conmutador DIIPA</div>
            </div>
            <div className="px-4 py-3">
              <div className="flex items-center gap-2">
                <span className={"h-2.5 w-2.5 rounded-full " + (linea.lista ? "bg-green-500" : "bg-amber-400")} />
                <span className="text-sm font-medium text-tinta">{linea.estado}</span>
              </div>
              <div className="mt-1 text-[11px] text-humo">Área: {linea.area || "—"}</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Formatea el teléfono a 10 dígitos: (33) 1234 5678
function fmtTel(t: string): string {
  const d = (t || "").replace(/\D/g, "").slice(-10);
  if (d.length !== 10) return t || "";
  return `(${d.slice(0, 2)}) ${d.slice(2, 6)} ${d.slice(6)}`;
}

type Compa = { nombre: string; extension: string; area: string };

// TARJETA pequeña abajo a la derecha cuando entra/está en una llamada (no tapa la vista).
export function LineaConmutadorPantalla({ linea }: { linea: LineaConmutadorAPI }) {
  // Etiqueta de quién llama: nombre si está registrado, si no el teléfono, si no genérico.
  const titulo = linea.quien || fmtTel(linea.tel) || "Número nuevo";

  // Panel de TRANSFERIR (traspasar la llamada a la extensión de otra persona).
  const [transfer, setTransfer] = useState(false);
  const [gente, setGente] = useState<Compa[]>([]);
  const [cargando, setCargando] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [msg, setMsg] = useState("");

  async function abrirTransfer() {
    setTransfer(true);
    setMsg("");
    setFiltro("");
    setCargando(true);
    try {
      const { data } = await supabase
        .from("colaboradores")
        .select("nombre,extension,area,activo")
        .eq("activo", true)
        .order("nombre");
      const arr = (data || [])
        .filter((x: { extension: string | null }) => x.extension)
        .map((x: { nombre: string | null; extension: string | null; area: string | null }) => ({
          nombre: x.nombre || "—",
          extension: String(x.extension),
          area: x.area || "",
        }));
      setGente(arr);
    } catch { setGente([]); }
    setCargando(false);
  }

  async function elegir(ext: string) {
    setMsg("Transfiriendo…");
    const res = await linea.transferir(ext);
    if (res.ok) {
      setMsg(res.nombre ? `Transferida a ${res.nombre} ✓` : "Transferida ✓");
      setTimeout(() => { setTransfer(false); setMsg(""); }, 1400);
    } else {
      setMsg(res.error || "No se pudo transferir");
    }
  }

  if (linea.enLlamada) {
    const filtrada = gente.filter((g) =>
      !filtro.trim() ||
      g.nombre.toLowerCase().includes(filtro.toLowerCase()) ||
      g.extension.includes(filtro)
    );
    return (
      <div className="fixed bottom-4 right-4 z-[80] w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-tinta p-4 text-white shadow-2xl">
        {!transfer ? (
          <>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-500/20 text-xl">📞</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">En llamada{linea.quien ? ` con ${linea.quien}` : ""}</p>
                <p className="truncate text-[11px] text-white/60">{linea.esCliente ? "Cliente" : "Llamada"} · {fmtTel(linea.tel) || "conmutador DIIPA"}</p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={abrirTransfer} className="flex-1 rounded-xl bg-white/15 py-2 text-xs font-semibold hover:bg-white/25">↗ Transferir</button>
              <button onClick={linea.colgar} className="flex-1 rounded-xl bg-red-600 py-2 text-xs font-semibold hover:bg-red-700">Colgar</button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-bold">Transferir a…</p>
              <button onClick={() => setTransfer(false)} className="text-[11px] text-white/60 hover:text-white">Cancelar</button>
            </div>
            <input
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Buscar nombre o extensión"
              className="mb-2 w-full rounded-lg bg-white/10 px-3 py-2 text-xs text-white placeholder-white/40 outline-none"
            />
            <div className="max-h-44 overflow-y-auto">
              {cargando ? (
                <p className="px-1 py-3 text-center text-[11px] text-white/50">Cargando…</p>
              ) : filtrada.length === 0 ? (
                <p className="px-1 py-3 text-center text-[11px] text-white/50">Sin coincidencias</p>
              ) : (
                filtrada.map((g) => (
                  <button
                    key={g.extension + g.nombre}
                    onClick={() => elegir(g.extension)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left hover:bg-white/10"
                  >
                    <span className="min-w-0 flex-1 truncate text-xs">{g.nombre}</span>
                    <span className="shrink-0 rounded bg-white/15 px-1.5 py-0.5 font-mono text-[10px]">{g.extension}</span>
                  </button>
                ))
              )}
            </div>
            {msg && <p className="mt-2 text-center text-[11px] font-medium text-white/80">{msg}</p>}
          </>
        )}
      </div>
    );
  }
  if (!linea.entrante) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[80] w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-gradient-to-br from-teal-dark to-tinta p-4 text-white shadow-2xl">
      <div className="flex items-center gap-3">
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 text-xl">
          ☎️
          <span className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-ping rounded-full bg-green-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-bold">{titulo}</p>
            {linea.esCliente && (
              <span className="shrink-0 rounded-full bg-green-500/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">Cliente</span>
            )}
          </div>
          <p className="truncate text-[11px] text-white/60">
            {linea.quien && linea.tel ? fmtTel(linea.tel) + " · " : ""}
            {linea.area ? "Área: " + linea.area : "Conmutador DIIPA"} · Sonando…
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button onClick={linea.rechazar} className="flex-1 rounded-xl bg-red-600 py-2 text-xs font-semibold hover:bg-red-700">Colgar</button>
        <button onClick={linea.contestar} className="flex-1 rounded-xl bg-green-500 py-2 text-xs font-semibold hover:bg-green-600">Contestar</button>
      </div>
    </div>
  );
}
