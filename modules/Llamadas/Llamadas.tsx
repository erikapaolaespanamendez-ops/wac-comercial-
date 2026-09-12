// MODULO REGISTRO DE LLAMADAS → va en: src/modules/Llamadas/Llamadas.tsx
import { useEffect, useMemo, useState } from "react";
import {
  fetchLlamadas,
  registrarLlamada,
  marcarUrgente,
  marcarDevuelta,
  eliminarLlamada,
  archivarLlamada,
  historialPorTelefono,
  clientePorTelefono,
  AREAS,
  MOTIVOS,
  RESULTADOS,
  type Llamada,
  type TipoLlamada,
} from "../../data/llamadas";
import { supabase } from "../../lib/supabase";
import { fetchPerfil } from "../../data/usuarios";
import { puedeAccion } from "../../data/roles";
import LlamarGrabar from "../LlamarGrabar/LlamarGrabar";
import { exportarBitacoraExcel } from "../../data/exportarBitacora";

const AREA_EMOJI: Record<string, string> = {
  juridico: "⚖️", comercial: "💼", contabilidad: "💰", administracion: "💰",
  atencion: "🎧", tecnologia: "💻", direccion: "⭐",
};

const FASES = ["Nueva", "En proceso", "Esperando al cliente", "Esperando documentos", "En revisión jurídica", "Resuelta"];

function fechaBonita(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-MX", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
function nombreArea(clave: string): string {
  return AREAS.find((a) => a.clave === clave)?.nombre || clave || "—";
}
function u10(s: string): string {
  return (s || "").replace(/\D/g, "").slice(-10);
}

export default function Llamadas() {
  const [llamadas, setLlamadas] = useState<Llamada[]>([]);
  const [miRol, setMiRol] = useState<string | null>(null);

  // Manda la llamada a la papelera (Configuración → Papelera). Borrado suave, recuperable.
  async function eliminarLlam(l: Llamada) {
    if (!confirm("¿Eliminar esta llamada? Se irá a la papelera (Configuración → Papelera).")) return;
    setLlamadas((prev) => prev.filter((x) => x.id !== l.id));
    setFicha(null);
    const ok = await eliminarLlamada(l.id, true);
    if (!ok) { alert("No se pudo eliminar. Intenta de nuevo."); setLlamadas((prev) => [l, ...prev]); }
  }

  // Archiva la llamada (la saca del registro sin borrarla; queda como archivada).
  async function archivarLlam(l: Llamada) {
    if (!puedeAccion(miRol, "archivar")) { alert("No tienes permiso para archivar."); return; }
    if (!confirm("¿Archivar esta llamada? Se quita del registro pero no se borra.")) return;
    setMenuLlam(null);
    setLlamadas((prev) => prev.filter((x) => x.id !== l.id));
    const ok = await archivarLlamada(l.id, true);
    if (!ok) { alert("No se pudo archivar. Intenta de nuevo."); setLlamadas((prev) => [l, ...prev]); }
  }
  // Manda a papelera desde el menú de la tarjeta.
  async function papeleraLlam(l: Llamada) {
    if (!puedeAccion(miRol, "enviar_papelera")) { alert("No tienes permiso para enviar a la papelera."); return; }
    setMenuLlam(null);
    await eliminarLlam(l);
  }
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<"todas" | "pendientes" | "urgentes" | "entrantes" | "perdidas">("todas");
  const [filtroArea, setFiltroArea] = useState<string>("todas");
  const [abrir, setAbrir] = useState(false);
  const [confirmacion, setConfirmacion] = useState<string | null>(null);

  // nombre de quien registra (de la sesión)
  const [yo, setYo] = useState("");

  // ----- Formulario manual (ahora solo para ENTRANTES) -----
  const [telefono, setTelefono] = useState("");
  const [tipo] = useState<TipoLlamada>("entrante"); // fijo: este formulario es para entrantes
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [area, setArea] = useState("atencion");
  const [clienteNombre, setClienteNombre] = useState("");
  const [garantia, setGarantia] = useState("");
  const [expediente, setExpediente] = useState("");
  const [resultado, setResultado] = useState(RESULTADOS[0]);
  const [devolver, setDevolver] = useState(false);
  const [urgente, setUrgente] = useState(false);
  const [responsable, setResponsable] = useState("");
  const [fechaCompromiso, setFechaCompromiso] = useState("");
  const [duracion, setDuracion] = useState("");
  const [registradoPor, setRegistradoPor] = useState("");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);

  const [buscandoTel, setBuscandoTel] = useState(false);
  const [infoNumero, setInfoNumero] = useState<{ cliente: string; garantia: string; veces: number } | null>(null);

  // ----- LLAMAR Y GRABAR (por compu, graba y registra solo) -----
  const [llamarDatos, setLlamarDatos] = useState<{ numero: string; nombre: string; area?: string | null } | null>(null);

  // Ficha técnica (clic en el folio)
  const [ficha, setFicha] = useState<Llamada | null>(null);
  const [menuLlam, setMenuLlam] = useState<Llamada | null>(null);

  const cargar = () => {
    setCargando(true);
    setError(false);
    fetchLlamadas().then(setLlamadas).catch(() => setError(true)).finally(() => setCargando(false));
  };
  useEffect(() => { cargar(); }, []);

  // Saca el nombre de la usuaria de la sesión (para "registrado por")
  useEffect(() => {
    let activo = true;
    supabase.auth.getSession().then(async ({ data }: any) => {
      const email = data.session?.user?.email;
      if (!email) return;
      const p = await fetchPerfil(email).catch(() => null);
      if (activo) { setYo(p?.nombre || email.split("@")[0]); setMiRol(p?.rol ?? null); }
    });
    return () => { activo = false; };
  }, []);

  const toggleUrgente = async (l: Llamada) => {
    if (!puedeAccion(miRol, "gestionar_llamada")) { alert("No tienes permiso para esto."); return; }
    const nuevo = !l.urgente;
    setLlamadas((prev) => prev.map((x) => (x.id === l.id ? { ...x, urgente: nuevo } : x)));
    const ok = await marcarUrgente(l.id, nuevo);
    if (!ok) {
      setLlamadas((prev) => prev.map((x) => (x.id === l.id ? { ...x, urgente: !nuevo } : x)));
    }
  };

  const toggleDevuelta = async (l: Llamada) => {
    if (!puedeAccion(miRol, "gestionar_llamada")) { alert("No tienes permiso para esto."); return; }
    const nuevo = !l.devuelta;
    setLlamadas((prev) => prev.map((x) => (x.id === l.id ? { ...x, devuelta: nuevo } : x)));
    const ok = await marcarDevuelta(l.id, nuevo);
    if (!ok) {
      setLlamadas((prev) => prev.map((x) => (x.id === l.id ? { ...x, devuelta: !nuevo } : x)));
    }
  };

  // Cambia la fase de una tarea (cualquiera puede avanzarla)
  const cambiarFase = async (l: Llamada, nuevaFase: string) => {
    const antes = l.fase;
    setLlamadas((prev) => prev.map((x) => (x.id === l.id ? { ...x, fase: nuevaFase } : x)));
    const { error } = await supabase.from("llamadas").update({ fase: nuevaFase }).eq("id", l.id);
    if (error) {
      setLlamadas((prev) => prev.map((x) => (x.id === l.id ? { ...x, fase: antes } : x)));
    }
  };

  const buscarNumero = async () => {
    if (telefono.replace(/\D/g, "").length < 7) { setInfoNumero(null); return; }
    setBuscandoTel(true);
    const [cli, hist] = await Promise.all([clientePorTelefono(telefono), historialPorTelefono(telefono)]);
    setBuscandoTel(false);
    if (cli) {
      setClienteNombre(cli.nombre); setGarantia(cli.garantia); setExpediente(cli.expediente);
      setInfoNumero({ cliente: cli.nombre, garantia: cli.garantia, veces: hist.veces });
    } else {
      setInfoNumero({ cliente: "", garantia: "", veces: hist.veces });
    }
  };

  const limpiar = () => {
    setTelefono(""); setMotivo(MOTIVOS[0]); setArea("atencion");
    setClienteNombre(""); setGarantia(""); setExpediente(""); setResultado(RESULTADOS[0]);
    setDevolver(false); setUrgente(false); setResponsable(""); setFechaCompromiso(""); setDuracion("");
    setRegistradoPor(""); setNota(""); setInfoNumero(null);
  };

  // Abre "Llamar y grabar" con el número de una fila (ideal para devolver llamadas)
  const llamarGrabarDesde = (l: Llamada) => {
    setLlamarDatos({ numero: l.telefono || "", nombre: l.clienteNombre || "", area: l.area || null });
  };

  const guardar = async () => {
    setGuardando(true);
    const r = await registrarLlamada({
      tipo, telefono, area, motivo, clienteNombre, garantia, expediente, resultado,
      devolver, urgente, responsable, fechaCompromiso,
      duracion: duracion ? parseInt(duracion, 10) : null,
      registradoPor: registradoPor || yo, nota,
    });
    setGuardando(false);
    if (r) {
      setAbrir(false);
      limpiar();
      cargar();
      setConfirmacion(r.folio);
      setTimeout(() => setConfirmacion(null), 4000);
    }
  };

  const conteoPorArea = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of llamadas) m[l.area] = (m[l.area] || 0) + 1;
    return m;
  }, [llamadas]);

  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return llamadas.filter((l) => {
      const texto = !q ||
        l.folio.toLowerCase().includes(q) ||
        l.telefono.includes(q) ||
        l.clienteNombre.toLowerCase().includes(q) ||
        l.motivo.toLowerCase().includes(q);
      let pasaFiltro = true;
      if (filtro === "pendientes") pasaFiltro = l.devolver && !l.devuelta;
      else if (filtro === "urgentes") pasaFiltro = l.urgente;
      else if (filtro === "entrantes") pasaFiltro = l.tipo === "entrante";
      else if (filtro === "perdidas") pasaFiltro = l.resultado === "No contestó";
      const areaOk = filtroArea === "todas" || l.area === filtroArea;
      return texto && pasaFiltro && areaOk;
    });
  }, [busqueda, filtro, filtroArea, llamadas]);

  const pendientes = llamadas.filter((l) => l.devolver && !l.devuelta).length;
  const urgentesN = llamadas.filter((l) => l.urgente).length;
  const entrantesN = llamadas.filter((l) => l.tipo === "entrante").length;
  const perdidasN = llamadas.filter((l) => l.resultado === "No contestó").length;

  const inputCls = "mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20";
  const labelCls = "text-xs font-medium text-humo";

  const TipoBadge = ({ t }: { t: TipoLlamada }) => (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${t === "saliente" ? "bg-teal-soft text-teal-dark" : "bg-aqua-soft text-aqua-dark"}`}>
      {t === "saliente" ? "↗ Saliente" : "↙ Entrante"}
    </span>
  );

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      {confirmacion && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700">
          ✓ Llamada registrada con folio <b>{confirmacion}</b>
        </div>
      )}

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por folio, teléfono, cliente o motivo…"
          className="w-full flex-1 rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm shadow-sm outline-none transition placeholder:text-humo/70 focus:border-teal focus:ring-2 focus:ring-teal/20"
        />
        <button
          onClick={() => setLlamarDatos({ numero: "", nombre: "", area: null })}
          className="shrink-0 rounded-2xl bg-teal px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-dark"
        >
          📞 Llamar y grabar
        </button>
        {puedeAccion(miRol, "registrar_llamada") && (
        <button
          onClick={() => setAbrir(true)}
          className="shrink-0 rounded-2xl bg-aqua px-4 py-3 text-sm font-semibold text-white transition hover:bg-aqua-dark"
        >
          📥 Registrar entrante
        </button>
        )}
        <button
          onClick={() => exportarBitacoraExcel(lista)}
          disabled={lista.length === 0}
          title="Descargar en Excel las llamadas que ves filtradas"
          className="shrink-0 rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
        >
          ⬇️ Exportar Excel
        </button>
      </div>

      <div className="mb-2 flex flex-wrap gap-1.5">
        <button
          onClick={() => setFiltro("todas")}
          className={filtro === "todas"
            ? "rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white"
            : "rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-humo hover:bg-teal-soft"}
        >
          Todas
        </button>
        <button
          onClick={() => setFiltro("entrantes")}
          className={filtro === "entrantes"
            ? "rounded-lg bg-aqua px-3 py-1.5 text-xs font-semibold text-white"
            : "rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-humo hover:bg-aqua-soft"}
        >
          ↙ Entrantes ({entrantesN})
        </button>
        <button
          onClick={() => setFiltro("perdidas")}
          className={filtro === "perdidas"
            ? "rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white"
            : "rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-humo hover:bg-rose-50"}
        >
          📵 Perdidas ({perdidasN})
        </button>
        <button
          onClick={() => setFiltro("urgentes")}
          className={filtro === "urgentes"
            ? "rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white"
            : "rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-humo hover:bg-rose-50"}
        >
          ⭐ Urgentes ({urgentesN})
        </button>
        <button
          onClick={() => setFiltro("pendientes")}
          className={filtro === "pendientes"
            ? "rounded-lg bg-dorado px-3 py-1.5 text-xs font-semibold text-tinta"
            : "rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-humo hover:bg-teal-soft"}
        >
          ⏰ Pendientes ({pendientes})
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        <button
          onClick={() => setFiltroArea("todas")}
          className={filtroArea === "todas"
            ? "rounded-lg bg-tinta px-3 py-1.5 text-xs font-semibold text-white"
            : "rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-humo hover:bg-nube"}
        >
          Todas las áreas ({llamadas.length})
        </button>
        {AREAS.map((a) => (
          <button
            key={a.clave}
            onClick={() => setFiltroArea(a.clave)}
            className={filtroArea === a.clave
              ? "rounded-lg bg-tinta px-3 py-1.5 text-xs font-semibold text-white"
              : "rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-humo hover:bg-nube"}
          >
            {(AREA_EMOJI[a.clave] || "📞")} {a.nombre} ({conteoPorArea[a.clave] || 0})
          </button>
        ))}
      </div>

      {cargando ? (
        <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-16 text-center text-humo">Cargando llamadas…</div>
      ) : error ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-16 text-center text-amber-800">
          No se pudo cargar el registro. Revisa que la tabla <b>llamadas</b> exista en Supabase.
        </div>
      ) : lista.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-16 text-center text-humo">
          No hay llamadas que coincidan. Usa "📞 Llamar y grabar" o "📥 Registrar entrante".
        </div>
      ) : (
        <>
          {/* MÓVIL Y TABLET: tarjetas */}
          <div className="space-y-2.5 lg:hidden">
            {lista.map((l) => {
              const esPerdida = l.resultado === "No contestó";
              const tareaPend = l.devolver && !l.devuelta;
              return (
                <div
                  key={l.id}
                  className={`rounded-2xl border p-3.5 shadow-sm ${l.urgente ? "border-rose-300 bg-rose-50" : tareaPend ? "border-dorado/40 bg-white" : "border-black/5 bg-white"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <button onClick={() => setFicha(l)} className="font-display font-bold text-teal-dark underline-offset-2 hover:underline">{l.folio}</button>
                      <span className="shrink-0 rounded-full bg-aqua-soft px-2 py-0.5 text-[11px] font-medium text-aqua-dark">
                        {(AREA_EMOJI[l.area] || "")} {nombreArea(l.area)}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => toggleUrgente(l)}
                        title={l.urgente ? "Quitar urgente" : "Marcar urgente"}
                        aria-label={l.urgente ? "Quitar urgente" : "Marcar urgente"}
                        className="shrink-0 text-xl leading-none transition hover:scale-110"
                      >
                        {l.urgente ? "⭐" : "☆"}
                      </button>
                      {(puedeAccion(miRol, "enviar_papelera") || puedeAccion(miRol, "archivar")) && (
                        <button
                          onClick={() => setMenuLlam(l)}
                          title="Acciones"
                          aria-label="Acciones"
                          className="shrink-0 rounded-lg px-2 py-0.5 text-lg font-bold leading-none text-humo transition hover:bg-nube hover:text-tinta"
                        >⋯</button>
                      )}
                    </div>
                  </div>

                  <div className="mt-2">
                    <div className="font-medium text-tinta">{l.clienteNombre || "—"}</div>
                    <div className="text-sm text-humo">{l.motivo || "—"}</div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <TipoBadge t={l.tipo} />
                    {esPerdida ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">📵 Perdida</span>
                    ) : l.resultado ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">{l.resultado}</span>
                    ) : null}
                    {l.telefono && (
                      <button
                        onClick={() => llamarGrabarDesde(l)}
                        title="Llamar y grabar a este número"
                        className="inline-flex items-center gap-1 rounded-full bg-teal-soft px-2 py-0.5 text-[11px] font-medium text-teal-dark transition hover:bg-teal hover:text-white"
                      >
                        📞 {l.telefono}
                      </button>
                    )}
                  </div>

                  {l.devolver && (
                    tareaPend ? (
                      <div className="mt-2.5 rounded-xl bg-dorado/10 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="text-base leading-none">⏰</span>
                            <div className="min-w-0 leading-tight">
                              <div className="text-[12px] font-semibold text-dorado-dark">Tarea · {l.responsable || "sin asignar"}</div>
                              <div className="text-[11px] text-dorado-dark/80">{l.fechaCompromiso ? `vence ${l.fechaCompromiso}` : "pendiente"}</div>
                            </div>
                          </div>
                          <button
                            onClick={() => toggleDevuelta(l)}
                            className="shrink-0 rounded-lg bg-teal px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-teal-dark"
                          >
                            Hecha
                          </button>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="shrink-0 text-[11px] font-semibold text-dorado-dark">Fase:</span>
                          <select
                            value={l.fase || FASES[0]}
                            onChange={(e) => cambiarFase(l, e.target.value)}
                            className="w-full rounded-lg border border-black/10 bg-white px-2 py-1 text-[12px] outline-none focus:border-teal"
                          >
                            {FASES.map((f) => <option key={f} value={f}>{f}</option>)}
                          </select>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xl bg-emerald-50 px-3 py-2">
                        <span className="text-[12px] font-semibold text-emerald-700">✓ Devuelta{l.responsable ? ` · ${l.responsable}` : ""}</span>
                        <button
                          onClick={() => toggleDevuelta(l)}
                          className="shrink-0 text-[11px] font-medium text-humo underline"
                        >
                          Reabrir
                        </button>
                      </div>
                    )
                  )}

                  <div className="mt-2 text-[11px] text-humo">{fechaBonita(l.fecha)}</div>
                </div>
              );
            })}
          </div>

          {/* ESCRITORIO GRANDE: tabla */}
          <div className="hidden overflow-x-auto rounded-xl border border-black/10 bg-white shadow-sm lg:block">
            <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
              <thead className="border-b border-black/10 bg-teal-soft text-[11px] uppercase tracking-wide text-teal-dark">
                <tr>
                  <th className="border-r border-black/10 px-2 py-2 text-center font-bold">⭐</th>
                  <th className="border-r border-black/10 px-2 py-2 text-center font-bold">#</th>
                  <th className="border-r border-black/10 px-3 py-2 font-bold">Folio</th>
                  <th className="border-r border-black/10 px-3 py-2 font-bold">Fecha</th>
                  <th className="border-r border-black/10 px-3 py-2 font-bold">Teléfono</th>
                  <th className="border-r border-black/10 px-3 py-2 font-bold">Cliente</th>
                  <th className="border-r border-black/10 px-3 py-2 font-bold">Motivo</th>
                  <th className="border-r border-black/10 px-3 py-2 font-bold">Área</th>
                  <th className="border-r border-black/10 px-3 py-2 font-bold">Tipo</th>
                  <th className="border-r border-black/10 px-3 py-2 font-bold">Resultado</th>
                  <th className="px-3 py-2 font-bold">Devolver</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((l, i) => (
                  <tr key={l.id} className={`border-b border-black/5 ${l.urgente ? "bg-rose-50" : (l.devolver && !l.devuelta) ? "bg-dorado/10" : i % 2 ? "bg-nube/40" : "bg-white"} hover:bg-teal-soft/50`}>
                    <td className="border-r border-black/5 px-2 py-2 text-center">
                      <button
                        onClick={() => toggleUrgente(l)}
                        title={l.urgente ? "Quitar urgente" : "Marcar urgente"}
                        className="text-base leading-none transition hover:scale-110"
                      >
                        {l.urgente ? "⭐" : "☆"}
                      </button>
                    </td>
                    <td className="border-r border-black/5 px-2 py-2 text-center text-[11px] text-humo">{i + 1}</td>
                    <td className="whitespace-nowrap border-r border-black/5 px-3 py-2 font-display font-bold text-teal-dark"><button onClick={() => setFicha(l)} className="underline-offset-2 hover:underline">{l.folio}</button></td>
                    <td className="whitespace-nowrap border-r border-black/5 px-3 py-2 text-humo">{fechaBonita(l.fecha)}</td>
                    <td className="whitespace-nowrap border-r border-black/5 px-3 py-2 text-tinta">
                      {l.telefono ? (
                        <button
                          onClick={() => llamarGrabarDesde(l)}
                          title="Llamar y grabar a este número"
                          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-teal-dark transition hover:bg-teal hover:text-white"
                        >
                          📞 {l.telefono}
                        </button>
                      ) : "—"}
                    </td>
                    <td className="border-r border-black/5 px-3 py-2 font-medium text-tinta">{l.clienteNombre || "—"}</td>
                    <td className="border-r border-black/5 px-3 py-2 text-humo">{l.motivo || "—"}</td>
                    <td className="whitespace-nowrap border-r border-black/5 px-3 py-2 text-aqua-dark">{(AREA_EMOJI[l.area] || "")} {nombreArea(l.area)}</td>
                    <td className="border-r border-black/5 px-3 py-2"><TipoBadge t={l.tipo} /></td>
                    <td className="border-r border-black/5 px-3 py-2 text-humo">
                      {l.resultado === "No contestó"
                        ? <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">📵 {l.resultado}</span>
                        : (l.resultado || "—")}
                    </td>
                    <td className="px-3 py-2">
                      {l.devolver ? (
                        l.devuelta ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">✓ Devuelta</span>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 rounded-full bg-dorado/20 px-2 py-0.5 text-[11px] font-semibold text-dorado-dark">
                                ⏰ {l.responsable || "—"} {l.fechaCompromiso ? `· ${l.fechaCompromiso}` : ""}
                              </span>
                              <button
                                onClick={() => toggleDevuelta(l)}
                                className="shrink-0 rounded-md bg-teal px-2 py-0.5 text-[11px] font-semibold text-white transition hover:bg-teal-dark"
                              >
                                Hecha
                              </button>
                            </div>
                            <select
                              value={l.fase || FASES[0]}
                              onChange={(e) => cambiarFase(l, e.target.value)}
                              className="rounded border border-black/10 bg-white px-1.5 py-0.5 text-[11px] outline-none focus:border-teal"
                            >
                              {FASES.map((f) => <option key={f} value={f}>{f}</option>)}
                            </select>
                          </div>
                        )
                      ) : (
                        <span className="text-[11px] text-humo">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="mt-6 text-center text-xs text-humo">
        {lista.length} llamada(s) · Ordenadas de la más reciente · Toca la ⭐ para urgente · Toca 📞 para llamar y grabar.
      </p>

      {/* ===== MODAL: REGISTRAR ENTRANTE (manual) ===== */}
      {abrir && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-tinta/40 p-4" onClick={() => setAbrir(false)}>
          <div className="my-6 w-full max-w-lg rounded-3xl bg-white p-5 shadow-xl sm:p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg font-bold text-tinta">📥 Registrar llamada entrante</h3>
            <p className="mt-1 text-sm text-humo">Para anotar a mano una llamada que entró. El folio se asigna solo, según el área.</p>

            <div className="mt-4 space-y-3">
              <div>
                <label className={labelCls}>Teléfono (escríbelo y sal del campo para identificar)</label>
                <input value={telefono} onChange={(e) => setTelefono(e.target.value)} onBlur={buscarNumero} className={inputCls} placeholder="Ej. 33 2233 4455" />
                {buscandoTel && <p className="mt-1 text-[11px] text-humo">Buscando número…</p>}
                {infoNumero && !buscandoTel && (
                  <div className="mt-2 rounded-xl bg-aqua-soft px-3 py-2 text-[12px] text-aqua-dark">
                    {infoNumero.cliente ? (
                      <span>📌 <b>{infoNumero.cliente}</b>{infoNumero.garantia ? ` · ${infoNumero.garantia}` : ""}</span>
                    ) : (
                      <span>📌 Número no ligado a un cliente registrado.</span>
                    )}
                    <span className="ml-1">· 🔢 Ha llamado <b>{infoNumero.veces}</b> vez(ces).</span>
                  </div>
                )}
              </div>

              <div>
                <label className={labelCls}>Área que atiende</label>
                <select value={area} onChange={(e) => setArea(e.target.value)} className={inputCls}>
                  {AREAS.map((a) => (<option key={a.clave} value={a.clave}>{a.nombre} ({a.prefijo})</option>))}
                </select>
              </div>

              <div>
                <label className={labelCls}>¿Por qué llamó? (Motivo)</label>
                <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className={inputCls}>
                  {MOTIVOS.map((m) => (<option key={m} value={m}>{m}</option>))}
                </select>
              </div>

              <div>
                <label className={labelCls}>Cliente (se llena solo si el número coincide)</label>
                <input value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} className={inputCls} placeholder="Nombre del cliente" />
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="flex-1">
                  <label className={labelCls}>Garantía</label>
                  <input value={garantia} onChange={(e) => setGarantia(e.target.value)} className={inputCls} placeholder="GAR-0000" />
                </div>
                <div className="flex-1">
                  <label className={labelCls}>Expediente</label>
                  <input value={expediente} onChange={(e) => setExpediente(e.target.value)} className={inputCls} placeholder="Opcional" />
                </div>
              </div>

              <div>
                <label className={labelCls}>Resultado (elige "No contestó" para que cuente como perdida)</label>
                <select value={resultado} onChange={(e) => setResultado(e.target.value)} className={inputCls}>
                  {RESULTADOS.map((r) => (<option key={r} value={r}>{r}</option>))}
                </select>
              </div>

              <label className="flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-tinta">
                <input type="checkbox" checked={urgente} onChange={(e) => setUrgente(e.target.checked)} className="h-4 w-4 rounded border-black/20" />
                ⭐ Marcar como <b>urgente / favorita</b>
              </label>

              <label className="flex items-center gap-2 text-sm text-tinta">
                <input type="checkbox" checked={devolver} onChange={(e) => setDevolver(e.target.checked)} className="h-4 w-4 rounded border-black/20" />
                Marcar para <b>devolver llamada</b> (seguimiento)
              </label>
              {devolver && (
                <div className="flex flex-col gap-3 rounded-xl bg-dorado/10 p-3 sm:flex-row">
                  <div className="flex-1">
                    <label className={labelCls}>Responsable</label>
                    <input value={responsable} onChange={(e) => setResponsable(e.target.value)} className={inputCls} placeholder="¿Quién la devuelve?" />
                  </div>
                  <div className="flex-1">
                    <label className={labelCls}>Fecha compromiso</label>
                    <input type="date" value={fechaCompromiso} onChange={(e) => setFechaCompromiso(e.target.value)} className={inputCls} />
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="flex-1">
                  <label className={labelCls}>Duración (min, opcional)</label>
                  <input value={duracion} onChange={(e) => setDuracion(e.target.value.replace(/\D/g, ""))} className={inputCls} placeholder="Ej. 5" inputMode="numeric" />
                </div>
                <div className="flex-1">
                  <label className={labelCls}>Quién registra</label>
                  <input value={registradoPor} onChange={(e) => setRegistradoPor(e.target.value)} className={inputCls} placeholder={yo || "Tu nombre"} />
                </div>
              </div>

              <div>
                <label className={labelCls}>Nota / detalle</label>
                <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} className={inputCls} placeholder="Qué dijo, qué se acordó…" />
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button onClick={() => setAbrir(false)} className="flex-1 rounded-xl border border-black/10 px-4 py-2.5 text-sm font-medium text-humo transition hover:bg-nube">Cancelar</button>
              <button onClick={guardar} disabled={guardando} className="flex-1 rounded-xl bg-teal px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-dark disabled:opacity-50">
                {guardando ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MENÚ DE ACCIONES DE LA TARJETA (papelera / archivar) ===== */}
      {menuLlam && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-tinta/40 p-4" onClick={() => setMenuLlam(null)}>
          <div className="w-full max-w-xs rounded-2xl bg-white p-3 shadow-xl" onClick={(ev) => ev.stopPropagation()}>
            <p className="truncate px-2 py-1.5 text-sm font-semibold text-tinta">{menuLlam.folio} · {menuLlam.clienteNombre || menuLlam.telefono || "—"}</p>
            {puedeAccion(miRol, "archivar") && (
              <button onClick={() => archivarLlam(menuLlam)} className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-tinta hover:bg-nube">📦 Archivar</button>
            )}
            {puedeAccion(miRol, "enviar_papelera") && (
              <button onClick={() => papeleraLlam(menuLlam)} className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-rose-600 hover:bg-rose-50">🗑️ Mandar a papelera</button>
            )}
            <button onClick={() => setMenuLlam(null)} className="mt-1 w-full rounded-lg px-3 py-2 text-sm text-humo hover:bg-nube">Cerrar</button>
          </div>
        </div>
      )}

      {/* ===== FICHA TÉCNICA (clic en el folio) ===== */}
      {ficha && (() => {
        const fnum = u10(ficha.telefono);
        const mismos = fnum.length === 10 ? llamadas.filter((x) => u10(x.telefono) === fnum) : [];
        const veces = mismos.length;
        const noCont = mismos.filter((x) => x.resultado === "No contestó").length;
        return (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-tinta/40 p-4" onClick={() => setFicha(null)}>
            <div className="my-6 w-full max-w-md rounded-3xl bg-white p-5 shadow-xl sm:p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-display text-lg font-extrabold text-teal-dark">Ficha técnica · {ficha.folio}</h3>
                  <p className="mt-0.5 text-xs text-humo">{fechaBonita(ficha.fecha)}</p>
                </div>
                <button onClick={() => setFicha(null)} className="rounded-lg px-2 py-1 text-sm text-humo hover:bg-nube">Cerrar</button>
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                <TipoBadge t={ficha.tipo} />
                <span className="rounded-full bg-aqua-soft px-2 py-0.5 text-[11px] font-medium text-aqua-dark">{(AREA_EMOJI[ficha.area] || "")} {nombreArea(ficha.area)}</span>
                {ficha.resultado && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">{ficha.resultado}</span>}
                {ficha.urgente && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">⭐ Urgente</span>}
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <div><span className="text-[11px] font-semibold uppercase text-humo">Teléfono</span><div className="text-tinta">{ficha.telefono || "—"}</div></div>
                <div><span className="text-[11px] font-semibold uppercase text-humo">Cliente</span><div className="text-tinta">{ficha.clienteNombre || "—"}</div></div>
                <div><span className="text-[11px] font-semibold uppercase text-humo">Motivo</span><div className="text-tinta">{ficha.motivo || "—"}</div></div>
                <div><span className="text-[11px] font-semibold uppercase text-humo">Duración</span><div className="text-tinta">{ficha.duracion ? ficha.duracion + " seg" : "—"}</div></div>
                {ficha.responsable && <div><span className="text-[11px] font-semibold uppercase text-humo">Responsable</span><div className="text-tinta">{ficha.responsable}</div></div>}
                {ficha.fase && <div><span className="text-[11px] font-semibold uppercase text-humo">Fase</span><div className="text-tinta">{ficha.fase}</div></div>}
                {ficha.expediente && <div><span className="text-[11px] font-semibold uppercase text-humo">Expediente</span><div className="text-tinta">{ficha.expediente}</div></div>}
                {ficha.garantia && <div><span className="text-[11px] font-semibold uppercase text-humo">Garantía</span><div className="text-tinta">{ficha.garantia}</div></div>}
                <div><span className="text-[11px] font-semibold uppercase text-humo">Registró</span><div className="text-tinta">{ficha.registradoPor || "—"}</div></div>
              </div>

              {ficha.nota && (
                <div className="mt-3 rounded-xl bg-nube p-3 text-sm text-tinta">
                  <span className="text-[11px] font-semibold uppercase text-humo">Nota</span>
                  <div className="mt-0.5">{ficha.nota}</div>
                </div>
              )}

              {ficha.grabacionUrl && (
                <div className="mt-3 rounded-xl border border-black/10 p-3">
                  <span className="text-[11px] font-semibold uppercase text-teal-dark">Grabación</span>
                  <audio controls src={ficha.grabacionUrl} className="mt-1 w-full" />
                  <a href={ficha.grabacionUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-teal underline">Abrir grabación</a>
                </div>
              )}

              {fnum.length === 10 && (
                <div className="mt-3 rounded-xl bg-teal-soft px-3 py-2 text-[12px] text-teal-dark">
                  📞 Este número ha llamado <b>{veces}</b> {veces === 1 ? "vez" : "veces"}{noCont > 0 ? ` · ${noCont} no contestada(s)` : ""}.
                </div>
              )}

              <div className="mt-4 flex justify-end border-t border-black/5 pt-3">
                {puedeAccion(miRol, "enviar_papelera") && <button onClick={() => eliminarLlam(ficha)} className="rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50">🗑️ Eliminar llamada</button>}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== VENTANITA: LLAMAR Y GRABAR (la grabadora) ===== */}
      {llamarDatos && (
        <LlamarGrabar
          numero={llamarDatos.numero}
          nombre={llamarDatos.nombre}
          area={llamarDatos.area}
          onCerrar={() => { setLlamarDatos(null); cargar(); }}
        />
      )}
    </div>
  );
}
