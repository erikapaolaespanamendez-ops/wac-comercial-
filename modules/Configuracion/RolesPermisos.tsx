// =====================================================================
//  ROLES Y PERMISOS  →  va en: src/modules/Configuracion/RolesPermisos.tsx
//
//  Pestaña dentro de Configuración. Aquí Paola (Dirección) regula TODA la app:
//   • Qué MÓDULOS ve cada rol.
//   • Qué ACCIONES puede hacer cada rol.
//   • Para los CLIENTES de cada área: si el rol puede Ver / Editar /
//     entrar como Colaborador / o no tiene acceso.
//
//  Dos vistas:
//   1) "Por rol"  → eliges un rol y editas todo con switches (lo normal).
//   2) "Mapa"     → la radiografía completa (solo lectura) en tablas.
//
//  Todo se guarda en Supabase (tabla app_permisos). Ver src/data/permisos.ts
// =====================================================================
import { useEffect, useState } from "react";
import {
  ROLES,
  GRUPOS_ROLES,
  TODOS_MODULOS,
  type ModuloClave,
  type AccionClave,
} from "../../data/roles";
import {
  cargarPermisos,
  guardarPermisos,
  permisosListosParaGuardar,
  segVacio,
  TODAS_ACCIONES,
  ACTIVIDADES_SEG,
  AREAS_PERMISOS,
  SQL_TABLA,
  type PermisosConfig,
  type NivelCliente,
  type ActividadSeg,
} from "../../data/permisos";
import {
  listarNiveles,
  guardarNivel,
  NIVELES as NIVELES_PANTALLA,
  NIVEL_NOMBRE,
  NIVEL_EXPLICACION,
  MODULO_COMERCIAL_NOMBRE,
  type Nivel,
  type NivelModulo,
  type ModuloComercial,
} from "../../data/niveles";

// Las pantallas de adentro que tienen nivel propio (antes vivían en el
// bloque aparte de "Niveles Comercial", debajo de esta pantalla).
const PANTALLAS: ModuloComercial[] = ["carteras", "administradoras", "catalogo_garantias"];

// ── Nombres bonitos de cada módulo ──────────────────────────
const MODULO_LABEL: Record<ModuloClave, string> = {
  asistente: "Asistente IA",
  chat: "Chat Interno",
  directorio: "Directorio",
  conmutador: "Conmutador",
  videollamadas: "Videollamadas",
  llamadas: "Llamadas",
  kpis: "KPIs",
  clientes: "Clientes",
  configuracion: "Configuración",
  catalogo: "Catálogo Seguimiento",
  seguimiento: "Seguimiento",
  chatcliente: "Chat Cliente",
  milista: "Mi lista del día",
  prospectos: "CRM Prospectos",
  devoluciones: "Control de Devoluciones",
  comercial: "Módulo Comercial",
};
// ── Qué hace cada módulo ────────────────────────────────────
// Se muestra debajo del nombre, en la tarjeta de cada módulo, para
// que al asignar un rol se sepa qué información se está abriendo y
// no haya que adivinarlo por el nombre. Pedido por la DGE (10-sep-2026).
const MODULO_DESC: Record<ModuloClave, string> = {
  asistente: "Asistente de inteligencia artificial para consultas del día a día.",
  chat: "Chat interno del equipo: grupos, mensajes directos, notas de voz y llamadas entre colaboradores.",
  directorio: "Lista del equipo con extensión, teléfono y correo de cada quien.",
  conmutador: "Recibir y transferir las llamadas que entran por la línea de la empresa.",
  videollamadas: "Videollamadas con clientes y salas para reuniones.",
  llamadas: "Historial de llamadas hechas y recibidas, con sus grabaciones.",
  kpis: "Números de llamadas por persona y por área. Deja ver el desempeño de todo el equipo.",
  clientes: "Ficha completa de cada cliente: estatus, datos, vínculos e historial.",
  configuracion: "Roles y permisos, colaboradores, solicitudes de acceso, carteras y papelera. Da control sobre quién entra y qué ve.",
  catalogo: "Reglas de seguimiento por código: quién es responsable, cada cuánto se contacta y cómo escala.",
  seguimiento: "CRM Clientes (UAC): a quién llamar hoy — vencidos, por vencer y al día.",
  chatcliente: "WhatsApp con clientes desde el sistema.",
  milista: "Los pendientes del día de quien entra, nada más los suyos.",
  prospectos: "CRM de prospectos: captura, reparto y seguimiento antes de que sean clientes.",
  devoluciones: "Fila de devoluciones (RDC): montos, prioridad y calendario de pagos. Es información de dinero.",
  comercial: "Módulo Comercial: garantías, precios, promociones y el equipo de plaza.",
};

const MODULO_CORTO: Record<ModuloClave, string> = {
  asistente: "IA",
  chat: "Chat",
  directorio: "Dir.",
  conmutador: "Conm.",
  videollamadas: "Video",
  llamadas: "Llam.",
  kpis: "KPIs",
  clientes: "Client.",
  configuracion: "Config.",
  catalogo: "Catál.",
  seguimiento: "Segui.",
  chatcliente: "WhatsApp",
  milista: "Mi día",
  prospectos: "Prosp.",
  devoluciones: "Devol.",
  comercial: "Comerc.",
};

// ── Nombres bonitos de cada acción ──────────────────────────
const ACCION_LABEL: Record<AccionClave, string> = {
  cartera_editar: "Carteras · Editar el catálogo (nombre, código, actor)",
  gar_editar_general: "Garantía · Editar información general",
  gar_editar_caracteristicas: "Garantía · Editar características (metros, recámaras)",
  gar_editar_ubicacion: "Garantía · Editar la ubicación (liga de Maps y coordenadas)",
  gar_editar_origen: "Garantía · Editar el origen (administradora, cartera, crédito)",
  gar_editar_precios: "Garantía · Editar la pestaña de precios completa",
  gar_capturar_avaluo: "Garantía · Capturar solo el valor del avalúo",
  gar_editar_legal: "Garantía · Editar la pestaña legal",
  gar_fotos_subir: "Garantía · Subir fotos a la galería",
  gar_fotos_organizar: "Garantía · Organizar fotos (principal, etiquetas, quitar)",
  gar_descargar_ficha: "Garantía · Descargar la ficha",
  gar_ver_descuentos: "Garantía · Ver los descuentos y promociones",
  gar_pedir_apertura_promociones: "Garantía · Pedir apertura de promociones",
  gar_mandar_predictamen: "Garantía · Mandar a predictamen",
  precio_calcular: "Precio · Calcular",
  precio_recalcular: "Precio · Recalcular uno ya cerrado",
  precio_definir_venta: "Precio · Definir el precio de venta al cliente",
  precio_validar: "Precio · Validar el precio de otro",
  promo_validar_apertura: "Promociones · Autorizar las solicitudes de apertura",
  exportar_bitacora: "Exportar bitácora",
  clientes_gestionar: "Gestionar clientes (crear / editar)",
  config_colaboradores: "Configurar colaboradores",
  aprobar_accesos: "Aprobar accesos nuevos",
  generar_exp_colaborador: "Generar expediente de colaborador",
  generar_exp_cliente: "Generar expediente de cliente",
  catalogo_editar: "Editar catálogo de seguimiento",
  asignar_asesor: "Asignar asesor a un cliente",
  convertir_cliente: "Convertir prospecto en cliente",
  editar_permisos: "Editar Roles y Permisos",
  ver_papelera: "Ver la Papelera / Registro",
  borrar_definitivo: "Borrar definitivo (permanente)",
  borrar_colaborador: "Borrar colaborador",
  enviar_papelera: "Mandar a la papelera / registro",
  restaurar: "Restaurar desde la papelera",
  archivar: "Archivar / desarchivar",
  cambiar_codigo: "Cambiar código del cliente (R1/R2/…)",
  compartir_cliente: "Compartir cliente con otra área",
  actualizar_vencido: "Actualizar contrato vencido a R1",
  registrar_llamada: "Registrar llamadas",
  gestionar_llamada: "Marcar llamada (urgente / devuelta)",
  crear_videollamada: "Crear videollamadas",
  crear_grupo_chat: "Crear grupos de chat",
  administrar_grupo: "Administrar grupo (integrantes / foto)",
  gestionar_actuaciones: "Gestionar actuaciones / boletines",
  gestionar_convenio_contingencia: "Gestionar convenio y contingencia",
  gestionar_juicio: "Gestionar datos del juicio",
  prospectos_crear: "CRM Prospectos · Crear lead",
  prospectos_asignar: "CRM Prospectos · Repartir / asignar asesor",
  prospectos_gestionar: "CRM Prospectos · Gestionar (toques, fases, datos)",
  prospectos_borrar: "CRM Prospectos · Borrar lead",
  registrar_abono: "Registrar abonos (dinero)",
  editar_abono: "Corregir abonos ya registrados (dinero)",
  borrar_abono: "Borrar abonos (dinero)",
  solicitar_compensacion: "Solicitar compensación (RAC)",
  habilitar_compensacion: "Habilitar compensación (RAC/SRAC)",
  solicitar_terminos_rdc: "Solicitar términos y condiciones diferentes (RDC)",
  solicitar_devolucion_formal: "Disparar solicitud de devolución (sin llenar datos)",
  llenar_datos_sucursal_rdc: "Llenar y validar datos en sucursal para RDC",
  terminar_caso: "Terminar caso · devolución/entrega (RAC/GAD/DGE)",
  editar_ficha: "Editar ficha técnica (corregir datos)",
  subir_devolucion: "Subir solicitud de devolución (RDC)",
  subir_documentos: "Subir documentos al expediente",
  docs_criticos: "🔒 Documentos críticos (contrato, carta propuesta, dictámenes, cuentas de pago)",
  agregar_nota: "Agregar notas",
  gestionar_tareas: "Gestionar tareas (crear / completar)",
  redactar_correo: "Redactar correos al cliente",
  ver_exp_ficha: "👁️ Pestaña Ficha técnica",
  ver_exp_expediente: "👁️ Pestaña Expediente",
  ver_exp_llamadas: "👁️ Pestaña Llamadas",
  ver_exp_correos: "👁️ Pestaña Correos",
  ver_exp_notas: "👁️ Pestaña Notas",
  ver_exp_tareas: "👁️ Pestaña Tareas",
  ver_exp_actuaciones: "👁️ Pestaña Actuaciones",
  ver_exp_legal: "👁️ Pestaña Contingencia/Convenio",
  ver_exp_cronologia: "👁️ Pestaña Cronología",
};

// ── Acciones que pertenecen a cada MÓDULO (para mostrarlas juntas) ────────
const ACCION_POR_MODULO_BASE: Partial<Record<ModuloClave, AccionClave[]>> = {
  clientes: ["clientes_gestionar", "asignar_asesor", "convertir_cliente", "generar_exp_cliente", "gestionar_actuaciones", "gestionar_convenio_contingencia", "gestionar_juicio", "registrar_abono", "editar_abono", "borrar_abono", "solicitar_compensacion", "habilitar_compensacion", "terminar_caso", "editar_ficha", "subir_documentos", "docs_criticos", "agregar_nota", "gestionar_tareas", "redactar_correo", "ver_exp_ficha", "ver_exp_expediente", "ver_exp_llamadas", "ver_exp_correos", "ver_exp_notas", "ver_exp_tareas", "ver_exp_actuaciones", "ver_exp_legal", "ver_exp_cronologia"],
  seguimiento: ["cambiar_codigo", "compartir_cliente", "actualizar_vencido"],
  prospectos: ["prospectos_crear", "prospectos_asignar", "prospectos_gestionar", "prospectos_borrar"],
  catalogo: ["catalogo_editar"],
  comercial: ["gar_editar_general", "gar_editar_caracteristicas", "gar_editar_ubicacion", "gar_editar_origen", "gar_editar_precios", "gar_capturar_avaluo", "gar_editar_legal", "gar_fotos_subir", "gar_fotos_organizar", "gar_descargar_ficha", "gar_ver_descuentos", "gar_pedir_apertura_promociones", "gar_mandar_predictamen", "precio_calcular", "precio_recalcular", "precio_definir_venta", "precio_validar", "promo_validar_apertura"],
  llamadas: ["registrar_llamada", "gestionar_llamada", "exportar_bitacora"],
  videollamadas: ["crear_videollamada"],
  chat: ["crear_grupo_chat", "administrar_grupo"],
  configuracion: ["cartera_editar", "config_colaboradores", "borrar_colaborador", "aprobar_accesos", "generar_exp_colaborador", "editar_permisos", "ver_papelera", "enviar_papelera", "restaurar", "archivar", "borrar_definitivo"],
};
// Si se agrega una acción nueva sin módulo, no se pierde: cae en Configuración.
const _accionesAsignadas = new Set(Object.values(ACCION_POR_MODULO_BASE).flat());
const _accionesSueltas = TODAS_ACCIONES.filter((a) => !_accionesAsignadas.has(a));
const ACCION_POR_MODULO: Partial<Record<ModuloClave, AccionClave[]>> = {
  ...ACCION_POR_MODULO_BASE,
  configuracion: [...(ACCION_POR_MODULO_BASE.configuracion || []), ..._accionesSueltas],
};

// ── Los 4 niveles de acceso a clientes ──────────────────────
const NIVELES: { clave: NivelCliente; label: string; sel: string; letra: string; punto: string }[] = [
  { clave: "ninguno", label: "Sin acceso", sel: "bg-slate-200 text-slate-700", letra: "–", punto: "bg-slate-300 text-slate-600" },
  { clave: "ver", label: "Ver", sel: "bg-teal text-white", letra: "V", punto: "bg-teal-soft text-teal-dark" },
  { clave: "colaborador", label: "Colaborador", sel: "bg-amber-500 text-white", letra: "C", punto: "bg-amber-50 text-amber-700" },
  { clave: "editar", label: "Editar", sel: "bg-aqua text-white", letra: "E", punto: "bg-aqua-soft text-aqua-dark" },
];
function nivelInfo(n: NivelCliente) {
  return NIVELES.find((x) => x.clave === n) || NIVELES[0];
}

// Nombres bonitos de las actividades de seguimiento.
const ACTIVIDAD_LABEL: Record<ActividadSeg, string> = {
  asignar: "Asignar / cambiar asesor",
  editar: "Editar datos",
  seguimiento: "Hacer seguimiento",
};
const ACTIVIDAD_CORTO: Record<ActividadSeg, string> = {
  asignar: "Asignar",
  editar: "Editar",
  seguimiento: "Segui.",
};

function quienSoy(): string {
  try {
    const y = JSON.parse(localStorage.getItem("chat_yo") || "null");
    return y?.nombre || "Dirección";
  } catch {
    return "Dirección";
  }
}

// Switch reutilizable
function Switch({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={"relative h-6 w-11 shrink-0 rounded-full transition " + (on ? "bg-aqua" : "bg-slate-300")}
    >
      <span className={"absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all " + (on ? "left-[22px]" : "left-0.5")} />
    </button>
  );
}

export default function RolesPermisos() {
  const [cargando, setCargando] = useState(true);
  const [sinTabla, setSinTabla] = useState(false);
  const [config, setConfig] = useState<PermisosConfig | null>(null);
  const [vista, setVista] = useState<"rol" | "mapa">("rol");
  const [rolSel, setRolSel] = useState<string>("DGE");
  const [sucio, setSucio] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [niveles, setNiveles] = useState<NivelModulo[]>([]);

  function recargar() {
    setCargando(true);
    setMsg("");
    cargarPermisos()
      .then(({ config, sinTabla }) => {
        setConfig(config);
        setSinTabla(sinTabla);
        setSucio(false);
      })
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    recargar();
    listarNiveles().then(setNiveles);
  }, []);

  // Las pantallas de adentro se guardan solas, renglón por renglón, en cuanto
  // las mueves. No esperan al botón "Guardar cambios".
  async function cambiarPantalla(rolCod: string, pantalla: ModuloComercial, cambio: Partial<NivelModulo>) {
    const actual =
      niveles.find((n: NivelModulo) => n.rol === rolCod && n.modulo === pantalla) ||
      { rol: rolCod, modulo: pantalla, nivel: "sin_acceso" as Nivel, puedeDesbloquear: false, puedePedirApertura: false };
    const nuevo: NivelModulo = { ...actual, ...cambio };
    setNiveles((prev: NivelModulo[]) => [...prev.filter((n: NivelModulo) => !(n.rol === rolCod && n.modulo === pantalla)), nuevo]);
    const ok = await guardarNivel(nuevo, quienSoy());
    if (!ok) {
      setMsg("No se pudo guardar el nivel de la pantalla. Vuelve a intentar.");
      listarNiveles().then(setNiveles);
    }
  }

  function aplicar(next: PermisosConfig) {
    setConfig(next);
    setSucio(true);
    setMsg("");
  }

  function toggleModulo(rol: string, m: ModuloClave) {
    if (!config) return;
    const actuales = config.modulos[rol] || [];
    const nuevos = actuales.includes(m) ? actuales.filter((x) => x !== m) : [...actuales, m];
    aplicar({ ...config, modulos: { ...config.modulos, [rol]: nuevos } });
  }
  function toggleAccion(rol: string, a: AccionClave) {
    if (!config) return;
    const actuales = config.acciones[rol] || [];
    const nuevos = actuales.includes(a) ? actuales.filter((x) => x !== a) : [...actuales, a];
    aplicar({ ...config, acciones: { ...config.acciones, [rol]: nuevos } });
  }
  function setNivel(rol: string, area: string, nivel: NivelCliente) {
    if (!config) return;
    const fila = { ...(config.clientes[rol] || {}), [area]: nivel };
    aplicar({ ...config, clientes: { ...config.clientes, [rol]: fila } });
  }
  function todosModulos(rol: string, on: boolean) {
    if (!config) return;
    aplicar({ ...config, modulos: { ...config.modulos, [rol]: on ? [...TODOS_MODULOS] : [] } });
  }
  function toggleSeg(rol: string, tipo: "prospecto" | "cliente", act: ActividadSeg) {
    if (!config) return;
    const actual = config.seguimiento[rol] || segVacio();
    const filaTipo = { ...actual[tipo], [act]: !actual[tipo][act] };
    aplicar({ ...config, seguimiento: { ...config.seguimiento, [rol]: { ...actual, [tipo]: filaTipo } } });
  }

  async function guardar() {
    if (!config) return;
    // Si la tabla no se leyó completa, guardar borraría lo que no se alcanzó
    // a leer. Mejor mandar a recargar que escribir a ciegas.
    if (sinTabla || !permisosListosParaGuardar()) {
      setMsg("No se guardó: los permisos no se leyeron completos. Recarga la pantalla e intenta de nuevo.");
      return;
    }
    setGuardando(true);
    const ok = await guardarPermisos(config, quienSoy());
    setGuardando(false);
    if (ok) {
      setSucio(false);
      setMsg("Guardado ✓");
      recargar();
    } else {
      setMsg("No se pudo guardar. Revisa que la tabla exista (botón de abajo).");
    }
  }

  async function copiarSQL() {
    try {
      await navigator.clipboard.writeText(SQL_TABLA);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      setCopiado(false);
    }
  }

  if (cargando || !config) {
    return (
      <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-16 text-center text-humo">
        Cargando permisos…
      </div>
    );
  }

  const rol = ROLES.find((r) => r.codigo === rolSel) || ROLES[0];
  const modsRol = config.modulos[rol.codigo] || [];
  const accsRol = config.acciones[rol.codigo] || [];
  const cliRol = config.clientes[rol.codigo] || {};
  const segRol = config.seguimiento[rol.codigo] || segVacio();
  const grupoRol = GRUPOS_ROLES.find((g) => g.clave === rol.grupo);

  return (
    <div className="space-y-5">
      {/* ===== Encabezado + barra de guardado ===== */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-extrabold text-tinta">🔐 Roles y Permisos</h1>
          <p className="text-sm text-humo">El reglamento vivo de JurisConecta: quién ve cada módulo, qué puede hacer y cómo trata a los clientes de cada área.</p>
          {config.actualizado_por && (
            <p className="mt-1 text-[11px] text-humo">
              Último cambio: <b>{config.actualizado_por}</b>
              {config.actualizado_en ? " · " + new Date(config.actualizado_en).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {sucio && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">Cambios sin guardar</span>}
          {msg && <span className="text-xs font-semibold text-teal-dark">{msg}</span>}
          {sucio && (
            <button onClick={recargar} className="rounded-xl border border-black/10 px-3 py-2 text-sm font-medium text-humo transition hover:bg-nube">
              Deshacer
            </button>
          )}
          <button
            onClick={guardar}
            disabled={guardando || sinTabla || !sucio}
            className="rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-dark disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>

      {/* ===== Aviso: falta crear la tabla ===== */}
      {sinTabla && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">⚠️ Modo solo lectura</p>
          <p className="mt-1">
            Estás viendo los permisos que hoy tiene la app (sacados del código), pero todavía <b>no se pueden guardar</b> porque falta crear la tabla
            <code className="mx-1 rounded bg-amber-100 px-1">app_permisos</code> en Supabase. Copia este SQL y pégalo una sola vez en
            Supabase → SQL Editor → Run:
          </p>
          <pre className="mt-2 max-h-48 overflow-auto rounded-xl bg-amber-900/90 p-3 text-[11px] leading-relaxed text-amber-50">{SQL_TABLA}</pre>
          <button onClick={copiarSQL} className="mt-2 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-700">
            {copiado ? "Copiado ✓" : "Copiar SQL"}
          </button>
        </div>
      )}

      {/* ===== Cambiar de vista ===== */}
      <div className="inline-flex rounded-xl border border-black/10 bg-white p-1">
        <button onClick={() => setVista("rol")} className={"rounded-lg px-4 py-1.5 text-sm font-semibold transition " + (vista === "rol" ? "bg-teal text-white" : "text-humo hover:bg-nube")}>Por rol</button>
        <button onClick={() => setVista("mapa")} className={"rounded-lg px-4 py-1.5 text-sm font-semibold transition " + (vista === "mapa" ? "bg-teal text-white" : "text-humo hover:bg-nube")}>Mapa completo</button>
      </div>

      {/* ============================================================ */}
      {/* VISTA 1: POR ROL (editable)                                  */}
      {/* ============================================================ */}
      {vista === "rol" && (
        <div className="space-y-5">
          {/* Selector de rol */}
          <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
            <label className="text-xs font-medium text-humo">Elige el rol que quieres regular</label>
            <select
              value={rolSel}
              onChange={(e) => setRolSel(e.target.value)}
              className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
            >
              {GRUPOS_ROLES.map((g) => (
                <optgroup key={g.clave} label={`${g.emoji} ${g.nombre}`}>
                  {ROLES.filter((r) => r.grupo === g.clave).map((r) => (
                    <option key={r.codigo} value={r.codigo}>{r.nombre} · {r.codigo}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {grupoRol && <span className="rounded-full bg-nube px-2.5 py-0.5 text-[11px] font-semibold text-tinta">{grupoRol.emoji} {grupoRol.nombre}</span>}
              <span className="rounded-full bg-teal-soft px-2.5 py-0.5 text-[11px] font-semibold text-teal-dark">{modsRol.length} módulo(s)</span>
              <span className="rounded-full bg-aqua-soft px-2.5 py-0.5 text-[11px] font-semibold text-aqua-dark">{accsRol.length} acción(es)</span>
            </div>
          </div>

          {/* Permisos por módulo (visibilidad + acciones, todo junto) */}
          <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base font-extrabold text-tinta">Permisos por módulo</h2>
              <div className="flex gap-1.5">
                <button onClick={() => todosModulos(rol.codigo, true)} className="rounded-lg border border-black/10 px-2.5 py-1 text-[11px] font-semibold text-humo transition hover:bg-nube">Ver todos</button>
                <button onClick={() => todosModulos(rol.codigo, false)} className="rounded-lg border border-black/10 px-2.5 py-1 text-[11px] font-semibold text-humo transition hover:bg-nube">Ocultar todos</button>
              </div>
            </div>
            <p className="mt-1 text-xs text-humo">Cada módulo con su visibilidad en el menú y, adentro, las acciones (botones) que permite.</p>

            <div className="mt-3 space-y-3">
              {TODOS_MODULOS.map((m) => {
                const visible = modsRol.includes(m);
                const acciones = ACCION_POR_MODULO[m] || [];
                return (
                  <div key={m} className="rounded-2xl border border-black/10 bg-nube/30 p-3">
                    {/* Cabecera del módulo */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="font-display text-sm font-extrabold text-tinta">{MODULO_LABEL[m]}</span>
                        <p className="mt-0.5 text-[11px] leading-snug text-humo">{MODULO_DESC[m]}</p>
                      </div>
                      <label className="flex items-center gap-2 text-[11px] font-semibold text-humo">
                        {visible ? "Visible" : "Oculto"}
                        <Switch on={visible} onClick={() => toggleModulo(rol.codigo, m)} />
                      </label>
                    </div>
                    {/* Acciones del módulo */}
                    {acciones.length > 0 && (
                      <div className="mt-2.5 space-y-1.5 border-t border-black/5 pt-2.5">
                        {acciones.map((a) => {
                          const on = accsRol.includes(a);
                          return (
                            <div key={a} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-1.5">
                              <span className="text-[13px] text-tinta">{ACCION_LABEL[a]}</span>
                              <Switch on={on} onClick={() => toggleAccion(rol.codigo, a)} />
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {m === "clientes" && <p className="mt-2 text-[11px] text-humo">El acceso por área se ajusta más abajo, en “Clientes por área”.</p>}
                    {m === "seguimiento" && <p className="mt-2 text-[11px] text-humo">Las actividades (asignar / editar / seguimiento) se ajustan más abajo.</p>}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Pantallas de adentro (lo que antes era el bloque de Niveles Comercial) */}
          <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
            <h2 className="font-display text-base font-extrabold text-tinta">Pantallas de adentro</h2>
            <p className="mt-1 text-xs text-humo">
              Estas no son módulos del menú: son pantallas dentro del Módulo Comercial. Cada nivel incluye al anterior —
              <b> Ver</b> es solo lectura, <b>Capturar</b> deja editar pero queda pendiente de validación, y <b>Validar</b> cierra el dato.
              Se guardan solas al moverlas.
            </p>

            <div className="mt-3 space-y-3">
              {PANTALLAS.map((p) => {
                const fila = niveles.find((n: NivelModulo) => n.rol === rol.codigo && n.modulo === p);
                const nivel = (fila?.nivel || "sin_acceso") as Nivel;
                return (
                  <div key={p} className="rounded-2xl border border-black/10 bg-nube/30 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="font-display text-sm font-extrabold text-tinta">{MODULO_COMERCIAL_NOMBRE[p]}</span>
                      <select
                        value={nivel}
                        onChange={(e) => cambiarPantalla(rol.codigo, p, { nivel: e.target.value as Nivel })}
                        className="rounded-xl border border-black/10 px-3 py-1.5 text-[13px] outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
                      >
                        {NIVELES_PANTALLA.map((n) => (
                          <option key={n} value={n}>{NIVEL_NOMBRE[n]}</option>
                        ))}
                      </select>
                    </div>
                    <p className="mt-1 text-[11px] text-humo">{NIVEL_EXPLICACION[nivel]}</p>

                    <div className="mt-2.5 space-y-1.5 border-t border-black/5 pt-2.5">
                      <div className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-1.5">
                        <span className="text-[13px] text-tinta">Desbloquear fichas de esta pantalla</span>
                        <Switch
                          on={!!fila?.puedeDesbloquear}
                          onClick={() => cambiarPantalla(rol.codigo, p, { puedeDesbloquear: !fila?.puedeDesbloquear })}
                        />
                      </div>
                      <div className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-1.5">
                        <span className="text-[13px] text-tinta">Pedir apertura de una ficha cerrada</span>
                        <Switch
                          on={!!fila?.puedePedirApertura}
                          onClick={() => cambiarPantalla(rol.codigo, p, { puedePedirApertura: !fila?.puedePedirApertura })}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Clientes por área */}
          <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
            <h2 className="font-display text-base font-extrabold text-tinta">Clientes por área</h2>
            <p className="mt-1 text-xs text-humo">
              Para los clientes de cada área: <b>Sin acceso</b>, <b>Ver</b>, <b>Editar</b> (control total, normalmente su propia área) o
              <b> Colaborador</b> (apoya y registra avances, pero el área dueña sigue mandando).
            </p>
            <div className="mt-3 space-y-2">
              {AREAS_PERMISOS.map((ar) => {
                const actual = cliRol[ar.clave] || "ninguno";
                return (
                  <div key={ar.clave} className="rounded-xl border border-black/5 bg-nube/40 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ar.color }} />
                      <span className="text-sm font-semibold text-tinta">{ar.nombre}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {NIVELES.map((n) => {
                        const activo = actual === n.clave;
                        return (
                          <button
                            key={n.clave}
                            onClick={() => setNivel(rol.codigo, ar.clave, n.clave)}
                            className={"rounded-lg px-3 py-1.5 text-xs font-semibold transition " + (activo ? n.sel : "border border-black/10 bg-white text-humo hover:bg-nube")}
                          >
                            {n.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Seguimiento: prospecto vs cliente */}
          <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
            <h2 className="font-display text-base font-extrabold text-tinta">Seguimiento de clientes</h2>
            <p className="mt-1 text-xs text-humo">
              A quién le toca <b>asignar</b>, <b>editar</b> y <b>dar seguimiento</b>. Se separa según el registro sea
              todavía <b>Prospecto</b> o ya <b>Cliente</b> (puedes dar permisos distintos en cada etapa).
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[360px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="px-2 py-2 text-left font-semibold text-humo">Puede…</th>
                    <th className="px-2 py-2 text-center font-semibold text-emerald-700">Prospecto</th>
                    <th className="px-2 py-2 text-center font-semibold text-teal-dark">Cliente</th>
                  </tr>
                </thead>
                <tbody>
                  {ACTIVIDADES_SEG.map((act) => (
                    <tr key={act} className="border-t border-black/5">
                      <td className="px-2 py-2.5 font-medium text-tinta">{ACTIVIDAD_LABEL[act]}</td>
                      <td className="px-2 py-2.5">
                        <div className="flex justify-center">
                          <Switch on={segRol.prospecto[act]} onClick={() => toggleSeg(rol.codigo, "prospecto", act)} />
                        </div>
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex justify-center">
                          <Switch on={segRol.cliente[act]} onClick={() => toggleSeg(rol.codigo, "cliente", act)} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ============================================================ */}
      {/* VISTA 2: MAPA COMPLETO (solo lectura)                        */}
      {/* ============================================================ */}
      {vista === "mapa" && (
        <div className="space-y-6">
          {/* Mapa de módulos */}
          <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
            <h2 className="font-display text-base font-extrabold text-tinta">Módulos por rol</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-white px-2 py-2 font-semibold text-humo">Rol</th>
                    {TODOS_MODULOS.map((m) => (
                      <th key={m} className="px-2 py-2 text-center font-semibold text-humo">{MODULO_CORTO[m]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {GRUPOS_ROLES.map((g) => {
                    const delGrupo = ROLES.filter((r) => r.grupo === g.clave);
                    if (delGrupo.length === 0) return null;
                    return (
                      <FragmentoGrupo key={g.clave} titulo={`${g.emoji} ${g.nombre}`} cols={TODOS_MODULOS.length + 1}>
                        {delGrupo.map((r) => (
                          <tr key={r.codigo} className="border-t border-black/5">
                            <td className="sticky left-0 z-10 bg-white px-2 py-1.5 font-medium text-tinta">{r.codigo}</td>
                            {TODOS_MODULOS.map((m) => {
                              const on = (config.modulos[r.codigo] || []).includes(m);
                              return (
                                <td key={m} className="px-2 py-1.5 text-center">
                                  {on ? <span className="font-bold text-aqua">✓</span> : <span className="text-slate-300">·</span>}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </FragmentoGrupo>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Mapa de clientes por área */}
          <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
            <h2 className="font-display text-base font-extrabold text-tinta">Clientes por área</h2>
            <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
              {NIVELES.map((n) => (
                <span key={n.clave} className={"rounded px-2 py-0.5 font-semibold " + n.punto}>{n.letra} = {n.label}</span>
              ))}
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-white px-2 py-2 font-semibold text-humo">Rol</th>
                    {AREAS_PERMISOS.map((ar) => (
                      <th key={ar.clave} className="px-2 py-2 text-center font-semibold text-humo">{ar.nombre}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {GRUPOS_ROLES.map((g) => {
                    const delGrupo = ROLES.filter((r) => r.grupo === g.clave);
                    if (delGrupo.length === 0) return null;
                    return (
                      <FragmentoGrupo key={g.clave} titulo={`${g.emoji} ${g.nombre}`} cols={AREAS_PERMISOS.length + 1}>
                        {delGrupo.map((r) => (
                          <tr key={r.codigo} className="border-t border-black/5">
                            <td className="sticky left-0 z-10 bg-white px-2 py-1.5 font-medium text-tinta">{r.codigo}</td>
                            {AREAS_PERMISOS.map((ar) => {
                              const nivel = (config.clientes[r.codigo] || {})[ar.clave] || "ninguno";
                              const info = nivelInfo(nivel);
                              return (
                                <td key={ar.clave} className="px-2 py-1.5 text-center">
                                  <span className={"inline-block h-5 w-5 rounded text-center text-[11px] font-bold leading-5 " + info.punto}>{info.letra}</span>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </FragmentoGrupo>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Mapa de seguimiento */}
          <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
            <h2 className="font-display text-base font-extrabold text-tinta">Seguimiento por rol</h2>
            <p className="mt-1 text-xs text-humo">Asignar · Editar · Hacer seguimiento, separado por etapa.</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr>
                    <th rowSpan={2} className="sticky left-0 z-10 bg-white px-2 py-2 align-bottom font-semibold text-humo">Rol</th>
                    <th colSpan={3} className="border-b border-black/10 px-2 py-1 text-center font-semibold text-emerald-700">Prospecto</th>
                    <th colSpan={3} className="border-b border-black/10 px-2 py-1 text-center font-semibold text-teal-dark">Cliente</th>
                  </tr>
                  <tr>
                    {ACTIVIDADES_SEG.map((a) => <th key={"p" + a} className="px-2 py-1 text-center font-medium text-humo">{ACTIVIDAD_CORTO[a]}</th>)}
                    {ACTIVIDADES_SEG.map((a) => <th key={"c" + a} className="px-2 py-1 text-center font-medium text-humo">{ACTIVIDAD_CORTO[a]}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {GRUPOS_ROLES.map((g) => {
                    const delGrupo = ROLES.filter((r) => r.grupo === g.clave);
                    if (delGrupo.length === 0) return null;
                    return (
                      <FragmentoGrupo key={g.clave} titulo={`${g.emoji} ${g.nombre}`} cols={ACTIVIDADES_SEG.length * 2 + 1}>
                        {delGrupo.map((r) => {
                          const s = config.seguimiento[r.codigo] || segVacio();
                          return (
                            <tr key={r.codigo} className="border-t border-black/5">
                              <td className="sticky left-0 z-10 bg-white px-2 py-1.5 font-medium text-tinta">{r.codigo}</td>
                              {ACTIVIDADES_SEG.map((a) => (
                                <td key={"p" + a} className="px-2 py-1.5 text-center">{s.prospecto[a] ? <span className="font-bold text-emerald-600">✓</span> : <span className="text-slate-300">·</span>}</td>
                              ))}
                              {ACTIVIDADES_SEG.map((a) => (
                                <td key={"c" + a} className="px-2 py-1.5 text-center">{s.cliente[a] ? <span className="font-bold text-teal">✓</span> : <span className="text-slate-300">·</span>}</td>
                              ))}
                            </tr>
                          );
                        })}
                      </FragmentoGrupo>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

// Fila-encabezado de un grupo dentro de una tabla.
function FragmentoGrupo({ titulo, cols, children }: { titulo: string; cols: number; children: React.ReactNode }) {
  return (
    <>
      <tr>
        <td colSpan={cols} className="sticky left-0 bg-nube px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-humo">{titulo}</td>
      </tr>
      {children}
    </>
  );
}
