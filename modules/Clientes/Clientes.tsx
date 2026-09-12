// ===================================================================
// PANTALLA DE CLIENTES  →  va en: src/modules/Clientes/Clientes.tsx
// ===================================================================
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  fetchClientes,
  archivarCliente,
  eliminarCliente,
  convertirACliente,
  asignarAsesor,
  ESTATUS,
  estatusDe,
  CODIGO,
  origenCliente,
  etapaDe,
  type Cliente,
  type Estatus,
} from "../../data/clientes";
import { fetchComunicaciones, registrarComunicacion, type Comunicacion } from "../../data/comunicaciones";
import { generarSala } from "../../data/reuniones";
import { generarExpediente, moverCarpetaEtapa } from "../../data/expediente";
import { supabase } from "../../lib/supabase";
import LlamarGrabar from "../LlamarGrabar/LlamarGrabar";
import FormularioCliente from "./FormularioCliente";
import { fetchColaboradores, type Colaborador } from "../../data/colaboradores";
import { fetchPerfil } from "../../data/usuarios";
import { puedeAccion } from "../../data/roles";
import { nivelClienteArea } from "../../data/permisos";
import Paginador from "../../components/Paginador";
import { invalidarClientes } from "../../data/clientes";

const ORDEN_ESTATUS: Estatus[] = [
  "apartado", "proceso", "juicio", "formalizacion", "entregado", "riesgo", "cancelado",
];

function Chip({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${className}`}>
      {children}
    </span>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-humo">{etiqueta}</div>
      <div className="text-sm text-tinta">{valor || "—"}</div>
    </div>
  );
}

function soloDigitos(s: string): string {
  let d = (s || "").replace(/\D/g, "");
  if (d.length === 10) d = "52" + d;
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
const TIPO_ICONO: Record<string, string> = { whatsapp: "💬", correo: "✉️", llamada: "📞", videollamada: "📹", nota: "📝" };

function inicialesDe(n: string): string {
  return (n || "?").trim().split(/\s+/).map((x) => x[0]).slice(0, 2).join("").toUpperCase();
}

function Comunicaciones({ c, puedeColaborar }: { c: Cliente; puedeColaborar: boolean }) {
  const [items, setItems] = useState<Comunicacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [llamarAbierto, setLlamarAbierto] = useState(false);

  const yo = (() => { try { return JSON.parse(localStorage.getItem("chat_yo") || "null"); } catch { return null; } })();
  const autor: string | null = yo?.nombre || null;
  const whats = c.whatsapp || c.telefono;

  useEffect(() => {
    setCargando(true);
    fetchComunicaciones(String(c.id)).then(setItems).finally(() => setCargando(false));
  }, [c.id]);

  async function registrar(tipo: string, detalle: string) {
    const r = await registrarComunicacion({ clienteId: String(c.id), clienteNombre: c.nombre, tipo, detalle, autor });
    if (r) setItems((prev) => [r, ...prev]);
  }

  function contactarWhats() {
    if (!whats) { alert("Este cliente no tiene WhatsApp ni teléfono."); return; }
    const msg = `Hola ${c.nombre}, le escribimos de DIIPA · Inmuebles Accesibles.`;
    window.open(waLink(whats, msg), "_blank");
    registrar("whatsapp", "Mensaje de WhatsApp abierto.");
  }
  function contactarCorreo() {
    if (!c.email) { alert("Este cliente no tiene correo."); return; }
    window.open(gmailLink(c.email, "DIIPA · Inmuebles Accesibles", `Hola ${c.nombre}:\n\n`), "_blank");
    registrar("correo", "Correo abierto.");
  }
  function llamar() {
    if (!c.telefono) { alert("Este cliente no tiene teléfono."); return; }
    registrar("llamada", `Llamada a ${c.telefono}.`);
    setLlamarAbierto(true);
  }
  function videollamada() {
    const { url } = generarSala(c.nombre);
    const msg = `Hola ${c.nombre}, le compartimos el enlace para su videollamada con DIIPA · Inmuebles Accesibles:\n\n${url}\n\nSolo dé clic para entrar (no necesita instalar nada).`;
    registrar("videollamada", url);
    if (whats) window.open(waLink(whats, msg), "_blank");
    else if (c.email) window.open(gmailLink(c.email, "Videollamada · DIIPA Inmuebles Accesibles", msg), "_blank");
    else window.open(url, "_blank");
  }
  async function guardarNota() {
    if (!nota.trim() || guardando) return;
    setGuardando(true);
    await registrar("nota", nota.trim());
    setGuardando(false);
    setNota("");
  }

  return (
    <div>
      {puedeColaborar && (
      <div className="grid grid-cols-2 gap-2">
        <button onClick={contactarWhats} style={{ backgroundColor: "#25D366" }} className="rounded-xl px-3 py-2.5 text-sm font-semibold text-white">💬 WhatsApp</button>
        <button onClick={contactarCorreo} className="rounded-xl bg-teal px-3 py-2.5 text-sm font-semibold text-white hover:bg-teal-dark">✉️ Correo</button>
        <button onClick={videollamada} className="rounded-xl bg-aqua px-3 py-2.5 text-sm font-semibold text-white hover:bg-aqua-dark">📹 Videollamada</button>
        <button onClick={llamar} className="rounded-xl bg-tinta px-3 py-2.5 text-sm font-semibold text-white">📞 Llamar</button>
      </div>
      )}

      {puedeColaborar && (
      <div className="mt-3 flex items-end gap-2">
        <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} placeholder="Agregar una nota del contacto…" className="flex-1 resize-none rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20" />
        <button onClick={guardarNota} disabled={!nota.trim() || guardando} className="shrink-0 rounded-xl bg-teal px-3 py-2.5 text-sm font-semibold text-white hover:bg-teal-dark disabled:opacity-50">{guardando ? "…" : "Guardar"}</button>
      </div>
      )}

      <div className="mt-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-teal-dark">Registro de contactos</p>
        {cargando ? (
          <p className="text-sm text-humo">Cargando…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-humo">Aún no hay contactos registrados. Usa los botones de arriba.</p>
        ) : (
          items.map((it) => (
            <div key={it.id} className="rounded-xl border border-black/5 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-tinta">{TIPO_ICONO[it.tipo] || "•"} {it.tipo.charAt(0).toUpperCase() + it.tipo.slice(1)}</span>
                <span className="text-[11px] text-humo">{fechaCorta(it.created_at)}</span>
              </div>
              {it.detalle && (it.tipo === "videollamada"
                ? <button onClick={() => window.open(it.detalle!, "_blank")} className="mt-1 text-sm text-aqua-dark underline break-all">{it.detalle}</button>
                : <p className="mt-1 text-sm text-humo break-words">{it.detalle}</p>)}
              {it.autor && <p className="mt-1 text-[11px] text-humo">Por {it.autor}</p>}
            </div>
          ))
        )}
      </div>

      {llamarAbierto && (
        <LlamarGrabar
          numero={c.telefono}
          nombre={c.nombre}
          area={c.area}
          onCerrar={() => setLlamarAbierto(false)}
        />
      )}
    </div>
  );
}

const PESTAÑAS = ["Comunicaciones", "Pagos", "Documentos", "Dictámenes UCP", "Avances"] as const;

function Ficha({ c, onCerrar, onConvertir, puedeAsignar, puedeConvertir, puedeColaborar, onAsignar, onActualizar }: { c: Cliente; onCerrar: () => void; onConvertir: () => void; puedeAsignar: boolean; puedeConvertir: boolean; puedeColaborar: boolean; onAsignar: (nombre: string, correo: string) => void; onActualizar: (c: Cliente) => void }) {
  const [tab, setTab] = useState<(typeof PESTAÑAS)[number]>("Comunicaciones");
  const est = estatusDe(c.estatus);

  // 👇 Fase B: selector de asesor
  const [pickerAbierto, setPickerAbierto] = useState(false);
  const [colab, setColab] = useState<Colaborador[]>([]);
  const [buscaAsesor, setBuscaAsesor] = useState("");
  useEffect(() => { if (pickerAbierto && colab.length === 0) fetchColaboradores().then(setColab).catch(() => {}); }, [pickerAbierto, colab.length]);

  // Generar / abrir expediente en Drive (ruta: Sucursal → Etapa → Registro)
  const [generando, setGenerando] = useState(false);
  const [genEstado, setGenEstado] = useState("");
  const [genLink, setGenLink] = useState<string | null>(c.carpetaDriveId ? "https://drive.google.com/drive/folders/" + c.carpetaDriveId : null);
  async function generar() {
    setGenerando(true);
    setGenEstado("");
    const r = await generarExpediente(c);
    setGenerando(false);
    if (r.ok) {
      setGenEstado(r.yaExistia ? "📁 Ya tenía carpeta — te abro la que existe" : "✅ Expediente creado en tu Drive");
      setGenLink(r.link || null);
      // 🔒 Candado: guarda el id en la ficha abierta y en la lista para no duplicar.
      if (r.carpetaId) onActualizar({ ...c, carpetaDriveId: r.carpetaId, carpetaDriveEtapa: r.etapa || c.carpetaDriveEtapa });
    } else {
      setGenEstado("No se pudo: " + (r.error || "intenta de nuevo"));
    }
  }

  // 👇 FASE D.2: mover la carpeta a la etapa que le toca (cuando hay desfase).
  const [moviendo, setMoviendo] = useState(false);
  async function mover() {
    setMoviendo(true);
    const r = await moverCarpetaEtapa(c);
    setMoviendo(false);
    if (r.ok && r.movido) {
      const nueva = r.etapa || etapaDe(c);
      setGenEstado("📦 Carpeta movida a “" + nueva + "”");
      onActualizar({ ...c, carpetaDriveEtapa: nueva });
    } else if (!r.ok) {
      setGenEstado("No se pudo mover: " + (r.error || "intenta de nuevo"));
    }
  }

  // Paso C: capturar el correo del cliente cuando falte (se guarda en Supabase).
  const [correo, setCorreo] = useState(c.email || "");
  const [editandoCorreo, setEditandoCorreo] = useState(false);
  const [correoTemp, setCorreoTemp] = useState("");
  const [guardandoCorreo, setGuardandoCorreo] = useState(false);
  async function guardarCorreo() {
    const v = correoTemp.trim();
    if (!v) return;
    setGuardandoCorreo(true);
    const { error } = await supabase.from("clientes").update({ email: v }).eq("id", c.id);
    invalidarClientes();
    setGuardandoCorreo(false);
    if (!error) { setCorreo(v); setEditandoCorreo(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-tinta/40" onClick={onCerrar}>
      <div className="h-full w-full max-w-xl overflow-y-auto bg-nube shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 border-b border-black/5 bg-white px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-extrabold text-tinta">{c.nombre}</h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Chip className={est.chip}><span className={`h-2 w-2 rounded-full ${est.punto}`} /> {est.label}</Chip>
                <Chip className="bg-teal-soft text-teal-dark">{c.codigo} · {CODIGO[c.codigo]}</Chip>
                <Chip className="bg-dorado/15 text-dorado-dark">Área: {c.area}</Chip>
                {c.folio && <Chip className="bg-dorado/15 font-mono text-dorado-dark">{c.folio}</Chip>}
                {origenCliente(c).enSiga && <Chip className="bg-emerald-100 text-emerald-800">🟢 SIGA</Chip>}
                <Chip className="bg-sky-100 text-sky-800">🔵 JurisConecta</Chip>
                {origenCliente(c).faltaInfo && <Chip className="bg-amber-100 text-amber-800">⚠️ Falta info</Chip>}
              </div>
              <button onClick={onCerrar} className="rounded-lg px-2 py-1 text-humo hover:bg-nube" aria-label="Cerrar">✕</button>
            </div>
          </div>
          {c.tipo === "prospecto" && (
            puedeConvertir
              ? <button onClick={onConvertir} className="mt-3 w-full rounded-xl bg-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-dark">➡️ Convertir a Cliente</button>
              : <p className="mt-3 rounded-xl bg-nube px-4 py-2.5 text-center text-[12px] font-medium text-humo">🔒 Solo un director puede convertir a Cliente.</p>
          )}
        </div>

        <div className="space-y-5 p-5">
          {c.conyuge && (
            <div className={`rounded-xl border px-4 py-3 text-sm ${c.conyugeNotificado ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-300 bg-amber-50 text-amber-800"}`}>
              <strong>Cónyuge:</strong> {c.conyuge} ·{" "}
              {c.conyugeNotificado ? "✅ Emplazado / notificado." : "⚠️ Aún NO emplazado — revisar derechos del cónyuge antes de avanzar el juicio."}
            </div>
          )}

          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-teal-dark">Datos personales</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Dato etiqueta="CURP / RFC" valor={c.curpRfc} />
              <Dato etiqueta="Identificación (INE)" valor={c.ine} />
              <Dato etiqueta="Estado civil" valor={c.estadoCivil} />
              <Dato etiqueta="Teléfono" valor={c.telefono} />
              <Dato etiqueta="WhatsApp" valor={c.whatsapp} />
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wide text-humo">Email</div>
                {correo ? (
                  <div className="text-sm text-tinta">{correo}</div>
                ) : editandoCorreo ? (
                  <div className="mt-1 flex gap-1.5">
                    <input value={correoTemp} onChange={(e) => setCorreoTemp(e.target.value)} type="email" placeholder="correo@ejemplo.com" className="w-full rounded-lg border border-black/10 px-2 py-1 text-sm outline-none focus:border-teal" />
                    <button onClick={guardarCorreo} disabled={guardandoCorreo} className="shrink-0 rounded-lg bg-teal px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50">{guardandoCorreo ? "…" : "Guardar"}</button>
                  </div>
                ) : (
                  <button onClick={() => { setCorreoTemp(""); setEditandoCorreo(true); }} className="mt-0.5 text-sm font-semibold text-teal underline">+ Agregar correo</button>
                )}
              </div>
              <div className="col-span-2"><Dato etiqueta="Domicilio" valor={c.domicilio} /></div>
              <Dato etiqueta="Cómo nos conoció" valor={c.comoConocio} />
              <Dato etiqueta="Quién lo refirió" valor={c.refirio} />
            </div>
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-teal-dark">Asesor a cargo</h3>
            {c.asesorAsignado ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-soft text-sm font-bold text-teal-dark">{inicialesDe(c.asesorAsignado)}</div>
                  <div>
                    <div className="text-sm font-semibold text-tinta">{c.asesorAsignado}</div>
                    <div className="text-[11px] text-humo">{c.asesorAsignadoPor ? "Asignado por " + c.asesorAsignadoPor : ""}{c.fechaAsignacion ? " · " + fechaCorta(c.fechaAsignacion) : ""}</div>
                  </div>
                </div>
                {puedeAsignar && <button onClick={() => setPickerAbierto(true)} className="shrink-0 rounded-lg border border-black/10 px-3 py-1.5 text-xs font-semibold text-humo hover:bg-nube">🔄 Reasignar</button>}
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-humo">Sin asignar</span>
                {puedeAsignar
                  ? <button onClick={() => setPickerAbierto(true)} className="shrink-0 rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-dark">+ Asignar asesor</button>
                  : <span className="text-[11px] text-humo">Solo directores y gerentes asignan</span>}
              </div>
            )}
            {c.historialAsesores && c.historialAsesores.length > 0 && (
              <div className="mt-3 border-t border-black/5 pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-humo">Historial de asesores</p>
                <ul className="mt-1.5 space-y-1">
                  {c.historialAsesores.map((h, i) => (
                    <li key={i} className="flex items-center gap-2 text-[12px] text-humo">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-nube text-[10px] font-bold text-humo">{inicialesDe(h.nombre)}</span>
                      <span><span className="font-medium text-tinta">{h.nombre}</span>{h.hasta ? " · hasta " + fechaCorta(h.hasta) : ""}{h.asignadoPor ? " · lo asignó " + h.asignadoPor : ""}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-teal-dark">Vínculos</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Dato etiqueta="Folio de registro" valor={c.folio} />
              {c.folioCierre && <Dato etiqueta="Folio de cierre" valor={c.folioCierre} />}
              <Dato etiqueta="ID Prospecto" valor={c.prospecto} />
              <Dato etiqueta="Garantía ligada" valor={c.garantia} />
              <Dato etiqueta="Folio SIGA" valor={c.folioSiga} />
              <Dato etiqueta="Folio garantía SIGA" valor={c.folioGarantiaSiga} />
              <Dato etiqueta="Crédito SIGA" valor={c.creditoSiga} />
              <Dato etiqueta="Expediente" valor={c.expediente} />
              <Dato etiqueta="Fecha de firma" valor={c.fechaFirma} />
              <Dato etiqueta="Sucursal" valor={c.sucursal} />
              <div className="col-span-2"><Dato etiqueta="Dirección de la garantía" valor={c.direccionGarantia} /></div>
              {c.tipo === "cliente" && c.fechaConversion && <div className="col-span-2"><Dato etiqueta="Convertido a cliente" valor={fechaCorta(c.fechaConversion) + (c.convertidoPor ? " · por " + c.convertidoPor : "")} /></div>}
            </div>
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-sm font-bold uppercase tracking-wider text-teal-dark">Expediente en Drive</h3>
                <p className="mt-0.5 text-xs text-humo">
                  Carpeta: <b>{c.sucursal || "Sin sucursal"}</b> → <b>{etapaDe(c)}</b> → {c.nombre}
                </p>
                {c.carpetaDriveId
                  ? <p className="mt-0.5 text-[11px] font-semibold text-emerald-700">🔒 Ya tiene carpeta — no se vuelve a crear.</p>
                  : <p className="mt-0.5 text-[11px] text-humo">Aún sin carpeta. Al generarla queda con candado para no duplicarse.</p>}
              </div>
              <button onClick={generar} disabled={generando} className="shrink-0 rounded-xl bg-dorado px-4 py-2.5 text-sm font-semibold text-tinta transition hover:brightness-95 disabled:opacity-50">
                {generando ? "Procesando…" : c.carpetaDriveId ? "📁 Abrir expediente" : "📁 Generar expediente"}
              </button>
            </div>
            {genEstado && <p className="mt-2 text-sm font-semibold text-humo">{genEstado}</p>}
            {genLink && <a href={genLink} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm font-semibold text-teal underline">Abrir carpeta del expediente</a>}
            {c.carpetaDriveId && c.carpetaDriveEtapa && c.carpetaDriveEtapa !== etapaDe(c) && (
              <button onClick={mover} disabled={moviendo} className="mt-3 w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50">
                {moviendo ? "Moviendo…" : `📦 Mover carpeta a “${etapaDe(c)}” (está en “${c.carpetaDriveEtapa}”)`}
              </button>
            )}
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap gap-1.5">
              {PESTAÑAS.map((p) => (
                <button key={p} onClick={() => setTab(p)} className={tab === p ? "rounded-lg bg-teal-soft px-3 py-1.5 text-xs font-semibold text-teal-dark" : "rounded-lg px-3 py-1.5 text-xs font-medium text-humo hover:bg-nube"}>{p}</button>
              ))}
            </div>
            {tab === "Comunicaciones" ? (
              <Comunicaciones c={c} puedeColaborar={puedeColaborar} />
            ) : (
              <div className="rounded-xl border border-dashed border-black/10 px-4 py-8 text-center text-sm text-humo">
                {tab} — se conectará con tu base de datos (Supabase) en un paso próximo.
                <br />
                <span className="text-xs">Aquí aparecerá el historial de {tab.toLowerCase()} de este cliente.</span>
              </div>
            )}
          </section>
        </div>

        {pickerAbierto && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-tinta/50 p-4" onClick={() => setPickerAbierto(false)}>
            <div className="flex max-h-[80vh] w-full max-w-sm flex-col rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-display text-sm font-bold text-tinta">Elige al asesor</h3>
                <button onClick={() => setPickerAbierto(false)} className="text-humo hover:text-tinta">✕</button>
              </div>
              <input value={buscaAsesor} onChange={(e) => setBuscaAsesor(e.target.value)} placeholder="Buscar asesor…" className="mb-2 w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-teal" />
              <div className="flex-1 overflow-y-auto">
                {colab.length === 0 ? (
                  <p className="px-2 py-4 text-center text-sm text-humo">Cargando…</p>
                ) : (
                  colab
                    .filter((x) => !buscaAsesor || (x.nombre || "").toLowerCase().includes(buscaAsesor.toLowerCase()))
                    .map((x) => (
                      <button key={x.id} onClick={() => { onAsignar(x.nombre, x.correo || ""); setPickerAbierto(false); }} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-nube">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-soft text-xs font-bold text-teal-dark">{inicialesDe(x.nombre)}</div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-tinta">{x.nombre}</div>
                          <div className="truncate text-[11px] text-humo">{[x.puesto, x.area].filter(Boolean).join(" · ")}</div>
                        </div>
                      </button>
                    ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
export default function Clientes() {
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 20;
  const [filtro, setFiltro] = useState<"todos" | Estatus>("todos");
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "prospecto" | "cliente">("todos");
  const [abierta, setAbierta] = useState<Cliente | null>(null);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const [acciones, setAcciones] = useState<Cliente | null>(null);
  const [mostrarArch, setMostrarArch] = useState(false);
  const [rolUsuario, setRolUsuario] = useState<string | null>(null);

  useEffect(() => {
    fetchClientes().then((data) => setClientes(data)).catch(() => setError(true)).finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const email = data.session?.user?.email;
      if (email) fetchPerfil(email).then((pf) => setRolUsuario(pf?.rol ?? null)).catch(() => {});
    });
  }, []);

  const puedeAsignar = puedeAccion(rolUsuario, "asignar_asesor");
  const puedeConvertir = puedeAccion(rolUsuario, "convertir_cliente"); // 👈 Fase E.2: solo directores

  async function archivar(c: Cliente) {
    const nuevo = !c.archivado;
    setClientes((prev) => prev.map((x) => (x.id === c.id ? { ...x, archivado: nuevo } : x)));
    const { ok, folioCierre } = await archivarCliente(c, nuevo);
    if (ok) setClientes((prev) => prev.map((x) => (x.id === c.id ? { ...x, archivado: nuevo, folioCierre } : x)));
    else setClientes((prev) => prev.map((x) => (x.id === c.id ? { ...x, archivado: !nuevo } : x)));
  }

  async function eliminar(c: Cliente) {
    if (!confirm(`¿Mandar a "${c.nombre}" a la papelera?\n\nLo podrás restaurar desde Configuración → Papelera.`)) return;
    setClientes((prev) => prev.map((x) => (x.id === c.id ? { ...x, eliminado: true } : x)));
    const ok = await eliminarCliente(c.id, true);
    if (!ok) setClientes((prev) => prev.map((x) => (x.id === c.id ? { ...x, eliminado: false } : x)));
  }

  async function convertir(c: Cliente) {
    const r = await convertirACliente(c);
    if (r.ok && r.cliente) {
      const actualizado = r.cliente;
      setClientes((prev) => prev.map((x) => (x.id === c.id ? actualizado : x)));
      setAbierta((a) => (a && a.id === c.id ? actualizado : a));
      // 👇 FASE D.2: al pasar a Cliente cambia la etapa → movemos la carpeta sola.
      const mv = await moverCarpetaEtapa(actualizado);
      if (mv.ok && mv.movido) {
        const conEtapa = { ...actualizado, carpetaDriveEtapa: mv.etapa || actualizado.carpetaDriveEtapa };
        setClientes((prev) => prev.map((x) => (x.id === conEtapa.id ? conEtapa : x)));
        setAbierta((a) => (a && a.id === conEtapa.id ? conEtapa : a));
      }
    } else {
      alert("No se pudo convertir. Intenta de nuevo.");
    }
  }

  async function asignar(c: Cliente, nombre: string, correo: string) {
    const r = await asignarAsesor(c, nombre, correo);
    if (r.ok && r.cliente) {
      const a = r.cliente;
      setClientes((prev) => prev.map((x) => (x.id === c.id ? a : x)));
      setAbierta((ab) => (ab && ab.id === c.id ? a : ab));
    } else {
      alert("No se pudo asignar el asesor. Intenta de nuevo.");
    }
  }

  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return clientes.filter((c) => {
      const coincideTexto =
        !q ||
        c.nombre.toLowerCase().includes(q) ||
        c.folio.toLowerCase().includes(q) ||
        c.folioCierre.toLowerCase().includes(q) ||
        c.prospecto.toLowerCase().includes(q) ||
        c.garantia.toLowerCase().includes(q) ||
        c.expediente.toLowerCase().includes(q) ||
        c.folioSiga.toLowerCase().includes(q) ||
        c.folioGarantiaSiga.toLowerCase().includes(q) ||
        c.creditoSiga.toLowerCase().includes(q) ||
        c.telefono.includes(q);
      const coincideEstatus = filtro === "todos" || c.estatus === filtro;
      const coincideTipo = filtroTipo === "todos" || c.tipo === filtroTipo;
      const coincideAcceso = nivelClienteArea(rolUsuario, c.area) !== "ninguno";
      return !c.eliminado && coincideTexto && coincideEstatus && coincideTipo && coincideAcceso;
    });
  }, [busqueda, filtro, filtroTipo, clientes, rolUsuario]);

  const visibles = lista.filter((c) => !c.archivado);
  const archivados = lista.filter((c) => c.archivado);

  // Paginación (20 por página) de la lista activa.
  const totalPaginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const offset = (paginaSegura - 1) * POR_PAGINA;
  const visiblesPagina = visibles.slice(offset, offset + POR_PAGINA);
  useEffect(() => { setPagina(1); }, [busqueda, filtro, filtroTipo]);

  const Th = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
    <th className={`whitespace-nowrap px-3 py-3 text-left font-bold ${className}`}>{children}</th>
  );
  const Td = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
    <td className={`whitespace-nowrap px-3 py-2.5 ${className}`}>{children}</td>
  );

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-5 space-y-3">
        <div className="flex justify-end">
          <button onClick={() => setRegistrando(true)} className="rounded-xl bg-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-dark">+ Registrar cliente</button>
        </div>
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, folio, folio/crédito SIGA, GAR, expediente o teléfono…"
          className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm shadow-sm outline-none transition placeholder:text-humo/70 focus:border-teal focus:ring-2 focus:ring-teal/20"
        />
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setFiltroTipo("todos")} className={filtroTipo === "todos" ? "rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white" : "rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-humo hover:bg-teal-soft"}>Todos</button>
          <button onClick={() => setFiltroTipo("prospecto")} className={filtroTipo === "prospecto" ? "rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white" : "rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-humo hover:bg-teal-soft"}>🟡 Prospectos</button>
          <button onClick={() => setFiltroTipo("cliente")} className={filtroTipo === "cliente" ? "rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white" : "rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-humo hover:bg-teal-soft"}>🟢 Clientes</button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setFiltro("todos")} className={filtro === "todos" ? "rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white" : "rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-humo hover:bg-teal-soft"}>Todos</button>
          {ORDEN_ESTATUS.map((e) => (
            <button key={e} onClick={() => setFiltro(e)} className={filtro === e ? "rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white" : "rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-humo hover:bg-teal-soft"}>{ESTATUS[e].label}</button>
          ))}
        </div>
      </div>

      {cargando ? (
        <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-16 text-center text-humo">Cargando clientes…</div>
      ) : error ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-16 text-center text-amber-800">No se pudo conectar con la base de datos. Revisa tu conexión e inténtalo de nuevo.</div>
      ) : lista.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-16 text-center text-humo">No hay clientes que coincidan con tu búsqueda.</div>
      ) : (
        <>
          {visibles.length > 0 ? (
            <>
              {/* MÓVIL Y TABLET: tarjetas (ya no tabla que se va de lado) */}
              <div className="space-y-2.5 lg:hidden">
                {visiblesPagina.map((c) => {
                  const est = estatusDe(c.estatus);
                  return (
                    <div
                      key={c.id}
                      onClick={() => setAbierta(c)}
                      className="block w-full cursor-pointer rounded-2xl border border-black/5 bg-white p-3.5 text-left shadow-sm transition hover:border-teal/30"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-display font-bold text-tinta">{c.nombre}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); setAcciones(c); }}
                          aria-label="Acciones"
                          className="shrink-0 rounded-md px-1.5 py-0.5 text-lg leading-none text-humo hover:bg-nube"
                        >⋮</button>
                      </div>
                      {c.folio && <div className="mt-0.5 font-mono text-[11px] text-dorado-dark">{c.folio}</div>}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Chip className={est.chip}><span className={`h-2 w-2 rounded-full ${est.punto}`} /> {est.label}</Chip>
                        <Chip className="bg-teal-soft text-teal-dark">{c.codigo}</Chip>
                        {c.tipo === "cliente"
                          ? <Chip className="bg-emerald-100 text-emerald-800">🟢 Cliente</Chip>
                          : <Chip className="bg-amber-100 text-amber-800">🟡 Prospecto</Chip>}
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] text-humo">
                        {c.garantia && <span><span className="text-humo/60">GAR:</span> <span className="font-medium text-aqua-dark">{c.garantia}</span></span>}
                        {c.prospecto && <span><span className="text-humo/60">PROS:</span> {c.prospecto}</span>}
                        {c.expediente && <span><span className="text-humo/60">Exp:</span> {c.expediente}</span>}
                        {c.telefono && <span><span className="text-humo/60">Tel:</span> {c.telefono}</span>}
                      </div>
                      {c.domicilio && <div className="mt-1 truncate text-[12px] text-humo">📍 {c.domicilio}</div>}
                    </div>
                  );
                })}
              </div>

              {/* ESCRITORIO: tabla compacta. Estatus y Cliente SIEMPRE visibles; las demás aparecen al haber más ancho. */}
              <div className="hidden overflow-x-auto rounded-2xl border border-black/5 bg-white shadow-sm lg:block">
                <table className="w-full text-sm">
                  <thead className="border-b border-black/5 bg-teal-soft text-[12px] uppercase tracking-wide text-teal-dark">
                    <tr>
                      <Th className="hidden 2xl:table-cell">#</Th>
                      <Th>Estatus</Th>
                      <Th>Cliente</Th>
                      <Th>Folio</Th>
                      <Th className="hidden xl:table-cell">Código</Th>
                      <Th className="hidden xl:table-cell">Prospecto</Th>
                      <Th>Garantía</Th>
                      <Th className="hidden xl:table-cell">Expediente</Th>
                      <Th className="hidden 2xl:table-cell">Domicilio</Th>
                      <Th className="hidden xl:table-cell">Teléfono</Th>
                      <Th className="hidden 2xl:table-cell">Firma</Th>
                      <Th> </Th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiblesPagina.map((c, i) => {
                      const est = estatusDe(c.estatus);
                      return (
                        <tr key={c.id} onClick={() => setAbierta(c)} className={`cursor-pointer border-b border-black/5 ${i % 2 ? "bg-nube/40" : "bg-white"} hover:bg-teal-soft/60`}>
                          <Td className="hidden text-humo 2xl:table-cell">{offset + i + 1}</Td>
                          <Td><Chip className={est.chip}><span className={`h-2 w-2 rounded-full ${est.punto}`} /> {est.label}</Chip></Td>
                          <Td className="font-display font-bold text-tinta">{c.nombre}{c.tipo === "cliente" ? <span title="Cliente" className="ml-1.5 align-middle">🟢</span> : <span title="Prospecto" className="ml-1.5 align-middle">🟡</span>}</Td>
                          <Td className="font-mono text-[12px] text-dorado-dark">{c.folio || "—"}</Td>
                          <Td className="hidden xl:table-cell"><Chip className="bg-teal-soft text-teal-dark">{c.codigo}</Chip></Td>
                          <Td className="hidden text-humo xl:table-cell">{c.prospecto || "—"}</Td>
                          <Td className="font-medium text-aqua-dark">{c.garantia || "—"}</Td>
                          <Td className="hidden text-humo xl:table-cell">{c.expediente || "—"}</Td>
                          <Td className="hidden max-w-[220px] truncate text-humo 2xl:table-cell">{c.domicilio || "—"}</Td>
                          <Td className="hidden text-tinta xl:table-cell">{c.telefono || "—"}</Td>
                          <Td className="hidden text-humo 2xl:table-cell">{c.fechaFirma || "—"}</Td>
                          <Td>
                            <button
                              onClick={(e) => { e.stopPropagation(); setAcciones(c); }}
                              aria-label="Acciones"
                              className="rounded-md px-2 py-0.5 text-lg leading-none text-humo hover:bg-nube"
                            >⋮</button>
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {visibles.length > POR_PAGINA && (
                <>
                  <Paginador pagina={paginaSegura} total={totalPaginas} onCambio={setPagina} />
                  <p className="mt-1 text-center text-[11px] text-humo">Mostrando {offset + 1}–{Math.min(offset + POR_PAGINA, visibles.length)} de {visibles.length}</p>
                </>
              )}
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-10 text-center text-sm text-humo">No hay clientes activos en este filtro.</div>
          )}

          {/* ===== ARCHIVADOS (colapsable) ===== */}
          {archivados.length > 0 && (
            <div className="mt-4">
              <button onClick={() => setMostrarArch((v) => !v)} className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-humo hover:text-tinta">
                🗄️ Archivados ({archivados.length}) {mostrarArch ? "▾" : "▸"}
              </button>
              {mostrarArch && (
                <div className="mt-2 overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
                  {archivados.map((c) => {
                    const est = estatusDe(c.estatus);
                    return (
                      <div key={c.id} className="flex items-center justify-between gap-2 border-b border-black/5 px-3 py-2.5 last:border-b-0">
                        <button onClick={() => setAbierta(c)} className="flex min-w-0 items-center gap-2 text-left">
                          <Chip className={est.chip}><span className={`h-2 w-2 rounded-full ${est.punto}`} /> {est.label}</Chip>
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-tinta">{c.nombre}</span>
                            {c.folioCierre && <span className="block font-mono text-[11px] text-humo">{c.folioCierre}</span>}
                          </span>
                        </button>
                        {puedeAccion(rolUsuario, "archivar") && <button onClick={() => archivar(c)} className="shrink-0 rounded-lg border border-teal/30 px-2.5 py-1 text-[11px] font-semibold text-teal-dark hover:bg-teal-soft">Desarchivar</button>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <p className="mt-6 text-center text-xs text-humo">{visibles.length} cliente(s){archivados.length > 0 ? ` · ${archivados.length} archivado(s)` : ""} · Toca una fila para abrir la ficha completa.</p>

      {abierta && <Ficha c={abierta} onCerrar={() => setAbierta(null)} onConvertir={() => convertir(abierta)} puedeAsignar={puedeAsignar && nivelClienteArea(rolUsuario, abierta.area) === "editar"} puedeConvertir={puedeConvertir && nivelClienteArea(rolUsuario, abierta.area) === "editar"} puedeColaborar={nivelClienteArea(rolUsuario, abierta.area) !== "ver" && nivelClienteArea(rolUsuario, abierta.area) !== "ninguno"} onAsignar={(nombre, correo) => asignar(abierta, nombre, correo)} onActualizar={(cc) => { setClientes((prev) => prev.map((x) => (x.id === cc.id ? cc : x))); setAbierta((a) => (a && a.id === cc.id ? cc : a)); }} />}

      {acciones && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-tinta/40 p-4" onClick={() => setAcciones(null)}>
          <div className="w-full max-w-xs rounded-2xl bg-white p-3 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="truncate px-2 py-1.5 text-sm font-semibold text-tinta">{acciones.nombre}</p>
            <button onClick={() => { setAbierta(acciones); setAcciones(null); }} className="w-full rounded-lg px-3 py-2.5 text-left text-sm text-tinta hover:bg-nube">📋 Ver ficha</button>
            {acciones.tipo === "prospecto" && (
              <button onClick={() => { convertir(acciones); setAcciones(null); }} className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-teal-dark hover:bg-teal-soft">➡️ Convertir a Cliente</button>
            )}
            {puedeAccion(rolUsuario, "archivar") && <button onClick={() => { archivar(acciones); setAcciones(null); }} className="w-full rounded-lg px-3 py-2.5 text-left text-sm text-tinta hover:bg-nube">{acciones.archivado ? "📤 Desarchivar" : "🗄️ Archivar"}</button>}
            {puedeAccion(rolUsuario, "enviar_papelera") && <button onClick={() => { eliminar(acciones); setAcciones(null); }} className="w-full rounded-lg px-3 py-2.5 text-left text-sm text-rose-600 hover:bg-rose-50">🗑️ Eliminar</button>}
            <button onClick={() => setAcciones(null)} className="mt-1 w-full rounded-lg px-3 py-2 text-sm text-humo hover:bg-nube">Cerrar</button>
          </div>
        </div>
      )}

      {registrando && (
        <FormularioCliente
          existentes={clientes}
          onAbrirExistente={(c) => { setRegistrando(false); setAbierta(c); }}
          onCerrar={() => setRegistrando(false)}
          onGuardado={(nuevo) => { setClientes((p) => [...p, nuevo]); setRegistrando(false); }}
        />
      )}
    </div>
  );
}
