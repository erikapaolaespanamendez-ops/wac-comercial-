// ===================================================================
// TABLERO DE SEGUIMIENTO  →  src/modules/Seguimiento/Seguimiento.tsx
// - Buscador inteligente (nombre, garantía, expediente, código, asesor…)
// - "Próximo en N días" por cliente
// - Agrupado por ÁREA; cada quien ve su área (DGE ve todo)
// - Clientes COMPARTIDOS aparecen en las dos áreas, marcados
// - Botón Compartir (solo DGE) · Cambiar código
// - Resumen: KPIs + "Por persona"
// ===================================================================
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "../../lib/supabase";
import { fetchPerfil } from "../../data/usuarios";
import { puedeAccion, ROLES } from "../../data/roles";
import { puedeSeguimiento } from "../../data/permisos";
import { fetchSeguimiento, compartirCliente, registrarContacto, registrarAccion, fetchIndicadores, crearIndicador, borrarIndicador, marcarAvisado, type ClienteSeguimiento, type EstadoSeguimiento, type Indicador } from "../../data/seguimiento";
import { validarNomenclatura, actualizarVencidoR1, guardarCambioR3, guardarReglaEspecial, type Codigo, type Cliente } from "../../data/clientes";
import { fetchCatalogo, type AccionCodigo } from "../../data/catalogoCodigos";
import { avisarEvento } from "../../data/avisarEvento";
import { generarExpediente } from "../../data/expediente";
import { subirArchivoDrive } from "../../data/expedienteDocs";
import RedactarCorreo from "../Correo/RedactarCorreo";
import Paginador from "../../components/Paginador";
import LlamarGrabar from "../LlamarGrabar/LlamarGrabar";
import CrmCliente from "../CrmCliente/CrmCliente";
import TerminarCasoModal from "./TerminarCasoModal";
import { reabrirCaso } from "../../data/cierreCaso";
import { fetchColaboradores, editarColaborador, type Colaborador } from "../../data/colaboradores";
import { descargarCSV, imprimirHTML, escHtml } from "../../lib/exportar";

const ESTILO: Record<EstadoSeguimiento, { chip: string; punto: string; label: string; peso: number }> = {
  vencido:   { chip: "bg-red-100 text-red-700",         punto: "bg-red-500",     label: "Vencido",    peso: 0 },
  porvencer: { chip: "bg-amber-100 text-amber-800",     punto: "bg-amber-500",   label: "Por vencer", peso: 1 },
  aldia:     { chip: "bg-emerald-100 text-emerald-800", punto: "bg-emerald-500", label: "Al día",     peso: 2 },
  sinplazo:  { chip: "bg-nube text-humo",               punto: "bg-humo",        label: "Sin plazo",  peso: 3 },
};

const CODIGOS: Codigo[] = ["SVT", "RV", "R1", "R1V", "R2", "R2C", "R3", "RD", "RDC"];

// Áreas (la columna 'area' del cliente) con su etiqueta visible.
const AREAS: { key: string; label: string }[] = [
  { key: "Comercial", label: "Comercial" },
  { key: "Jurídico",  label: "Jurídico" },
  { key: "RAC",       label: "Atención (UAC)" },
  { key: "Admin",     label: "Administración (GAD)" },
  { key: "UFC",       label: "UFC" },
];
function areaLabel(a: string): string {
  if (a === APOYO_KEY) return "🤝 Donde apoyas";
  const f = AREAS.find((x) => x.key === a);
  return f ? f.label : (a || "Sin área");
}
// Grupo especial: clientes que ves SOLO porque tu rol es apoyo/responsable de su código.
const APOYO_KEY = "__apoyo__";

// Qué áreas ve cada rol. null = ve TODAS (DGE / Super Admin / Dirección).
const GRUPO_AREAS: Record<string, string[]> = {
  DGC: ["Comercial"],
  DIL: ["Jurídico", "UFC"],
  GAD: ["Admin"],
  RAC: ["RAC"],
};
function areasDelRol(rol: string | null): string[] | null {
  if (!rol) return null;
  // DGE / Super Admin ven todo. RAC (Atención) también: regula la calidad/atención de TODAS las áreas.
  // SRAC (sub-RAC), ATC (telefonista) y GRC (Gerente de Remates y Contingencias) también ven todo:
  // su nivel de EDICIÓN ya queda limitado aparte, en Roles y Permisos (nivel "colaborador" + acciones).
  if (rol === "Super_Admin" || rol === "DGE" || rol === "RAC" || rol === "SRAC" || rol === "ATC" || rol === "GRC") return null;
  const grupo = ROLES.find((r) => r.codigo === rol)?.grupo;
  if (!grupo || grupo === "DGE" || grupo === "SIS") return null;
  return GRUPO_AREAS[grupo] ?? null;
}

function tonoDeCodigo(cod: string): string {
  if (cod === "SVT") return "bg-emerald-100 text-emerald-800";
  if (cod === "R2" || cod === "R2C") return "bg-amber-100 text-amber-800";
  return "bg-sky-100 text-sky-800";
}

function colorEtiqueta(color: string): string {
  switch (color) {
    case "rojo": return "bg-red-100 text-red-700";
    case "ambar": return "bg-amber-100 text-amber-700";
    case "verde": return "bg-emerald-100 text-emerald-700";
    case "azul": return "bg-blue-100 text-blue-700";
    case "violeta": return "bg-violet-100 text-violet-700";
    default: return "bg-nube text-humo";
  }
}

function Chip({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${className}`}>{children}</span>;
}

// Quita acentos y pasa a minúsculas (para buscar sin que importe el acento).
function norm(s: string): string {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function textoBuscable(s: ClienteSeguimiento): string {
  const c = s.cliente;
  return norm([
    c.nombre, c.curpRfc, c.ine, c.estadoCivil, c.conyuge,
    c.telefono, c.telefono2, c.whatsapp, c.email, c.domicilio,
    c.comoConocio, c.refirio, c.autorizadoNombre, c.autorizadoTelefono, c.autorizadoCorreo,
    c.prospecto, c.garantia, c.expediente, c.folioSiga, c.folioGarantiaSiga, c.creditoSiga,
    c.codigo, c.area, c.estatus, c.tipo, c.direccionGarantia, c.sucursal, c.folio, c.folioCierre,
    c.asesorAsignado, c.asesorCorreo, s.responsable,
  ].filter(Boolean).join(" "));
}

// "Próximo contacto": cuántos días faltan (o de atraso) para el siguiente seguimiento.
function proximo(s: ClienteSeguimiento): { texto: string; cls: string } {
  if (s.diasLimite == null) return { texto: "Sin reloj", cls: "bg-nube text-humo" };
  if (s.diasDesdeCiclo == null) return { texto: "Pendiente ya", cls: "bg-red-100 text-red-700" };
  const r = s.diasLimite - s.diasDesdeCiclo;
  if (r < 0) return { texto: `Vencido hace ${-r}d`, cls: "bg-red-100 text-red-700" };
  if (r === 0) return { texto: "Vence hoy", cls: "bg-amber-100 text-amber-800" };
  if (r <= 3) return { texto: `Próximo en ${r}d`, cls: "bg-amber-100 text-amber-800" };
  return { texto: `Próximo en ${r}d`, cls: "bg-emerald-100 text-emerald-800" };
}


// 👇 NUEVO: un RV está VENCIDO si su contrato (firma + 15 meses hábiles) ya pasó de hoy.
//  La fecha de vencimiento ya viene calculada en la columna fecha_vencimiento.
function contratoVencido(c: Cliente): boolean {
  if (c.codigo !== "RV" || !c.fechaVencimiento) return false;
  return new Date(c.fechaVencimiento) < new Date();
}

// 👇 FASE 2: días que un cliente lleva SIN actuación/cambio (usa el reloj de Fase 1).
//  Más días = más olvidado = sube. Recién atendido (0 días) = baja al fondo.
function diasSinActuacion(c: Cliente): number {
  if (!c.ultimaActuacionAt) return 999999; // nunca tocado → hasta arriba
  const ms = Date.now() - new Date(c.ultimaActuacionAt).getTime();
  return Math.max(0, Math.floor(ms / 86400000)); // 86400000 = ms en un día
}
type Tab = "lista" | "resumen" | "concluidas" | "alternos";
type Entrada = { s: ClienteSeguimiento; compartido: boolean };

function EditorAccionesCli({ valor, onChange }: { valor: AccionCodigo[]; onChange: (v: AccionCodigo[]) => void }) {
  function set<K extends keyof AccionCodigo>(i: number, campo: K, v: AccionCodigo[K]) { onChange(valor.map((a, k) => (k === i ? { ...a, [campo]: v } : a))); }
  return (
    <div className="rounded-xl border border-black/10 bg-nube/40 p-2.5">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-humo">Acciones propias (reemplazan las del código)</div>
      {valor.length === 0 && <p className="mb-1.5 text-[11px] text-humo">Sin acciones propias. Si agregas, solo este cliente las usa.</p>}
      {valor.map((a, i) => (
        <div key={i} className="mb-1.5 rounded-lg border border-black/10 bg-white p-2">
          <div className="flex items-center gap-2">
            <input value={a.nombre} onChange={(e) => set(i, "nombre", e.target.value)} placeholder="Nombre de la acción" className="flex-1 rounded-lg border border-black/10 px-2 py-1 text-[13px] outline-none focus:border-teal" />
            <button onClick={() => onChange(valor.filter((_, k) => k !== i))} className="rounded-lg px-2 py-1 text-sm text-red-600 hover:bg-red-50" aria-label="Quitar">🗑️</button>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <select value={a.evidencia} onChange={(e) => set(i, "evidencia", e.target.value)} className="rounded-lg border border-black/10 bg-white px-1.5 py-1 text-[11px] outline-none focus:border-teal">
              <option value="ninguna">Sin evidencia</option>
              <option value="foto">📷 Foto</option>
              <option value="pdf">📄 PDF</option>
              <option value="doc">📝 Documento</option>
            </select>
            <label className="flex items-center gap-1 text-[11px] font-medium text-tinta">
              <input type="checkbox" checked={a.cuenta ?? false} onChange={(e) => set(i, "cuenta", e.target.checked)} />
              ✔ obligatoria
            </label>
          </div>
        </div>
      ))}
      <button onClick={() => onChange([...valor, { nombre: "", evidencia: "ninguna", cuenta: false }])} className="rounded-lg border border-teal/30 px-2.5 py-1 text-[11px] font-semibold text-teal-dark hover:bg-teal-soft">➕ Agregar acción</button>
    </div>
  );
}

const COND_IND: Array<{ k: string; label: string }> = [
  { k: "vencido", label: "Vencidos 🔴" },
  { k: "porvencer", label: "Por vencer 🟠" },
  { k: "aldia", label: "Al día 🟢" },
  { k: "falta_accion", label: "Les falta una acción" },
  { k: "contingencia", label: "Con demanda 🚨" },
  { k: "convenio", label: "Con convenio 💰" },
  { k: "sin_validar", label: "Sin validar código ⚠️" },
  { k: "codigo", label: "De un código específico" },
];

function cumpleIndicador(s: ClienteSeguimiento, ind: Indicador): boolean {
  switch (ind.condicion) {
    case "vencido": return s.estado === "vencido";
    case "porvencer": return s.estado === "porvencer";
    case "aldia": return s.estado === "aldia";
    case "falta_accion": return !!s.faltaAccion;
    case "contingencia": return s.contingencia;
    case "convenio": return s.convenio;
    case "sin_validar": return !s.cliente.nomenclaturaValidada;
    case "codigo": return s.cliente.codigo === ind.codigo;
    default: return false;
  }
}

function IndicadoresModal({ lista, onCerrar, onCambio }: { lista: Indicador[]; onCerrar: () => void; onCambio: () => void }) {
  const [nombre, setNombre] = useState("");
  const [cond, setCond] = useState("vencido");
  const [cod, setCod] = useState("");
  const [color, setColor] = useState("azul");
  const [avisar, setAvisar] = useState(false);
  const [min, setMin] = useState("1");
  const [busy, setBusy] = useState(false);
  async function agregar() {
    if (!nombre.trim()) return;
    setBusy(true);
    await crearIndicador({ nombre: nombre.trim(), condicion: cond, codigo: cond === "codigo" ? (cod.trim().toUpperCase() || null) : null, color, orden: lista.length + 1, avisar, avisar_min: Number(min) || 1 });
    setBusy(false); setNombre(""); setCod(""); setAvisar(false); setMin("1");
    onCambio();
  }
  async function quitar(id: string) { setBusy(true); await borrarIndicador(id); setBusy(false); onCambio(); }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-tinta/40 p-4" onClick={onCerrar}>
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-base font-extrabold text-tinta">⚙️ Indicadores del tablero</h2>
        <p className="mb-3 mt-0.5 text-sm text-humo">Contadores que aparecen en el Resumen.</p>
        {lista.length > 0 && (
          <div className="mb-3 space-y-1.5">
            {lista.map((ind) => (
              <div key={ind.id} className="flex items-center justify-between rounded-lg border border-black/10 px-2.5 py-1.5">
                <span className="flex items-center gap-2 text-sm text-tinta">
                  <span className={"rounded-full px-2 py-0.5 text-[11px] font-bold " + colorEtiqueta(ind.color)}>{ind.nombre}</span>
                  <span className="text-[11px] text-humo">{(COND_IND.find((c) => c.k === ind.condicion)?.label) ?? ind.condicion}{ind.condicion === "codigo" ? " · " + ind.codigo : ""}{ind.avisar ? " · 🔔" : ""}</span>
                </span>
                <button onClick={() => quitar(ind.id)} disabled={busy} className="rounded-lg px-2 py-1 text-sm text-red-600 hover:bg-red-50">🗑️</button>
              </div>
            ))}
          </div>
        )}
        <div className="rounded-xl border border-black/10 bg-nube/40 p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-humo">Nuevo indicador</div>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre (ej. En juicio)" className="mb-2 w-full rounded-lg border border-black/10 px-2.5 py-1.5 text-sm outline-none focus:border-teal" />
          <div className="flex flex-wrap gap-2">
            <select value={cond} onChange={(e) => setCond(e.target.value)} className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-[13px] outline-none focus:border-teal">
              {COND_IND.map((c) => <option key={c.k} value={c.k}>{c.label}</option>)}
            </select>
            {cond === "codigo" && <input value={cod} onChange={(e) => setCod(e.target.value.toUpperCase())} placeholder="Código (ej. R2)" className="w-28 rounded-lg border border-black/10 px-2 py-1.5 text-[13px] outline-none focus:border-teal" />}
            <select value={color} onChange={(e) => setColor(e.target.value)} className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-[13px] outline-none focus:border-teal">
              <option value="azul">Azul</option><option value="rojo">Rojo</option><option value="ambar">Ámbar</option><option value="verde">Verde</option><option value="violeta">Violeta</option><option value="gris">Gris</option>
            </select>
          </div>
          <label className="mt-2 flex items-center gap-1.5 text-[13px] text-tinta">
            <input type="checkbox" checked={avisar} onChange={(e) => setAvisar(e.target.checked)} />
            🔔 Avisar en la campanita
          </label>
          {avisar && (
            <div className="mt-1 flex items-center gap-1.5 text-[12px] text-humo">
              cuando haya
              <input type="number" value={min} onChange={(e) => setMin(e.target.value)} className="w-16 rounded-lg border border-black/10 px-2 py-1 text-sm text-tinta outline-none focus:border-teal" />
              o más
            </div>
          )}
          <button onClick={agregar} disabled={busy || !nombre.trim()} className="mt-2 w-full rounded-lg bg-teal px-3 py-2 text-sm font-semibold text-white hover:bg-teal-dark disabled:opacity-50">➕ Agregar indicador</button>
        </div>
        <button onClick={onCerrar} className="mt-3 w-full rounded-xl border border-black/10 px-3 py-2 text-sm font-semibold text-humo hover:bg-nube">Cerrar</button>
      </div>
    </div>
  );
}

function ReglaEspecialModal({ item, onCerrar, onGuardado }: { item: ClienteSeguimiento; onCerrar: () => void; onGuardado: () => void }) {
  const c = item.cliente;
  const [dias, setDias] = useState(c.overrideDiasLimite != null ? String(c.overrideDiasLimite) : "");
  const [aviso, setAviso] = useState(c.overrideDiasAviso != null ? String(c.overrideDiasAviso) : "");
  const [resp, setResp] = useState(c.overrideResponsable ?? "");
  const [acc, setAcc] = useState<AccionCodigo[]>(c.overrideAcciones ?? []);
  const [guardando, setGuardando] = useState(false);
  const tiene = c.overrideDiasLimite != null || c.overrideDiasAviso != null || !!c.overrideResponsable || (!!c.overrideAcciones && c.overrideAcciones.length > 0);
  async function guardar(limpiar: boolean) {
    setGuardando(true);
    await guardarReglaEspecial(c.id, limpiar
      ? { diasLimite: null, diasAviso: null, responsable: null, acciones: null }
      : { diasLimite: dias === "" ? null : Number(dias), diasAviso: aviso === "" ? null : Number(aviso), responsable: resp || null, acciones: acc.length > 0 ? acc : null });
    setGuardando(false);
    onGuardado();
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-tinta/40 p-4" onClick={onCerrar}>
      <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-base font-extrabold text-tinta">⏱️ Regla especial</h2>
        <p className="mt-0.5 text-sm text-humo">{c.nombre} · código {c.codigo}</p>
        <p className="mb-3 mt-1 text-[11px] text-humo">Lo que dejes vacío usa la regla de su código.</p>
        <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-humo">Cada cuántos días
          <input type="number" value={dias} onChange={(e) => setDias(e.target.value)} placeholder="(usa el del código)" className="mt-0.5 w-full rounded-lg border border-black/10 px-2.5 py-1.5 text-sm text-tinta outline-none focus:border-teal" />
        </label>
        <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-humo">Días de aviso (naranja)
          <input type="number" value={aviso} onChange={(e) => setAviso(e.target.value)} placeholder="(usa el del código)" className="mt-0.5 w-full rounded-lg border border-black/10 px-2.5 py-1.5 text-sm text-tinta outline-none focus:border-teal" />
        </label>
        <label className="mb-3 block text-[11px] font-semibold uppercase tracking-wide text-humo">Responsable
          <select value={resp} onChange={(e) => setResp(e.target.value)} className="mt-0.5 w-full rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm text-tinta outline-none focus:border-teal">
            <option value="">— Usa el del código —</option>
            {ROLES.map((r) => <option key={r.codigo} value={r.codigo}>{r.codigo} · {r.nombre}</option>)}
          </select>
        </label>
        <div className="mb-3"><EditorAccionesCli valor={acc} onChange={setAcc} /></div>
        <div className="flex gap-2">
          <button onClick={onCerrar} disabled={guardando} className="flex-1 rounded-xl px-3 py-2 text-sm text-humo hover:bg-nube disabled:opacity-50">Cancelar</button>
          <button onClick={() => guardar(false)} disabled={guardando} className="flex-1 rounded-xl bg-teal px-3 py-2 text-sm font-semibold text-white hover:bg-teal-dark disabled:opacity-50">{guardando ? "Guardando…" : "Guardar"}</button>
        </div>
        {tiene && <button onClick={() => guardar(true)} disabled={guardando} className="mt-2 w-full rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">Quitar regla especial (volver a la del código)</button>}
      </div>
    </div>
  );
}

export default function Seguimiento({ target }: { target?: { cliente: Cliente; nonce: number } | null }) {
  const [items, setItems] = useState<ClienteSeguimiento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [plazo, setPlazo] = useState<EstadoSeguimiento | "todos">("todos");
  const [situacion, setSituacion] = useState<"todas" | "condemanda" | "conconvenio" | "terminados" | "garantias">("todas");
  const [codigoFiltro, setCodigoFiltro] = useState<Codigo | "todos">("todos");
  const [codigosCat, setCodigosCat] = useState<string[]>(CODIGOS);   // 👈 FASE B: lista de códigos sale del catálogo
  const [tab, setTab] = useState<Tab>("lista");
  const [busqueda, setBusqueda] = useState("");
  const [areaFiltro, setAreaFiltro] = useState<string>("todas");
  // 👇 FASE 3: apartado "Concluidas" (Terminadas / Garantías entregadas)
  const [concluidasTipo, setConcluidasTipo] = useState<"terminadas" | "garantias">("terminadas");
  const [buscaConcl, setBuscaConcl] = useState("");
  const [pagina, setPagina] = useState(1);          // paginación: 20 por página
  const POR_PAGINA = 20;

  const [rol, setRol] = useState<string | null>(null);
  const [yo, setYo] = useState<string>("");
  const [cambiar, setCambiar] = useState<ClienteSeguimiento | null>(null);
  const [codigoElegido, setCodigoElegido] = useState<Codigo | null>(null);
  const [verTodos, setVerTodos] = useState(false);   // 👈 Parte 2b: ver todos los códigos vs solo salidas
  const [r3Direccion, setR3Direccion] = useState("");
  const [r3Valor, setR3Valor] = useState("");
  const [r3Terminos, setR3Terminos] = useState("");
  const [r3Archivo, setR3Archivo] = useState<File | null>(null);
  const [menuFila, setMenuFila] = useState<ClienteSeguimiento | null>(null);
  const [reglaEsp, setReglaEsp] = useState<ClienteSeguimiento | null>(null);
  const [indicadores, setIndicadores] = useState<Indicador[]>([]);
  const [showIndConfig, setShowIndConfig] = useState(false);
  const [terminar, setTerminar] = useState<ClienteSeguimiento | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Compartir
  const [compartir, setCompartir] = useState<ClienteSeguimiento | null>(null);
  const [seleccion, setSeleccion] = useState<string[]>([]);

  // Redactar correo (abre la ventana con IA para ese cliente)
  const [correoPara, setCorreoPara] = useState<ClienteSeguimiento | null>(null);

  // Llamar+grabar por Twilio (abre tu llamador con el cliente ya cargado)
  const [llamarA, setLlamarA] = useState<ClienteSeguimiento | null>(null);
  const [crmCliente, setCrmCliente] = useState<Cliente | null>(null);

  // Si llegamos desde el inicio (mini-banner) con un cliente, abrimos su ficha.
  useEffect(() => {
    if (target?.cliente) setCrmCliente(target.cliente);
  }, [target?.nonce]);

  async function cargar() {
    setCargando(true);
    // forzar: esta pantalla es la que el usuario mira y edita, siempre datos frescos.
    try { setItems(await fetchSeguimiento({ forzar: true })); setError(false); }
    catch { setError(true); }
    finally { setCargando(false); }
  }

  useEffect(() => { cargar(); }, []);

  // 👇 FASE B: trae los códigos ACTIVOS del catálogo (incluye los nuevos que crees).
  useEffect(() => {
    fetchCatalogo().then((cs) => {
      const activos = cs.filter((c) => c.activo !== false)
        .sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99))
        .map((c) => c.codigo);
      if (activos.length) setCodigosCat(activos);
    }).catch(() => {});
  }, []);

  // 👇 FASE G2: indicadores del tablero
  function recargarIndicadores() { fetchIndicadores().then(setIndicadores).catch(() => {}); }
  useEffect(() => { recargarIndicadores(); }, []);


  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const email = data.session?.user?.email;
      if (!email) return;
      const p = await fetchPerfil(email).catch(() => null);
      setRol(p?.rol ?? null);
      setYo(p?.nombre || email.split("@")[0]);
    });
  }, []);

  const puedeCambiar = puedeAccion(rol, "cambiar_codigo");
  const puedeIndicadores = puedeAccion(rol, "catalogo_editar");
  // 👇 NUEVO: solo ADM (Administración) puede actualizar un contrato vencido a R1.
  // 👇 Permiso para actualizar un contrato vencido a R1 (configurable en Roles y Permisos).
  const puedeActualizarVencido = puedeAccion(rol, "actualizar_vencido");
  const puedeTerminar = puedeAccion(rol, "terminar_caso");
  const esDGE = rol === "DGE" || rol === "Super_Admin";
  const misAreas = useMemo(() => areasDelRol(rol), [rol]);

  // ¿Mi rol exacto es apoyo/responsable del código de este cliente?
  function esApoyo(s: ClienteSeguimiento): boolean {
    return !!rol && s.rolesApoyo.includes(rol);
  }
  // ¿Ya lo vería por su área (o porque me lo compartieron)? Si sí, no lo duplico en "Donde apoyas".
  function yaVisiblePorArea(s: ClienteSeguimiento): boolean {
    if (misAreas === null) return true;
    const set = new Set(misAreas);
    return set.has(s.cliente.area) || s.areasCompartidas.some((a) => set.has(a));
  }

  // Clientes que esta persona puede ver (su área + lo compartido + donde su rol apoya).
  const base = useMemo(() => {
    if (misAreas === null) return items;
    const set = new Set(misAreas);
    return items.filter((s) => set.has(s.cliente.area) || s.areasCompartidas.some((a) => set.has(a)) || (!!rol && s.rolesApoyo.includes(rol)));
  }, [items, misAreas, rol]);
  // 👇 FASE G3: avisa en la campanita una vez al día por indicador
  useEffect(() => {
    if (base.length === 0 || indicadores.length === 0) return;
    const hoy = new Date().toISOString().slice(0, 10);
    for (const ind of indicadores) {
      if (!ind.avisar || ind.avisado_fecha === hoy) continue;
      const n = base.filter((s) => cumpleIndicador(s, ind)).length;
      if (n < (ind.avisar_min || 1)) continue;
      avisarEvento({ tipo: "sistema", icono: "🔔", titulo: `${ind.nombre}: ${n} cliente(s)`, detalle: "Indicador de seguimiento", modulo: "seguimiento" });
      marcarAvisado(ind.id);
      setIndicadores((prev) => prev.map((x) => (x.id === ind.id ? { ...x, avisado_fecha: hoy } : x)));
    }
  }, [base, indicadores]);


  // "Vivos" = casos activos (sin terminados). Los terminados solo salen en sus filtros.
  const vivos = useMemo(() => base.filter((s) => !s.cliente.terminado), [base]);
  const terminadosDev = useMemo(() => base.filter((s) => s.cliente.terminado && s.cliente.terminadoTipo === "devolucion"), [base]);
  const terminadosEnt = useMemo(() => base.filter((s) => s.cliente.terminado && s.cliente.terminadoTipo === "entrega"), [base]);

  const conteo = useMemo(() => {
    const c = { vencido: 0, porvencer: 0, aldia: 0, sinplazo: 0 };
    for (const s of vivos) c[s.estado]++;
    return c;
  }, [vivos]);

  function ordenar(arr: Entrada[]) {
    return [...arr].sort((a, b) => {
      // Contingencia activa = máxima prioridad (hasta arriba).
      const ca = a.s.contingencia ? 0 : 1, cb = b.s.contingencia ? 0 : 1;
      if (ca !== cb) return ca - cb;
      const pa = ESTILO[a.s.estado].peso, pb = ESTILO[b.s.estado].peso;
      if (pa !== pb) return pa - pb;
      // 👇 FASE 2: a igualdad de prioridad, el más OLVIDADO arriba; el recién atendido al fondo.
      const da = diasSinActuacion(a.s.cliente);
      const db = diasSinActuacion(b.s.cliente);
      return db - da;
    });
  }

  // Filtra por estado + búsqueda, mete cada cliente en su área + sus áreas compartidas,
  // y deja solo las áreas que esta persona puede ver.
  const grupos = useMemo(() => {
    const q = norm(busqueda.trim());
    let lista =
      situacion === "terminados" ? terminadosDev
      : situacion === "garantias" ? terminadosEnt
      : situacion === "condemanda" ? vivos.filter((s) => s.contingencia)
      : situacion === "conconvenio" ? vivos.filter((s) => s.convenio)
      : vivos;
    if (plazo !== "todos" && situacion !== "terminados" && situacion !== "garantias") {
      lista = lista.filter((s) => s.estado === plazo);
    }
    if (codigoFiltro !== "todos") lista = lista.filter((s) => s.cliente.codigo === codigoFiltro);
    if (q) lista = lista.filter((s) => textoBuscable(s).includes(q));

    const porArea = new Map<string, Entrada[]>();
    const push = (area: string, s: ClienteSeguimiento, compartido: boolean) => {
      if (!porArea.has(area)) porArea.set(area, []);
      porArea.get(area)!.push({ s, compartido });
    };
    for (const s of lista) {
      const propia = s.cliente.area || "Sin área";
      push(propia, s, false);
      for (const extra of s.areasCompartidas) {
        if (extra && extra !== propia) push(extra, s, true);
      }
      // Carril por ROL: si lo veo solo porque mi rol apoya su código, va al grupo "Donde apoyas".
      if (esApoyo(s) && !yaVisiblePorArea(s)) push(APOYO_KEY, s, true);
    }

    const visible = (k: string) => k === APOYO_KEY || misAreas === null || misAreas.includes(k);
    const orden = [...AREAS.map((a) => a.key), ...[...porArea.keys()].filter((k) => !AREAS.some((a) => a.key === k))];
    let res = orden
      .filter((k) => porArea.has(k) && visible(k))
      .map((k) => ({ area: k, label: areaLabel(k), filas: ordenar(porArea.get(k)!) }));
    if (areaFiltro !== "todas") res = res.filter((g) => g.area === areaFiltro);
    return res;
  }, [base, vivos, terminadosDev, terminadosEnt, plazo, situacion, codigoFiltro, busqueda, misAreas, areaFiltro, rol]);

  // Una sola tabla compacta: aplana todas las áreas, sin duplicar clientes,
  // con su etiqueta de área, y reordena por prioridad (contingencia → vencido…).
  const filasPlanas = useMemo(() => {
    const vistos = new Set<string>();
    const out: { s: ClienteSeguimiento; compartido: boolean; areaTxt: string }[] = [];
    for (const g of grupos) {
      for (const f of g.filas) {
        const id = String(f.s.cliente.id);
        if (vistos.has(id)) continue;
        vistos.add(id);
        out.push({ s: f.s, compartido: f.compartido, areaTxt: g.label });
      }
    }
    out.sort((a, b) => {
      const ca = a.s.contingencia ? 0 : 1, cb = b.s.contingencia ? 0 : 1;
      if (ca !== cb) return ca - cb;
      const pa = ESTILO[a.s.estado].peso, pb = ESTILO[b.s.estado].peso;
      if (pa !== pb) return pa - pb;
      // 👇 FASE 2: a igualdad de prioridad, el más OLVIDADO arriba; el recién atendido al fondo.
      const da = diasSinActuacion(a.s.cliente);
      const db = diasSinActuacion(b.s.cliente);
      return db - da;
    });
    return out;
  }, [grupos]);

  // 👇 FASE 3: filas para el apartado "Concluidas".
  //  Toma los terminados (devolución) o las garantías entregadas, según el sub-filtro,
  //  y aplica la búsqueda propia del apartado. Respeta lo que cada persona puede ver (vienen de 'base').
  const filasConcluidas = useMemo(() => {
    const q = norm(buscaConcl.trim());
    let lista = concluidasTipo === "garantias" ? terminadosEnt : terminadosDev;
    if (q) lista = lista.filter((s) => textoBuscable(s).includes(q));
    return lista.map((s) => ({ s, compartido: false, areaTxt: areaLabel(s.cliente.area) }));
  }, [terminadosDev, terminadosEnt, concluidasTipo, buscaConcl]);

  // Paginación: 20 por página (« Anterior · Siguiente »).
  const totalPaginas = Math.max(1, Math.ceil(filasPlanas.length / POR_PAGINA));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const offset = (paginaSegura - 1) * POR_PAGINA;
  const filasPagina = filasPlanas.slice(offset, offset + POR_PAGINA);
  // Al cambiar filtro/búsqueda/área, vuelve a la página 1.
  useEffect(() => { setPagina(1); }, [plazo, situacion, codigoFiltro, busqueda, areaFiltro]);

  // Áreas que esta persona puede ver (para los botones de filtro por área).
  const areasVisibles = useMemo(() => {
    const keys = misAreas === null ? AREAS.map((a) => a.key) : [...misAreas];
    const arr = keys.map((k) => ({ key: k, label: areaLabel(k) }));
    if (rol && base.some((s) => s.rolesApoyo.includes(rol) && !yaVisiblePorArea(s))) {
      arr.push({ key: APOYO_KEY, label: areaLabel(APOYO_KEY) });
    }
    return arr;
  }, [misAreas, base, rol]);

  // ---- KPIs (pestaña Resumen), siempre sobre lo que esta persona ve ----
  const kpi = useMemo(() => {
    const total = base.length;
    const conPlazo = base.filter((s) => s.estado !== "sinplazo");
    const cp = conPlazo.length;
    const alDia = conPlazo.filter((s) => s.estado === "aldia").length;
    const porVencer = conPlazo.filter((s) => s.estado === "porvencer").length;
    const vencido = conPlazo.filter((s) => s.estado === "vencido").length;
    const sinContacto = base.filter((s) => s.ultimoContacto == null).length;
    const contactados = total - sinContacto;
    const conDemanda = base.filter((s) => s.contingencia).length;
    const conConvenio = base.filter((s) => s.convenio).length;
    const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

    // Por área.
    const mapA = new Map<string, { total: number; aldia: number; porvencer: number; vencido: number; demanda: number; convenio: number }>();
    for (const s of base) {
      const k = (s.cliente.area || "—").toString();
      if (!mapA.has(k)) mapA.set(k, { total: 0, aldia: 0, porvencer: 0, vencido: 0, demanda: 0, convenio: 0 });
      const o = mapA.get(k)!;
      o.total++;
      if (s.estado === "aldia") o.aldia++;
      else if (s.estado === "porvencer") o.porvencer++;
      else if (s.estado === "vencido") o.vencido++;
      if (s.contingencia) o.demanda++;
      if (s.convenio) o.convenio++;
    }
    const porArea = [...mapA.entries()].map(([area, v]) => ({ area, label: areaLabel(area), ...v }))
      .sort((a, b) => b.vencido - a.vencido || b.total - a.total);

    const porCodigo = codigosCat.map((c) => {
      const g = base.filter((s) => s.cliente.codigo === c);
      return {
        codigo: c, total: g.length,
        aldia: g.filter((s) => s.estado === "aldia").length,
        porvencer: g.filter((s) => s.estado === "porvencer").length,
        vencido: g.filter((s) => s.estado === "vencido").length,
      };
    }).filter((x) => x.total > 0);

    // Por persona (al asesor que lo atiende).
    const mapP = new Map<string, { total: number; aldia: number; porvencer: number; vencido: number }>();
    for (const s of base) {
      const k = (s.cliente.asesorAsignado || "").trim() || "Sin asesor";
      if (!mapP.has(k)) mapP.set(k, { total: 0, aldia: 0, porvencer: 0, vencido: 0 });
      const o = mapP.get(k)!;
      o.total++;
      if (s.estado === "aldia") o.aldia++;
      else if (s.estado === "porvencer") o.porvencer++;
      else if (s.estado === "vencido") o.vencido++;
    }
    const porPersona = [...mapP.entries()].map(([persona, v]) => ({ persona, ...v }))
      .sort((a, b) => b.vencido - a.vencido || b.total - a.total);

    return { total, cp, alDia, porVencer, vencido, sinContacto, contactados, conDemanda, conConvenio, pct, porArea, porCodigo, porPersona };
  }, [base, codigosCat]);

  async function aplicarCambio(nuevo: Codigo) {
    if (!cambiar) return;
    if (nuevo === "R3") {
      if (!r3Direccion.trim() || !r3Valor.trim() || !r3Terminos.trim()) {
        alert("Para pasar a R3 (cambio): pon la nueva dirección, el valor nuevo y los términos y condiciones del nuevo contrato.");
        return;
      }
      if (!r3Archivo) { alert("Sube el contrato (solicitud de cambio)."); return; }
      setGuardando(true);
      try {
        let carpetaId = (cambiar.cliente.carpetaDriveId || "").trim();
        if (!carpetaId) {
          const exp = await generarExpediente(cambiar.cliente);
          if (!exp.ok || !exp.carpetaId) throw new Error("No se pudo abrir la carpeta de Drive del cliente.");
          carpetaId = exp.carpetaId;
        }
        const base64: string = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result).split(",")[1] || "");
          r.onerror = () => rej(new Error("No se pudo leer el archivo."));
          r.readAsDataURL(r3Archivo);
        });
        const up = await subirArchivoDrive({ carpetaId, nombre: r3Archivo.name, base64, subcarpeta: "Solicitud de cambio", mime: r3Archivo.type, publico: true });
        if (!up.ok || !up.link) throw new Error("Falló la subida del contrato.");
        const ok = await guardarCambioR3(cambiar.cliente.id, {
          direccionNueva: r3Direccion.trim(), valorNuevo: r3Valor.trim(), terminos: r3Terminos.trim(),
          doc: { url: up.link, nombre: up.nombre || r3Archivo.name },
        });
        if (!ok) throw new Error("No se pudo guardar.");
        setCambiar(null); setCodigoElegido(null); setR3Direccion(""); setR3Valor(""); setR3Terminos(""); setR3Archivo(null);
        cargar();
      } catch (e) {
        alert(e instanceof Error ? e.message : "No se pudo guardar.");
      } finally {
        setGuardando(false);
      }
      return;
    }
    setGuardando(true);
    const ok = await validarNomenclatura(cambiar.cliente.id, nuevo);
    setGuardando(false);
    setCambiar(null);
    setCodigoElegido(null);
    if (ok) cargar();
    else alert("No se pudo validar. Intenta de nuevo.");
  }

  // 👇 NUEVO: ADM actualiza un contrato vencido (RV) a R1.
  async function actualizarAR1(s: ClienteSeguimiento) {
    if (!confirm(`El contrato de "${s.cliente.nombre}" venció el ${s.cliente.fechaVencimiento}.\n\n¿Actualizarlo a R1 y pasarlo a Atención (RAC)?`)) return;
    setGuardando(true);
    const ok = await actualizarVencidoR1(s.cliente.id);
    setGuardando(false);
    setMenuFila(null);
    if (ok) cargar();
    else alert("No se pudo actualizar. Intenta de nuevo.");
  }

  function abrirCompartir(s: ClienteSeguimiento) {
    setSeleccion([...s.areasCompartidas]);
    setCompartir(s);
  }
  function toggleArea(k: string) {
    setSeleccion((prev) => prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]);
  }
  async function guardarCompartir() {
    if (!compartir) return;
    setGuardando(true);
    const r = await compartirCliente(compartir.cliente.id, compartir.cliente.nombre, seleccion, yo);
    setGuardando(false);
    setCompartir(null);
    if (r.ok) cargar();
    else alert("No se pudo compartir: " + (r.error || ""));
  }

  const Tarjeta = ({ titulo, n, color }: { titulo: string; n: number; color: string }) => (
    <div className={`flex-1 rounded-xl ${color} px-3 py-2.5`}>
      <div className="text-2xl font-extrabold">{n}</div>
      <div className="text-[11px] font-medium">{titulo}</div>
    </div>
  );

  const TabBtn = ({ valor, texto }: { valor: Tab; texto: string }) => (
    <button
      onClick={() => setTab(valor)}
      className={"flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition " +
        (tab === valor ? "bg-teal text-white" : "bg-white text-humo border border-black/10 hover:bg-teal-soft")}
    >{texto}</button>
  );

  // Una fila de cliente en la tabla (estilo Excel). `compartido` = área que NO es la suya.
  function FilaTabla({ s, compartido, areaTxt }: { s: ClienteSeguimiento; compartido: boolean; areaTxt: string }) {
    const e = ESTILO[s.estado];
    const px = proximo(s);
    const puedeSeg = puedeSeguimiento(rol, s.cliente.tipo, "seguimiento");
    const tenue = (s.estado === "aldia" || s.estado === "sinplazo") && !s.faltaBoletin && !s.contingencia;
    const faltaLlamada = s.falta === "llamada" || s.falta === "ambos";
    const faltaCorreo = s.falta === "correo" || s.falta === "ambos";
    const completo = s.falta === null && !s.faltaBoletin && !s.faltaAvance && s.estado !== "sinplazo";
    return (
      <tr className={"border-t border-black/5 align-middle " + (s.contingencia ? "bg-red-50/40 " : "") + (tenue ? "opacity-60" : "")}>
        {/* Prioridad — interactivo: filtra por ese estado */}
        <td className="px-2 py-2.5 text-center">
          <button onClick={() => { setSituacion("todas"); setPlazo(s.estado); }} title={"Ver solo: " + e.label} aria-label={e.label}>
            <span className={`inline-block h-3.5 w-3.5 rounded-full ${e.punto} ring-2 ring-white`} />
          </button>
        </td>
        {/* Cliente */}
        <td className="px-2 py-2.5">
          <button onClick={() => setCrmCliente(s.cliente)} className="block max-w-[200px] truncate text-left font-display text-[13.5px] font-bold text-tinta hover:text-teal hover:underline" title="Abrir CRM del cliente">{s.cliente.nombre}</button>
          <div className="truncate text-[11.5px] text-humo">
            {s.cliente.asesorAsignado || (s.responsable && s.responsable !== "—" ? s.responsable : "—")}
            {compartido ? " · 🔗 " + areaLabel(s.cliente.area) : (s.areasCompartidas.length > 0 ? " · 🔗" : "")}
          </div>
          {s.etiquetas && s.etiquetas.length > 0 && (
            <div className="mt-0.5 flex flex-wrap gap-1">
              {s.etiquetas.map((et, i) => (
                <span key={i} className={"rounded-full px-1.5 py-0.5 text-[10px] font-bold " + colorEtiqueta(et.color)}>{et.texto}</span>
              ))}
            </div>
          )}
        </td>
        {/* Área */}
        <td className="whitespace-nowrap px-2 py-2.5 text-[12px] font-medium text-humo">{areaTxt}</td>
        {/* Código */}
        <td className="px-2 py-2.5">
          <span className="inline-flex items-center gap-1">
            <Chip className={tonoDeCodigo(s.cliente.codigo)}>{s.cliente.codigo}</Chip>
            {!s.cliente.nomenclaturaValidada && (
              <span title="Falta validar el código (vino del Excel, puede tener errores)" className="cursor-help text-[14px] text-amber-500">⚠️</span>
            )}
            {contratoVencido(s.cliente) && (
              <span title={"Contrato VENCIDO (venció el " + s.cliente.fechaVencimiento + ") — debe actualizarse a R1 con ADM"} className="cursor-help text-[14px] text-red-600">⏰</span>
            )}
          </span>
        </td>
        {/* Estatus legal */}
        <td className="whitespace-nowrap px-2 py-2.5">
          <div className="flex flex-col items-start gap-0.5">
            {s.contingencia && <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">🚨 Demanda</span>}
            {s.convenio && <span className="rounded-full bg-dorado/20 px-1.5 py-0.5 text-[10px] font-bold text-dorado-dark">💰 Convenio</span>}
            {!s.contingencia && !s.convenio && <span className="text-[11px] text-humo/50">—</span>}
          </div>
        </td>
        {/* Estado + próximo/plazo */}
        <td className="whitespace-nowrap px-2 py-2.5">
          <Chip className={e.chip}>{e.label}</Chip>
          <div className="mt-0.5 text-[11.5px] text-humo">📅 {px.texto}{s.diasLimite ? ` · ${s.diasLimite}d` : ""}</div>
          {(() => {
            const d = diasSinActuacion(s.cliente);
            const col = d >= 15 ? "text-red-600" : d >= 7 ? "text-amber-600" : "text-humo/70";
            return <div className={"text-[11px] font-semibold " + col}>🕓 {d === 0 ? "Movido hoy" : `${d}d sin actuación`}</div>;
          })()}
        </td>
        {/* Falta — interactivo: dispara la acción que falta */}
        <td className="whitespace-nowrap px-2 py-2.5 text-center text-[17px]">
          {faltaLlamada && (
            <button onClick={() => puedeSeg && s.cliente.telefono && setLlamarA(s)} title="Falta llamada — llamar" className="px-0.5 text-red-600 hover:scale-110">📞</button>
          )}
          {faltaCorreo && (
            <button onClick={() => puedeSeg && s.cliente.email && setCorreoPara(s)} title="Falta correo — enviar" className="px-0.5 text-red-600 hover:scale-110">✉️</button>
          )}
          {s.faltaBoletin && (
            <button onClick={() => setCrmCliente(s.cliente)} title="Falta boletín de esta semana — capturar" className="px-0.5 text-red-600 hover:scale-110">⚖️</button>
          )}
          {s.faltaAvance && (
            <button onClick={() => setCrmCliente(s.cliente)} title="Falta documento de avance de esta semana — capturar" className="px-0.5 text-red-600 hover:scale-110">📄</button>
          )}
          {completo && <span title="Ciclo completo" className="text-emerald-600">✓</span>}
          {s.estado === "sinplazo" && <span className="text-humo/50">—</span>}
        </td>
        {/* Acciones — todo junto en un botón ⋯ */}
        <td className="whitespace-nowrap px-2 py-2.5 text-right text-[19px]">
          <button onClick={() => setMenuFila(s)} title="Acciones" aria-label="Acciones" className="rounded-lg px-2 py-0.5 font-bold leading-none text-humo hover:bg-nube hover:text-tinta">⋯</button>
        </td>
      </tr>
    );
  }

  // ── H6 · Exportar la tabla de Seguimiento (CSV para Excel + PDF del navegador) ──
  function etiquetaFalta(f: ClienteSeguimiento["falta"]): string {
    return f === "ambos" ? "Llamada y correo" : f === "llamada" ? "Llamada" : f === "correo" ? "Correo" : "—";
  }
  function legalTxt(s: ClienteSeguimiento): string {
    const a = [s.contingencia ? "Demanda" : "", s.convenio ? "Convenio" : ""].filter(Boolean);
    return a.length ? a.join(" / ") : "—";
  }
  function exportarCSV() {
    const filas: (string | number)[][] = [["Cliente", "Área", "Código", "Estado", "Legal", "Falta", "Días", "Responsable", "Teléfono", "WhatsApp", "Correo"]];
    for (const f of filasPlanas) {
      const s = f.s;
      filas.push([
        s.cliente.nombre, f.areaTxt, s.cliente.codigo, ESTILO[s.estado].label, legalTxt(s),
        etiquetaFalta(s.falta), s.diasDesdeCiclo ?? "", s.cliente.asesorAsignado || s.responsable || "",
        s.cliente.telefono || "", s.cliente.whatsapp || "", s.cliente.email || "",
      ]);
    }
    descargarCSV("seguimiento_" + new Date().toISOString().slice(0, 10), filas);
  }
  function exportarPDF() {
    const filasHTML = filasPlanas.map((f) => {
      const s = f.s;
      return "<tr><td>" + escHtml(s.cliente.nombre) + "</td><td>" + escHtml(f.areaTxt) + "</td><td>" + escHtml(s.cliente.codigo) +
        "</td><td>" + escHtml(ESTILO[s.estado].label) + "</td><td>" + escHtml(legalTxt(s)) + "</td><td>" + escHtml(etiquetaFalta(s.falta)) +
        "</td><td class='num'>" + (s.diasDesdeCiclo ?? "") + "</td><td>" + escHtml(s.cliente.asesorAsignado || s.responsable || "") + "</td></tr>";
    }).join("");
    const html = "<h1>Seguimiento de clientes</h1><div class='sub'>Generado " + escHtml(new Date().toLocaleString("es-MX")) + " · " + filasPlanas.length + " cliente(s)</div>" +
      "<table><thead><tr><th>Cliente</th><th>Área</th><th>Código</th><th>Estado</th><th>Legal</th><th>Falta</th><th class='num'>Días</th><th>Responsable</th></tr></thead><tbody>" + filasHTML + "</tbody></table>";
    imprimirHTML("Seguimiento", html);
  }

  if (crmCliente) {
    return <CrmCliente cliente={crmCliente} onCerrar={() => { setCrmCliente(null); cargar(); }} />;
  }

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      {/* Pestañas */}
      <div className="mb-4 flex gap-2">
        <TabBtn valor="lista" texto="📋 Lista" />
        <TabBtn valor="resumen" texto="📊 Resumen" />
        <TabBtn valor="concluidas" texto="✅ Concluidas" />
        {esDGE && <TabBtn valor="alternos" texto="🤝 Alternos" />}
      </div>

      {cargando ? (
        <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-16 text-center text-humo">Calculando seguimiento…</div>
      ) : error ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-16 text-center text-amber-800">No se pudo calcular el seguimiento. Revisa la conexión.</div>
      ) : tab === "lista" ? (
        <>
          {/* Buscador inteligente */}
          <div className="relative mb-4">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-humo">🔍</span>
            <input
              value={busqueda}
              onChange={(ev) => setBusqueda(ev.target.value)}
              placeholder="Buscar por nombre, garantía, expediente, código, asesor…"
              className="w-full rounded-xl border border-black/10 bg-white py-2.5 pl-9 pr-9 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
            />
            {busqueda && (
              <button onClick={() => setBusqueda("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md px-1.5 text-humo hover:bg-nube" aria-label="Limpiar">✕</button>
            )}
          </div>

          {/* Exportar (respeta filtros y búsqueda actuales) */}
          <div className="mb-4 flex items-center gap-2">
            <span className="mr-auto text-[11px] text-humo">{filasPlanas.length} cliente(s) en vista</span>
            <button onClick={exportarCSV} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-[12px] font-semibold text-emerald-800 hover:bg-emerald-100">⬇️ Excel</button>
            <button onClick={exportarPDF} className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-[12px] font-semibold text-tinta hover:bg-nube">🖨️ PDF</button>
          </div>

          {/* Contadores */}
          <div className="mb-4 flex gap-2.5">
            <Tarjeta titulo="Vencidos" n={conteo.vencido} color="bg-red-100 text-red-700" />
            <Tarjeta titulo="Por vencer" n={conteo.porvencer} color="bg-amber-100 text-amber-800" />
            <Tarjeta titulo="Al día" n={conteo.aldia} color="bg-emerald-100 text-emerald-800" />
          </div>

          {/* Filtros estilo Excel: Plazo · Situación · Tipo de cliente */}
          <div className="mb-4 flex flex-wrap items-end gap-2">
            <label className="flex flex-col text-[10px] font-semibold uppercase tracking-wide text-humo">Plazo
              <select value={plazo} onChange={(e) => setPlazo(e.target.value as EstadoSeguimiento | "todos")} disabled={situacion === "terminados" || situacion === "garantias"}
                className="mt-0.5 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm font-medium text-tinta outline-none focus:border-teal disabled:opacity-50">
                <option value="todos">Todos</option>
                <option value="vencido">Vencidos ({conteo.vencido})</option>
                <option value="porvencer">Por vencer ({conteo.porvencer})</option>
                <option value="aldia">Al día ({conteo.aldia})</option>
                <option value="sinplazo">Sin plazo ({conteo.sinplazo})</option>
              </select>
            </label>
            <label className="flex flex-col text-[10px] font-semibold uppercase tracking-wide text-humo">Situación
              <select value={situacion} onChange={(e) => setSituacion(e.target.value as typeof situacion)}
                className="mt-0.5 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm font-medium text-tinta outline-none focus:border-teal">
                <option value="todas">Todas</option>
                <option value="condemanda">🚨 Con demanda ({vivos.filter((s) => s.contingencia).length})</option>
                <option value="conconvenio">💰 Con convenio ({vivos.filter((s) => s.convenio).length})</option>
                <option value="terminados">✅ Terminadas ({terminadosDev.length})</option>
                <option value="garantias">🏠 Garantías culminadas y entregadas ({terminadosEnt.length})</option>
              </select>
            </label>
            <label className="flex flex-col text-[10px] font-semibold uppercase tracking-wide text-humo">Tipo de cliente
              <select value={codigoFiltro} onChange={(e) => setCodigoFiltro(e.target.value as Codigo | "todos")}
                className="mt-0.5 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm font-medium text-tinta outline-none focus:border-teal">
                <option value="todos">Todos</option>
                {codigosCat.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            {(plazo !== "todos" || situacion !== "todas" || codigoFiltro !== "todos") && (
              <button onClick={() => { setPlazo("todos"); setSituacion("todas"); setCodigoFiltro("todos"); }}
                className="rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs font-semibold text-humo hover:bg-nube">✕ Limpiar</button>
            )}
          </div>

          {/* Filtro por ÁREA (para no saturar cuando hay muchos clientes) */}
          {areasVisibles.length > 1 && (
            <div className="mb-4 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-humo">Área:</span>
              <button
                onClick={() => setAreaFiltro("todas")}
                className={"rounded-full px-3 py-1 text-xs font-semibold transition " + (areaFiltro === "todas" ? "bg-teal text-white" : "border border-black/10 bg-white text-humo hover:bg-nube")}>
                Todas
              </button>
              {areasVisibles.map((a) => (
                <button
                  key={a.key}
                  onClick={() => setAreaFiltro(a.key)}
                  className={"rounded-full px-3 py-1 text-xs font-semibold transition " + (areaFiltro === a.key ? "bg-teal text-white" : "border border-black/10 bg-white text-humo hover:bg-nube")}>
                  {a.label}
                </button>
              ))}
            </div>
          )}

          {/* Una sola tabla compacta con TODAS las áreas */}
          {filasPlanas.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-10 text-center text-sm text-humo">
              {busqueda ? "Nada coincide con tu búsqueda." : "No hay clientes en este filtro."}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-black/5 bg-white shadow-sm">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead>
                  <tr className="bg-nube/40 text-[11px] font-semibold uppercase tracking-wide text-humo">
                    <th className="w-9 px-2 py-2"></th>
                    <th className="px-2 py-2">Cliente</th>
                    <th className="px-2 py-2">Área</th>
                    <th className="px-2 py-2">Código</th>
                    <th className="px-2 py-2">Legal</th>
                    <th className="px-2 py-2">Estado</th>
                    <th className="px-2 py-2 text-center">Falta</th>
                    <th className="px-2 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filasPagina.map((f) => <FilaTabla key={f.s.cliente.id} s={f.s} compartido={f.compartido} areaTxt={f.areaTxt} />)}
                </tbody>
              </table>
            </div>
          )}

          {filasPlanas.length > POR_PAGINA && (
            <div className="mt-4">
              <Paginador pagina={paginaSegura} total={totalPaginas} onCambio={setPagina} />
              <p className="mt-1 text-center text-[11px] text-humo">Mostrando {offset + 1}–{Math.min(offset + POR_PAGINA, filasPlanas.length)} de {filasPlanas.length}</p>
            </div>
          )}

          <p className="mt-5 text-center text-[11px] text-humo">Un ciclo se cierra con llamada + correo (SVT basta llamada). "Próximo" = cuándo toca el siguiente contacto.</p>
        </>
      ) : tab === "concluidas" ? (
        /* ---------- APARTADO CONCLUIDAS (Fase 3) ---------- */
        <>
          <div className="mb-4 rounded-xl bg-teal-soft/40 px-3 py-2.5 text-[12.5px] text-teal-dark">
            Aquí viven los casos ya <b>concluidos</b>: terminados por devolución y garantías culminadas y entregadas. Ya <b>no aparecen</b> en la lista de trabajo. Si necesitas regresar uno, ábrelo en ⋯ y dale <b>Reabrir caso</b>.
          </div>

          {/* Sub-filtro: Terminadas / Garantías entregadas */}
          <div className="mb-4 flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setConcluidasTipo("terminadas")}
              className={"rounded-full px-3 py-1 text-xs font-semibold transition " + (concluidasTipo === "terminadas" ? "bg-teal text-white" : "border border-black/10 bg-white text-humo hover:bg-nube")}>
              ✅ Terminadas ({terminadosDev.length})
            </button>
            <button
              onClick={() => setConcluidasTipo("garantias")}
              className={"rounded-full px-3 py-1 text-xs font-semibold transition " + (concluidasTipo === "garantias" ? "bg-teal text-white" : "border border-black/10 bg-white text-humo hover:bg-nube")}>
              🏠 Garantías entregadas ({terminadosEnt.length})
            </button>
          </div>

          {/* Buscador propio del apartado */}
          <div className="relative mb-4">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-humo">🔍</span>
            <input
              value={buscaConcl}
              onChange={(ev) => setBuscaConcl(ev.target.value)}
              placeholder="Buscar en concluidas…"
              className="w-full rounded-xl border border-black/10 bg-white py-2.5 pl-9 pr-9 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
            />
            {buscaConcl && (
              <button onClick={() => setBuscaConcl("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md px-1.5 text-humo hover:bg-nube" aria-label="Limpiar">✕</button>
            )}
          </div>

          {filasConcluidas.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-10 text-center text-sm text-humo">
              {buscaConcl ? "Nada coincide con tu búsqueda." : "Aún no hay casos concluidos aquí."}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-black/5 bg-white shadow-sm">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead>
                  <tr className="bg-nube/40 text-[11px] font-semibold uppercase tracking-wide text-humo">
                    <th className="w-9 px-2 py-2"></th>
                    <th className="px-2 py-2">Cliente</th>
                    <th className="px-2 py-2">Área</th>
                    <th className="px-2 py-2">Código</th>
                    <th className="px-2 py-2">Legal</th>
                    <th className="px-2 py-2">Estado</th>
                    <th className="px-2 py-2 text-center">Falta</th>
                    <th className="px-2 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filasConcluidas.map((f) => <FilaTabla key={f.s.cliente.id} s={f.s} compartido={f.compartido} areaTxt={f.areaTxt} />)}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-4 text-center text-[11px] text-humo">{filasConcluidas.length} caso(s) concluido(s).</p>
        </>
      ) : tab === "alternos" ? (
        <AlternosPanel />
      ) : (
        /* ---------- PESTAÑA RESUMEN (estilo Excel) ---------- */
        <div className="space-y-5">
          {/* Tarjetas resumen */}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            <div className="rounded-xl border border-black/10 bg-white px-3 py-2.5 text-center"><div className="text-2xl font-extrabold text-tinta tabular-nums">{kpi.total}</div><div className="text-[10.5px] font-semibold uppercase text-humo">Clientes</div></div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-center text-emerald-800"><div className="text-2xl font-extrabold tabular-nums">{kpi.alDia}</div><div className="text-[10.5px] font-semibold uppercase">Al día · {kpi.pct(kpi.alDia, kpi.cp)}%</div></div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-center text-amber-800"><div className="text-2xl font-extrabold tabular-nums">{kpi.porVencer}</div><div className="text-[10.5px] font-semibold uppercase">Por venc · {kpi.pct(kpi.porVencer, kpi.cp)}%</div></div>
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-center text-red-700"><div className="text-2xl font-extrabold tabular-nums">{kpi.vencido}</div><div className="text-[10.5px] font-semibold uppercase">Vencidos · {kpi.pct(kpi.vencido, kpi.cp)}%</div></div>
            <div className="rounded-xl border border-red-200 bg-white px-3 py-2.5 text-center"><div className="text-2xl font-extrabold text-red-600 tabular-nums">{kpi.conDemanda}</div><div className="text-[10.5px] font-semibold uppercase text-humo">🚨 Demanda</div></div>
            <div className="rounded-xl border border-dorado/40 bg-white px-3 py-2.5 text-center"><div className="text-2xl font-extrabold text-dorado-dark tabular-nums">{kpi.conConvenio}</div><div className="text-[10.5px] font-semibold uppercase text-humo">💰 Convenio</div></div>
          </div>

          {(indicadores.length > 0 || puedeIndicadores) && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-humo">Indicadores</h3>
                {puedeIndicadores && <button onClick={() => setShowIndConfig(true)} className="text-[11px] font-semibold text-teal-dark hover:underline">⚙️ Configurar</button>}
              </div>
              {indicadores.length === 0 ? (
                <p className="text-[12px] text-humo">Sin indicadores. Usa ⚙️ Configurar para agregar.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {indicadores.map((ind) => {
                    const n = base.filter((s) => cumpleIndicador(s, ind)).length;
                    return (
                      <div key={ind.id} className={"rounded-xl border border-black/10 px-3 py-2.5 text-center " + colorEtiqueta(ind.color)}>
                        <div className="text-2xl font-extrabold tabular-nums">{n}</div>
                        <div className="text-[10.5px] font-semibold uppercase">{ind.nombre}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="rounded-xl border border-black/10 bg-white px-4 py-2.5 text-[13px] text-tinta">
            <strong>{kpi.contactados}</strong> de <strong>{kpi.total}</strong> clientes con al menos un contacto
            <span className="text-humo"> ({kpi.pct(kpi.contactados, kpi.total)}%)</span>.
            {kpi.sinContacto > 0 && <span className="font-semibold text-red-600"> · {kpi.sinContacto} sin ningún contacto.</span>}
          </div>

          {/* POR ÁREA (Excel) */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-humo">Por área</p>
            <div className="overflow-x-auto rounded-xl border border-black/15">
              <table className="w-full border-collapse text-[12.5px]">
                <thead>
                  <tr className="bg-nube text-humo">
                    <th className="border border-black/10 px-2.5 py-1.5 text-left font-bold">Área</th>
                    <th className="border border-black/10 px-2.5 py-1.5 text-center font-bold">Total</th>
                    <th className="border border-black/10 px-2.5 py-1.5 text-center font-bold text-emerald-700">Al día</th>
                    <th className="border border-black/10 px-2.5 py-1.5 text-center font-bold text-amber-700">Por v.</th>
                    <th className="border border-black/10 px-2.5 py-1.5 text-center font-bold text-red-600">Venc.</th>
                    <th className="border border-black/10 px-2.5 py-1.5 text-center font-bold text-red-600">🚨</th>
                    <th className="border border-black/10 px-2.5 py-1.5 text-center font-bold text-dorado-dark">💰</th>
                  </tr>
                </thead>
                <tbody>
                  {kpi.porArea.length === 0 ? (
                    <tr><td colSpan={7} className="border border-black/10 px-3 py-6 text-center text-humo">Sin clientes aún.</td></tr>
                  ) : kpi.porArea.map((r, i) => (
                    <tr key={r.area} className={i % 2 ? "bg-nube/15" : "bg-white"}>
                      <td className="border border-black/10 px-2.5 py-1.5 text-left font-semibold text-tinta">{r.label}</td>
                      <td className="border border-black/10 px-2.5 py-1.5 text-center font-semibold tabular-nums text-tinta">{r.total}</td>
                      <td className="border border-black/10 px-2.5 py-1.5 text-center tabular-nums text-emerald-700">{r.aldia || "·"}</td>
                      <td className="border border-black/10 px-2.5 py-1.5 text-center tabular-nums text-amber-700">{r.porvencer || "·"}</td>
                      <td className="border border-black/10 px-2.5 py-1.5 text-center font-semibold tabular-nums text-red-600">{r.vencido || "·"}</td>
                      <td className="border border-black/10 px-2.5 py-1.5 text-center tabular-nums text-red-600">{r.demanda || "·"}</td>
                      <td className="border border-black/10 px-2.5 py-1.5 text-center tabular-nums text-dorado-dark">{r.convenio || "·"}</td>
                    </tr>
                  ))}
                  {kpi.porArea.length > 0 && (
                    <tr className="bg-nube/60 font-bold text-tinta">
                      <td className="border border-black/10 px-2.5 py-1.5 text-left">TOTAL</td>
                      <td className="border border-black/10 px-2.5 py-1.5 text-center tabular-nums">{kpi.total}</td>
                      <td className="border border-black/10 px-2.5 py-1.5 text-center tabular-nums text-emerald-700">{kpi.alDia}</td>
                      <td className="border border-black/10 px-2.5 py-1.5 text-center tabular-nums text-amber-700">{kpi.porVencer}</td>
                      <td className="border border-black/10 px-2.5 py-1.5 text-center tabular-nums text-red-600">{kpi.vencido}</td>
                      <td className="border border-black/10 px-2.5 py-1.5 text-center tabular-nums text-red-600">{kpi.conDemanda}</td>
                      <td className="border border-black/10 px-2.5 py-1.5 text-center tabular-nums text-dorado-dark">{kpi.conConvenio}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* POR PERSONA (Excel) */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-humo">Por persona (asesor que lo atiende)</p>
            <div className="overflow-x-auto rounded-xl border border-black/15">
              <table className="w-full border-collapse text-[12.5px]">
                <thead>
                  <tr className="bg-nube text-humo">
                    <th className="border border-black/10 px-2.5 py-1.5 text-left font-bold">Asesor</th>
                    <th className="border border-black/10 px-2.5 py-1.5 text-center font-bold">Total</th>
                    <th className="border border-black/10 px-2.5 py-1.5 text-center font-bold text-emerald-700">Al día</th>
                    <th className="border border-black/10 px-2.5 py-1.5 text-center font-bold text-amber-700">Por v.</th>
                    <th className="border border-black/10 px-2.5 py-1.5 text-center font-bold text-red-600">Venc.</th>
                  </tr>
                </thead>
                <tbody>
                  {kpi.porPersona.length === 0 ? (
                    <tr><td colSpan={5} className="border border-black/10 px-3 py-6 text-center text-humo">Sin clientes aún.</td></tr>
                  ) : kpi.porPersona.map((r, i) => (
                    <tr key={r.persona} className={i % 2 ? "bg-nube/15" : "bg-white"}>
                      <td className="border border-black/10 px-2.5 py-1.5 text-left font-semibold text-tinta">{r.persona}</td>
                      <td className="border border-black/10 px-2.5 py-1.5 text-center font-semibold tabular-nums text-tinta">{r.total}</td>
                      <td className="border border-black/10 px-2.5 py-1.5 text-center tabular-nums text-emerald-700">{r.aldia || "·"}</td>
                      <td className="border border-black/10 px-2.5 py-1.5 text-center tabular-nums text-amber-700">{r.porvencer || "·"}</td>
                      <td className="border border-black/10 px-2.5 py-1.5 text-center font-semibold tabular-nums text-red-600">{r.vencido || "·"}</td>
                    </tr>
                  ))}
                  {kpi.porPersona.length > 0 && (
                    <tr className="bg-nube/60 font-bold text-tinta">
                      <td className="border border-black/10 px-2.5 py-1.5 text-left">TOTAL</td>
                      <td className="border border-black/10 px-2.5 py-1.5 text-center tabular-nums">{kpi.total}</td>
                      <td className="border border-black/10 px-2.5 py-1.5 text-center tabular-nums text-emerald-700">{kpi.alDia}</td>
                      <td className="border border-black/10 px-2.5 py-1.5 text-center tabular-nums text-amber-700">{kpi.porVencer}</td>
                      <td className="border border-black/10 px-2.5 py-1.5 text-center tabular-nums text-red-600">{kpi.vencido}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* POR CÓDIGO (Excel) */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-humo">Por código</p>
            <div className="overflow-x-auto rounded-xl border border-black/15">
              <table className="w-full border-collapse text-[12.5px]">
                <thead>
                  <tr className="bg-nube text-humo">
                    <th className="border border-black/10 px-2.5 py-1.5 text-left font-bold">Código</th>
                    <th className="border border-black/10 px-2.5 py-1.5 text-center font-bold">Total</th>
                    <th className="border border-black/10 px-2.5 py-1.5 text-center font-bold text-emerald-700">Al día</th>
                    <th className="border border-black/10 px-2.5 py-1.5 text-center font-bold text-amber-700">Por v.</th>
                    <th className="border border-black/10 px-2.5 py-1.5 text-center font-bold text-red-600">Venc.</th>
                  </tr>
                </thead>
                <tbody>
                  {kpi.porCodigo.length === 0 ? (
                    <tr><td colSpan={5} className="border border-black/10 px-3 py-6 text-center text-humo">Sin clientes aún.</td></tr>
                  ) : kpi.porCodigo.map((r, i) => (
                    <tr key={r.codigo} className={i % 2 ? "bg-nube/15" : "bg-white"}>
                      <td className="border border-black/10 px-2.5 py-1.5 text-left"><Chip className={tonoDeCodigo(r.codigo)}>{r.codigo}</Chip></td>
                      <td className="border border-black/10 px-2.5 py-1.5 text-center font-semibold tabular-nums text-tinta">{r.total}</td>
                      <td className="border border-black/10 px-2.5 py-1.5 text-center tabular-nums text-emerald-700">{r.aldia || "·"}</td>
                      <td className="border border-black/10 px-2.5 py-1.5 text-center tabular-nums text-amber-700">{r.porvencer || "·"}</td>
                      <td className="border border-black/10 px-2.5 py-1.5 text-center font-semibold tabular-nums text-red-600">{r.vencido || "·"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: validar nomenclatura (confirmar o corregir el código que vino del Excel) */}
      {cambiar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 p-4" onClick={() => { if (!guardando) { setCambiar(null); setCodigoElegido(null); setR3Direccion(""); setR3Valor(""); setR3Terminos(""); setR3Archivo(null); } }}>
          <div className="w-full max-w-xs rounded-2xl bg-white p-4 shadow-xl" onClick={(ev) => ev.stopPropagation()}>
            <h2 className="font-display text-base font-extrabold text-tinta">Validar nomenclatura</h2>
            <p className="mt-0.5 text-sm font-semibold text-tinta">{cambiar.cliente.nombre}</p>
            <p className="mt-1 text-[12px] text-humo">Código del Excel: <Chip className={tonoDeCodigo(cambiar.cliente.codigo)}>{cambiar.cliente.codigo}</Chip></p>
            <p className="mb-2 mt-3 text-[11px] font-semibold uppercase tracking-wide text-humo">Confirma o corrige el código correcto:</p>
            {(() => {
              const opciones: string[] = (cambiar.salidas.length > 0 && !verTodos)
                ? Array.from(new Set<string>([cambiar.cliente.codigo, ...cambiar.salidas]))
                : codigosCat;
              return (
                <>
                  <div className="grid grid-cols-3 gap-1.5">
                    {opciones.map((cod) => {
                      const esHoy = cod === cambiar.cliente.codigo;
                      const sel = (codigoElegido ?? cambiar.cliente.codigo) === cod;
                      return (
                        <button key={cod} disabled={guardando} onClick={() => { setCodigoElegido(cod as Codigo); if (cod === "R3") { setR3Direccion(cambiar.cliente.r3DireccionNueva || cambiar.cliente.direccionGarantia || ""); setR3Valor(cambiar.cliente.r3ValorNuevo || ""); setR3Terminos(cambiar.cliente.r3Terminos || ""); } }}
                          className={"rounded-xl border px-2 py-2 text-sm font-bold disabled:opacity-50 " + (sel ? "border-teal bg-teal-soft text-teal-dark ring-1 ring-teal" : "border-black/10 text-tinta hover:bg-nube")}>
                          {cod}{esHoy ? " ·hoy" : ""}
                        </button>
                      );
                    })}
                  </div>
                  {cambiar.salidas.length > 0 && (
                    <button type="button" onClick={() => setVerTodos((v) => !v)} className="mt-2 text-[11px] font-semibold text-teal-dark hover:underline">
                      {verTodos ? ("↩ Ver solo las salidas de " + cambiar.cliente.codigo) : "Ver todos los códigos (corregir)"}
                    </button>
                  )}
                </>
              );
            })()}

            {(codigoElegido ?? cambiar.cliente.codigo) === "R3" && (
              <div className="mt-3 space-y-2 rounded-xl border border-teal/20 bg-teal-soft/20 p-2.5">
                <p className="text-[11px] font-bold uppercase tracking-wide text-teal-dark">Datos del cambio (nuevo contrato)</p>
                <label className="block text-[11px] font-semibold text-humo">Nueva dirección *
                  <input value={r3Direccion} onChange={(e) => setR3Direccion(e.target.value)} placeholder="Dirección de la nueva garantía" className="mt-0.5 w-full rounded-lg border border-black/10 px-2 py-1.5 text-sm outline-none focus:border-teal" />
                </label>
                <label className="block text-[11px] font-semibold text-humo">Valor nuevo *
                  <input value={r3Valor} onChange={(e) => setR3Valor(e.target.value)} placeholder="$ valor del nuevo bien" className="mt-0.5 w-full rounded-lg border border-black/10 px-2 py-1.5 text-sm outline-none focus:border-teal" />
                </label>
                <label className="block text-[11px] font-semibold text-humo">Términos y condiciones del nuevo contrato *
                  <textarea value={r3Terminos} onChange={(e) => setR3Terminos(e.target.value)} rows={3} placeholder="Condiciones acordadas del cambio" className="mt-0.5 w-full rounded-lg border border-black/10 px-2 py-1.5 text-sm outline-none focus:border-teal" />
                </label>
                <label className="block text-[11px] font-semibold text-humo">Contrato (solicitud de cambio) *
                  <input type="file" onChange={(e) => setR3Archivo(e.target.files?.[0] || null)} className="mt-0.5 w-full text-[11px] file:mr-1 file:rounded file:border-0 file:bg-teal-soft file:px-1.5 file:py-0.5 file:text-[11px] file:font-semibold file:text-teal-dark" />
                </label>
                {r3Archivo && <span className="block truncate text-[10px] text-humo">{r3Archivo.name}</span>}
              </div>
            )}

            <button disabled={guardando} onClick={() => aplicarCambio(codigoElegido ?? cambiar.cliente.codigo)}
              className="mt-3 w-full rounded-xl bg-teal px-3 py-2.5 text-sm font-bold text-white hover:bg-teal-dark disabled:opacity-50">
              {guardando ? "Validando…" : "✅ Validar"}
            </button>
            <button onClick={() => { setCambiar(null); setCodigoElegido(null); setR3Direccion(""); setR3Valor(""); setR3Terminos(""); setR3Archivo(null); }} disabled={guardando} className="mt-2 w-full rounded-xl px-3 py-2 text-sm text-humo hover:bg-nube disabled:opacity-50">Cancelar</button>
          </div>
        </div>
      )}

      {/* MENÚ de acciones de una fila (botón ⋯) */}
      {menuFila && (() => {
        const m = menuFila;
        const puedeSegM = puedeSeguimiento(rol, m.cliente.tipo, "seguimiento");
        return (
          <div className="fixed inset-0 z-[55] flex items-center justify-center bg-tinta/40 p-4" onClick={() => setMenuFila(null)}>
            <div className="w-full max-w-xs rounded-2xl bg-white p-3 shadow-xl" onClick={(ev) => ev.stopPropagation()}>
              <p className="truncate px-2 py-1.5 text-sm font-semibold text-tinta">{m.cliente.nombre}</p>
              {m.acciones && m.acciones.length > 0 && (
                <div className="mb-1 rounded-lg bg-nube/60 px-3 py-2">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-humo">Para atenderlo ({m.cliente.codigo}):</p>
                  {m.faltaAccion && <p className="mb-1 text-[11px] font-semibold text-red-600">⚠️ Falta: {m.faltaAccion}</p>}
                  <ul className="space-y-1">
                    {m.acciones.map((a, i) => {
                      const hecha = m.accionesHechas?.[a.nombre];
                      return (
                      <li key={i} className="flex flex-wrap items-center gap-1.5 text-[12px] text-tinta">
                        <span>{a.evidencia === "foto" ? "📷" : a.evidencia === "pdf" ? "📄" : a.evidencia === "doc" ? "📝" : "•"}</span>
                        <span>{a.nombre}</span>
                        {a.cuenta && <span className="text-[9px] font-bold uppercase text-amber-600">obligatoria</span>}
                        {hecha
                          ? <span className="text-[10px] font-semibold text-emerald-600">✓ {new Date(hecha).toLocaleDateString("es-MX")}</span>
                          : (a.evidencia !== "ninguna" && <span className="text-[10px] text-humo">(sube {a.evidencia === "doc" ? "documento" : a.evidencia === "pdf" ? "PDF" : "foto"})</span>)}
                        {puedeSegM && (
                          <button onClick={async () => { await registrarAccion(String(m.cliente.id), a.nombre, yo); setMenuFila(null); cargar(); }} className="ml-auto shrink-0 rounded-md border border-teal/30 px-2 py-0.5 text-[10px] font-semibold text-teal-dark hover:bg-teal-soft">✓ hecha</button>
                        )}
                      </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              <button onClick={() => { setCrmCliente(m.cliente); setMenuFila(null); }} className="w-full rounded-lg px-3 py-2.5 text-left text-sm text-tinta hover:bg-nube">📋 Ver ficha</button>
              {puedeTerminar && !m.cliente.terminado && (
                <button onClick={() => { setTerminar(m); setMenuFila(null); }} className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-emerald-700 hover:bg-emerald-50">✅ Terminar caso</button>
              )}
              {puedeTerminar && m.cliente.terminado && (
                <button onClick={async () => { setMenuFila(null); if (confirm("¿Reabrir este caso? Volverá a la lista activa.")) { const r = await reabrirCaso(m.cliente.id); if (r.ok) cargar(); else alert("No se pudo reabrir: " + (r.error || "")); } }} className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-amber-700 hover:bg-amber-50">↩️ Reabrir caso</button>
              )}
              {puedeSegM && m.cliente.telefono && (
                <button onClick={() => { setLlamarA(m); setMenuFila(null); }} className="w-full rounded-lg px-3 py-2.5 text-left text-sm text-tinta hover:bg-nube">📞 Llamar</button>
              )}
              {puedeSegM && m.cliente.whatsapp && (
                <button onClick={async () => { window.open("https://wa.me/" + m.cliente.whatsapp.replace(/\D/g, ""), "_blank"); await registrarContacto(m.cliente.id, m.cliente.nombre, "whatsapp", "WhatsApp al cliente", yo); setMenuFila(null); cargar(); }} className="w-full rounded-lg px-3 py-2.5 text-left text-sm text-tinta hover:bg-nube">💬 WhatsApp</button>
              )}
              {puedeSegM && m.cliente.email && (
                <button onClick={() => { setCorreoPara(m); setMenuFila(null); }} className="w-full rounded-lg px-3 py-2.5 text-left text-sm text-tinta hover:bg-nube">✉️ Correo</button>
              )}
              {puedeAccion(rol, "compartir_cliente") && (
                <button onClick={() => { abrirCompartir(m); setMenuFila(null); }} className="w-full rounded-lg px-3 py-2.5 text-left text-sm text-tinta hover:bg-nube">🔗 Compartir</button>
              )}
              {puedeCambiar && (
                <button onClick={() => { setCodigoElegido(m.cliente.codigo); setVerTodos(false); setCambiar(m); setMenuFila(null); }} className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-teal-dark hover:bg-teal-soft">{m.cliente.nomenclaturaValidada ? "✅ Nomenclatura validada (revisar)" : "⚠️ Validar nomenclatura"}</button>
              )}
              {puedeCambiar && (
                <button onClick={() => { setReglaEsp(m); setMenuFila(null); }} className="w-full rounded-lg px-3 py-2.5 text-left text-sm text-tinta hover:bg-nube">⏱️ Regla especial</button>
              )}
              {contratoVencido(m.cliente) && puedeActualizarVencido && (
                <button onClick={() => actualizarAR1(m)} className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-red-700 hover:bg-red-50">⏰ Actualizar a R1 (contrato vencido)</button>
              )}
              {contratoVencido(m.cliente) && !puedeActualizarVencido && (
                <div className="rounded-lg px-3 py-2 text-[11px] text-humo">⏰ Contrato vencido — no tienes permiso para actualizarlo a R1</div>
              )}
              <button onClick={() => setMenuFila(null)} className="mt-1 w-full rounded-lg px-3 py-2 text-sm text-humo hover:bg-nube">Cerrar</button>
            </div>
          </div>
        );
      })()}

      {reglaEsp && <ReglaEspecialModal item={reglaEsp} onCerrar={() => setReglaEsp(null)} onGuardado={() => { setReglaEsp(null); cargar(); }} />}

      {showIndConfig && <IndicadoresModal lista={indicadores} onCerrar={() => setShowIndConfig(false)} onCambio={recargarIndicadores} />}

      {/* MODAL: compartir (solo DGE) */}
      {compartir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 p-4" onClick={() => !guardando && setCompartir(null)}>
          <div className="w-full max-w-xs rounded-2xl bg-white p-4 shadow-xl" onClick={(ev) => ev.stopPropagation()}>
            <h2 className="font-display text-base font-extrabold text-tinta">Compartir cliente</h2>
            <p className="mt-0.5 text-sm text-humo">{compartir.cliente.nombre} · área: <strong>{areaLabel(compartir.cliente.area)}</strong></p>
            <p className="mb-2 mt-3 text-[11px] font-semibold uppercase tracking-wide text-humo">Áreas que también lo atienden:</p>
            <div className="flex flex-col gap-1.5">
              {AREAS.filter((a) => a.key !== compartir.cliente.area).map((a) => {
                const on = seleccion.includes(a.key);
                return (
                  <button key={a.key} disabled={guardando} onClick={() => toggleArea(a.key)}
                    className={"flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm font-semibold disabled:opacity-50 " +
                      (on ? "border-violet-300 bg-violet-50 text-violet-700" : "border-black/10 text-tinta hover:bg-nube")}>
                    <span>{a.label}</span>
                    <span>{on ? "✓" : "+"}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={() => setCompartir(null)} disabled={guardando} className="flex-1 rounded-xl px-3 py-2 text-sm text-humo hover:bg-nube disabled:opacity-50">Cancelar</button>
              <button onClick={guardarCompartir} disabled={guardando} className="flex-1 rounded-xl bg-teal px-3 py-2 text-sm font-semibold text-white hover:bg-teal-dark disabled:opacity-50">{guardando ? "Guardando…" : "Guardar"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Llamador + grabador por Twilio (con el cliente ya cargado) */}
      {terminar && <TerminarCasoModal cliente={terminar.cliente} por={yo} onCerrar={(ok) => { setTerminar(null); if (ok) cargar(); }} />}

      {llamarA && (
        <LlamarGrabar
          numero={llamarA.cliente.telefono}
          nombre={llamarA.cliente.nombre}
          area={llamarA.cliente.area}
          clienteIdVincular={llamarA.cliente.id}
          onContactoReal={async (info) => {
            // Solo entra aquí si hubo llamada conectada (grabada/subida a Drive)
            // Y se guardó el seguimiento. Recién entonces la tarea queda hecha.
            const c = llamarA.cliente;
            const detalle = info.link
              ? `Llamada con grabación en Drive y seguimiento · ${info.link}`
              : "Llamada con seguimiento (grabación en Drive)";
            await registrarContacto(c.id, c.nombre, "llamada", detalle, yo);
            cargar();
          }}
          onCerrar={() => setLlamarA(null)}
        />
      )}

      {/* MODAL: redactar correo con IA (Gmail) */}
      {correoPara && (
        <RedactarCorreo
          paraCorreo={correoPara.cliente.email}
          paraNombre={correoPara.cliente.nombre}
          asuntoInicial={`Seguimiento · DIIPA · ${correoPara.cliente.nombre}`}
          cliente={correoPara.cliente}
          exigeEvidencia
          onCorreoReal={async (info) => {
            // Solo entra aquí si el correo salió Y la evidencia quedó en Drive.
            if (!correoPara) return;
            const detalle = info.link
              ? `Correo con evidencia en Drive · ${info.link}`
              : "Correo con evidencia (Drive)";
            await registrarContacto(correoPara.cliente.id, correoPara.cliente.nombre, "correo", detalle, yo);
            cargar();
          }}
          onCerrar={() => setCorreoPara(null)}
        />
      )}
    </div>
  );
}

// ── Pestaña ALTERNOS (solo DGE): quién cubre a cada persona ──────────
function AlternosPanel() {
  const [cols, setCols] = useState<Colaborador[] | null>(null);
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  useEffect(() => { fetchColaboradores().then(setCols).catch(() => setCols([])); }, []);

  async function asignar(id: string, alternoId: string) {
    setGuardandoId(id);
    const ok = await editarColaborador(id, { alterno_id: alternoId || null });
    if (ok) setCols((prev) => (prev || []).map((c) => (c.id === id ? { ...c, alterno_id: alternoId || null } : c)));
    setGuardandoId(null);
  }

  if (cols === null) return <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-10 text-center text-humo">Cargando colaboradores…</div>;

  const activos = cols.filter((c) => c.activo);
  const q = busca.trim().toLowerCase();
  const lista = q ? activos.filter((c) => (c.nombre || "").toLowerCase().includes(q) || (c.puesto || "").toLowerCase().includes(q)) : activos;
  const sinAlterno = activos.filter((c) => !c.alterno_id).length;

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-teal-soft/40 px-3 py-2.5 text-[12.5px] text-teal-dark">
        El <b>alterno</b> es quien cubre a cada persona. Si alguien va vencido en su seguimiento, el robot también le avisará a su alterno.
        {sinAlterno > 0 && <span className="font-semibold"> · Faltan {sinAlterno} por asignar.</span>}
      </div>
      <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar colaborador…"
        className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20" />
      <div className="overflow-x-auto rounded-2xl border border-black/5 bg-white shadow-sm">
        <table className="w-full min-w-[460px] border-collapse text-left">
          <thead>
            <tr className="bg-nube/40 text-[11px] font-semibold uppercase tracking-wide text-humo">
              <th className="px-3 py-2">Colaborador</th>
              <th className="px-3 py-2">Alterno (lo cubre)</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.id} className="border-t border-black/5 align-middle">
                <td className="px-3 py-2.5">
                  <div className="text-[13.5px] font-bold text-tinta">{c.nombre}</div>
                  <div className="text-[11.5px] text-humo">{c.puesto || "—"}{c.area ? " · " + c.area : ""}</div>
                </td>
                <td className="px-3 py-2.5">
                  <select value={c.alterno_id || ""} onChange={(e) => asignar(c.id, e.target.value)} disabled={guardandoId === c.id}
                    className="w-full max-w-[230px] rounded-lg border border-black/10 px-2 py-1.5 text-sm outline-none focus:border-teal disabled:opacity-50">
                    <option value="">— Sin alterno —</option>
                    {activos.filter((o) => o.id !== c.id).map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
