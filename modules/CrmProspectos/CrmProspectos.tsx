// CRM Prospectos Comercial · Fase 3 (tablero de leads + nuevo lead + filtros)
import { useEffect, useMemo, useState } from "react";
import {
  fetchProspectos, agregarProspecto, moverFase, borrarProspecto, agregarToque,
  ORIGENES, FASES_SELECT, NECESIDADES, FORMAS_PAGO, TIPOS_ACTIVO, CREDITO_TIPOS,
  TAMANOS_CASA, PRESUPUESTOS, ZONAS, ORIGENES_ACTIVO,
  type Prospecto, type Origen, type Fase,
} from "../../data/prospectos";
import FichaProspecto from "./FichaProspecto";
import Segmentador from "./Segmentador";
import ScriptBoton from "./ScriptLlamada";
import { avisarEvento } from "../../data/avisarEvento";
import LlamarGrabar from "../LlamarGrabar/LlamarGrabar";
import { useMiRol } from "../CrmCliente/_compartido";
import { puedeAccion } from "../../data/roles";

const SUCURSALES = ["Mazatlán", "Guadalajara", "Culiacán", "La Paz"];

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

const ICONO_ORIGEN: Record<string, string> = {
  Facebook: "📘", Instagram: "📷", Referido: "🤝", Campaña: "📣", Chatwoot: "💬", Otro: "•",
};

const hoy = () => new Date().toISOString().slice(0, 10);
const fechaCorta = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
};

// Días desde hoy hasta el próximo toque (negativo = vencido).
function diasPara(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  const h = new Date(hoy() + "T00:00:00");
  return Math.round((d.getTime() - h.getTime()) / 86400000);
}

// Tipo de seguimiento que toca según la fase.
const TIPO_SEG: Record<string, string> = {
  Nuevo: "Primera llamada",
  Contactado: "Insistir · 2º intento",
  Cita: "Confirmar cita",
  Perfilado: "Cerrar cita/visita",
  Apartado: "Seguimiento semanal",
  Frío: "Reactivar (15/30 días)",
  Perdido: "—",
  Cliente: "—",
  Contrato: "Acompañar firma",
};

function yoNombre(): string {
  try { return JSON.parse(localStorage.getItem("chat_yo") || "{}")?.nombre || ""; } catch { return ""; }
}

export default function CrmProspectos() {
  const [lista, setLista] = useState<Prospecto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [origen, setOrigen] = useState<Origen | "todos">("todos");
  const [fase, setFase] = useState<Fase | "todas">("todas");
  const [asesorF, setAsesorF] = useState("todos");
  const [busca, setBusca] = useState("");
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const [abierto, setAbierto] = useState<Prospecto | null>(null);
  const [llamarA, setLlamarA] = useState<Prospecto | null>(null);
  const [vista, setVista] = useState<"lista" | "bolsas">("lista");
  const miRol = useMiRol();
  const puedeCrear = puedeAccion(miRol, "prospectos_crear");
  const puedeBorrar = puedeAccion(miRol, "prospectos_borrar");

  async function cargar() {
    setCargando(true);
    setLista(await fetchProspectos());
    setCargando(false);
  }
  useEffect(() => { cargar(); }, []);

  // Llamar / WhatsApp / Correo directo desde la fila (registra el toque, igual que en la ficha).
  function llamarLead(p: Prospecto) {
    if (!p.telefono) { alert("Este lead no tiene teléfono."); return; }
    setLlamarA(p);
  }
  async function llamadaHecha(p: Prospecto) {
    await agregarToque({ prospectoId: p.id, tipo: "llamada", resultado: "Llamada realizada", calidad: true, autor: yoNombre() });
    cargar();
  }
  async function waLead(p: Prospecto) {
    const tel = (p.telefono || "").replace(/\D/g, "");
    if (!tel) { alert("Este lead no tiene teléfono."); return; }
    const msg = encodeURIComponent(`Hola ${p.nombre}, le saluda DIIPA — Inmuebles Accesibles. Le contactamos por su interés en ${p.activoInteres || "nuestras soluciones"}.`);
    window.open(`https://wa.me/${tel}?text=${msg}`, "_blank");
    await agregarToque({ prospectoId: p.id, tipo: "whatsapp", resultado: "WhatsApp enviado", autor: yoNombre() });
    cargar();
  }
  async function correoLead(p: Prospecto) {
    if (!p.email) { alert("Este lead no tiene correo. Ábrelo (toca el nombre) y captúralo."); return; }
    const asunto = encodeURIComponent("DIIPA · Inmuebles Accesibles");
    const cuerpo = encodeURIComponent(`Hola ${p.nombre},\n\nLe contactamos de DIIPA por su interés en ${p.activoInteres || "nuestras soluciones inmobiliarias con certeza jurídica"}.\n\nQuedamos a sus órdenes.`);
    window.open(`mailto:${p.email}?subject=${asunto}&body=${cuerpo}`, "_blank");
    await agregarToque({ prospectoId: p.id, tipo: "correo", resultado: "Correo enviado", autor: yoNombre() });
    cargar();
  }

  const asesores = useMemo(() => [...new Set(lista.map((p) => p.asesor).filter(Boolean))].sort(), [lista]);

  const filtrada = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return lista.filter((p) => {
      if (origen !== "todos" && p.origen !== origen) return false;
      if (fase !== "todas" && p.fase !== fase) return false;
      if (asesorF !== "todos" && p.asesor !== asesorF) return false;
      if (q && !(`${p.nombre} ${p.telefono} ${p.activoInteres}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [lista, origen, fase, asesorF, busca]);

  const kpi = useMemo(() => ({
    total: lista.length,
    fb: lista.filter((p) => p.origen === "Facebook").length,
    ig: lista.filter((p) => p.origen === "Instagram").length,
    nuevos: lista.filter((p) => p.fase === "Nuevo").length,
    sinTocar: lista.filter((p) => p.fase === "Nuevo" && p.fechaLead <= hoy()).length,
  }), [lista]);

  async function cambiarFase(p: Prospecto, nueva: Fase) {
    await moverFase(p.id, nueva);
    cargar();
  }
  async function eliminar(p: Prospecto) {
    if (confirm(`¿Borrar el lead de "${p.nombre}"? Esto no se puede deshacer.`)) {
      await borrarProspecto(p.id);
      cargar();
    }
  }

  const limpio = origen === "todos" && fase === "todas" && asesorF === "todos" && !busca;

  return (
    <div className="px-4 py-4 sm:px-6 lg:px-8">
      {/* Pestañas Lista / Bolsas */}
      <div className="mb-3 flex gap-1.5">
        <button onClick={() => setVista("lista")} className={vista === "lista" ? "rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white" : "rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-humo hover:bg-teal-soft"}>📋 Lista</button>
        <button onClick={() => setVista("bolsas")} className={vista === "bolsas" ? "rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white" : "rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-humo hover:bg-teal-soft"}>🗂️ Bolsas</button>
      </div>

      {vista === "bolsas" && <Segmentador lista={lista} onAbrir={setAbierto} />}

      {vista === "lista" && (<>
      {/* Tira de KPIs rápidos */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Mini etiqueta="Leads" valor={kpi.total} />
        <Mini etiqueta="📘 Facebook" valor={kpi.fb} color="text-blue-700" />
        <Mini etiqueta="📷 Instagram" valor={kpi.ig} color="text-pink-600" />
        <Mini etiqueta="Nuevos" valor={kpi.nuevos} color="text-teal" />
        <Mini etiqueta="⚠️ Llamar hoy" valor={kpi.sinTocar} color={kpi.sinTocar ? "text-rose-600" : "text-humo"} />
      </div>

      {/* Barra de acciones */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nombre, teléfono o activo…"
          className="min-w-[180px] flex-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-teal"
        />
        <ScriptBoton compacto />
        {puedeCrear && (
          <button
            onClick={() => setNuevoAbierto(true)}
            className="rounded-lg bg-teal px-3 py-2 text-sm font-semibold text-white hover:bg-teal-dark"
          >➕ Nuevo lead</button>
        )}
      </div>

      {/* Filtros estilo Excel */}
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-[10px] font-semibold uppercase tracking-wide text-humo">Origen
          <select value={origen} onChange={(e) => setOrigen(e.target.value as Origen | "todos")}
            className="mt-0.5 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm font-medium text-tinta outline-none focus:border-teal">
            <option value="todos">Todos</option>
            {ORIGENES.map((o) => <option key={o} value={o}>{ICONO_ORIGEN[o]} {o}</option>)}
          </select>
        </label>
        <label className="flex flex-col text-[10px] font-semibold uppercase tracking-wide text-humo">Fase
          <select value={fase} onChange={(e) => setFase(e.target.value as Fase | "todas")}
            className="mt-0.5 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm font-medium text-tinta outline-none focus:border-teal">
            <option value="todas">Todas</option>
            {FASES_SELECT.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
        <label className="flex flex-col text-[10px] font-semibold uppercase tracking-wide text-humo">Asesor
          <select value={asesorF} onChange={(e) => setAsesorF(e.target.value)}
            className="mt-0.5 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm font-medium text-tinta outline-none focus:border-teal">
            <option value="todos">Todos</option>
            {asesores.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        {!limpio && (
          <button onClick={() => { setOrigen("todos"); setFase("todas"); setAsesorF("todos"); setBusca(""); }}
            className="rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs font-semibold text-humo hover:bg-nube">✕ Limpiar</button>
        )}
      </div>

      {/* Tabla de leads */}
      {cargando ? (
        <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-14 text-center text-sm text-humo">Cargando prospectos…</div>
      ) : filtrada.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-14 text-center text-sm text-humo">
          {lista.length === 0 ? "Aún no hay leads. Toca “➕ Nuevo lead” para registrar el primero." : "Ningún lead coincide con el filtro."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-black/5 bg-white shadow-sm">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-black/5 text-left text-[11px] font-semibold uppercase tracking-wide text-humo">
                <th className="px-3 py-2.5">Lead</th>
                <th className="px-3 py-2.5">Origen</th>
                <th className="px-3 py-2.5">Asesor</th>
                <th className="px-3 py-2.5">Sucursal</th>
                <th className="px-3 py-2.5">Fase</th>
                <th className="px-3 py-2.5">Lead</th>
                <th className="px-3 py-2.5">Seguimiento</th>
                <th className="px-3 py-2.5">Contacto</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {filtrada.map((p) => {
                return (
                  <tr key={p.id} className="border-b border-black/5 last:border-0 hover:bg-nube/40">
                    <td className="px-3 py-2.5">
                      <button onClick={() => setAbierto(p)} className="text-left">
                        <div className="font-semibold text-teal-dark hover:underline">{p.nombre || "—"}</div>
                        <div className="text-[11px] text-humo">{p.folio || ""}{p.folio ? " · " : ""}{p.telefono || "sin teléfono"}{p.activoInteres ? ` · ${p.activoInteres}` : ""}</div>
                      </button>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{ICONO_ORIGEN[p.origen]} {p.origen}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-humo">{p.asesor || <span className="text-rose-500">sin asignar</span>}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-humo">{p.sucursal || "—"}</td>
                    <td className="px-3 py-2.5">
                      <select
                        value={p.fase}
                        onChange={(e) => cambiarFase(p, e.target.value as Fase)}
                        className={"rounded-full border px-2 py-1 text-xs font-semibold outline-none " + COLOR_FASE[p.fase]}
                      >
                        {FASES_SELECT.map((f) => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-humo">{fechaCorta(p.fechaLead)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {(() => {
                        const dias = diasPara(p.fechaProximo);
                        const cuando = dias === null ? <span className="text-humo">—</span>
                          : dias < 0 ? <span className="font-semibold text-rose-600">Vencido {Math.abs(dias)} d</span>
                          : dias === 0 ? <span className="font-semibold text-rose-600">HOY</span>
                          : <span className="font-semibold text-tinta">en {dias} día{dias === 1 ? "" : "s"}</span>;
                        return <div>{cuando}<div className="text-[11px] text-humo">{TIPO_SEG[p.fase] || "Seguimiento"}</div></div>;
                      })()}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <button onClick={() => llamarLead(p)} disabled={!p.telefono} title={p.telefono ? "Llamar" : "Sin teléfono"}
                          className="rounded-md px-1.5 py-1 text-base hover:bg-teal-soft disabled:opacity-30">📞</button>
                        <button onClick={() => waLead(p)} disabled={!p.telefono} title={p.telefono ? "WhatsApp" : "Sin teléfono"}
                          className="rounded-md px-1.5 py-1 text-base hover:bg-emerald-50 disabled:opacity-30">💬</button>
                        <button onClick={() => correoLead(p)} disabled={!p.email} title={p.email ? "Correo" : "Sin correo"}
                          className="rounded-md px-1.5 py-1 text-base hover:bg-blue-50 disabled:opacity-30">✉️</button>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {puedeBorrar && <button onClick={() => eliminar(p)} title="Borrar lead" className="rounded-md px-1.5 py-1 text-humo hover:bg-rose-50 hover:text-rose-600">🗑️</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      </>)}

      {nuevoAbierto && <ModalNuevoLead onCerrar={() => setNuevoAbierto(false)} onGuardado={() => { setNuevoAbierto(false); cargar(); }} />}
      {abierto && (
        <FichaProspecto
          prospecto={abierto}
          onCerrar={() => setAbierto(null)}
          onCambio={async () => { const fresca = await fetchProspectos(); setLista(fresca); setAbierto((a) => (a ? fresca.find((p) => p.id === a.id) || null : null)); }}
        />
      )}
      {llamarA && (
        <LlamarGrabar
          numero={llamarA.telefono}
          nombre={llamarA.nombre}
          rol={miRol || undefined}
          onContactoReal={() => llamadaHecha(llamarA)}
          onCerrar={() => setLlamarA(null)}
        />
      )}
    </div>
  );
}

function Sel({ label, value, set, ops, input }: { label: string; value: string; set: (v: string) => void; ops: readonly string[]; input: string }) {
  return (
    <div>
      <label className="text-[11px] font-semibold uppercase tracking-wide text-humo">{label}</label>
      <select value={value} onChange={(e) => set(e.target.value)} className={input}>
        <option value="">—</option>
        {ops.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function Mini({ etiqueta, valor, color }: { etiqueta: string; valor: number; color?: string }) {
  return (
    <div className="rounded-xl border border-black/5 bg-white px-3 py-2 shadow-sm">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-humo">{etiqueta}</div>
      <div className={"font-display text-xl font-extrabold " + (color || "text-tinta")}>{valor}</div>
    </div>
  );
}

function ModalNuevoLead({ onCerrar, onGuardado }: { onCerrar: () => void; onGuardado: () => void }) {
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [origen, setOrigen] = useState<Origen>("Facebook");
  const [asesor, setAsesor] = useState("");
  const [sucursal, setSucursal] = useState("");
  const [activoInteres, setActivoInteres] = useState("");
  const [notas, setNotas] = useState("");
  const [necesidad, setNecesidad] = useState("");
  const [formaPago, setFormaPago] = useState("");
  const [tipoActivo, setTipoActivo] = useState("");
  const [creditoTipo, setCreditoTipo] = useState("");
  const [tamanoCasa, setTamanoCasa] = useState("");
  const [presupuestoRango, setPresupuestoRango] = useState("");
  const [zona, setZona] = useState("");
  const [colonia, setColonia] = useState("");
  const [origenActivo, setOrigenActivo] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (!nombre.trim() || guardando) return;
    setGuardando(true);
    const ok = await agregarProspecto({
      nombre: nombre.trim(), telefono, email, origen, asesor, sucursal,
      activoInteres, notas, registradoPor: yoNombre(),
      necesidad, formaPago, tipoActivo, creditoTipo: formaPago === "Crédito" ? creditoTipo : "",
      tamanoCasa, presupuestoRango, zona, colonia, origenActivo,
    });
    setGuardando(false);
    if (ok) {
      // 7A · Reparto: avisa al instante (campanita), antes de que el lead se enfríe.
      avisarEvento({
        tipo: "sistema",
        accion: "prospecto_nuevo",
        titulo: ok.asesor ? `📌 Lead ${ok.folio} → ${ok.asesor}` : `🆕 Nuevo lead ${ok.folio} sin asignar`,
        detalle: ok.asesor
          ? `Llamar HOY · ${ok.zona || ok.sucursal || ""}`.trim()
          : `${ok.zona || ok.sucursal || ""} · repártelo (SDC / Gerente Local)`.trim(),
        autor: yoNombre() || undefined, modulo: "prospectos", refId: ok.id, icono: ok.asesor ? "📌" : "🆕",
      });
      onGuardado();
    } else alert("No se pudo guardar el lead. Intenta de nuevo.");
  }

  const input = "w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-teal";

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-tinta/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-extrabold text-tinta">➕ Nuevo lead</h2>
          <button onClick={onCerrar} className="rounded-md px-2 py-1 text-humo hover:bg-nube">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-humo">Nombre *</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={input} placeholder="Nombre del prospecto" />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-humo">Teléfono</label>
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)} className={input} placeholder="WhatsApp / celular" />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-humo">Correo</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} className={input} placeholder="correo@ejemplo.com" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-humo">Origen</label>
              <select value={origen} onChange={(e) => setOrigen(e.target.value as Origen)} className={input}>
                {ORIGENES.map((o) => <option key={o} value={o}>{ICONO_ORIGEN[o]} {o}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-humo">Sucursal</label>
              <select value={sucursal} onChange={(e) => setSucursal(e.target.value)} className={input}>
                <option value="">—</option>
                {SUCURSALES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-humo">Asesor (dueño)</label>
            <input value={asesor} onChange={(e) => setAsesor(e.target.value)} className={input} placeholder="Quién lo atiende (déjalo vacío si lo reparte SDC)" />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-humo">Activo / garantía de interés</label>
            <input value={activoInteres} onChange={(e) => setActivoInteres(e.target.value)} className={input} placeholder="Qué le interesó" />
          </div>
          <div className="rounded-xl border border-black/5 bg-nube/40 p-2.5">
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-teal-dark">Segmentación</p>
            <div className="grid grid-cols-2 gap-2">
              <Sel label="Necesidad" value={necesidad} set={setNecesidad} ops={NECESIDADES} input={input} />
              <Sel label="Forma de pago" value={formaPago} set={setFormaPago} ops={FORMAS_PAGO} input={input} />
              <Sel label="Tipo de activo" value={tipoActivo} set={setTipoActivo} ops={TIPOS_ACTIVO} input={input} />
              {formaPago === "Crédito" && <Sel label="Tipo de crédito" value={creditoTipo} set={setCreditoTipo} ops={CREDITO_TIPOS} input={input} />}
              <Sel label="Tamaño de casa" value={tamanoCasa} set={setTamanoCasa} ops={TAMANOS_CASA} input={input} />
              <Sel label="Presupuesto" value={presupuestoRango} set={setPresupuestoRango} ops={PRESUPUESTOS} input={input} />
              <Sel label="Zona" value={zona} set={setZona} ops={ZONAS} input={input} />
              <Sel label="Origen del activo" value={origenActivo} set={setOrigenActivo} ops={ORIGENES_ACTIVO} input={input} />
            </div>
            <div className="mt-2">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-humo">Colonia / sector</label>
              <input value={colonia} onChange={(e) => setColonia(e.target.value)} className={input} />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-humo">Notas</label>
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className={input} placeholder="Cualquier dato útil" />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={onCerrar} className="flex-1 rounded-lg border border-black/10 px-3 py-2 text-sm font-semibold text-humo hover:bg-nube">Cancelar</button>
          <button onClick={guardar} disabled={!nombre.trim() || guardando}
            className="flex-1 rounded-lg bg-teal px-3 py-2 text-sm font-semibold text-white hover:bg-teal-dark disabled:opacity-50">
            {guardando ? "Guardando…" : "Guardar lead"}
          </button>
        </div>
      </div>
    </div>
  );
}
