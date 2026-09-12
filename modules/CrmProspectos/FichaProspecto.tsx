// CRM Prospectos · Ficha del prospecto (Fase 4)
// Datos editables + script de llamada de calidad + registro de toques + ritmo.
import { useEffect, useState } from "react";
import {
  fetchToques, agregarToque, actualizarProspecto, moverFase,
  guardarApartado, convertirProspectoACliente,
  RITMO, FASES_SELECT, TIPOS_TOQUE,
  NECESIDADES, FORMAS_PAGO, TIPOS_ACTIVO, CREDITO_TIPOS, TAMANOS_CASA, PRESUPUESTOS, ZONAS, ORIGENES_ACTIVO,
  BOLSAS, bolsaDe,
  type Prospecto, type Toque, type Fase, type TipoToque,
} from "../../data/prospectos";
import { generarExpediente } from "../../data/expediente";
import { subirArchivoDrive } from "../../data/expedienteDocs";
import { useMiRol } from "../CrmCliente/_compartido";
import { puedeAccion } from "../../data/roles";
import LlamarGrabar from "../LlamarGrabar/LlamarGrabar";
import { avisarEvento } from "../../data/avisarEvento";

function leerBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] || "");
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

const COLOR_FASE: Record<Fase, string> = {
  Nuevo: "bg-blue-50 text-blue-700 border-blue-200",
  Contactado: "bg-teal-soft text-teal-dark border-teal/30",
  Cita: "bg-violet-50 text-violet-700 border-violet-200",
  Perfilado: "bg-amber-50 text-amber-700 border-amber-200",
  Apartado: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Contrato: "bg-indigo-50 text-indigo-700 border-indigo-200",
  Cliente: "bg-green-100 text-green-800 border-green-300",
  Frío: "bg-slate-100 text-slate-600 border-slate-200",
  Perdido: "bg-rose-50 text-rose-600 border-rose-200",
};

const ICONO_TIPO: Record<string, string> = { llamada: "📞", whatsapp: "💬", correo: "✉️", cita: "📅" };

const fechaLarga = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};
const fechaCorta = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
};
function yoNombre(): string {
  try { return JSON.parse(localStorage.getItem("chat_yo") || "{}")?.nombre || ""; } catch { return ""; }
}

// Los 6 pasos del script de llamada de calidad (de Paola).
const SCRIPT: { titulo: string; texto: string }[] = [
  { titulo: "1. Saludo (10 seg)", texto: "“Hola [nombre], le habla [asesor] de DIIPA, especialistas en soluciones inmobiliarias con certeza jurídica. Vi que le interesó [el activo/garantía]. ¿Tiene 2 minutitos?”" },
  { titulo: "2. Perfilar (escuchar 70%)", texto: "¿Qué busca exactamente? · ¿Para vivir, invertir o regularizar? · ¿Manejaba algún presupuesto / forma de pago? · ¿Para cuándo le urge?" },
  { titulo: "3. Dar certeza (no promesas)", texto: "“Con nosotros todo va por escrito y acompañado legalmente. El cliente no pierde: cada paso queda documentado. No le prometo plazos que no dependen de mí, pero sí claridad en cada etapa.”" },
  { titulo: "4. Manejar la duda típica", texto: "“Entiendo su duda. Por eso lo primero es una cita sin compromiso, donde le mostramos el activo y el proceso, con documentos a la vista.”" },
  { titulo: "5. Cerrar el siguiente paso (SIEMPRE)", texto: "“¿Le queda mejor [mañana 10am] o [mañana 4pm] para mostrarle todo? …Perfecto, le mando confirmación por WhatsApp y nos vemos. Quedó agendado.”" },
  { titulo: "6. Si no contesta", texto: "WhatsApp: “Hola [nombre], le marcamos de DIIPA por su interés en [activo]. ¿Le acomoda hoy en la tarde o mañana?”" },
];

export default function FichaProspecto({ prospecto, onCerrar, onCambio }: {
  prospecto: Prospecto; onCerrar: () => void; onCambio: () => void;
}) {
  const [toques, setToques] = useState<Toque[]>([]);
  const [verScript, setVerScript] = useState(false);
  const miRol = useMiRol();
  const puedeGestionar = puedeAccion(miRol, "prospectos_gestionar");
  const puedeAsignar = puedeAccion(miRol, "prospectos_asignar");

  // Datos editables
  const [telefono, setTelefono] = useState(prospecto.telefono);
  const [email, setEmail] = useState(prospecto.email);
  const [asesor, setAsesor] = useState(prospecto.asesor);
  const [activoInteres, setActivoInteres] = useState(prospecto.activoInteres);
  const [busca, setBusca] = useState(prospecto.busca);
  const [presupuesto, setPresupuesto] = useState(prospecto.presupuesto);
  const [urgencia, setUrgencia] = useState(prospecto.urgencia);
  const [apto, setApto] = useState<boolean | null>(prospecto.apto);
  const [notas, setNotas] = useState(prospecto.notas);
  const [necesidad, setNecesidad] = useState(prospecto.necesidad);
  const [formaPago, setFormaPago] = useState(prospecto.formaPago);
  const [tipoActivo, setTipoActivo] = useState(prospecto.tipoActivo);
  const [creditoTipo, setCreditoTipo] = useState(prospecto.creditoTipo);
  const [tamanoCasa, setTamanoCasa] = useState(prospecto.tamanoCasa);
  const [presupuestoRango, setPresupuestoRango] = useState(prospecto.presupuestoRango);
  const [zona, setZona] = useState(prospecto.zona);
  const [colonia, setColonia] = useState(prospecto.colonia);
  const [origenActivo, setOrigenActivo] = useState(prospecto.origenActivo);
  const [guardando, setGuardando] = useState(false);
  const [fase, setFase] = useState<Fase>(prospecto.fase);

  // Apartado + conversión a cliente
  const [fechaFirma, setFechaFirma] = useState(prospecto.fechaFirma || "");
  const [montoContrato, setMontoContrato] = useState(prospecto.montoContrato);
  const [montoApartado, setMontoApartado] = useState(prospecto.montoApartado);
  const [reciboFile, setReciboFile] = useState<File | null>(null);
  const [guardandoAp, setGuardandoAp] = useState(false);
  const [convirtiendo, setConvirtiendo] = useState(false);
  const [llamando, setLlamando] = useState(false);

  // Registro de toque
  const [tipo, setTipo] = useState<TipoToque>("llamada");
  const [resultado, setResultado] = useState("");
  const [calidad, setCalidad] = useState(false);
  const [perfilado, setPerfilado] = useState("");
  const [siguientePaso, setSiguientePaso] = useState("");
  const [fechaSiguiente, setFechaSiguiente] = useState("");
  const [registrando, setRegistrando] = useState(false);

  async function cargarToques() { setToques(await fetchToques(prospecto.id)); }
  useEffect(() => { cargarToques(); }, [prospecto.id]);

  async function guardarDatos() {
    setGuardando(true);
    await actualizarProspecto(prospecto.id, { telefono, email, asesor, activoInteres, busca, presupuesto, urgencia, apto, notas,
      necesidad, formaPago, tipoActivo, creditoTipo: formaPago === "Crédito" ? creditoTipo : "", tamanoCasa, presupuestoRango, zona, colonia, origenActivo });
    // 7A · Reparto: si recién se asignó un asesor, avísale (campanita) para que llame HOY.
    if (!prospecto.asesor && asesor.trim()) {
      avisarEvento({
        tipo: "sistema", accion: "prospecto_asignado",
        titulo: `📌 Lead ${prospecto.folio || ""} → ${asesor.trim()}`.trim(),
        detalle: `Llamar HOY · ${zona || prospecto.sucursal || ""}`.trim(),
        autor: yoNombre() || undefined, modulo: "prospectos", refId: prospecto.id, icono: "📌",
      });
    }
    setGuardando(false);
    onCambio();
  }

  async function cambiarFase(nueva: Fase) {
    setFase(nueva);
    await moverFase(prospecto.id, nueva);
    onCambio();
  }

  async function registrarToque() {
    if (registrando) return;
    setRegistrando(true);
    await agregarToque({
      prospectoId: prospecto.id, tipo, resultado,
      calidad: calidad || !!siguientePaso, perfilado, siguientePaso,
      fechaSiguiente: fechaSiguiente || null, autor: yoNombre(),
    });
    setRegistrando(false);
    setResultado(""); setCalidad(false); setPerfilado(""); setSiguientePaso(""); setFechaSiguiente("");
    cargarToques();
    onCambio();
  }

  const input = "w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-teal";
  const lbl = "text-[11px] font-semibold uppercase tracking-wide text-humo";

  async function tocarWhatsApp() {
    const tel = (telefono || "").replace(/\D/g, "");
    if (!tel) { alert("Este prospecto no tiene teléfono."); return; }
    const msg = encodeURIComponent(`Hola ${prospecto.nombre}, le saluda DIIPA — Inmuebles Accesibles. Le contactamos por su interés en ${prospecto.activoInteres || "nuestras soluciones"}.`);
    window.open(`https://wa.me/${tel}?text=${msg}`, "_blank");
    await agregarToque({ prospectoId: prospecto.id, tipo: "whatsapp", resultado: "WhatsApp enviado", autor: yoNombre() });
    cargarToques(); onCambio();
  }

  async function tocarCorreo() {
    if (!email) { alert("Este prospecto no tiene correo. Captúralo abajo y guarda."); return; }
    const asunto = encodeURIComponent("DIIPA · Inmuebles Accesibles");
    const cuerpo = encodeURIComponent(`Hola ${prospecto.nombre},\n\nLe contactamos de DIIPA por su interés en ${prospecto.activoInteres || "nuestras soluciones inmobiliarias con certeza jurídica"}.\n\nQuedamos a sus órdenes.`);
    window.open(`mailto:${email}?subject=${asunto}&body=${cuerpo}`, "_blank");
    await agregarToque({ prospectoId: prospecto.id, tipo: "correo", resultado: "Correo enviado", autor: yoNombre() });
    cargarToques(); onCambio();
  }

  async function llamadaConectada() {
    await agregarToque({ prospectoId: prospecto.id, tipo: "llamada", resultado: "Llamada realizada", calidad: true, autor: yoNombre() });
    cargarToques(); onCambio();
  }

  async function guardarAp() {
    setGuardandoAp(true);
    await guardarApartado(prospecto.id, { fechaFirma: fechaFirma || null, montoContrato, montoApartado });
    setGuardandoAp(false);
    onCambio();
  }

  function verRecibo() {
    if (reciboFile) { window.open(URL.createObjectURL(reciboFile), "_blank"); return; }
    if (prospecto.recibo?.link) window.open(prospecto.recibo.link, "_blank");
  }

  async function volverloCliente() {
    if (convirtiendo) return;
    if (!fechaFirma || !montoApartado) { alert("Captura al menos la fecha de firma y el monto del apartado."); return; }
    if (!confirm(`¿Convertir a "${prospecto.nombre}" en CLIENTE? Pasará a CRM Clientes (UAC) y saldrá del embudo de prospectos.`)) return;
    setConvirtiendo(true);
    const r = await convertirProspectoACliente(prospecto, { fechaFirma, montoContrato, montoApartado });
    if (r.ok && r.cliente) {
      // Sube el recibo a la carpeta del nuevo cliente (si hay).
      if (reciboFile) {
        try {
          const exp = await generarExpediente(r.cliente);
          if (exp.ok && exp.carpetaId) {
            const base64 = await leerBase64(reciboFile);
            const sub = await subirArchivoDrive({ carpetaId: exp.carpetaId, nombre: reciboFile.name, base64, subcarpeta: "Apartado" });
            if (sub.ok && sub.link) await guardarApartado(prospecto.id, { recibo: { nombre: reciboFile.name, link: sub.link } });
          }
        } catch {}
      }
      setConvirtiendo(false);
      alert("✅ Convertido. Ya aparece como cliente en CRM Clientes (UAC).");
      onCambio();
      onCerrar();
    } else {
      setConvirtiendo(false);
      alert(r.error || "No se pudo convertir.");
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-tinta/40 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-2xl">
        {/* Encabezado */}
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-extrabold text-tinta">{prospecto.nombre}</h2>
            <p className="text-[11px] text-humo">{prospecto.folio ? prospecto.folio + " · " : ""}{prospecto.origen} · lead {fechaCorta(prospecto.fechaLead)}{prospecto.sucursal ? ` · ${prospecto.sucursal}` : ""}</p>
            <p className="mt-1 inline-block rounded-full bg-nube px-2 py-0.5 text-[11px] font-semibold text-tinta">{BOLSAS.find((b) => b.clave === bolsaDe({ formaPago, tipoActivo, necesidad, creditoTipo, origenActivo }))?.etiqueta}</p>
          </div>
          <button onClick={onCerrar} className="shrink-0 rounded-md px-2 py-1 text-humo hover:bg-nube">✕</button>
        </div>

        {/* Fase + ritmo */}
        <div className="mb-4 rounded-xl border border-black/5 bg-nube/50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={lbl}>Fase:</span>
            <select value={fase} onChange={(e) => cambiarFase(e.target.value as Fase)} disabled={!puedeGestionar}
              className={"rounded-full border px-2.5 py-1 text-xs font-semibold outline-none disabled:opacity-60 " + COLOR_FASE[fase]}>
              {FASES_SELECT.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <p className="mt-2 text-[13px] text-tinta"><span className="font-semibold">📌 Ritmo:</span> {RITMO[fase].nota}</p>
          {prospecto.fechaProximo && (
            <p className="mt-0.5 text-[12px] text-humo">Próximo toque sugerido: <span className="font-semibold text-teal-dark">{fechaCorta(prospecto.fechaProximo)}</span></p>
          )}
        </div>

        {/* Comunicación: llamar · WhatsApp · correo (recursos JurisConecta) */}
        <div className="mb-4 grid grid-cols-3 gap-2">
          <button onClick={() => telefono ? setLlamando(true) : alert("Sin teléfono.")} disabled={!telefono}
            className="rounded-xl border border-black/10 bg-white px-2 py-2 text-sm font-semibold text-tinta hover:bg-teal-soft disabled:opacity-40">📞 Llamar</button>
          <button onClick={tocarWhatsApp} disabled={!telefono}
            className="rounded-xl border border-black/10 bg-white px-2 py-2 text-sm font-semibold text-tinta hover:bg-teal-soft disabled:opacity-40">💬 WhatsApp</button>
          <button onClick={tocarCorreo} disabled={!email}
            className="rounded-xl border border-black/10 bg-white px-2 py-2 text-sm font-semibold text-tinta hover:bg-teal-soft disabled:opacity-40">✉️ Correo</button>
        </div>

        {/* Datos del lead (editables) */}
        <div className="mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>Teléfono</label><input value={telefono} onChange={(e) => setTelefono(e.target.value)} className={input} /></div>
            <div><label className={lbl}>Correo</label><input value={email} onChange={(e) => setEmail(e.target.value)} className={input} placeholder="correo@ejemplo.com" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>Asesor (dueño)</label><input value={asesor} onChange={(e) => setAsesor(e.target.value)} readOnly={!puedeAsignar} className={input + (puedeAsignar ? "" : " bg-nube/50")} placeholder="sin asignar" /></div>
            <div></div>
          </div>
          <div><label className={lbl}>Activo / garantía de interés</label><input value={activoInteres} onChange={(e) => setActivoInteres(e.target.value)} className={input} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>¿Qué busca?</label>
              <select value={busca} onChange={(e) => setBusca(e.target.value)} className={input}>
                <option value="">—</option>
                <option value="Vivir">Vivir</option>
                <option value="Invertir">Invertir</option>
                <option value="Regularizar">Regularizar</option>
                <option value="Otro">Otro</option>
              </select>
            </div>
            <div><label className={lbl}>Presupuesto</label><input value={presupuesto} onChange={(e) => setPresupuesto(e.target.value)} className={input} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Urgencia</label>
              <select value={urgencia} onChange={(e) => setUrgencia(e.target.value)} className={input}>
                <option value="">—</option><option value="Alta">Alta</option><option value="Media">Media</option><option value="Baja">Baja</option>
              </select>
            </div>
            <div>
              <label className={lbl}>¿Es apto?</label>
              <select value={apto === null ? "" : apto ? "si" : "no"} onChange={(e) => setApto(e.target.value === "" ? null : e.target.value === "si")} className={input}>
                <option value="">—</option><option value="si">Sí</option><option value="no">No</option>
              </select>
            </div>
          </div>
          <div className="rounded-xl border border-black/5 bg-nube/40 p-2.5">
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-teal-dark">Segmentación</p>
            <div className="grid grid-cols-2 gap-2">
              <SelF label="Necesidad" value={necesidad} set={setNecesidad} ops={NECESIDADES} input={input} lbl={lbl} />
              <SelF label="Forma de pago" value={formaPago} set={setFormaPago} ops={FORMAS_PAGO} input={input} lbl={lbl} />
              <SelF label="Tipo de activo" value={tipoActivo} set={setTipoActivo} ops={TIPOS_ACTIVO} input={input} lbl={lbl} />
              {formaPago === "Crédito" && <SelF label="Tipo de crédito" value={creditoTipo} set={setCreditoTipo} ops={CREDITO_TIPOS} input={input} lbl={lbl} />}
              <SelF label="Tamaño de casa" value={tamanoCasa} set={setTamanoCasa} ops={TAMANOS_CASA} input={input} lbl={lbl} />
              <SelF label="Presupuesto" value={presupuestoRango} set={setPresupuestoRango} ops={PRESUPUESTOS} input={input} lbl={lbl} />
              <SelF label="Zona" value={zona} set={setZona} ops={ZONAS} input={input} lbl={lbl} />
              <SelF label="Origen del activo" value={origenActivo} set={setOrigenActivo} ops={ORIGENES_ACTIVO} input={input} lbl={lbl} />
            </div>
            <div className="mt-2"><label className={lbl}>Colonia / sector</label><input value={colonia} onChange={(e) => setColonia(e.target.value)} className={input} /></div>
          </div>
          <div><label className={lbl}>Notas</label><textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className={input} /></div>
          <button onClick={guardarDatos} disabled={guardando || !puedeGestionar}
            className="w-full rounded-lg border border-teal/30 bg-teal-soft px-3 py-2 text-sm font-semibold text-teal-dark hover:bg-teal hover:text-white disabled:opacity-50">
            {guardando ? "Guardando…" : "💾 Guardar datos"}
          </button>
        </div>

        {/* Apartado + Convertir a Cliente (solo cuando está en Apartado o ya convertido) */}
        {(fase === "Apartado" || prospecto.convertido) && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
            {prospecto.convertido ? (
              <div>
                <p className="text-sm font-bold text-emerald-700">✅ Convertido a cliente</p>
                <p className="mt-0.5 text-[12px] text-humo">Firma: {fechaCorta(prospecto.fechaFirma)} · Contrato: {prospecto.montoContrato || "—"} · Apartado: {prospecto.montoApartado || "—"}</p>
                {prospecto.recibo?.link && <button onClick={verRecibo} className="mt-1 text-[12px] font-semibold text-teal-dark underline">👁️ Ver recibo</button>}
                <p className="mt-1 text-[12px] text-emerald-700">Ya aparece en CRM Clientes (UAC).</p>
              </div>
            ) : (
              <>
                <p className="mb-2 text-sm font-bold text-emerald-800">🤝 Apartado · términos de firma</p>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={lbl}>Fecha de firma *</label><input type="date" value={fechaFirma} onChange={(e) => setFechaFirma(e.target.value)} className={input} /></div>
                  <div><label className={lbl}>Monto del apartado *</label><input value={montoApartado} onChange={(e) => setMontoApartado(e.target.value)} className={input} placeholder="$" /></div>
                </div>
                <div className="mt-2"><label className={lbl}>Monto del contrato</label><input value={montoContrato} onChange={(e) => setMontoContrato(e.target.value)} className={input} placeholder="$" /></div>
                <div className="mt-2">
                  <label className={lbl}>Recibo de pago</label>
                  <div className="flex items-center gap-2">
                    <input type="file" onChange={(e) => setReciboFile(e.target.files?.[0] || null)} className="flex-1 text-[12px]" />
                    {(reciboFile || prospecto.recibo?.link) && <button onClick={verRecibo} title="Ver recibo" className="rounded-md border border-black/10 px-2 py-1 text-sm hover:bg-white">👁️</button>}
                  </div>
                  <p className="mt-0.5 text-[11px] text-humo">El recibo se guarda en la carpeta del cliente al convertir.</p>
                </div>
                {puedeGestionar && (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <button onClick={guardarAp} disabled={guardandoAp} className="flex-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-humo hover:bg-nube disabled:opacity-50">{guardandoAp ? "Guardando…" : "💾 Guardar apartado"}</button>
                    <button onClick={volverloCliente} disabled={convirtiendo} className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{convirtiendo ? "Convirtiendo…" : "✅ Volverlo Cliente"}</button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Script de llamada de calidad */}
        <button onClick={() => setVerScript((v) => !v)}
          className="mb-2 flex w-full items-center justify-between rounded-xl border border-dorado/30 bg-dorado/5 px-3 py-2.5 text-sm font-semibold text-tinta hover:bg-dorado/10">
          <span>📞 Script de llamada de calidad</span>
          <span className="text-humo">{verScript ? "▲" : "▼"}</span>
        </button>
        {verScript && (
          <div className="mb-4 space-y-2 rounded-xl border border-black/5 bg-white p-3">
            {SCRIPT.map((s) => (
              <div key={s.titulo} className="rounded-lg bg-nube/40 p-2.5">
                <p className="text-[12px] font-bold text-teal-dark">{s.titulo}</p>
                <p className="mt-0.5 text-[13px] leading-snug text-tinta">{s.texto}</p>
              </div>
            ))}
            <p className="px-1 pt-1 text-[11px] text-humo">🚦 Escuchar más que hablar · nunca prometer resultados legales · no colgar sin agendar · registrar el toque al terminar.</p>
          </div>
        )}

        {/* Registrar toque (llamada de calidad) */}
        <div className="mb-4 rounded-xl border border-black/5 bg-nube/40 p-3">
          <p className="mb-2 text-sm font-bold text-tinta">➕ Registrar toque</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={lbl}>Tipo</label>
              <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoToque)} className={input}>
                {TIPOS_TOQUE.map((t) => <option key={t} value={t}>{ICONO_TIPO[t]} {t}</option>)}
              </select>
            </div>
            <div><label className={lbl}>Resultado</label><input value={resultado} onChange={(e) => setResultado(e.target.value)} className={input} placeholder="contestó / no contestó / agendó…" /></div>
          </div>
          <div className="mt-2"><label className={lbl}>Perfilado (qué busca, presupuesto, urgencia)</label><input value={perfilado} onChange={(e) => setPerfilado(e.target.value)} className={input} /></div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div><label className={lbl}>Siguiente paso (cita/visita)</label><input value={siguientePaso} onChange={(e) => setSiguientePaso(e.target.value)} className={input} placeholder="qué se agendó" /></div>
            <div><label className={lbl}>Fecha del siguiente paso</label><input type="date" value={fechaSiguiente} onChange={(e) => setFechaSiguiente(e.target.value)} className={input} /></div>
          </div>
          <label className="mt-2 flex items-center gap-2 text-[13px] text-tinta">
            <input type="checkbox" checked={calidad} onChange={(e) => setCalidad(e.target.checked)} />
            Fue llamada de calidad (perfiló + agendó siguiente paso)
          </label>
          {!siguientePaso && !fechaSiguiente && (
            <p className="mt-1 text-[11px] text-rose-500">⚠️ Regla de oro: ningún lead sin siguiente toque agendado.</p>
          )}
          <button onClick={registrarToque} disabled={registrando || !puedeGestionar}
            className="mt-2 w-full rounded-lg bg-teal px-3 py-2 text-sm font-semibold text-white hover:bg-teal-dark disabled:opacity-50">
            {registrando ? "Registrando…" : "Registrar toque"}
          </button>
        </div>

        {/* Historial de toques */}
        <div>
          <p className="mb-2 text-sm font-bold text-tinta">Historial de toques ({toques.length})</p>
          {toques.length === 0 ? (
            <p className="rounded-lg border border-dashed border-black/10 px-3 py-4 text-center text-[13px] text-humo">Aún no hay toques registrados.</p>
          ) : (
            <div className="space-y-2">
              {toques.map((t) => (
                <div key={t.id} className="rounded-lg border border-black/5 bg-white p-2.5 text-[13px]">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-tinta">{ICONO_TIPO[t.tipo]} {t.tipo}{t.calidad ? " · ⭐ calidad" : ""}</span>
                    <span className="text-[11px] text-humo">{fechaLarga(t.fecha)}</span>
                  </div>
                  {t.resultado && <p className="text-humo">Resultado: {t.resultado}</p>}
                  {t.perfilado && <p className="text-humo">Perfilado: {t.perfilado}</p>}
                  {t.siguientePaso && <p className="text-teal-dark">→ {t.siguientePaso}{t.fechaSiguiente ? ` (${fechaCorta(t.fechaSiguiente)})` : ""}</p>}
                  {t.autor && <p className="text-[11px] text-humo/80">por {t.autor}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {llamando && (
        <LlamarGrabar
          numero={telefono}
          nombre={prospecto.nombre}
          rol={miRol || undefined}
          onContactoReal={llamadaConectada}
          onCerrar={() => setLlamando(false)}
        />
      )}
    </div>
  );
}

function SelF({ label, value, set, ops, input, lbl }: { label: string; value: string; set: (v: string) => void; ops: readonly string[]; input: string; lbl: string }) {
  return (
    <div>
      <label className={lbl}>{label}</label>
      <select value={value} onChange={(e) => set(e.target.value)} className={input}>
        <option value="">—</option>
        {ops.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
