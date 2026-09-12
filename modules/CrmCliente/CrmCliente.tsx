// ===================================================================
// CRM DEL CLIENTE (vista 360°)  →  src/modules/CrmCliente/CrmCliente.tsx
// Página de pantalla completa que junta TODO de un cliente:
//   • Ficha técnica (todos los datos que se llenan en el cliente).
//   • Llamadas (con grabaciones)  → Parte 2
//   • Correos                     → Parte 3
//   • Notas                       → Parte 4
//   • Tareas (asignadas y hechas) → Parte 5
//   • Foto del cliente            → Parte 6
// El CLIENTE es la fuente: lo que se captura en su ficha se refleja aquí.
// ===================================================================
import { useEffect, useState } from "react";
import { CODIGO, estatusDe, origenCliente, actualizarCliente, cambiarCodigoCliente, guardarIndicadorR3, type Cliente, type CamposClienteEditables, type Codigo, type Area } from "../../data/clientes";
import { fetchCierre, agregarEvidencias, quitarEvidencia, galeriaEvidencias, type CierreCaso, type EvidenciaCierre } from "../../data/cierreCaso";
import { subirArchivoDrive } from "../../data/expedienteDocs";
import { generarExpediente } from "../../data/expediente";
import { registrarComunicacion } from "../../data/comunicaciones";
import { puedeAccion, type AccionClave } from "../../data/roles";
import PanelExpediente, { ResumenContrato } from "./PanelExpediente";
import PanelConvenio from "./panels/PanelConvenio";
import PanelContingencia from "./panels/PanelContingencia";
import PanelLlamadas from "./panels/PanelLlamadas";
import PanelCita from "./panels/PanelCita";
import PanelCorreos from "./panels/PanelCorreos";
import PanelNotas from "./panels/PanelNotas";
import PanelTareas from "./panels/PanelTareas";
import PanelCronologia from "./panels/PanelCronologia";
import PanelJuridico from "./panels/PanelJuridico";
import IndicadorSolicitudDevolucion from "./panels/IndicadorSolicitudDevolucion";
import { useMiRol, Dato, Seccion } from "./_compartido";
import VistaPreviaDoc from "./VistaPreviaDoc";

// 👇 Saca el id de un archivo de Drive desde su URL ( .../d/ID/view  o  ?id=ID ).
function driveIdDeUrl(url: string): string {
  const m = url.match(/\/d\/([^/]+)/) || url.match(/[?&]id=([^&]+)/);
  return m ? m[1] : "";
}
// 👇 Construye una URL de imagen embebible (miniatura grande) para verla DENTRO del CRM.
function driveImg(url: string, ancho = 1600): string {
  const id = driveIdDeUrl(url);
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w${ancho}` : url;
}

// 👇 Muestra la foto de evidencia en grande. Intenta 2 formatos de Drive;
//    si ninguno carga (ej. fotos viejas subidas como "audio"), muestra un aviso
//    claro en vez de dejar el hueco vacío.
function FotoEvidencia({ url }: { url: string }) {
  const id = driveIdDeUrl(url);
  const fuentes = id
    ? [driveImg(url, 1600), `https://lh3.googleusercontent.com/d/${id}=w1600`]
    : [url];
  const [idx, setIdx] = useState(0);
  const [fallo, setFallo] = useState(false);

  if (fallo) {
    return (
      <div className="mt-2 rounded-xl border-2 border-dashed border-emerald-300 bg-white px-4 py-4 text-center">
        <p className="text-[13px] font-semibold text-emerald-800">📷 La foto no se pudo mostrar aquí</p>
        <p className="mt-0.5 text-[12px] text-humo">Si se subió antes del arreglo, vuelve a subirla (reabrir → cerrar con la foto) para verla en grande.</p>
        <a href={url} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-emerald-700 hover:underline">🔍 Abrir foto en Drive</a>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <a href={url} target="_blank" rel="noreferrer" title="Abrir la foto en Google Drive">
        <img
          src={fuentes[idx]}
          alt="Foto de evidencia de la entrega"
          className="w-full max-w-lg rounded-xl border-2 border-emerald-300 object-cover shadow-md transition hover:shadow-lg"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => { if (idx < fuentes.length - 1) setIdx(idx + 1); else setFallo(true); }}
        />
      </a>
      <a href={url} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-emerald-700 hover:underline">🔍 Ver en grande / abrir en Drive</a>
    </div>
  );
}

// Lee un archivo y lo regresa en base64 (sin el encabezado "data:...,").
function leerBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] || "");
    r.onerror = () => rej(new Error("No se pudo leer el archivo."));
    r.readAsDataURL(file);
  });
}

// 👇 Galería de fotos de evidencia: muestra todas, deja AGREGAR varias y QUITAR.
//    "Quitar" la saca de la vista; el archivo se queda en Drive como respaldo.
function GaleriaEvidencia({ cliente, cierre, puedeEditar, onActualizado }: {
  cliente: Cliente;
  cierre: CierreCaso | null;
  puedeEditar: boolean;
  onActualizado: () => void;
}) {
  const galeria = galeriaEvidencias(cierre);
  const [subiendo, setSubiendo] = useState(false);
  const [msg, setMsg] = useState("");

  async function onAgregar(files: FileList | null) {
    if (!files || files.length === 0) return;
    setSubiendo(true); setMsg("Subiendo foto(s)…");
    try {
      let carpetaId = (cliente.carpetaDriveId || "").trim();
      if (!carpetaId) {
        const exp = await generarExpediente(cliente);
        if (!exp.ok || !exp.carpetaId) throw new Error("No se pudo abrir la carpeta de Drive del cliente.");
        carpetaId = exp.carpetaId;
      }
      const nuevas: EvidenciaCierre[] = [];
      for (const file of Array.from(files)) {
        const base64 = await leerBase64(file);
        const up = await subirArchivoDrive({ carpetaId, nombre: file.name, base64, subcarpeta: "Garantías culminadas y entregadas", mime: file.type, publico: true });
        if (up.ok && up.link) nuevas.push({ url: up.link, nombre: up.nombre || file.name });
      }
      if (nuevas.length === 0) throw new Error("No se pudo subir ninguna foto.");
      const r = await agregarEvidencias(cliente.id, nuevas);
      if (!r.ok) throw new Error(r.error || "No se pudo guardar.");
      setMsg(""); onActualizado();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "No se pudo subir.");
    } finally {
      setSubiendo(false);
    }
  }

  async function onQuitar(url: string) {
    if (!confirm("¿Quitar esta foto de la evidencia?\n\nEl archivo se queda guardado en Drive como respaldo.")) return;
    setSubiendo(true); setMsg("Quitando…");
    const r = await quitarEvidencia(cliente.id, url);
    setSubiendo(false); setMsg(r.ok ? "" : (r.error || "No se pudo quitar."));
    if (r.ok) onActualizado();
  }

  return (
    <div className="mt-2 space-y-2">
      {galeria.length === 0 ? (
        <p className="text-[12px] text-humo">Aún no hay foto de evidencia.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {galeria.map((ev) => (
            <div key={ev.url} className="relative">
              <FotoEvidencia url={ev.url} />
              {puedeEditar && (
                <button onClick={() => onQuitar(ev.url)} disabled={subiendo}
                  className="absolute right-2 top-2 rounded-lg bg-white/90 px-2 py-1 text-[12px] font-semibold text-red-600 shadow hover:bg-white disabled:opacity-50"
                  title="Quitar esta foto">🗑️ Quitar</button>
              )}
            </div>
          ))}
        </div>
      )}

      {puedeEditar && (
        <div className="flex items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-emerald-700">
            ➕ Agregar foto(s)
            <input type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => { onAgregar(e.target.files); e.currentTarget.value = ""; }} disabled={subiendo} />
          </label>
          {subiendo && <span className="text-[12px] text-humo">{msg || "Trabajando…"}</span>}
          {!subiendo && msg && <span className="text-[12px] text-red-600">{msg}</span>}
        </div>
      )}
    </div>
  );
}

type Pestana = "ficha" | "cita" | "expediente" | "llamadas" | "correos" | "notas" | "tareas" | "contingencia" | "legal" | "cronologia" | "juridico";

const PESTAÑAS: { key: Pestana; label: string; icono: string }[] = [
  { key: "ficha",    label: "Ficha técnica", icono: "📋" },
  { key: "cita",     label: "Cita",          icono: "🚪" },
  { key: "expediente", label: "Expediente",  icono: "📁" },
  { key: "llamadas", label: "Llamadas",      icono: "📞" },
  { key: "correos",  label: "Correos",       icono: "✉️" },
  { key: "notas",    label: "Notas",         icono: "📝" },
  { key: "tareas",   label: "Tareas",        icono: "✅" },
  { key: "contingencia", label: "Contingencia", icono: "⚠️" },
  { key: "legal",    label: "Convenio", icono: "💰" },
  { key: "cronologia", label: "Cronología",  icono: "🕓" },
  { key: "juridico", label: "Jurídico · JusticiaFácil", icono: "🏛️" },
];

// Qué permiso controla la visibilidad de cada pestaña del expediente.
const TAB_PERMISO: Record<Pestana, AccionClave> = {
  ficha: "ver_exp_ficha",
  cita: "ver_exp_ficha",
  expediente: "ver_exp_expediente",
  llamadas: "ver_exp_llamadas",
  correos: "ver_exp_correos",
  notas: "ver_exp_notas",
  tareas: "ver_exp_tareas",
  contingencia: "ver_exp_legal",
  legal: "ver_exp_legal",
  cronologia: "ver_exp_cronologia",
  juridico: "ver_exp_expediente",
};

function iniciales(nombre: string): string {
  const p = (nombre || "").trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  return (p[0][0] + (p[1]?.[0] || "")).toUpperCase();
}

export default function CrmCliente({ cliente, onCerrar }: { cliente: Cliente; onCerrar: () => void }) {
  const miRol = useMiRol();
  const [tab, setTab] = useState<Pestana>("ficha");
  // Pestañas visibles según el rol. Mientras carga el rol (null), se muestran todas (sin parpadeo).
  const pestVisibles = PESTAÑAS.filter((p) => miRol === null || puedeAccion(miRol, TAB_PERMISO[p.key]));
  useEffect(() => {
    if (miRol !== null && !pestVisibles.some((p) => p.key === tab) && pestVisibles[0]) setTab(pestVisibles[0].key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [miRol]);
  const [c, setC] = useState<Cliente>(cliente);
  const [validando, setValidando] = useState(false);
  useEffect(() => { setC(cliente); }, [cliente]);

  // Si el caso está terminado, traemos el detalle del cierre (para mostrar la evidencia).
  const [cierre, setCierre] = useState<CierreCaso | null>(null);
  useEffect(() => {
    if (cliente.terminado) fetchCierre(cliente.id).then(setCierre).catch(() => setCierre(null));
    else setCierre(null);
  }, [cliente.id, cliente.terminado]);

  const est = estatusDe(c.estatus);
  const origen = origenCliente(c);
  const driveUrl = c.carpetaDriveId ? "https://drive.google.com/drive/folders/" + c.carpetaDriveId : null;

  return (
    <div className="w-full">
      {/* ===== Encabezado ===== */}
      <div className="border-b border-teal/15 bg-gradient-to-r from-teal/10 via-aqua/10 to-transparent px-4 py-4 backdrop-blur-sm sm:px-6">
        <div className="flex w-full items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {/* Foto (Parte 6) — por ahora, avatar con iniciales */}
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-teal-soft text-xl font-extrabold text-teal-dark">
              {iniciales(c.nombre)}
            </div>
            <div className="min-w-0">
              <h2 className="truncate font-display text-2xl font-extrabold text-tinta">{c.nombre || "Sin nombre"}</h2>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[13px] font-semibold text-sky-700">{c.codigo}{CODIGO[c.codigo] ? " · " + CODIGO[c.codigo] : ""}</span>
                {est && <span className={"rounded-full px-2 py-0.5 text-[13px] font-semibold " + est.chip}>{est.label}</span>}
                <span className="rounded-full bg-nube px-2 py-0.5 text-[13px] font-semibold text-tinta">Área: {c.area}</span>
                <span className="rounded-full bg-nube px-2 py-0.5 text-[13px] font-semibold text-tinta">{c.tipo === "cliente" ? "Cliente" : "Prospecto"}</span>
                <span className={"rounded-full px-2 py-0.5 text-[13px] font-semibold " + (origen.enSiga ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>{origen.enSiga ? "🟢 SIGA" : "⚠️ Falta info SIGA"}</span>
              </div>
            </div>
          </div>
          <button onClick={onCerrar} className="shrink-0 rounded-lg border border-black/10 px-3 py-1.5 text-sm font-semibold text-humo hover:bg-nube" aria-label="Volver">← Volver</button>
        </div>

        {/* ===== Pestañas ===== */}
        <div className="mt-3 flex w-full gap-1 overflow-x-auto">
          {pestVisibles.map((p) => (
            <button key={p.key} onClick={() => setTab(p.key)}
              className={"shrink-0 rounded-lg px-3 py-1.5 text-[14px] font-semibold transition " + (tab === p.key ? "bg-teal text-white" : "text-humo hover:bg-nube")}>
              {p.icono} {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ===== Contenido ===== */}
      <div className="px-4 py-5 sm:px-6">
        <div className="w-full space-y-4">

          {/* ===== BANDERA DE CITA =====
              Salta en CUALQUIER pestaña, para que quien conteste el teléfono la
              vea aunque haya entrado a otra cosa. Se apaga sola en cuanto el
              cliente se presenta (validacionPresencialEn deja de ser nulo). */}
          {c.requiereCitaSucursal && !c.validacionPresencialEn && (
            <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] font-extrabold text-amber-900">🚪 Este cliente debe presentarse en sucursal</span>
                {c.sucursal && <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[13px] font-semibold text-amber-900">{c.sucursal}</span>}
              </div>
              <p className="mt-1 text-[14px] text-amber-900">
                Tiene devolución abierta y sus datos no están validados. Antes de habilitarle la Solicitud
                Formal o el Convenio, tiene que venir en persona con sus documentos originales.
                <b> Si te está llamando ahora, aprovecha y agéndale la cita.</b>
              </p>
              {c.citaSucursalMotivo && (
                <p className="mt-1.5 whitespace-pre-wrap rounded-lg bg-white/70 px-2.5 py-1.5 text-[13px] text-amber-900">{c.citaSucursalMotivo}</p>
              )}
              <button onClick={() => setTab("cita")}
                className="mt-2 rounded-lg bg-amber-700 px-3 py-1.5 text-[14px] font-semibold text-white hover:bg-amber-800">
                📅 Ir a agendar la cita
              </button>
            </div>
          )}

          {c.terminado && (
            <div className={"rounded-2xl border px-4 py-3 " + (c.terminadoTipo === "entrega" ? "border-emerald-200 bg-emerald-50" : "border-teal/30 bg-teal-soft/40")}>
              {c.terminadoTipo === "entrega" ? (
                <>
                  <p className="text-[15px] font-bold text-emerald-800">🎉 🏠 Garantía culminada y entregada</p>
                  {cierre?.nota && <p className="mt-0.5 text-[13px] text-emerald-900/80">{cierre.nota}</p>}
                  <GaleriaEvidencia
                    cliente={c}
                    cierre={cierre}
                    puedeEditar={puedeAccion(miRol, "terminar_caso")}
                    onActualizado={() => fetchCierre(c.id).then(setCierre).catch(() => {})}
                  />
                  {cierre?.terminado_por && <p className="mt-1.5 text-[11px] text-emerald-900/60">Cerró: {cierre.terminado_por}</p>}
                </>
              ) : (
                <>
                  <p className="text-[15px] font-bold text-teal-dark">💰 Devolución registrada</p>
                  <div className="mt-1 flex flex-wrap gap-2 text-[13px]">
                    {cierre?.total != null && <span className="rounded-full bg-white px-2.5 py-0.5 font-semibold text-tinta">Total: ${Number(cierre.total).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>}
                    {cierre?.con_compensacion != null && <span className="rounded-full bg-white px-2.5 py-0.5 font-semibold text-tinta">{cierre.con_compensacion ? "Con compensación" : "Sin compensación"}{cierre.con_compensacion && cierre.compensacion != null ? `: $${Number(cierre.compensacion).toLocaleString("es-MX", { minimumFractionDigits: 2 })}` : ""}</span>}
                    {cierre?.forma_pago && <span className="rounded-full bg-white px-2.5 py-0.5 font-semibold text-tinta">{cierre.forma_pago === "abonos" ? "En abonos" : "Una sola exhibición"}{cierre.manera_pago ? ` · ${cierre.manera_pago}` : ""}</span>}
                  </div>

                  {/* Desglose de valores */}
                  {(cierre?.val_apartado != null || cierre?.val_firma != null || cierre?.val_formalizaciones != null || cierre?.val_otros != null) && (
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[12.5px] text-teal-dark/90">
                      {cierre?.val_apartado != null && <span>Apartado: <b>${Number(cierre.val_apartado).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</b></span>}
                      {cierre?.val_firma != null && <span>Firma: <b>${Number(cierre.val_firma).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</b></span>}
                      {cierre?.val_formalizaciones != null && <span>Formalizaciones: <b>${Number(cierre.val_formalizaciones).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</b></span>}
                      {cierre?.val_otros != null && <span>Otros: <b>${Number(cierre.val_otros).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</b></span>}
                    </div>
                  )}

                  {/* Comprobante de exhibición única */}
                  {cierre?.forma_pago === "exhibicion" && cierre?.evidencia?.url && (
                    <a href={cierre.evidencia.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-teal px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-teal-dark">📎 Ver comprobante</a>
                  )}

                  {/* Lista de abonos */}
                  {cierre?.forma_pago === "abonos" && cierre?.abonos && cierre.abonos.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <p className="text-[12px] font-semibold text-teal-dark">Abonos ({cierre.abonos.length}):</p>
                      {cierre.abonos.map((ab, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1 text-[12.5px]">
                          <span className="text-tinta"><b>${Number(ab.monto).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</b> · {ab.fecha}{ab.manera ? ` · ${ab.manera}` : ""}</span>
                          {ab.evidencia?.url && <a href={ab.evidencia.url} target="_blank" rel="noreferrer" className="shrink-0 font-semibold text-teal hover:underline">📎 Ver</a>}
                        </div>
                      ))}
                    </div>
                  )}

                  {cierre?.nota && <p className="mt-1.5 text-[13px] text-teal-dark/80">{cierre.nota}</p>}
                  {cierre?.terminado_por && <p className="mt-1.5 text-[11px] text-teal-dark/60">Cerró: {cierre.terminado_por}</p>}
                </>
              )}
            </div>
          )}

          {tab === "ficha" && (
            <>
              {c.codigo === "R3" && (
                <PanelR3 cliente={c} puedeEditar={puedeAccion(miRol, "editar_ficha")}
                  onCambio={(r3Tipo, r3Seguimiento) => setC((prev) => ({ ...prev, r3Tipo, r3Seguimiento }))} />
              )}
              {/* Acciones y estado del cliente (agrupados, ya no regados) */}
              <div className="space-y-2.5 rounded-2xl border border-black/5 bg-white p-3 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-wider text-humo">Acciones</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {puedeAccion(miRol, "editar_ficha") && (
                    <button onClick={() => setValidando(true)} className="flex items-center justify-between gap-2 rounded-xl border border-dorado/40 bg-dorado/10 px-3 py-2.5 text-left hover:bg-dorado/20">
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-tinta">📝 Validar / actualizar datos</p>
                        <p className="text-[11px] text-humo">Cuando el cliente lo solicite o un dato esté mal.</p>
                      </div>
                    </button>
                  )}
                  <button onClick={() => setTab("contingencia")} className="flex items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50/50 px-3 py-2.5 text-left hover:bg-red-50">
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-tinta">⚠️ Contingencia</p>
                      <p className="text-[11px] text-humo">Demandas y quejas.</p>
                    </div>
                    <span className="shrink-0 font-semibold text-red-600">→</span>
                  </button>
                  <button onClick={() => setTab("legal")} className="flex items-center justify-between gap-2 rounded-xl border border-teal/20 bg-teal-soft/30 px-3 py-2.5 text-left hover:bg-teal-soft/50">
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-tinta">💰 Convenio de devolución</p>
                      <p className="text-[11px] text-humo">Convenio, abonos y compensación.</p>
                    </div>
                    <span className="shrink-0 font-semibold text-teal">→</span>
                  </button>
                </div>
                <IndicadorSolicitudDevolucion cliente={c} />
              </div>

              <Seccion titulo="Datos personales">
                <Dato label="Nombre completo" valor={c.nombre} ancho />
                <Dato label="CURP / RFC" valor={c.curpRfc} />
                <Dato label="Identificación (INE)" valor={c.ine} />
                <Dato label="Estado civil" valor={c.estadoCivil} />
                <Dato label="Cónyuge" valor={c.conyuge} />
                <Dato label="Teléfono" valor={c.telefono} />
                <Dato label="Teléfono 2" valor={c.telefono2} />
                <Dato label="WhatsApp" valor={c.whatsapp} />
                <Dato label="Email" valor={c.email} />
                <Dato label="Domicilio" valor={c.domicilio} ancho />
                <Dato label="Cómo nos conoció" valor={c.comoConocio} />
                <Dato label="Quién lo refirió" valor={c.refirio} />
              </Seccion>

              <Seccion titulo="Contacto autorizado">
                <Dato label="Nombre" valor={c.autorizadoNombre} />
                <Dato label="Teléfono" valor={c.autorizadoTelefono} />
                <Dato label="Correo" valor={c.autorizadoCorreo} />
              </Seccion>

              <Seccion titulo="Asesor a cargo">
                <Dato label="Asesor" valor={c.asesorAsignado} />
                <Dato label="Correo del asesor" valor={c.asesorCorreo} />
                <Dato label="Asignado por" valor={c.asesorAsignadoPor} />
                <Dato label="Fecha de asignación" valor={c.fechaAsignacion} />
                <Dato label="Asesores anteriores" valor={c.historialAsesores?.length ? c.historialAsesores.map((h) => h.nombre).join(", ") : ""} ancho />
              </Seccion>

              <ResumenContrato cliente={c} />

              <Seccion titulo="💵 Pagos y valores">
                <Dato label="Valor a la firma del contrato" valor={c.valorFirma} />
                <Dato label="Monto de apartado" valor={c.montoApartado} />
                <Dato label="Segundos pagos" valor={c.segundosPagos} ancho />
                <Dato label="Pago de cesión" valor={c.pagoCesion} />
                <Dato label="Pago de escritura (formalización)" valor={c.pagoEscritura} />
                <Dato label="Pago de gestoría" valor={c.pagoGestoria} />
                <Dato label="Otros pagos" valor={c.otrosPagos} ancho />
              </Seccion>

              <Seccion titulo="Vínculos y SIGA">
                <Dato label="Folio de registro" valor={c.folio} />
                <Dato label="ID Prospecto" valor={c.prospecto} />
                <Dato label="Garantía ligada" valor={c.garantia} />
                <Dato label="Dirección de la garantía" valor={c.direccionGarantia} ancho />
                <Dato label="Folio SIGA" valor={c.folioSiga} />
                <Dato label="Folio garantía SIGA" valor={c.folioGarantiaSiga} />
                <Dato label="Crédito SIGA" valor={c.creditoSiga} />
                <Dato label="Expediente" valor={c.expediente} />
                <Dato label="Fecha de firma" valor={c.fechaFirma} />
                <Dato label="Sucursal" valor={c.sucursal} />
                <Dato label="Folio de cierre" valor={c.folioCierre} />
                <Dato label="Fecha de conversión" valor={c.fechaConversion} />
                <Dato label="Convertido por" valor={c.convertidoPor} />
              </Seccion>

              <Seccion titulo="Expediente en Drive">
                <Dato label="Etapa de la carpeta" valor={c.carpetaDriveEtapa} />
                <div>
                  <div className="text-[13px] font-semibold uppercase tracking-wide text-humo">Carpeta</div>
                  {driveUrl ? (
                    <a href={driveUrl} target="_blank" rel="noreferrer" className="mt-0.5 inline-block text-sm font-semibold text-teal underline">📂 Abrir carpeta en Drive</a>
                  ) : (
                    <div className="mt-0.5 text-sm text-humo/60">Aún sin carpeta</div>
                  )}
                </div>
              </Seccion>
            </>
          )}

          {tab === "cita" && <PanelCita cliente={c} />}
          {tab === "expediente" && <PanelExpediente cliente={c} />}
          {tab === "llamadas" && <PanelLlamadas cliente={c} />}
          {tab === "correos" && <PanelCorreos cliente={c} />}
          {tab === "notas" && <PanelNotas cliente={c} />}
          {tab === "tareas" && <PanelTareas cliente={c} />}
          {tab === "contingencia" && <PanelContingencia cliente={c} />}
          {tab === "legal" && <PanelConvenio cliente={c} />}
          {tab === "cronologia" && <PanelCronologia cliente={c} />}
          {tab === "juridico" && <PanelJuridico cliente={c} />}

        </div>
      </div>

      {validando && (
        <AsistenteValidacion
          cliente={c}
          onCerrar={() => setValidando(false)}
          onGuardado={(cambios) => { setC((prev) => ({ ...prev, ...cambios })); setValidando(false); }}
          onCambioCodigo={(codigo, area) => { setC((prev) => ({ ...prev, codigo, area })); }}
        />
      )}
    </div>
  );
}

// 👇 NUEVO (Mejora A): calcula el vencimiento del contrato = fecha de firma + 14 meses, contra HOY.
function infoVencimiento(fechaFirma: string): { vencido: boolean; venceTxt: string; meses: number } | null {
  if (!fechaFirma) return null;
  const firma = new Date(fechaFirma + "T00:00:00");
  if (isNaN(firma.getTime())) return null;
  const vence = new Date(firma);
  vence.setMonth(vence.getMonth() + 14);
  const hoy = new Date();
  const meses = (hoy.getFullYear() - vence.getFullYear()) * 12 + (hoy.getMonth() - vence.getMonth());
  const vencido = hoy.getTime() >= vence.getTime();
  const venceTxt = vence.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });
  return { vencido, venceTxt, meses: Math.abs(meses) };
}

// 👇 NUEVO (Mejora B): panel del indicador R3 (cómo cerró + si sigue con seguimiento).
function PanelR3({ cliente, puedeEditar, onCambio }: {
  cliente: Cliente;
  puedeEditar: boolean;
  onCambio: (r3Tipo: string, r3Seguimiento: boolean) => void;
}) {
  const [tipo, setTipo] = useState(cliente.r3Tipo || "");
  const [seg, setSeg] = useState(cliente.r3Seguimiento);
  const [guardando, setGuardando] = useState(false);
  const [ok, setOk] = useState(false);

  async function guardar(nuevoTipo: string, nuevoSeg: boolean) {
    setTipo(nuevoTipo); setSeg(nuevoSeg);
    if (!puedeEditar) return;
    setGuardando(true); setOk(false);
    const r = await guardarIndicadorR3(String(cliente.id), nuevoTipo, nuevoSeg);
    setGuardando(false);
    if (r) { setOk(true); onCambio(nuevoTipo, nuevoSeg); setTimeout(() => setOk(false), 1500); }
  }

  const btn = (activo: boolean) =>
    "rounded-lg px-3 py-1.5 text-[13px] font-semibold border disabled:opacity-50 " +
    (activo ? "bg-teal text-white border-teal" : "bg-white text-humo border-black/10 hover:bg-nube");

  return (
    <div className="rounded-2xl border border-teal/30 bg-teal-soft/30 px-4 py-3">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-bold text-tinta">🏁 Estado del cambio (R3)</p>
        {guardando && <span className="text-[12px] text-humo">Guardando…</span>}
        {ok && <span className="text-[12px] font-semibold text-teal-dark">✓ Guardado</span>}
      </div>

      {(cliente.r3DireccionNueva || cliente.r3ValorNuevo || cliente.r3Terminos) && (
        <div className="mt-2 grid gap-0.5 rounded-xl bg-white/70 px-3 py-2 text-[12.5px] text-tinta">
          {cliente.r3DireccionNueva && <span>📍 <b>Nueva dirección:</b> {cliente.r3DireccionNueva}</span>}
          {cliente.r3ValorNuevo && <span>💲 <b>Valor nuevo:</b> {cliente.r3ValorNuevo}</span>}
          {cliente.r3Terminos && <span className="whitespace-pre-wrap">📝 <b>Términos:</b> {cliente.r3Terminos}</span>}
          {cliente.r3DocCambio?.url && <VistaPreviaDoc url={cliente.r3DocCambio.url} nombre={cliente.r3DocCambio.nombre} etiqueta="👁️ Ver contrato (solicitud de cambio)" />}
        </div>
      )}

      <p className="mt-2 text-[13px] font-semibold text-humo">¿Cómo cerró?</p>
      <div className="mt-1 flex flex-wrap gap-2">
        <button disabled={!puedeEditar} onClick={() => guardar("entrega", seg)} className={btn(tipo === "entrega")}>🏠 Entrega (culminación)</button>
        <button disabled={!puedeEditar} onClick={() => guardar("devolucion", seg)} className={btn(tipo === "devolucion")}>💸 Devolución</button>
      </div>

      <p className="mt-3 text-[13px] font-semibold text-humo">¿Sigue con seguimiento?</p>
      <div className="mt-1 flex flex-wrap gap-2">
        <button disabled={!puedeEditar} onClick={() => guardar(tipo, true)} className={btn(seg === true)}>📌 Sí · pendiente (escrituración/formalización)</button>
        <button disabled={!puedeEditar} onClick={() => guardar(tipo, false)} className={btn(seg === false)}>✅ No · ya terminó del todo</button>
      </div>

      <p className={"mt-3 rounded-lg px-3 py-2 text-[12.5px] " + (seg ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800")}>
        {seg
          ? "📋 Sigue en la lista de seguimiento (tiene proceso pendiente)."
          : "🎉 Ya no entra en la lista del día (cambio terminado del todo)."}
      </p>
    </div>
  );
}

// ── Asistente "Rellenar y validar datos" (por fases) ─────────
const FASES_VALIDACION: { titulo: string; icono: string; campos: { key: keyof CamposClienteEditables; label: string; ancho?: boolean }[] }[] = [
  {
    titulo: "Datos personales", icono: "🧑",
    campos: [
      { key: "nombre", label: "Nombre completo", ancho: true },
      { key: "curpRfc", label: "CURP / RFC" },
      { key: "ine", label: "Identificación (INE)" },
      { key: "estadoCivil", label: "Estado civil" },
      { key: "conyuge", label: "Cónyuge" },
      { key: "domicilio", label: "Domicilio", ancho: true },
    ],
  },
  {
    titulo: "Contacto", icono: "📞",
    campos: [
      { key: "telefono", label: "Teléfono" },
      { key: "telefono2", label: "Teléfono 2" },
      { key: "whatsapp", label: "WhatsApp" },
      { key: "email", label: "Email" },
      { key: "autorizadoNombre", label: "Autorizado · Nombre" },
      { key: "autorizadoTelefono", label: "Autorizado · Teléfono" },
      { key: "autorizadoCorreo", label: "Autorizado · Correo", ancho: true },
    ],
  },
  {
    titulo: "Garantía y crédito", icono: "🏠",
    campos: [
      { key: "direccionGarantia", label: "Dirección de la garantía", ancho: true },
      { key: "creditoSiga", label: "Número de crédito" },
      { key: "folioSiga", label: "Folio SIGA" },
      { key: "folioGarantiaSiga", label: "Folio garantía SIGA" },
      { key: "sucursal", label: "Sucursal" },
    ],
  },
  {
    titulo: "Pagos y valores", icono: "💵",
    campos: [
      { key: "valorFirma", label: "Valor a la firma del contrato" },
      { key: "montoApartado", label: "Monto de apartado" },
      { key: "segundosPagos", label: "¿Tiene segundos pagos? (detalle)", ancho: true },
      { key: "pagoCesion", label: "Pago de cesión" },
      { key: "pagoEscritura", label: "Pago de escritura (formalización)" },
      { key: "pagoGestoria", label: "Pago de gestoría" },
      { key: "otrosPagos", label: "Otros pagos", ancho: true },
    ],
  },
];

function AsistenteValidacion({ cliente, onCerrar, onGuardado, onCambioCodigo }: {
  cliente: Cliente;
  onCerrar: () => void;
  onGuardado: (cambios: CamposClienteEditables) => void;
  onCambioCodigo?: (codigo: Codigo, area: Area) => void;
}) {
  const inicial: CamposClienteEditables = {
    nombre: cliente.nombre || "", curpRfc: cliente.curpRfc || "", ine: cliente.ine || "", estadoCivil: cliente.estadoCivil || "", conyuge: cliente.conyuge || "", domicilio: cliente.domicilio || "",
    telefono: cliente.telefono || "", telefono2: cliente.telefono2 || "", whatsapp: cliente.whatsapp || "", email: cliente.email || "",
    autorizadoNombre: cliente.autorizadoNombre || "", autorizadoTelefono: cliente.autorizadoTelefono || "", autorizadoCorreo: cliente.autorizadoCorreo || "",
    direccionGarantia: cliente.direccionGarantia || "", creditoSiga: cliente.creditoSiga || "", folioSiga: cliente.folioSiga || "", folioGarantiaSiga: cliente.folioGarantiaSiga || "", sucursal: cliente.sucursal || "",
    fechaFirma: cliente.fechaFirma || "",
    valorFirma: cliente.valorFirma || "", montoApartado: cliente.montoApartado || "", segundosPagos: cliente.segundosPagos || "", pagoCesion: cliente.pagoCesion || "", pagoEscritura: cliente.pagoEscritura || "", pagoGestoria: cliente.pagoGestoria || "", otrosPagos: cliente.otrosPagos || "",
  };
  const [f, setF] = useState<CamposClienteEditables>(inicial);
  const [fase, setFase] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = FASES_VALIDACION.length;
  const actual = FASES_VALIDACION[fase];
  const esUltima = fase === total - 1;
  const venc = infoVencimiento(f.fechaFirma);                 // 👈 NUEVO (Mejora A)
  const esGarantia = actual.titulo === "Garantía y crédito";  // 👈 NUEVO (Mejora A)

  function set(k: keyof CamposClienteEditables, v: string) { setF((p) => ({ ...p, [k]: v })); }

  async function siguiente() {
    if (!esUltima) { setFase((x) => x + 1); return; }
    // Última fase: guardar + registrar en cronología.
    setGuardando(true); setError(null);
    const ok = await actualizarCliente(String(cliente.id), f);
    if (!ok) { setGuardando(false); setError("No se pudo guardar. Reintenta."); return; }
    const yo = (() => { try { return JSON.parse(localStorage.getItem("chat_yo") || "null")?.nombre || null; } catch { return null; } })();
    await registrarComunicacion({
      clienteId: String(cliente.id), clienteNombre: f.nombre || cliente.nombre, tipo: "nota",
      detalle: `✅ Información validada por fases (Datos personales · Contacto · Garantía y crédito).`,
      autor: yo,
    });
    setGuardando(false);
    onGuardado(f);
  }

  // 👇 NUEVO (Mejora A): guarda la fecha y cambia el código a R1 (contrato vencido).
  async function pasarAR1() {
    setGuardando(true); setError(null);
    await actualizarCliente(String(cliente.id), { fechaFirma: f.fechaFirma }); // que la fecha quede guardada
    const ok = await cambiarCodigoCliente(String(cliente.id), "R1", "RAC");
    if (!ok) { setGuardando(false); setError("No se pudo cambiar el código. Reintenta."); return; }
    const yo = (() => { try { return JSON.parse(localStorage.getItem("chat_yo") || "null")?.nombre || null; } catch { return null; } })();
    await registrarComunicacion({
      clienteId: String(cliente.id), clienteNombre: f.nombre || cliente.nombre, tipo: "nota",
      detalle: `⚠️ Contrato vencido (firma + 14 meses). Reclasificado a R1 (seguimiento RAC).`,
      autor: yo,
    });
    setGuardando(false);
    onCambioCodigo?.("R1", "RAC");
    onCerrar();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 p-4" onClick={guardando ? undefined : onCerrar}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-display text-base font-extrabold text-tinta">📝 Validar / actualizar datos</h2>
            <p className="text-[11.5px] text-humo">Para cuando el cliente solicite un cambio o un dato esté mal y haya que corregirlo.</p>
          </div>
          <button onClick={onCerrar} disabled={guardando} className="rounded-lg px-2 py-1 text-humo hover:bg-nube disabled:opacity-50" aria-label="Cerrar">✕</button>
        </div>

        {/* Progreso por fases */}
        <div className="mt-3 flex gap-1.5">
          {FASES_VALIDACION.map((fs, i) => (
            <div key={fs.titulo} className="flex-1">
              <div className={"h-1.5 rounded-full " + (i <= fase ? "bg-teal" : "bg-nube")} />
            </div>
          ))}
        </div>
        <p className="mt-2 text-[13px] font-semibold text-teal-dark">{actual.icono} Fase {fase + 1} de {total} · {actual.titulo}</p>

        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          {actual.campos.map((cp) => (
            <label key={cp.key} className={"block text-[13px] font-semibold text-humo " + (cp.ancho ? "sm:col-span-2" : "")}>
              {cp.label}
              <input value={f[cp.key]} onChange={(e) => set(cp.key, e.target.value)}
                className="mt-0.5 w-full rounded-lg border border-black/10 px-2.5 py-1.5 text-sm outline-none focus:border-teal" />
            </label>
          ))}
        </div>

        {/* 👇 NUEVO (Mejora A): fecha de firma + cálculo de vencimiento (solo en la fase de Garantía) */}
        {esGarantia && (
          <div className="mt-3 rounded-xl border border-black/10 p-3">
            <label className="block text-[13px] font-semibold text-humo">
              📅 Fecha de firma del contrato
              <input type="date" value={f.fechaFirma} onChange={(e) => set("fechaFirma", e.target.value)}
                className="mt-0.5 w-full rounded-lg border border-black/10 px-2.5 py-1.5 text-sm outline-none focus:border-teal" />
            </label>

            {!venc && (
              <p className="mt-2 text-[12.5px] text-humo">Captura la fecha de firma para calcular el vencimiento.</p>
            )}

            {venc && !venc.vencido && (
              <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-800">
                ✅ <b>Contrato vigente</b> · vence el {venc.venceTxt} (faltan ~{venc.meses} {venc.meses === 1 ? "mes" : "meses"}).
              </div>
            )}

            {venc && venc.vencido && (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-[12.5px] font-semibold text-amber-800">⚠️ Contrato vencido</p>
                <p className="mt-0.5 text-[12.5px] text-amber-800">
                  Venció el {venc.venceTxt} (firma + 14 meses) · hace ~{venc.meses} {venc.meses === 1 ? "mes" : "meses"}.
                  {cliente.codigo !== "R1" && <> Conviene pasarlo a <b>R1</b> (seguimiento RAC).</>}
                </p>
                {cliente.codigo !== "R1" && (
                  <button onClick={pasarAR1} disabled={guardando}
                    className="mt-2 rounded-lg bg-amber-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
                    {guardando ? "Cambiando…" : "→ Pasar a R1"}
                  </button>
                )}
                {cliente.codigo === "R1" && <p className="mt-1 text-[12px] text-amber-700">Ya está marcado como R1.</p>}
              </div>
            )}
          </div>
        )}

        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>}

        <div className="mt-4 flex gap-2">
          {fase > 0 && (
            <button onClick={() => setFase((x) => x - 1)} disabled={guardando} className="rounded-xl px-3 py-2 text-sm font-semibold text-humo hover:bg-nube disabled:opacity-50">← Atrás</button>
          )}
          <button onClick={siguiente} disabled={guardando} className="flex-1 rounded-xl bg-teal px-3 py-2 text-sm font-semibold text-white hover:bg-teal-dark disabled:opacity-50">
            {guardando ? "Guardando…" : esUltima ? "✅ Validar y guardar" : "Validar y siguiente →"}
          </button>
        </div>
      </div>
    </div>
  );
}
