// ===================================================================
// Pestaña EXPEDIENTE del CRM  →  src/modules/CrmCliente/PanelExpediente.tsx
// Documentos por código del cliente. Cada documento: estado, valores (si
// aplican), subir VARIOS archivos con nombre, vista previa, vínculo SIGA.
// Archivos → Drive (subir-grabacion, carpeta del cliente). Datos → Supabase.
// SVT · Contrato · Pre-dictaminar · Recibos · Cambio (RV/R1/R3).
// ===================================================================
import { useEffect, useRef, useState } from "react";
import type { Cliente } from "../../data/clientes";
import { leerCarpetaDrive } from "../../data/clientes";
import {
  fetchExpediente,
  guardarDoc,
  subirArchivoDrive,
  type DocExpediente,
  type ArchivoDoc,
  type EstadoDoc,
} from "../../data/expedienteDocs";
import { generarExpediente } from "../../data/expediente";
import { supabase } from "../../lib/supabase";
import { fetchPerfil } from "../../data/usuarios";
import { puedeAccion } from "../../data/roles";

// ¿Quién soy? (rol) para aplicar permisos de subida de documentos.
function useMiRol(): string | null {
  const [rol, setRol] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const email = data.session?.user?.email;
      if (email) fetchPerfil(email).then((pf) => setRol(pf?.rol ?? null)).catch(() => {});
    });
  }, []);
  return rol;
}

type EstadoOpt = { v: EstadoDoc; label: string; chip: string };

export type SlotDef = {
  clave: string;
  titulo: string;
  icono: string;
  estados?: EstadoOpt[];
  conValor?: boolean;
  conValorFirma?: boolean;
  conTiempo?: boolean;
  conNota?: boolean;
  notaLabel?: string;
  conTerminos?: boolean;
  conOrigen?: boolean;       // administradora / banco / vendedor
  conValidacion?: boolean;
  conFecha?: boolean;
  obligatorio?: boolean;
  critico?: boolean;        // 🔒 requiere el permiso "docs_criticos" para tocarse
};
type Grupo = { titulo: string; slots: SlotDef[] };

const ESTADOS_BASE: EstadoOpt[] = [
  { v: "en_espera", label: "En espera", chip: "bg-amber-100 text-amber-700" },
  { v: "existe", label: "Existe", chip: "bg-emerald-100 text-emerald-700" },
];
const ESTADOS_DICTAMEN: EstadoOpt[] = [
  { v: "en_espera", label: "🟡 En espera", chip: "bg-amber-100 text-amber-700" },
  { v: "positivo", label: "🟢 Positivo", chip: "bg-emerald-100 text-emerald-700" },
  { v: "negativo", label: "🔴 Negativo", chip: "bg-red-100 text-red-700" },
];
const ESTADOS_CUENTAS: EstadoOpt[] = [
  { v: "en_espera", label: "Pendiente", chip: "bg-amber-100 text-amber-700" },
  { v: "validado", label: "Aprobada y entregada", chip: "bg-emerald-100 text-emerald-700" },
];
const ESTADOS_SINO: EstadoOpt[] = [
  { v: "en_espera", label: "Pendiente", chip: "bg-amber-100 text-amber-700" },
  { v: "existe", label: "✓ Sí", chip: "bg-emerald-100 text-emerald-700" },
  { v: "no", label: "✗ No", chip: "bg-red-100 text-red-700" },
];

// Catálogo de documentos según el código (acumulativo).
export function gruposDeCodigo(codigo: string): Grupo[] {
  const esSVT = codigo === "SVT";

  const preDict: SlotDef[] = [
    { clave: "apartado", titulo: "Apartado", icono: "💵", conValor: true },
    { clave: "aml", titulo: "AML", icono: "🛡️" },
    { clave: "kyc", titulo: "KYC", icono: "🛡️" },
  ];
  if (!esSVT) {
    preDict.push(
      { clave: "juridico", titulo: "Jurídico", icono: "⚖️" },
      { clave: "rppc", titulo: "RPPC", icono: "🏛️" },
      { clave: "antecedentes", titulo: "Antecedentes", icono: "📚" },
      { clave: "carta_propuesta", titulo: "Carta propuesta", icono: "✉️", conOrigen: true, critico: true },
      { clave: "dictamen_juridico", titulo: "Dictamen jurídico", icono: "⚖️", estados: ESTADOS_DICTAMEN, critico: true },
      { clave: "dictamen_registral", titulo: "Dictamen registral", icono: "🏛️", estados: ESTADOS_DICTAMEN, critico: true },
      { clave: "cuentas_pagos", titulo: "Cuentas para pagos", icono: "🏦", estados: ESTADOS_CUENTAS, conValidacion: true, critico: true },
    );
  }

  const grupos: Grupo[] = [
    {
      titulo: "Documentos del cliente",
      slots: [
        { clave: "rfc", titulo: "RFC", icono: "🪪", obligatorio: true },
        { clave: "ine", titulo: "INE", icono: "🪪", obligatorio: true }, // 👈 obligatorio para RDC
        { clave: "curp", titulo: "CURP", icono: "🪪", obligatorio: true }, // 👈 obligatorio para RDC
        { clave: "comprobante_domicilio", titulo: "Comprobante de domicilio", icono: "🏠", obligatorio: true }, // 👈 obligatorio para RDC
      ],
    },
    { titulo: "Documentos para pre-dictaminar", slots: preDict },
  ];

  if (!esSVT) {
    grupos.push({
      titulo: "Contrato",
      slots: [
        {
          clave: "contrato", titulo: "Contrato", icono: "📄",
          conNota: true, notaLabel: "Tipo de contrato",
          conFecha: true,
          conValor: true, conValorFirma: true, conTiempo: true, conTerminos: true,
          obligatorio: true,
          critico: true,
        },
        { clave: "contrato_confidencialidad", titulo: "Contrato de confidencialidad", icono: "🤐" },
      ],
    });
    grupos.push({
      titulo: "Pagos",
      slots: [{ clave: "recibos_pago", titulo: "Recibos de pago", icono: "🧾" }],
    });
  }

  if (["R2", "R2C", "R3"].includes(codigo)) {
    grupos.push({
      titulo: "Formalización",
      slots: [
        { clave: "notaria", titulo: "Datos de notaría", icono: "🏛️", conNota: true, notaLabel: "Datos de notaría" },
        { clave: "cesion_derechos", titulo: "Cesión de derechos", icono: "📜", estados: ESTADOS_SINO },
        { clave: "testimonio_cesion", titulo: "Testimonio de cesión", icono: "📃" },
        { clave: "escritura", titulo: "Escritura", icono: "📜", estados: ESTADOS_SINO },
        { clave: "actuaciones", titulo: "Actuaciones jurídicas y evidencia procesal", icono: "⚖️" },
        { clave: "boletin_judicial", titulo: "Boletín judicial semanal", icono: "📰", obligatorio: true },
      ],
    });
  }

  // Informes que la empresa le entrega al cliente por escrito. El PDF vive en
  // su carpeta de Drive y desde aquí se abre con un clic, igual que el resto
  // de los documentos del expediente.
  grupos.push({
    titulo: "Informes al cliente",
    slots: [
      {
        clave: "informe_proceso",
        titulo: "Informe del proceso y estado de contrato",
        icono: "📑",
        conFecha: true,
        conNota: true,
        notaLabel: "Resumen del informe",
      },
    ],
  });

  return grupos;
}

// Sub-documentos del CAMBIO (segunda ronda, espacios nuevos).
const CAMBIO_SOLICITUD: SlotDef[] = [
  { clave: "carta_cambio", titulo: "Carta de intención de cambio", icono: "📝", conFecha: true },
  { clave: "contrato_cambio", titulo: "Contrato de cambio", icono: "📄", conFecha: true, conValor: true, conValorFirma: true, conTiempo: true, conTerminos: true, obligatorio: true, critico: true },
  { clave: "carta_propuesta_cambio", titulo: "Carta propuesta nueva", icono: "✉️", conOrigen: true, critico: true },
];
const CAMBIO_DICTAMINAR: SlotDef[] = [
  { clave: "dictamen_juridico_cambio", titulo: "Dictamen jurídico (cambio)", icono: "⚖️", estados: ESTADOS_DICTAMEN, critico: true },
  { clave: "dictamen_registral_cambio", titulo: "Dictamen registral (cambio)", icono: "🏛️", estados: ESTADOS_DICTAMEN, critico: true },
  { clave: "antecedentes_cambio", titulo: "Antecedentes (cambio)", icono: "📚" },
  { clave: "docs_adm_cambio", titulo: "Docs. administradora / banco / vendedor", icono: "📁", conOrigen: true },
];

function leerBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] || "");
    r.onerror = () => rej(new Error("No se pudo leer el archivo"));
    r.readAsDataURL(file);
  });
}

function yoNombre(): string | null {
  try { return JSON.parse(localStorage.getItem("chat_yo") || "null")?.nombre || null; } catch { return null; }
}

function pesos(n: number | null | undefined): string {
  if (n == null) return "";
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
}

// ── Campo editable compacto (toca para editar) ──────────────
function CampoInline({ label, display, raw, onGuardar, soloLectura }: {
  label: string; display: string; raw: string; onGuardar: (v: string) => void;
  soloLectura?: boolean;   // 🔒 documento crítico sin permiso: se ve, no se edita
}) {
  const [edit, setEdit] = useState(false);
  const [tmp, setTmp] = useState("");
  // Sin permiso: se muestra el dato tal cual, sin botón de editar.
  if (soloLectura) {
    return (
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-humo">{label}</div>
        <div className="mt-0.5 truncate text-[13px] font-semibold text-humo">{display || "—"}</div>
      </div>
    );
  }
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-humo">{label}</div>
      {edit ? (
        <div className="mt-0.5 flex items-center gap-1">
          <input value={tmp} onChange={(e) => setTmp(e.target.value)} autoFocus
            className="w-full rounded-lg border border-black/10 px-2 py-1 text-[13px] outline-none focus:border-teal" />
          <button onClick={() => { onGuardar(tmp); setEdit(false); }} className="shrink-0 rounded-lg bg-teal px-2 py-1 text-[11px] font-semibold text-white">OK</button>
        </div>
      ) : (
        <button onClick={() => { setTmp(raw); setEdit(true); }} className="mt-0.5 block w-full truncate text-left text-[13px] font-semibold text-tinta hover:underline">
          {display || <span className="text-teal">+ Agregar</span>}
        </button>
      )}
    </div>
  );
}

// ── Tarjeta de un documento ─────────────────────────────────
function TarjetaDocumento({ cliente, def, doc, onCambio, onPreview }: {
  cliente: Cliente;
  def: SlotDef;
  doc: DocExpediente | undefined;
  onCambio: (d: DocExpediente) => void;
  onPreview: (a: ArchivoDoc) => void;
}) {
  const miRol = useMiRol();
  // 🔒 Candado de documentos críticos (contrato, carta propuesta, dictámenes,
  //    cuentas de pago y sus versiones "de cambio"). Si el documento está
  //    marcado como crítico y este rol NO tiene el permiso "docs_criticos",
  //    la tarjeta queda de solo lectura COMPLETA: no se sube, no se cambia el
  //    estado, no se editan valores ni términos, y no se quitan archivos.
  const bloqueado = !!def.critico && !puedeAccion(miRol, "docs_criticos");
  const puedeSubir = puedeAccion(miRol, "subir_documentos") && !bloqueado;
  const [subiendo, setSubiendo] = useState(false);
  const [sigaAbierto, setSigaAbierto] = useState(false);
  const [sigaTmp, setSigaTmp] = useState(doc?.sigaLink || "");
  const [verTerminos, setVerTerminos] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const archivos = doc?.archivos || [];
  const opciones = def.estados || ESTADOS_BASE;
  const estado: EstadoDoc = doc?.estado || opciones[0].v;
  const carpeta = cliente.carpetaDriveId;
  const tieneCampos = def.conNota || def.conValor || def.conValorFirma || def.conTiempo || def.conFecha;

  async function guardar(cambios: Parameters<typeof guardarDoc>[2]) {
    // Candado de fondo: aunque algo se colara en la pantalla, aquí no pasa.
    if (bloqueado) { alert("No tienes permiso para modificar este documento."); return null; }
    const g = await guardarDoc(String(cliente.id), def.clave, cambios);
    if (g) onCambio(g);
    return g;
  }
  function numero(v: string): number | null {
    const n = Number((v || "").replace(/[^\d.]/g, ""));
    return isNaN(n) ? null : n;
  }
  function cambiarEstado(v: EstadoDoc) {
    const extra: Parameters<typeof guardarDoc>[2] = {};
    if (def.conValidacion) {
      if (v === "validado") { extra.validado = true; extra.validadoPor = yoNombre(); }
      else if (estado === "validado") { extra.validado = false; extra.validadoPor = null; }
    }
    guardar({ estado: v, ...extra });
  }

  async function subir(e: React.ChangeEvent<HTMLInputElement>) {
    if (!puedeSubir) { alert("No tienes permiso para subir documentos."); return; }
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;
    if (!carpeta) { alert("Primero genera el expediente en Drive (botón de arriba)."); return; }
    setSubiendo(true);
    try {
      const nuevos: ArchivoDoc[] = [...archivos];
      for (const file of files) {
        const nombre = files.length === 1
          ? (window.prompt("Nombre del documento:", file.name) || file.name).trim()
          : file.name;
        const base64 = await leerBase64(file);
        const r = await subirArchivoDrive({ carpetaId: carpeta, nombre, base64, subcarpeta: def.titulo, mime: file.type, publico: true });
        if (r.ok && r.id && r.link) {
          nuevos.push({ nombre: r.nombre || nombre, link: r.link, driveId: r.id, mime: file.type, subidoPor: yoNombre(), fecha: new Date().toISOString() });
        } else {
          alert("No se pudo subir " + file.name + ": " + (r.error || "intenta de nuevo"));
        }
      }
      const subeEstado = (!def.estados && estado === "en_espera") ? "existe" : estado;
      await guardar({ archivos: nuevos, estado: subeEstado });
    } finally {
      setSubiendo(false);
    }
  }

  async function quitar(a: ArchivoDoc) {
    if (!window.confirm(`¿Quitar "${a.nombre}" de la lista? (no se borra de Drive)`)) return;
    await guardar({ archivos: archivos.filter((x) => x.driveId !== a.driveId) });
  }

  const estadoChip = opciones.find((x) => x.v === estado) || opciones[0];

  return (
    <div className={"rounded-2xl border p-3 shadow-sm " + (bloqueado ? "border-black/10 bg-nube/40" : "border-black/5 bg-white")}>
      {/* Encabezado */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-lg">{def.icono}</span>
          <span className="truncate text-sm font-bold text-tinta">{def.titulo}</span>
          {def.obligatorio && <span className="shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-red-700">Obligatorio</span>}
          {bloqueado && <span className="shrink-0 text-[11px]" title="Documento restringido: solo lectura para tu puesto">🔒</span>}
        </div>
        {bloqueado ? (
          // Sin permiso: el estado se VE, pero no se puede cambiar.
          <span className={"shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold " + estadoChip.chip}>{estadoChip.label}</span>
        ) : (
          <select value={estado} onChange={(e) => cambiarEstado(e.target.value as EstadoDoc)}
            className={"shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold outline-none " + estadoChip.chip}>
            {opciones.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
          </select>
        )}
      </div>

      {/* Origen (administradora / banco / vendedor) */}
      {def.conOrigen && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-humo">Origen</span>
          {bloqueado ? (
            <span className="text-[12px] font-semibold text-humo">{doc?.origen ? doc.origen.charAt(0).toUpperCase() + doc.origen.slice(1) : "—"}</span>
          ) : (
            <select value={doc?.origen || ""} onChange={(e) => guardar({ origen: e.target.value || null })}
              className="rounded-lg border border-black/10 px-2 py-1 text-[12px] outline-none focus:border-teal">
              <option value="">—</option>
              <option value="administradora">Administradora</option>
              <option value="banco">Banco</option>
              <option value="vendedor">Vendedor</option>
            </select>
          )}
        </div>
      )}

      {/* Validación */}
      {def.conValidacion && doc?.validado && (
        <p className="mt-1.5 text-[11px] font-semibold text-emerald-700">✅ Validada{doc.validadoPor ? " por " + doc.validadoPor : ""}{archivos.length === 0 ? " · falta documento de evidencia" : ""}</p>
      )}

      {/* Aviso obligatorio */}
      {def.obligatorio && archivos.length === 0 && (
        <p className="mt-1.5 text-[11px] font-semibold text-red-700">⚠️ Es obligatorio subir este documento.</p>
      )}

      {/* Campos (tipo, valores, tiempo, fecha) */}
      {tieneCampos && (
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
          {def.conNota && <CampoInline soloLectura={bloqueado} label={def.notaLabel || "Nota"} display={doc?.nota || ""} raw={doc?.nota || ""} onGuardar={(v) => guardar({ nota: v.trim() || null })} />}
          {def.conFecha && (
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-humo">Fecha</div>
              <input type="date" defaultValue={doc?.fecha || ""} disabled={bloqueado} onChange={(e) => guardar({ fecha: e.target.value || null })}
                className="mt-0.5 w-full rounded-lg border border-black/10 px-2 py-1 text-[13px] outline-none focus:border-teal disabled:bg-nube disabled:text-humo" />
            </div>
          )}
          {def.conValor && <CampoInline soloLectura={bloqueado} label="Valor" display={pesos(doc?.valor)} raw={doc?.valor != null ? String(doc.valor) : ""} onGuardar={(v) => guardar({ valor: numero(v) })} />}
          {def.conValorFirma && <CampoInline soloLectura={bloqueado} label="Valor de firma" display={pesos(doc?.valorFirma)} raw={doc?.valorFirma != null ? String(doc.valorFirma) : ""} onGuardar={(v) => guardar({ valorFirma: numero(v) })} />}
          {def.conTiempo && <CampoInline soloLectura={bloqueado} label="Tiempo" display={doc?.tiempo || ""} raw={doc?.tiempo || ""} onGuardar={(v) => guardar({ tiempo: v.trim() || null })} />}
        </div>
      )}

      {/* Términos y condiciones (colapsable) */}
      {def.conTerminos && (
        <div className="mt-2">
          <button onClick={() => setVerTerminos((v) => !v)} className="text-[11px] font-semibold text-teal">
            {verTerminos ? "▾" : "▸"} Términos y condiciones
          </button>
          {verTerminos && (
            <textarea defaultValue={doc?.terminos || ""} readOnly={bloqueado} onBlur={(e) => { if (!bloqueado) guardar({ terminos: e.target.value.trim() || null }); }} rows={3}
              placeholder={bloqueado ? "—" : "Escribe los términos y condiciones…"}
              className={"mt-1 w-full resize-none rounded-lg border border-black/10 px-2 py-1.5 text-[13px] outline-none focus:border-teal " + (bloqueado ? "bg-nube text-humo" : "")} />
          )}
        </div>
      )}

      {/* Archivos */}
      <div className="mt-2 space-y-1.5">
        {archivos.length === 0 ? (
          <p className="text-[12px] text-humo/70">Sin archivos.</p>
        ) : (
          archivos.map((a) => (
            <div key={a.driveId} className="flex items-center gap-2 rounded-lg bg-nube/50 px-2 py-1.5">
              <span className="text-sm">{(a.mime || "").startsWith("image/") ? "🖼️" : "📄"}</span>
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-tinta">{a.nombre}</span>
              <button onClick={() => onPreview(a)} title="Vista previa" className="shrink-0 rounded-md px-1.5 py-0.5 text-sm hover:bg-white">👁️</button>
              {!bloqueado && (
                <button onClick={() => quitar(a)} title="Quitar" className="shrink-0 rounded-md px-1.5 py-0.5 text-sm text-humo hover:bg-white">🗑️</button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Aviso de documento restringido */}
      {bloqueado && (
        <p className="mt-2 rounded-lg bg-nube px-2 py-1.5 text-[11px] font-medium text-humo">
          🔒 Documento restringido. Puedes verlo y abrirlo, pero no modificarlo. Si necesitas un cambio, pídelo a tu gerencia o a Dirección.
        </p>
      )}

      {/* Acciones */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <input ref={inputRef} type="file" accept="image/*,application/pdf" multiple onChange={subir} className="hidden" />
        {puedeSubir && (
          <button onClick={() => inputRef.current?.click()} disabled={subiendo} className="rounded-lg bg-teal px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-teal-dark disabled:opacity-50">
            {subiendo ? "Subiendo…" : "➕ Subir"}
          </button>
        )}
        {!bloqueado && (
          <button onClick={() => setSigaAbierto((v) => !v)} className={"rounded-lg border px-2.5 py-1 text-[12px] font-semibold " + (doc?.sigaLink ? "border-emerald-300 text-emerald-700" : "border-black/10 text-humo hover:bg-nube")}>
            🔗 SIGA
          </button>
        )}
      </div>

      {sigaAbierto && (
        <div className="mt-2 flex items-center gap-1.5">
          <input value={sigaTmp} onChange={(e) => setSigaTmp(e.target.value)} placeholder="Pega el enlace de SIGA…"
            className="min-w-0 flex-1 rounded-lg border border-black/10 px-2 py-1 text-[12px] outline-none focus:border-teal" />
          <button onClick={async () => { await guardar({ sigaLink: sigaTmp.trim() || null }); setSigaAbierto(false); }} className="shrink-0 rounded-lg bg-teal px-2 py-1 text-[11px] font-semibold text-white">OK</button>
        </div>
      )}
      {doc?.sigaLink && !sigaAbierto && (
        <a href={doc.sigaLink} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11px] font-semibold text-emerald-700 underline">🔗 Ver en SIGA</a>
      )}
    </div>
  );
}

// ── Rejilla de tarjetas ─────────────────────────────────────
function Rejilla({ cliente, slots, docs, onCambio, onPreview }: {
  cliente: Cliente; slots: SlotDef[]; docs: Record<string, DocExpediente>;
  onCambio: (d: DocExpediente) => void; onPreview: (a: ArchivoDoc) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
      {slots.map((s) => (
        <TarjetaDocumento key={s.clave} cliente={cliente} def={s} doc={docs[s.clave]} onCambio={onCambio} onPreview={onPreview} />
      ))}
    </div>
  );
}

// ── Grupo CAMBIO (flujo condicional) ────────────────────────
function GrupoCambio({ cliente, docs, onCambio, onPreview }: {
  cliente: Cliente; docs: Record<string, DocExpediente>;
  onCambio: (d: DocExpediente) => void; onPreview: (a: ArchivoDoc) => void;
}) {
  const cambio = docs["cambio"];
  const estado: EstadoDoc = cambio?.estado || "no";
  async function setEstado(v: EstadoDoc) {
    const g = await guardarDoc(String(cliente.id), "cambio", { estado: v });
    if (g) onCambio(g);
  }
  const opciones: { v: EstadoDoc; label: string }[] = [
    { v: "no", label: "No" },
    { v: "en_espera", label: "En espera" },
    { v: "existe", label: "Sí" },
  ];
  const chip = estado === "existe" ? "bg-emerald-100 text-emerald-700" : estado === "en_espera" ? "bg-amber-100 text-amber-700" : "bg-nube text-humo";

  return (
    <div>
      <h3 className="mb-2 font-display text-sm font-extrabold uppercase tracking-wide text-teal-dark">Cambio</h3>
      <div className="rounded-2xl border border-black/5 bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-tinta">¿Existe cambio?</span>
          <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoDoc)}
            className={"rounded-full px-3 py-1 text-[12px] font-semibold outline-none " + chip}>
            {opciones.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
        </div>
        {estado === "existe" && <p className="mt-1 text-[11px] text-humo">Captura la solicitud, el contrato de cambio y su ronda de dictámenes.</p>}
      </div>

      {estado === "existe" && (
        <div className="mt-3 space-y-4">
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-humo">Solicitud y contrato</p>
            <Rejilla cliente={cliente} slots={CAMBIO_SOLICITUD} docs={docs} onCambio={onCambio} onPreview={onPreview} />
          </div>
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-humo">Documentos para dictaminar (del cambio)</p>
            <Rejilla cliente={cliente} slots={CAMBIO_DICTAMINAR} docs={docs} onCambio={onCambio} onPreview={onPreview} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Grupo RDC (devolución con vencimiento a 14 meses) ───────
const CARTA_DEVOLUCION: SlotDef = { clave: "carta_devolucion", titulo: "Carta de solicitud de devolución", icono: "📄", conFecha: true };
const MESES_VENCIMIENTO = 14;

function parseFecha(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
function fechaTxt(d: Date): string {
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" });
}

function GrupoRDC({ cliente, docs, onCambio, onPreview }: {
  cliente: Cliente; docs: Record<string, DocExpediente>;
  onCambio: (d: DocExpediente) => void; onPreview: (a: ArchivoDoc) => void;
}) {
  const cambio = docs["cambio"];
  const contratoCambio = docs["contrato_cambio"];
  const contrato = docs["contrato"];
  const usaCambio = cambio?.estado === "existe" && !!parseFecha(contratoCambio?.fecha);
  const base = usaCambio ? parseFecha(contratoCambio?.fecha) : (parseFecha(contrato?.fecha) || parseFecha(cliente.fechaFirma));

  let venc: Date | null = null;
  if (base) { venc = new Date(base); venc.setMonth(venc.getMonth() + MESES_VENCIMIENTO); }
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const vencido = venc ? hoy.getTime() > venc.getTime() : false;
  const dias = venc ? Math.round((venc.getTime() - hoy.getTime()) / 86400000) : null;

  return (
    <div>
      <h3 className="mb-2 font-display text-sm font-extrabold uppercase tracking-wide text-teal-dark">Devolución (RDC)</h3>
      <div className="space-y-3">
        <Rejilla cliente={cliente} slots={[CARTA_DEVOLUCION]} docs={docs} onCambio={onCambio} onPreview={onPreview} />

        <div className={"rounded-2xl border p-3 shadow-sm " + (!base ? "border-amber-200 bg-amber-50" : vencido ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50")}>
          <p className="text-sm font-bold text-tinta">⏳ Vencimiento (14 meses)</p>
          {!base ? (
            <p className="mt-1 text-[12px] text-amber-800">Captura la <b>fecha del contrato</b> (o del contrato de cambio firmado) para calcular el vencimiento.</p>
          ) : (
            <div className="mt-1.5 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
              <Rengloncito label={usaCambio ? "Base (contrato de cambio)" : "Base (contrato)"} valor={fechaTxt(base)} />
              <Rengloncito label="Vence el" valor={venc ? fechaTxt(venc) : "—"} />
              <Rengloncito label="Estado" valor={vencido ? "🔴 Vencido" : "🟢 Vigente"} />
              {dias != null && <Rengloncito label={vencido ? "Días vencido" : "Días restantes"} valor={String(Math.abs(dias))} />}
            </div>
          )}
          <p className="mt-2 text-[10px] text-humo">Cálculo: 14 meses desde la fecha base. Si hay contrato de cambio firmado, se recalcula desde ahí.</p>
        </div>
      </div>
    </div>
  );
}

// ── Panel completo ──────────────────────────────────────────
export default function PanelExpediente({ cliente }: { cliente: Cliente }) {
  const [docs, setDocs] = useState<Record<string, DocExpediente>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [preview, setPreview] = useState<ArchivoDoc | null>(null);
  const [carpetaId, setCarpetaId] = useState<string>(cliente.carpetaDriveId || "");
  const [generando, setGenerando] = useState(false);
  const [genMsg, setGenMsg] = useState("");

  async function generar() {
    setGenerando(true); setGenMsg("");
    const r = await generarExpediente(cliente);
    setGenerando(false);
    if (r.ok && r.carpetaId) { setCarpetaId(r.carpetaId); setGenMsg(r.yaExistia ? "📁 Ya tenía carpeta — lista para subir." : "✅ Carpeta creada en Drive."); }
    else setGenMsg("No se pudo: " + (r.error || "intenta de nuevo"));
  }

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    // 👇 NUEVO: confirma EN VIVO si el cliente ya tiene carpeta (por si el dato
    //  que llegó del tablero venía viejo). Así muestra "carpeta lista" y no
    //  vuelve a pedir generar (ni duplica).
    leerCarpetaDrive(String(cliente.id))
      .then((r) => { if (vivo && r.carpetaId) setCarpetaId(r.carpetaId); })
      .catch(() => {});
    fetchExpediente(String(cliente.id))
      .then((lista) => {
        if (!vivo) return;
        const mapa: Record<string, DocExpediente> = {};
        for (const d of lista) mapa[d.clave] = d;
        setDocs(mapa);
      })
      .catch(() => { if (vivo) setError(true); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [cliente.id]);

  function onCambio(d: DocExpediente) {
    setDocs((prev) => ({ ...prev, [d.clave]: d }));
  }

  const grupos = gruposDeCodigo(cliente.codigo);
  const tieneCambio = ["RV", "R1", "R1V", "R3"].includes(cliente.codigo);
  const cli = { ...cliente, carpetaDriveId: carpetaId };

  if (error) return <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-10 text-center text-amber-800">No se pudo cargar el expediente.</div>;
  if (cargando) return <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-10 text-center text-humo">Cargando expediente…</div>;

  return (
    <div className="space-y-5">
      {/* Carpeta del cliente en Drive */}
      {carpetaId ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px]">
          <span className="font-semibold text-emerald-800">✅ Carpeta en Drive lista — sube los documentos del cliente.</span>
          <a href={"https://drive.google.com/drive/folders/" + carpetaId} target="_blank" rel="noreferrer" className="font-semibold text-teal underline">📂 Abrir carpeta</a>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px]">
          <span className="text-amber-800">⚠️ Este cliente aún no tiene carpeta en Drive.</span>
          <button onClick={generar} disabled={generando} className="rounded-lg bg-dorado px-3 py-1.5 text-[12px] font-semibold text-tinta hover:brightness-95 disabled:opacity-50">
            {generando ? "Generando…" : "📁 Generar expediente en Drive"}
          </button>
        </div>
      )}
      {genMsg && <p className="text-[12px] font-semibold text-humo">{genMsg}</p>}

      {grupos.map((g) => (
        <div key={g.titulo}>
          <h3 className="mb-2 font-display text-sm font-extrabold uppercase tracking-wide text-teal-dark">{g.titulo}</h3>
          <Rejilla cliente={cli} slots={g.slots} docs={docs} onCambio={onCambio} onPreview={setPreview} />
        </div>
      ))}

      {tieneCambio && <GrupoCambio cliente={cli} docs={docs} onCambio={onCambio} onPreview={setPreview} />}

      {cliente.codigo === "RDC" && <GrupoRDC cliente={cli} docs={docs} onCambio={onCambio} onPreview={setPreview} />}

      {preview && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-black/70 p-3" onClick={() => setPreview(null)}>
          <div className="mx-auto flex h-full w-full max-w-3xl flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2 pb-2 text-white">
              <span className="min-w-0 truncate text-sm font-semibold">{preview.nombre}</span>
              <div className="flex shrink-0 gap-2">
                <a href={preview.link} target="_blank" rel="noreferrer" className="rounded-lg bg-white/15 px-3 py-1 text-xs font-semibold text-white hover:bg-white/25">↗️ Abrir en Drive</a>
                <button onClick={() => setPreview(null)} className="rounded-lg bg-white/15 px-3 py-1 text-xs font-semibold text-white hover:bg-white/25">✕ Cerrar</button>
              </div>
            </div>
            <iframe src={`https://drive.google.com/file/d/${preview.driveId}/preview`} title="Vista previa" className="h-full w-full rounded-xl bg-white" />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Resumen del contrato (para reflejar en la Ficha técnica) ─
export function ResumenContrato({ cliente }: { cliente: Cliente }) {
  const [contrato, setContrato] = useState<DocExpediente | null>(null);
  const [apartado, setApartado] = useState<DocExpediente | null>(null);
  const [cambio, setCambio] = useState<DocExpediente | null>(null);
  const [contratoCambio, setContratoCambio] = useState<DocExpediente | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    fetchExpediente(String(cliente.id))
      .then((lista) => {
        if (!vivo) return;
        setContrato(lista.find((d) => d.clave === "contrato") || null);
        setApartado(lista.find((d) => d.clave === "apartado") || null);
        setCambio(lista.find((d) => d.clave === "cambio") || null);
        setContratoCambio(lista.find((d) => d.clave === "contrato_cambio") || null);
      })
      .catch(() => {})
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [cliente.id]);

  const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }));
  const existe = contrato && contrato.estado === "existe";
  const ecam = cambio?.estado;
  const cambioTxt = ecam === "existe" ? "✅ Sí" : ecam === "en_espera" ? "🕓 En espera" : "No";

  return (
    <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
      <h3 className="mb-3 font-display text-sm font-extrabold uppercase tracking-wide text-teal-dark">Términos y condiciones del contrato</h3>
      {cargando ? (
        <p className="text-sm text-humo">Cargando…</p>
      ) : (
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <Rengloncito label="¿Existe contrato?" valor={existe ? "✅ Sí" : "🕓 En espera"} />
          <Rengloncito label="Tipo de contrato" valor={contrato?.nota || "—"} />
          <Rengloncito label="Valor del contrato" valor={fmt(contrato?.valor)} />
          <Rengloncito label="Valor de firma" valor={fmt(contrato?.valorFirma)} />
          <Rengloncito label="Tiempo del contrato" valor={contrato?.tiempo || "—"} />
          <Rengloncito label="Valor del apartado" valor={fmt(apartado?.valor)} />
          <Rengloncito label="¿Existe cambio?" valor={cambioTxt} />
          <Rengloncito label="Valor del contrato de cambio" valor={fmt(contratoCambio?.valor)} />
          <Rengloncito label="Valor de firma (cambio)" valor={fmt(contratoCambio?.valorFirma)} />
        </div>
      )}
    </section>
  );
}

function Rengloncito({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-humo">{label}</div>
      <div className={"mt-0.5 text-sm " + (valor && valor !== "—" ? "text-tinta" : "text-humo/60")}>{valor}</div>
    </div>
  );
}

/**
 * Todos los documentos OBLIGATORIOS del Expediente para un cliente, con su
 * nombre — para usarse fuera de este panel (ej. la Solicitud Formal RDC).
 * Solo R3 significa "ya tuvo un cambio CONCLUIDO" — R2/R2C es "en juicio",
 * no implica un cambio previo, así que NO se les exige el contrato de
 * cambio.
 */
export function obligatoriosDeCodigo(codigo: string): { clave: string; titulo: string }[] {
  const lista = gruposDeCodigo(codigo)
    .flatMap((g) => g.slots)
    .filter((s) => s.obligatorio)
    .map((s) => ({ clave: s.clave, titulo: s.titulo }));

  if (codigo === "R3") {
    const cambio = CAMBIO_SOLICITUD.find((s) => s.clave === "contrato_cambio");
    if (cambio && !lista.some((l) => l.clave === "contrato_cambio")) {
      lista.push({ clave: cambio.clave, titulo: cambio.titulo });
    }
  }
  return lista;
}
