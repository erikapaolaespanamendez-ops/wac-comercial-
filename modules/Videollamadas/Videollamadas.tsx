import { useEffect, useState } from "react";
import { crearReunion, fetchReuniones, archivarReunion, eliminarReunion, type Reunion } from "../../data/reuniones";
import { descargarNotasWord } from "../../data/notasWord"; // 👈 NUEVO (Fase 2 · descargar notas)
import { fetchCanales, enviarMensaje, type Canal } from "../../data/chat";
import { fetchColaboradores, type Colaborador } from "../../data/colaboradores";
import { fetchClientes, type Cliente } from "../../data/clientes";
import LlamadaGrupo from "./LlamadaGrupo";
import { supabase } from "../../lib/supabase";
import { fetchPerfil } from "../../data/usuarios";
import { puedeAccion } from "../../data/roles";

function soloDigitos(s: string): string {
  let d = (s || "").replace(/\D/g, "");
  if (d.length === 10) d = "52" + d; // México
  return d;
}
function waLink(tel: string, msg: string): string {
  return `https://wa.me/${soloDigitos(tel)}?text=${encodeURIComponent(msg)}`;
}
function gmailLink(to: string, asunto: string, cuerpo: string): string {
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
}
function fechaCorta(iso: string): string {
  try { return new Date(iso).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

// Una persona suelta que se suma a la reunión (no está en la lista del equipo).
type Invitado = { nombre: string; correo: string };

// Junta correos (sin repetir ni vacíos) para mandar UNA sola invitación.
function juntarCorreos(...listas: (string | undefined | null)[]): string {
  const set = new Set<string>();
  for (const c of listas) {
    const v = (c || "").trim();
    if (v) set.add(v);
  }
  return Array.from(set).join(",");
}

export default function Videollamadas() {
  const [yo, setYo] = useState<{ nombre: string; area: string } | null>(null);
  const [canales, setCanales] = useState<Canal[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [reuniones, setReuniones] = useState<Reunion[]>([]);
  const [verArch, setVerArch] = useState(false);
  const [miRol, setMiRol] = useState<string | null>(null);

  // ---- EQUIPO ----
  const [grupoSel, setGrupoSel] = useState("");
  const [buscarEquipo, setBuscarEquipo] = useState("");
  const [equipoSel, setEquipoSel] = useState<Colaborador[]>([]);
  const [equipoExtras, setEquipoExtras] = useState<Invitado[]>([]);
  const [exNombre, setExNombre] = useState("");
  const [exCorreo, setExCorreo] = useState("");
  const [creandoEquipo, setCreandoEquipo] = useState(false);
  const [equipoReunion, setEquipoReunion] = useState<Reunion | null>(null);

  // ---- CLIENTE ----
  const [buscarCliente, setBuscarCliente] = useState("");
  const [cNombre, setCNombre] = useState("");
  const [cWhats, setCWhats] = useState("");
  const [cCorreo, setCCorreo] = useState("");
  const [cTipo, setCTipo] = useState<string>("");
  const [clienteExtras, setClienteExtras] = useState<Invitado[]>([]);
  const [cexNombre, setCexNombre] = useState("");
  const [cexCorreo, setCexCorreo] = useState("");
  const [creandoCliente, setCreandoCliente] = useState(false);
  const [clienteReunion, setClienteReunion] = useState<Reunion | null>(null);

  const [copiado, setCopiado] = useState<string | null>(null);

  // Sala activa: cuando tiene valor, se muestra la videollamada nativa encima.
  const [enLlamada, setEnLlamada] = useState<string | null>(null);

  // Modal "Ver notas" y aviso de descarga (Fase 2).
  const [notasVer, setNotasVer] = useState<Reunion | null>(null);
  const [bajando, setBajando] = useState<string | null>(null);

  async function bajarNotas(r: Reunion) {
    setBajando(r.id);
    try { await descargarNotasWord(r); }
    catch { alert("No se pudo generar el Word. Intenta de nuevo."); }
    setBajando(null);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const email = data.session?.user?.email;
      if (email) fetchPerfil(email).then((pf) => setMiRol(pf?.rol ?? null)).catch(() => {});
    });
    const g = localStorage.getItem("chat_yo");
    if (g) { try { setYo(JSON.parse(g)); } catch {} }
    fetchCanales().then((cs) => setCanales(cs.filter((c) => c.tipo !== "directo")));
    fetchColaboradores().then((cs) => setColaboradores(cs.filter((c) => c.activo !== false)));
    fetchClientes().then((cs) => setClientes(cs.filter((c) => !c.archivado))).catch(() => {});
    fetchReuniones().then(setReuniones);
  }, []);

  // Archiva/desarchiva una videollamada (la mueve a/desde la sección "Archivadas").
  async function archivarReu(r: Reunion) {
    const nuevo = !r.archivado;
    setReuniones((prev) => prev.map((x) => (x.id === r.id ? { ...x, archivado: nuevo } : x)));
    const ok = await archivarReunion(r.id, nuevo);
    if (!ok) setReuniones((prev) => prev.map((x) => (x.id === r.id ? { ...x, archivado: !nuevo } : x)));
  }

  // Manda la videollamada a la papelera (Configuración → Papelera). Recuperable.
  async function eliminarReu(r: Reunion) {
    if (!confirm("¿Eliminar esta videollamada? Se irá a la papelera (Configuración → Papelera).")) return;
    setReuniones((prev) => prev.filter((x) => x.id !== r.id));
    const ok = await eliminarReunion(r.id, true);
    if (!ok) { alert("No se pudo eliminar. Intenta de nuevo."); setReuniones((prev) => [r, ...prev]); }
  }

  function copiar(url: string, id: string) {
    try { navigator.clipboard.writeText(url); setCopiado(id); setTimeout(() => setCopiado(null), 1500); } catch {}
  }

  // ---------- EQUIPO: armar la lista ----------
  function toggleEquipo(c: Colaborador) {
    setEquipoSel((prev) => prev.some((x) => x.id === c.id) ? prev.filter((x) => x.id !== c.id) : [...prev, c]);
    setEquipoReunion(null);
  }
  function agregarExtraEquipo() {
    const nom = exNombre.trim(); const cor = exCorreo.trim();
    if (!cor) { alert("Pon al menos el correo del invitado."); return; }
    setEquipoExtras((prev) => [...prev, { nombre: nom || cor, correo: cor }]);
    setExNombre(""); setExCorreo(""); setEquipoReunion(null);
  }

  const equipoFiltrado = colaboradores.filter((c) => {
    const q = buscarEquipo.trim().toLowerCase();
    if (!q) return true;
    return (c.nombre || "").toLowerCase().includes(q) || (c.area || "").toLowerCase().includes(q) || (c.puesto || "").toLowerCase().includes(q);
  });

  const hayEquipo = !!grupoSel || equipoSel.length > 0 || equipoExtras.length > 0;

  async function crearEquipo() {
    if (!puedeAccion(miRol, "crear_videollamada")) { alert("No tienes permiso para crear videollamadas."); return; }
    if (!hayEquipo || creandoEquipo) return;
    setCreandoEquipo(true);
    const canal = canales.find((c) => c.id === grupoSel);
    const nombres = [...equipoSel.map((c) => c.nombre), ...equipoExtras.map((e) => e.nombre)];
    const destino = canal?.nombre || (nombres.length ? `Equipo: ${nombres.slice(0, 3).join(", ")}${nombres.length > 3 ? ` +${nombres.length - 3}` : ""}` : "Equipo");
    const r = await crearReunion({ tipo: "interna", creadoPor: yo?.nombre, destino, titulo: `Reunión · ${destino}` });
    if (r) {
      if (canal) {
        await enviarMensaje({ canalId: canal.id, autorNombre: yo?.nombre || "Sistema", autorArea: yo?.area || null, texto: r.url });
      }
      setEquipoReunion(r);
      setReuniones((prev) => [r, ...prev]);
      setEnLlamada(r.sala);
    } else alert("No se pudo crear la reunión.");
    setCreandoEquipo(false);
  }

  // ---------- CLIENTE: buscar prospecto/cliente ----------
  function elegirCliente(c: Cliente) {
    setCNombre(c.nombre || "");
    setCWhats(c.whatsapp || c.telefono || "");
    setCCorreo(c.email || "");
    setCTipo(c.tipo === "cliente" ? "Cliente" : "Prospecto");
    setBuscarCliente("");
    setClienteReunion(null);
  }
  function agregarExtraCliente() {
    const nom = cexNombre.trim(); const cor = cexCorreo.trim();
    if (!cor) { alert("Pon al menos el correo de la persona."); return; }
    setClienteExtras((prev) => [...prev, { nombre: nom || cor, correo: cor }]);
    setCexNombre(""); setCexCorreo(""); setClienteReunion(null);
  }
  function limpiarCliente() {
    setClienteReunion(null); setCNombre(""); setCWhats(""); setCCorreo(""); setCTipo("");
    setClienteExtras([]); setBuscarCliente("");
  }

  const clientesFiltrados = (() => {
    const q = buscarCliente.trim().toLowerCase();
    if (!q) return [];
    return clientes.filter((c) => (c.nombre || "").toLowerCase().includes(q)).slice(0, 6);
  })();

  async function crearCliente() {
    if (!puedeAccion(miRol, "crear_videollamada")) { alert("No tienes permiso para crear videollamadas."); return; }
    if (!cWhats.trim() && !cCorreo.trim() && clienteExtras.length === 0) { alert("Pon al menos el WhatsApp o el correo del cliente."); return; }
    if (creandoCliente) return;
    setCreandoCliente(true);
    const destino = cNombre.trim() || cWhats.trim() || cCorreo.trim();
    const r = await crearReunion({ tipo: "cliente", creadoPor: yo?.nombre, destino, titulo: cNombre.trim() ? `Videollamada · ${cNombre.trim()}` : "Videollamada · cliente" });
    if (r) { setClienteReunion(r); setReuniones((prev) => [r, ...prev]); }
    else alert("No se pudo crear la reunión.");
    setCreandoCliente(false);
  }

  // ---- textos de invitación ----
  const saludo = cNombre.trim() ? ` ${cNombre.trim()}` : "";
  const msgWhats = clienteReunion ? `Hola${saludo}, le compartimos el enlace para su videollamada con DIIPA · Inmuebles Accesibles:\n\n${clienteReunion.url}\n\nSolo dé clic para entrar (no necesita instalar nada).` : "";
  const asuntoCorreo = "Videollamada · DIIPA Inmuebles Accesibles";
  const cuerpoCorreo = clienteReunion ? `Hola${saludo}:\n\nLe compartimos el enlace para su videollamada con DIIPA · Inmuebles Accesibles:\n\n${clienteReunion.url}\n\nSolo dé clic para entrar (no necesita instalar nada). Quedamos atentos.` : "";
  const correosCliente = juntarCorreos(cCorreo, ...clienteExtras.map((e) => e.correo));

  const cuerpoEquipo = equipoReunion ? `Hola:\n\nLes compartimos el enlace para la videollamada del equipo (DIIPA · Inmuebles Accesibles):\n\n${equipoReunion.url}\n\nSolo den clic para entrar (no necesitan instalar nada).` : "";
  const correosEquipo = juntarCorreos(...equipoSel.map((c) => c.correo), ...equipoExtras.map((e) => e.correo));

  const activas = reuniones.filter((r) => !r.archivado);
  const archivadas = reuniones.filter((r) => r.archivado);

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="font-display text-xl font-extrabold text-tinta">Videollamadas</h1>
        <p className="mt-0.5 text-sm text-humo">Crea videollamadas gratis para el equipo o para un cliente. Cada una queda registrada.</p>
        {!yo && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">Tip: elige tu nombre en el Chat para que las reuniones queden a tu nombre. Por ahora se guardarán como "Sistema".</p>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* ===================== EQUIPO ===================== */}
        <div className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xl">👥</span>
            <h2 className="font-display font-bold text-tinta">Con el equipo</h2>
          </div>

          {/* Opción 1: grupo del chat */}
          <p className="mb-1.5 text-xs font-semibold text-humo">Mandar al chat de un grupo (opcional)</p>
          <select value={grupoSel} onChange={(e) => { setGrupoSel(e.target.value); setEquipoReunion(null); }} className="mb-3 w-full rounded-xl border border-black/10 px-3 py-2 text-sm">
            <option value="">— sin grupo —</option>
            {canales.map((c) => (<option key={c.id} value={c.id}>{c.emoji} {c.nombre}</option>))}
          </select>

          {/* Opción 2: armar el equipo persona por persona */}
          <p className="mb-1.5 text-xs font-semibold text-humo">Arma el equipo (elige a quién invitar)</p>
          <input value={buscarEquipo} onChange={(e) => setBuscarEquipo(e.target.value)} placeholder="Buscar por nombre o área…" className="mb-2 w-full rounded-xl border border-black/10 px-3 py-2 text-sm" />
          <div className="mb-2 max-h-40 overflow-y-auto rounded-xl border border-black/10">
            {equipoFiltrado.length === 0 ? (
              <p className="px-3 py-3 text-xs text-humo">Sin resultados.</p>
            ) : equipoFiltrado.map((c) => {
              const sel = equipoSel.some((x) => x.id === c.id);
              return (
                <button key={c.id} onClick={() => toggleEquipo(c)} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-nube ${sel ? "bg-teal-soft/60" : ""}`}>
                  <span className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${sel ? "border-teal bg-teal text-white" : "border-black/20"}`}>{sel ? "✓" : ""}</span>
                  <span className="min-w-0 flex-1 truncate text-tinta">{c.nombre}{c.area ? <span className="text-humo"> · {c.area}</span> : null}</span>
                  {!c.correo && <span className="shrink-0 text-[10px] text-amber-600">sin correo</span>}
                </button>
              );
            })}
          </div>

          {/* Seleccionados (incluye externos) */}
          {(equipoSel.length > 0 || equipoExtras.length > 0) && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {equipoSel.map((c) => (
                <span key={c.id} className="inline-flex items-center gap-1 rounded-full bg-teal-soft px-2 py-0.5 text-[11px] font-medium text-teal-dark">
                  {c.nombre}
                  <button onClick={() => toggleEquipo(c)} className="text-teal-dark/60 hover:text-teal-dark">✕</button>
                </span>
              ))}
              {equipoExtras.map((e, i) => (
                <span key={`x${i}`} className="inline-flex items-center gap-1 rounded-full bg-aqua-soft px-2 py-0.5 text-[11px] font-medium text-aqua-dark">
                  {e.nombre}
                  <button onClick={() => setEquipoExtras((prev) => prev.filter((_, j) => j !== i))} className="text-aqua-dark/60 hover:text-aqua-dark">✕</button>
                </span>
              ))}
            </div>
          )}

          {/* Invitado externo */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input value={exNombre} onChange={(e) => setExNombre(e.target.value)} placeholder="Nombre (opcional)" className="min-w-0 flex-1 rounded-lg border border-black/10 px-2.5 py-1.5 text-xs" />
            <input value={exCorreo} onChange={(e) => setExCorreo(e.target.value)} placeholder="Correo del invitado" className="min-w-0 flex-1 rounded-lg border border-black/10 px-2.5 py-1.5 text-xs" />
            <button onClick={agregarExtraEquipo} className="shrink-0 rounded-lg border border-teal/40 px-2.5 py-1.5 text-xs font-semibold text-teal-dark hover:bg-teal-soft">+ Invitado</button>
          </div>

          <button onClick={crearEquipo} disabled={!hayEquipo || creandoEquipo} className="w-full rounded-xl bg-teal px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-dark disabled:opacity-50">
            {creandoEquipo ? "Creando…" : "📹 Crear videollamada"}
          </button>

          {equipoReunion && (
            <div className="mt-3 space-y-2 rounded-xl bg-teal-soft/60 px-3 py-2.5">
              <p className="text-center text-xs font-semibold text-teal-dark">✓ Reunión creada{grupoSel ? " y enviada al chat" : ""}</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setEnLlamada(equipoReunion.sala)} className="rounded-lg bg-aqua px-3 py-1.5 text-xs font-semibold text-white hover:bg-aqua-dark">Entrar</button>
                <button onClick={() => copiar(equipoReunion.url, equipoReunion.id)} className="rounded-lg border border-aqua/40 px-3 py-1.5 text-xs font-semibold text-aqua-dark hover:bg-white">{copiado === equipoReunion.id ? "✓ Copiado" : "Copiar enlace"}</button>
              </div>
              {correosEquipo && (
                <button onClick={() => window.open(gmailLink(correosEquipo, asuntoCorreo, cuerpoEquipo), "_blank")} className="w-full rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-dark">
                  ✉️ Invitar por correo ({correosEquipo.split(",").length})
                </button>
              )}
            </div>
          )}
        </div>

        {/* ===================== CLIENTE ===================== */}
        <div className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xl">🧑‍💼</span>
            <h2 className="font-display font-bold text-tinta">Con un cliente</h2>
          </div>

          {/* Buscador de prospecto/cliente */}
          <p className="mb-1.5 text-xs font-semibold text-humo">Busca al prospecto o cliente</p>
          <div className="relative mb-2">
            <input value={buscarCliente} onChange={(e) => setBuscarCliente(e.target.value)} placeholder="Escribe un nombre…" className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm" />
            {clientesFiltrados.length > 0 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-black/10 bg-white shadow-lg">
                {clientesFiltrados.map((c) => (
                  <button key={c.id} onClick={() => elegirCliente(c)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-nube">
                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${c.tipo === "cliente" ? "bg-aqua-soft text-aqua-dark" : "bg-teal-soft text-teal-dark"}`}>{c.tipo === "cliente" ? "Cliente" : "Prospecto"}</span>
                    <span className="min-w-0 flex-1 truncate text-tinta">{c.nombre || "(sin nombre)"}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <p className="mb-3 text-xs text-humo">O captura sus datos a mano. Se le manda la invitación con el enlace; entra sin instalar nada.</p>
          <div className="relative mb-2">
            <input value={cNombre} onChange={(e) => { setCNombre(e.target.value); setCTipo(""); }} placeholder="Nombre del cliente (opcional)" className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm" />
            {cTipo && <span className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${cTipo === "Cliente" ? "bg-aqua-soft text-aqua-dark" : "bg-teal-soft text-teal-dark"}`}>{cTipo}</span>}
          </div>
          <input value={cWhats} onChange={(e) => setCWhats(e.target.value)} placeholder="WhatsApp (ej. 33 1234 5678)" className="mb-2 w-full rounded-xl border border-black/10 px-3 py-2 text-sm" />
          <input value={cCorreo} onChange={(e) => setCCorreo(e.target.value)} placeholder="Correo (opcional)" className="mb-3 w-full rounded-xl border border-black/10 px-3 py-2 text-sm" />

          {/* Más personas a la misma reunión */}
          {clienteExtras.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {clienteExtras.map((e, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-full bg-aqua-soft px-2 py-0.5 text-[11px] font-medium text-aqua-dark">
                  {e.nombre}
                  <button onClick={() => setClienteExtras((prev) => prev.filter((_, j) => j !== i))} className="text-aqua-dark/60 hover:text-aqua-dark">✕</button>
                </span>
              ))}
            </div>
          )}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input value={cexNombre} onChange={(e) => setCexNombre(e.target.value)} placeholder="Otra persona (nombre)" className="min-w-0 flex-1 rounded-lg border border-black/10 px-2.5 py-1.5 text-xs" />
            <input value={cexCorreo} onChange={(e) => setCexCorreo(e.target.value)} placeholder="Su correo" className="min-w-0 flex-1 rounded-lg border border-black/10 px-2.5 py-1.5 text-xs" />
            <button onClick={agregarExtraCliente} className="shrink-0 rounded-lg border border-teal/40 px-2.5 py-1.5 text-xs font-semibold text-teal-dark hover:bg-teal-soft">+ Persona</button>
          </div>

          {!clienteReunion ? (
            <button onClick={crearCliente} disabled={creandoCliente} className="w-full rounded-xl bg-teal px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-dark disabled:opacity-50">
              {creandoCliente ? "Creando…" : "📹 Crear invitación"}
            </button>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => window.open(waLink(cWhats, msgWhats), "_blank")} disabled={!cWhats.trim()} style={{ backgroundColor: "#25D366" }} className="rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">💬 WhatsApp</button>
                <button onClick={() => window.open(gmailLink(correosCliente, asuntoCorreo, cuerpoCorreo), "_blank")} disabled={!correosCliente} className="rounded-lg bg-teal px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">✉️ Correo{correosCliente && correosCliente.includes(",") ? ` (${correosCliente.split(",").length})` : ""}</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setEnLlamada(clienteReunion.sala)} className="rounded-lg bg-aqua px-3 py-2 text-xs font-semibold text-white hover:bg-aqua-dark">Entrar yo</button>
                <button onClick={() => copiar(clienteReunion.url, clienteReunion.id)} className="rounded-lg border border-black/10 px-3 py-2 text-xs font-semibold text-humo hover:bg-nube">{copiado === clienteReunion.id ? "✓ Copiado" : "Copiar enlace"}</button>
              </div>
              <button onClick={limpiarCliente} className="w-full rounded-lg px-3 py-1.5 text-xs font-medium text-humo hover:underline">+ Nueva invitación</button>
            </div>
          )}
        </div>
      </div>

      {/* ===================== HISTORIAL ===================== */}
      <div className="mt-8">
        <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-teal-dark">Reuniones recientes</h2>
        {activas.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-10 text-center text-sm text-humo">Aún no hay reuniones. Crea la primera arriba.</div>
        ) : (
          <div className="space-y-2">
            {activas.map((r) => (
              <div key={r.id} className="flex items-center gap-2 rounded-xl border border-black/5 bg-white p-3 shadow-sm">
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${r.tipo === "cliente" ? "bg-aqua-soft text-aqua-dark" : "bg-teal-soft text-teal-dark"}`}>{r.tipo === "cliente" ? "Cliente" : "Equipo"}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-tinta">{r.titulo || r.destino || "Videollamada"}</p>
                  <p className="truncate text-xs text-humo">{r.creado_por ? `Por ${r.creado_por} · ` : ""}{fechaCorta(r.created_at)}</p>
                </div>
                <button onClick={() => setEnLlamada(r.sala)} className="shrink-0 rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-dark">Entrar</button>
                {r.notas && (
                  <>
                    <button onClick={() => setNotasVer(r)} title="Ver notas" className="shrink-0 rounded-lg border border-teal/30 px-2.5 py-1.5 text-xs font-semibold text-teal-dark hover:bg-teal-soft">📝 Ver notas</button>
                    <button onClick={() => bajarNotas(r)} disabled={bajando === r.id} title="Descargar notas en Word" className="shrink-0 rounded-lg border border-black/10 px-2.5 py-1.5 text-xs font-semibold text-humo hover:bg-nube disabled:opacity-50">{bajando === r.id ? "…" : "📥 Notas"}</button>
                  </>
                )}
                <button onClick={() => copiar(r.url, r.id)} className="shrink-0 rounded-lg border border-black/10 px-2.5 py-1.5 text-xs font-semibold text-humo hover:bg-nube">{copiado === r.id ? "✓" : "Copiar"}</button>
                {puedeAccion(miRol, "archivar") && <button onClick={() => archivarReu(r)} title="Archivar" aria-label="Archivar" className="shrink-0 rounded-lg border border-black/10 px-2 py-1.5 text-xs text-humo hover:bg-nube">🗄️</button>}
                {puedeAccion(miRol, "enviar_papelera") && <button onClick={() => eliminarReu(r)} title="Eliminar" aria-label="Eliminar" className="shrink-0 rounded-lg border border-rose-200 px-2 py-1.5 text-xs text-rose-600 hover:bg-rose-50">🗑️</button>}
              </div>
            ))}
          </div>
        )}

        {archivadas.length > 0 && (
          <div className="mt-4">
            <button onClick={() => setVerArch((v) => !v)} className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-humo hover:text-tinta">
              🗄️ Archivadas ({archivadas.length}) {verArch ? "▾" : "▸"}
            </button>
            {verArch && (
              <div className="mt-2 space-y-2">
                {archivadas.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 rounded-xl border border-black/5 bg-nube/40 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-tinta">{r.titulo || r.destino || "Videollamada"}</p>
                      <p className="truncate text-xs text-humo">{r.creado_por ? `Por ${r.creado_por} · ` : ""}{fechaCorta(r.created_at)}</p>
                    </div>
                    {r.notas && (
                      <>
                        <button onClick={() => setNotasVer(r)} className="shrink-0 rounded-lg border border-teal/30 px-2.5 py-1 text-[11px] font-semibold text-teal-dark hover:bg-teal-soft">📝 Ver notas</button>
                        <button onClick={() => bajarNotas(r)} disabled={bajando === r.id} className="shrink-0 rounded-lg border border-black/10 px-2.5 py-1 text-[11px] font-semibold text-humo hover:bg-nube disabled:opacity-50">{bajando === r.id ? "…" : "📥"}</button>
                      </>
                    )}
                    {puedeAccion(miRol, "archivar") && <button onClick={() => archivarReu(r)} className="shrink-0 rounded-lg border border-teal/30 px-2.5 py-1 text-[11px] font-semibold text-teal-dark hover:bg-teal-soft">Desarchivar</button>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {enLlamada && (
        <LlamadaGrupo sala={enLlamada} nombre={yo?.nombre || "Invitado"} onCerrar={() => setEnLlamada(null)} />
      )}

      {/* ===================== MODAL: VER NOTAS ===================== */}
      {notasVer && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => setNotasVer(null)}>
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-black/5 px-5 py-3">
              <div className="min-w-0">
                <h3 className="truncate font-display font-bold text-tinta">📝 Notas · {notasVer.titulo || notasVer.destino || "Videollamada"}</h3>
                <p className="truncate text-xs text-humo">{notasVer.creado_por ? `Por ${notasVer.creado_por} · ` : ""}{fechaCorta(notasVer.created_at)}</p>
              </div>
              <button onClick={() => setNotasVer(null)} className="ml-2 shrink-0 rounded-lg px-2 py-1 text-humo hover:bg-nube">✕</button>
            </div>
            <div className="flex-1 overflow-auto px-5 py-4">
              <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-tinta">{notasVer.notas || "Esta reunión no tiene notas."}</pre>
            </div>
            <div className="flex justify-end gap-2 border-t border-black/5 px-5 py-3">
              <button onClick={() => setNotasVer(null)} className="rounded-lg border border-black/10 px-4 py-2 text-sm font-semibold text-humo hover:bg-nube">Cerrar</button>
              <button onClick={() => bajarNotas(notasVer)} disabled={bajando === notasVer.id} className="rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-dark disabled:opacity-50">{bajando === notasVer.id ? "Generando…" : "📥 Descargar Word"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
