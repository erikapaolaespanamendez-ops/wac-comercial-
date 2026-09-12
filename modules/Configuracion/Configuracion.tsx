import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { supabase } from "../../lib/supabase";
import {
  fetchColaboradores,
  crearColaborador,
  editarColaborador,
  borrarColaborador,
  subirFotoColaborador,
  type Colaborador,
} from "../../data/colaboradores";
import { ROLES, GRUPOS_ROLES, puedeAccion } from "../../data/roles";
import { fetchPerfil } from "../../data/usuarios";
import BotonNotificaciones from "../Notificaciones/BotonNotificaciones";
import FoliosRegistro from "./FoliosRegistro";
import RolesPermisos from "./RolesPermisos";
import NivelesComercial from "./NivelesComercial";
import Papelera from "./Papelera";
import Administradoras from "./Administradoras";
import CatalogoCarteras from "./CatalogoCarteras";
import { generarExpedienteColaborador } from "../../data/expedienteColaborador";

const AREAS = [
  { clave: "direccion", nombre: "Dirección", color: "#C9A227" },
  { clave: "juridico", nombre: "Jurídico", color: "#7C3AED" },
  { clave: "comercial", nombre: "Comercial", color: "#16A34A" },
  { clave: "contabilidad", nombre: "Contabilidad", color: "#1E50A0" },
  { clave: "atencion", nombre: "Atención", color: "#EA580C" },
  { clave: "tecnologia", nombre: "Tecnología", color: "#64748B" },
];
const ROLES_SISTEMA = ["super_admin", "admin", "colaborador"];
const ROLES_TELEFONIA = [
  { v: "", t: "Sin rol de teléfono" },
  { v: "telefonista_primer_contacto", t: "Telefonista Primer Contacto" },
  { v: "secretaria_general", t: "Secretaria General (Gerente de Secretarías)" },
  { v: "secretaria", t: "Secretaria de Área" },
  { v: "asistente_contable", t: "Asistente Contable" },
  { v: "director", t: "Director de Área" },
];

const ROLES_ACCESO = ["DGE", "DIL", "DGC", "GAD", "RAC", "UCM", "UCP", "URRJ", "Colaborador", "Invitado"];

// Extensiones oficiales por área (bloques fijos; cada persona una, sin repetir).
function rango(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}
const EXTENSIONES: Record<string, number[]> = {
  direccion: rango(100, 109),
  juridico: rango(200, 209),
  comercial: rango(300, 309),
  contabilidad: rango(400, 409),
  atencion: rango(500, 509),
  tecnologia: rango(600, 609),
};

// Área del conmutador según el grupo del rol.
const AREA_POR_GRUPO: Record<string, string> = {
  SIS: "direccion",
  DGE: "direccion",
  DGC: "comercial",
  DIL: "juridico",
  GAD: "contabilidad",
  RAC: "atencion",
  DTR: "tecnologia",
};

// Extensión oficial FIJA por rol (código). Al elegir el rol, se pone sola.
const EXTENSION_POR_ROL: Record<string, string> = {
  DGE: "100",
  DGC: "300", GRS_Nacional: "301", GRC: "302", GL_GDL: "303", GL_CUL: "304", GL_LAP: "305", GL_MAZ: "306", SDC: "307", SS: "308",
  DIL: "200", URRJ: "201", UCP: "202", UCM: "203", UDP: "204", UFC: "205",
  GAD: "400", UFF_Fact: "401", UFF_Cobros: "402", UFF_Pagos: "403", ASIS_CONT: "404", SEC_GAD: "405",
  RAC: "500", SRAC: "501", ATC: "502",
  Super_Admin: "109",
};

type Solicitud = { email: string; nombre: string; estado: string };

function areaNombre(clave: string | null): string {
  return AREAS.find((a) => a.clave === clave)?.nombre || clave || "—";
}
function areaColor(clave: string | null): string {
  return AREAS.find((a) => a.clave === clave)?.color || "#64748B";
}

// Le falta algún dato clave (lo usamos para marcar con ⚠️ a los de las pruebas).
function incompleto(c: Colaborador): boolean {
  return !c.puesto || !c.area || !c.extension || !c.correo || !c.numero_oficial;
}

function Avatar({ nombre, foto, size = 44 }: { nombre: string; foto?: string | null; size?: number }) {
  const inicial = (nombre || "?").charAt(0).toUpperCase();
  if (foto) {
    return <img src={foto} alt={nombre} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <div className="shrink-0 rounded-full bg-teal-soft flex items-center justify-center font-bold text-teal-dark"
      style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {inicial}
    </div>
  );
}

export default function Configuracion() {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [cargando, setCargando] = useState(true);
  const [fichaAbierta, setFichaAbierta] = useState(false);
  const [editando, setEditando] = useState<Colaborador | null>(null);
  const [form, setForm] = useState<Partial<Colaborador>>({});
  const [guardando, setGuardando] = useState(false);
  const [genExp, setGenExp] = useState(false);
  const [expMsg, setExpMsg] = useState("");
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [seccion, setSeccion] = useState<"equipo" | "folios" | "roles" | "papelera" | "administradoras">("equipo");
  const fotoRef = useRef<HTMLInputElement | null>(null);

  // ===== Solicitudes de acceso =====
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [cargandoSol, setCargandoSol] = useState(true);
  const [rolSel, setRolSel] = useState<Record<string, string>>({});
  const [miRol, setMiRol] = useState<string | null>(null);

  const cargar = () => {
    setCargando(true);
    fetchColaboradores().then(setColaboradores).finally(() => setCargando(false));
  };

  async function cargarSolicitudes() {
    setCargandoSol(true);
    const { data } = await supabase
      .from("usuarios")
      .select("email,nombre,estado")
      .eq("estado", "pendiente")
      .order("nombre");
    setSolicitudes((data as Solicitud[]) || []);
    setCargandoSol(false);
  }

  useEffect(() => { cargar(); cargarSolicitudes(); }, []);

  // ¿Quién soy? → para aplicar los permisos críticos (Nivel 1).
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const email = data.session?.user?.email;
      if (email) fetchPerfil(email).then((pf) => setMiRol(pf?.rol ?? null)).catch(() => {});
    });
  }, []);

  async function aprobar(s: Solicitud) {
    const rol = rolSel[s.email];
    if (!rol) return;
    const { error } = await supabase.from("usuarios").update({ estado: "activo", rol }).eq("email", s.email);
    if (error) { alert("No se pudo aprobar. Intenta de nuevo."); return; }
    setSolicitudes((prev) => prev.filter((x) => x.email !== s.email));
  }

  async function rechazar(s: Solicitud) {
    if (!confirm(`¿Rechazar el acceso de ${s.nombre}?`)) return;
    const { error } = await supabase.from("usuarios").update({ estado: "rechazado" }).eq("email", s.email);
    if (error) { alert("No se pudo rechazar. Intenta de nuevo."); return; }
    setSolicitudes((prev) => prev.filter((x) => x.email !== s.email));
  }

  function abrirNuevo() {
    setEditando(null);
    setForm({ rol_sistema: "colaborador", activo: true, area: "direccion" });
    setFichaAbierta(true);
  }
  function abrirFicha(c: Colaborador) {
    setEditando(c);
    const base: Partial<Colaborador> = { ...c };
    // Si ya existe pero no tiene extensión/área, se las sugerimos según su rol.
    if (c.puesto) {
      const r = ROLES.find((x) => x.nombre === c.puesto);
      if (r) {
        if (!c.area) { const a = AREA_POR_GRUPO[r.grupo]; if (a) base.area = a; }
        if (!c.extension) { const ext = EXTENSION_POR_ROL[r.codigo]; if (ext) base.extension = ext; }
      }
    }
    setForm(base);
    setFichaAbierta(true);
  }
  function cerrar() {
    setFichaAbierta(false);
    setEditando(null);
    setForm({});
    setExpMsg("");
  }
  function cambiar<K extends keyof Colaborador>(campo: K, valor: Colaborador[K]) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  // Al elegir el rol, pone sola el área y la extensión oficial de ese rol.
  function elegirRol(nombreRol: string) {
    const r = ROLES.find((x) => x.nombre === nombreRol);
    setForm((f) => {
      const next: Partial<Colaborador> = { ...f, puesto: nombreRol };
      if (r) {
        const area = AREA_POR_GRUPO[r.grupo];
        if (area) next.area = area;
        const ext = EXTENSION_POR_ROL[r.codigo];
        if (ext) next.extension = ext;
      }
      return next;
    });
  }

  async function onFoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert("La foto es muy grande (máximo 5 MB)."); return; }
    setSubiendoFoto(true);
    const url = await subirFotoColaborador(file);
    setSubiendoFoto(false);
    if (url) cambiar("foto_url", url);
    else alert("No se pudo subir la foto. Intenta de nuevo.");
  }

  async function regenerarExp() {
    if (!editando) return;
    setGenExp(true);
    setExpMsg("");
    const base = { ...editando, ...form } as Colaborador;
    const r = await generarExpedienteColaborador(base);
    if (r.ok && r.link) {
      await supabase.from("colaboradores").update({ expediente_url: r.link }).eq("id", editando.id);
      setForm((f) => ({ ...f, expediente_url: r.link }));
      setEditando((e) => (e ? { ...e, expediente_url: r.link } : e));
      setColaboradores((prev) => prev.map((x) => (x.id === editando.id ? { ...x, expediente_url: r.link } : x)));
      setExpMsg("Expediente listo ✓");
    } else {
      setExpMsg("No se pudo: " + (r.error || "intenta de nuevo"));
    }
    setGenExp(false);
  }

  async function guardar() {
    if (!form.nombre || !form.nombre.trim() || guardando) return;
    setGuardando(true);
    let ok = false;
    if (editando) {
      const { id, created_at, ...cambios } = form as Colaborador;
      void id; void created_at;
      ok = await editarColaborador(editando.id, cambios);
    } else {
      const r = await crearColaborador(form);
      ok = !!r;
      // FASE C: al dar de alta, genera solo su expediente (Word) y lo vincula.
      if (r) {
        const exp = await generarExpedienteColaborador(r);
        if (exp.ok && exp.link) {
          await supabase.from("colaboradores").update({ expediente_url: exp.link }).eq("id", r.id);
        }
      }
    }
    setGuardando(false);
    if (ok) { cerrar(); cargar(); }
    else alert("No se pudo guardar. Revisa que el nombre no esté repetido.");
  }

  async function borrar() {
    if (!editando) return;
    if (!confirm(`¿Borrar a ${editando.nombre}? Esta acción no se puede deshacer.`)) return;
    const ok = await borrarColaborador(editando.id);
    if (ok) { cerrar(); cargar(); }
    else alert("No se pudo borrar.");
  }

  const inputCls = "mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20";
  const labelCls = "text-xs font-medium text-humo";

  // Extensiones oficiales de la ficha abierta (según su área) + cuáles ya están ocupadas.
  const extsArea = (EXTENSIONES[form.area || ""] || []).map(String);
  const tomadas = new Set(
    colaboradores.filter((c) => c.id !== editando?.id).map((c) => String(c.extension || "")).filter(Boolean)
  );

  const totalIncompletos = colaboradores.filter(incompleto).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">

      {/* ===== Pestañas ===== */}
      <div className="mb-5 flex gap-2">
        <button onClick={() => setSeccion("equipo")} className={seccion === "equipo" ? "rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white" : "rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-medium text-humo hover:bg-teal-soft"}>👥 Equipo</button>
        <button onClick={() => setSeccion("folios")} className={seccion === "folios" ? "rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white" : "rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-medium text-humo hover:bg-teal-soft"}>🗂️ Folios de Registro</button>
        {puedeAccion(miRol, "editar_permisos") && (
        <button onClick={() => setSeccion("roles")} className={seccion === "roles" ? "rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white" : "rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-medium text-humo hover:bg-teal-soft"}>🔐 Roles y Permisos</button>
        )}
        <button onClick={() => setSeccion("administradoras")} className={seccion === "administradoras" ? "rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white" : "rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-medium text-humo hover:bg-teal-soft"}>🏦 Administradoras y carteras</button>
        {puedeAccion(miRol, "ver_papelera") && (
        <button onClick={() => setSeccion("papelera")} className={seccion === "papelera" ? "rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white" : "rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-medium text-humo hover:bg-teal-soft"}>🗑️ Papelera</button>
        )}
      </div>

      {seccion === "folios" && <FoliosRegistro />}

      {seccion === "administradoras" && (
        <>
          <Administradoras miRol={miRol} />
          <CatalogoCarteras miRol={miRol} />
        </>
      )}

      {seccion === "roles" && puedeAccion(miRol, "editar_permisos") && (
        <div className="space-y-4">
          <RolesPermisos />
          <NivelesComercial />
        </div>
      )}

      {seccion === "papelera" && puedeAccion(miRol, "ver_papelera") && <Papelera />}

      {seccion === "equipo" && (
      <>
      {/* ===== Notificaciones en este aparato ===== */}
      <section className="mb-6 rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
        <h2 className="font-display text-base font-extrabold text-tinta">📲 Notificaciones en este aparato</h2>
        <p className="mt-1 text-sm text-humo">
          Activa los avisos para recibir notificaciones en la pantalla aunque la app esté cerrada
          (mensajes del chat, llamadas y más). Tienes que activarlo en cada aparato o navegador que uses.
        </p>
        <div className="mt-3">
          <BotonNotificaciones />
        </div>
      </section>

      {/* ===== Solicitudes de acceso ===== */}
      <section className="mb-6 rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-base font-extrabold text-tinta">🔔 Solicitudes de acceso</h2>
          {solicitudes.length > 0 && (
            <span className="rounded-full bg-rose-500 px-2 py-0.5 text-xs font-bold text-white">{solicitudes.length}</span>
          )}
        </div>
        <p className="mt-1 text-sm text-humo">Personas que se registraron y esperan tu aprobación.</p>

        {cargandoSol ? (
          <p className="mt-4 text-sm text-humo/70">Cargando…</p>
        ) : solicitudes.length === 0 ? (
          <p className="mt-4 rounded-xl bg-nube px-4 py-3 text-sm text-humo">No hay solicitudes pendientes. ✅</p>
        ) : (
          <div className="mt-4 space-y-3">
            {solicitudes.map((s) => (
              <div key={s.email} className="rounded-xl border border-black/10 p-3">
                <p className="font-semibold text-tinta">{s.nombre}</p>
                <p className="break-all text-xs text-humo">{s.email}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select
                    value={rolSel[s.email] || ""}
                    onChange={(e) => setRolSel((r) => ({ ...r, [s.email]: e.target.value }))}
                    className="rounded-lg border border-black/15 px-2 py-1.5 text-sm"
                  >
                    <option value="">Elige un rol…</option>
                    {ROLES_ACCESO.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <button
                    onClick={() => aprobar(s)}
                    disabled={!rolSel[s.email]}
                    className="rounded-lg bg-teal px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-teal-dark disabled:opacity-50"
                  >
                    Aprobar
                  </button>
                  <button
                    onClick={() => rechazar(s)}
                    className="rounded-lg border border-rose-300 px-3 py-1.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
                  >
                    Rechazar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ===== Colaboradores ===== */}
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-extrabold text-tinta">Colaboradores</h1>
          <p className="text-sm text-humo">El registro oficial de DIIPA. Alimenta el chat, el directorio y el conmutador.</p>
        </div>
        <button onClick={abrirNuevo} className="shrink-0 rounded-2xl bg-teal px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-dark">
          + Agregar colaborador
        </button>
      </div>

      {totalIncompletos > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠️ Hay <b>{totalIncompletos}</b> colaborador(es) con datos incompletos (sin rol, área, extensión o correo). Ábrelos y complétalos: al elegir el rol, el área y la extensión se ponen solas.
        </div>
      )}

      {cargando ? (
        <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-16 text-center text-humo">Cargando…</div>
      ) : colaboradores.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-16 text-center text-humo">
          Aún no hay colaboradores. Usa "+ Agregar colaborador".
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {colaboradores.map((c) => (
            <button key={c.id} onClick={() => abrirFicha(c)} className={"flex items-center gap-3 rounded-xl border bg-white p-3 text-left shadow-sm transition hover:shadow-md " + (incompleto(c) ? "border-amber-300" : "border-black/5")}>
              <Avatar nombre={c.nombre} foto={c.foto_url} />
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-bold text-tinta">{c.nombre}</h3>
                <p className="truncate text-xs text-humo">{c.puesto || "—"}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold text-white" style={{ backgroundColor: areaColor(c.area) }}>
                    {areaNombre(c.area)}
                  </span>
                  {c.extension && <span className="inline-block rounded bg-teal-soft px-1.5 py-0.5 text-[10px] font-semibold text-teal-dark">ext. {c.extension}</span>}
                  {incompleto(c) && <span className="inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">⚠️ incompleto</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <p className="mt-6 text-center text-xs text-humo">
        {colaboradores.length} colaborador(es) registrados
        {totalIncompletos > 0 && <span className="text-amber-600"> · {totalIncompletos} incompleto(s) ⚠️</span>}
      </p>
      </>
      )}

      {fichaAbierta && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-tinta/40 p-4" onClick={cerrar}>
          <div className="my-6 w-full max-w-lg rounded-3xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg font-bold text-tinta">{editando ? "Ficha del colaborador" : "Nuevo colaborador"}</h3>

            <div className="mt-4 flex flex-col items-center gap-2">
              <Avatar nombre={form.nombre || "?"} foto={form.foto_url} size={88} />
              <input ref={fotoRef} type="file" accept="image/*" className="hidden" onChange={onFoto} />
              <button onClick={() => fotoRef.current?.click()} disabled={subiendoFoto} className="rounded-lg border border-teal/30 px-3 py-1.5 text-xs font-semibold text-teal-dark transition hover:bg-teal-soft disabled:opacity-50">
                {subiendoFoto ? "Subiendo…" : "📷 Subir foto oficial"}
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className={labelCls}>Nombre *</label>
                <input value={form.nombre || ""} onChange={(e) => cambiar("nombre", e.target.value)} className={inputCls} placeholder="Nombre completo" />
              </div>
              <div>
                <label className={labelCls}>Rol</label>
                <select value={form.puesto || ""} onChange={(e) => elegirRol(e.target.value)} className={inputCls}>
                  <option value="">— Elige un rol —</option>
                  {form.puesto && !ROLES.some((r) => r.nombre === form.puesto) && (
                    <option value={form.puesto}>{form.puesto}</option>
                  )}
                  {GRUPOS_ROLES.map((g) => (
                    <optgroup key={g.clave} label={`${g.emoji} ${g.nombre}`}>
                      {ROLES.filter((r) => r.grupo === g.clave).map((r) => (
                        <option key={r.codigo} value={r.nombre}>{r.nombre} · {r.codigo}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-humo">Al elegir el rol se llenan solas el área y la extensión oficial.</p>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className={labelCls}>Área</label>
                  <select value={form.area || ""} onChange={(e) => cambiar("area", e.target.value)} className={inputCls}>
                    <option value="">— elige —</option>
                    {AREAS.map((a) => (<option key={a.clave} value={a.clave}>{a.nombre}</option>))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className={labelCls}>Extensión oficial</label>
                  <select value={form.extension || ""} onChange={(e) => cambiar("extension", e.target.value)} className={inputCls}>
                    <option value="">{form.area ? "— elige —" : "Elige primero el área"}</option>
                    {form.extension && !extsArea.includes(String(form.extension)) && (
                      <option value={form.extension}>{form.extension} (actual)</option>
                    )}
                    {extsArea.map((ext) => {
                      const ocupada = tomadas.has(ext) && ext !== String(form.extension);
                      return (
                        <option key={ext} value={ext} disabled={ocupada}>
                          {ext}{ocupada ? " · ocupada" : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className={labelCls}>Teléfono</label>
                  <input value={form.telefono || ""} onChange={(e) => cambiar("telefono", e.target.value)} className={inputCls} placeholder="10 dígitos" />
                </div>
                <div className="flex-1">
                  <label className={labelCls}>WhatsApp</label>
                  <input value={form.whatsapp || ""} onChange={(e) => cambiar("whatsapp", e.target.value)} className={inputCls} placeholder="10 dígitos" />
                </div>
              </div>
              <div>
                <label className={labelCls}>Correo</label>
                <input value={form.correo || ""} onChange={(e) => cambiar("correo", e.target.value)} className={inputCls} placeholder="correo@diipadesarrollos.com" />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className={labelCls}>Número oficial (conmutador)</label>
                  <input value={form.numero_oficial || ""} onChange={(e) => cambiar("numero_oficial", e.target.value)} className={inputCls} placeholder="Opcional" />
                </div>
                <div className="flex-1">
                  <label className={labelCls}>Rol en el sistema</label>
                  <select value={form.rol_sistema || "colaborador"} onChange={(e) => cambiar("rol_sistema", e.target.value)} className={inputCls}>
                    {ROLES_SISTEMA.map((r) => (<option key={r} value={r}>{r}</option>))}
                  </select>
                </div>
              </div>
              <div>
                <label className={labelCls}>Rol de teléfono (conmutador)</label>
                <select value={form.rol_telefonia || ""} onChange={(e) => cambiar("rol_telefonia", e.target.value)} className={inputCls}>
                  {ROLES_TELEFONIA.map((r) => (<option key={r.v} value={r.v}>{r.t}</option>))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-tinta">
                <input type="checkbox" checked={form.activo ?? true} onChange={(e) => cambiar("activo", e.target.checked)} className="h-4 w-4 rounded border-black/20" />
                Activo
              </label>
            </div>

            {editando && (
              <div className="mt-4 rounded-xl border border-black/10 bg-nube/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-humo">Expediente en Drive</p>
                    <p className="text-xs text-humo">Carpeta (Área → Colaborador) con su ficha autollenada.</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {form.expediente_url && (
                      <a href={form.expediente_url} target="_blank" rel="noreferrer" className="rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-teal-dark">📁 Abrir</a>
                    )}
                    <button onClick={regenerarExp} disabled={genExp} className="rounded-lg border border-teal/30 px-3 py-1.5 text-xs font-semibold text-teal-dark transition hover:bg-teal-soft disabled:opacity-50">
                      {genExp ? "…" : form.expediente_url ? "Regenerar" : "📁 Generar"}
                    </button>
                  </div>
                </div>
                {expMsg && <p className="mt-1.5 text-[12px] font-semibold text-teal-dark">{expMsg}</p>}
              </div>
            )}

            <div className="mt-5 flex gap-2">
              {editando && puedeAccion(miRol, "borrar_colaborador") && (
                <button onClick={borrar} className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50">
                  Borrar
                </button>
              )}
              <button onClick={cerrar} className="flex-1 rounded-xl border border-black/10 px-4 py-2.5 text-sm font-medium text-humo transition hover:bg-nube">Cancelar</button>
              <button onClick={guardar} disabled={guardando || !form.nombre?.trim()} className="flex-1 rounded-xl bg-teal px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-dark disabled:opacity-50">
                {guardando ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
