// Pestaña "Contingencia" del expediente del cliente: demandas/quejas
// (cliente↔empresa) con su tablita estilo Excel.
// (Extraído de CrmCliente.tsx para dividir los módulos por archivo.)
import { useState, useEffect } from "react";
import { type Cliente } from "../../../data/clientes";
import { puedeAccion } from "../../../data/roles";
import { fetchContingencia, guardarContingencia, CONTINGENCIA_VACIA, QUIEN_DEMANDA, TIPOS_DEMANDA, etiqueta, type Contingencia } from "../../../data/contingencia";
import { useMiRol, SegmentoSiNo } from "../_compartido";
import SeguimientoJuridicoBloque from "./SeguimientoJuridico";
import DocumentosDemanda from "./DocumentosDemanda";

function BloqueContingencia({ cliente, inicialAbierto }: { cliente: Cliente; inicialAbierto?: boolean }) {
  const miRol = useMiRol();
  const [c, setC] = useState<Contingencia | null>(null);
  const [editar, setEditar] = useState(false);
  const [form, setForm] = useState<Contingencia>(CONTINGENCIA_VACIA);
  const [guardando, setGuardando] = useState(false);
  const [abierto, setAbierto] = useState(inicialAbierto ?? false);

  useEffect(() => {
    let vivo = true;
    fetchContingencia(String(cliente.id))
      .then((r) => { if (vivo) setC(r || CONTINGENCIA_VACIA); })
      .catch(() => { if (vivo) setC(CONTINGENCIA_VACIA); });
    return () => { vivo = false; };
  }, [cliente.id]);

  function abrir() { setForm(c || CONTINGENCIA_VACIA); setEditar(true); }
  async function guardar() {
    if (!puedeAccion(miRol, "gestionar_convenio_contingencia")) { alert("No tienes permiso para esto."); return; }
    setGuardando(true);
    const ok = await guardarContingencia(String(cliente.id), form);
    setGuardando(false);
    if (ok) { setC(form); setEditar(false); }
  }

  const activa = !!c?.tieneDemanda;
  const inputCls = "mt-0.5 w-full rounded-lg border border-black/10 px-2.5 py-1.5 text-sm outline-none focus:border-teal";
  const lblCls = "block text-[12px] font-semibold text-humo";

  return (
    <div className={"rounded-2xl border p-3.5 shadow-sm " + (activa ? "border-red-300 bg-red-50/50" : "border-teal/15 bg-white")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button onClick={() => setAbierto((v) => !v)} className="flex min-w-0 items-center gap-1.5 text-left">
          <span className="text-humo">{abierto ? "▾" : "▸"}</span>
          <span className="text-base">⚖️</span>
          <h3 className={"font-display text-[13px] font-extrabold " + (activa ? "text-red-700" : "text-tinta")}>Contingencia</h3>
          {activa && <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">CON DEMANDA</span>}
        </button>
        <button onClick={abrir} className={"shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-semibold text-white hover:brightness-95 " + (activa ? "bg-red-600" : "bg-teal")}>
          {c === null ? "…" : activa ? "Editar" : "➕"}
        </button>
      </div>

      {abierto && (c === null ? (
        <p className="mt-2 text-[12px] text-humo">Cargando…</p>
      ) : activa ? (
        <div className="mt-2.5 overflow-x-auto rounded-xl border border-red-200">
          <table className="w-full border-collapse text-left text-[13px]">
            <tbody>
              <tr className="border-b border-red-100"><td className="bg-red-50 px-3 py-1.5 font-semibold text-red-800">Quién demanda</td><td className="px-3 py-1.5 text-tinta">{etiqueta(QUIEN_DEMANDA, c.quienDemanda)}</td></tr>
              <tr className="border-b border-red-100"><td className="bg-red-50 px-3 py-1.5 font-semibold text-red-800">Tipo</td><td className="px-3 py-1.5 text-tinta">{etiqueta(TIPOS_DEMANDA, c.tipo)}</td></tr>
              <tr className="border-b border-red-100"><td className="bg-red-50 px-3 py-1.5 font-semibold text-red-800">Expediente / radicado</td><td className="px-3 py-1.5 text-tinta">{c.expediente || "—"}</td></tr>
              <tr className="border-b border-red-100"><td className="bg-red-50 px-3 py-1.5 font-semibold text-red-800">Jurisdicción</td><td className="px-3 py-1.5 text-tinta">{c.jurisdiccion || "—"}</td></tr>
              <tr className="border-b border-red-100"><td className="bg-red-50 px-3 py-1.5 font-semibold text-red-800">Ciudad de la demanda</td><td className="px-3 py-1.5 text-tinta">{c.ciudad || "—"}</td></tr>
              <tr className="border-b border-red-100"><td className="bg-red-50 px-3 py-1.5 font-semibold text-red-800">Quién recibió</td><td className="px-3 py-1.5 text-tinta">{c.quienRecibio || "—"}</td></tr>
              <tr className="border-b border-red-100"><td className="bg-red-50 px-3 py-1.5 font-semibold text-red-800">Abogado encargado</td><td className="px-3 py-1.5 text-tinta">{c.abogado || "—"}</td></tr>
              <tr className="border-b border-red-100"><td className="bg-red-50 px-3 py-1.5 font-semibold text-red-800">Etapa</td><td className="px-3 py-1.5 text-tinta">{c.etapa || "—"}</td></tr>
              <tr className="border-b border-red-100"><td className="bg-red-50 px-3 py-1.5 font-semibold text-red-800">Apoderado de DIIPA</td><td className="px-3 py-1.5 text-tinta">{c.apoderadoEmpresa || "—"}</td></tr>
              <tr className="border-b border-red-100"><td className="bg-red-50 px-3 py-1.5 font-semibold text-red-800">¿Cliente con apoderado?</td><td className="px-3 py-1.5 text-tinta">{c.clienteTieneApoderado ? (c.apoderadoCliente || "Sí") : "No"}</td></tr>
              {c.avance && <tr className="border-b border-red-100"><td className="bg-red-50 px-3 py-1.5 font-semibold text-red-800">Avance</td><td className="px-3 py-1.5 whitespace-pre-wrap text-tinta">{c.avance}</td></tr>}
              {c.nota && <tr><td className="bg-red-50 px-3 py-1.5 font-semibold text-red-800">Nota</td><td className="px-3 py-1.5 whitespace-pre-wrap text-tinta">{c.nota}</td></tr>}
            </tbody>
          </table>
          <p className="bg-red-50/60 px-3 py-1.5 text-[11px] text-red-700">⏱️ Cliente con contingencia activa → seguimiento semanal prioritario y documento de avance.</p>
        </div>
      ) : (
        <p className="mt-2 text-[12.5px] text-humo">Sin contingencia. Si el cliente demanda a la empresa (o la empresa al cliente), regístrala aquí.</p>
      ))}

      {editar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 p-4" onClick={guardando ? undefined : () => setEditar(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-extrabold text-tinta">⚖️ Contingencia de cliente</h2>
              <button onClick={() => setEditar(false)} disabled={guardando} className="rounded-lg px-2 py-1 text-humo hover:bg-nube disabled:opacity-50">✕</button>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-black/10 p-3">
              <span className="text-[13px] font-semibold text-tinta">¿Tiene demanda / contingencia?</span>
              <SegmentoSiNo valor={form.tieneDemanda} onCambio={(v: boolean) => setForm((p) => ({ ...p, tieneDemanda: v }))} />
            </div>

            {form.tieneDemanda && (
              <div className="mt-3 space-y-2.5">
                <label className={lblCls}>¿Quién demanda?
                  <select value={form.quienDemanda} onChange={(e) => setForm((p) => ({ ...p, quienDemanda: e.target.value }))} className={inputCls}>
                    <option value="">— Selecciona —</option>
                    {QUIEN_DEMANDA.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                </label>
                <label className={lblCls}>Tipo
                  <select value={form.tipo} onChange={(e) => setForm((p) => ({ ...p, tipo: e.target.value }))} className={inputCls}>
                    <option value="">— Selecciona —</option>
                    {TIPOS_DEMANDA.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                </label>
                <label className={lblCls}>Abogado encargado
                  <input value={form.abogado} onChange={(e) => setForm((p) => ({ ...p, abogado: e.target.value }))} className={inputCls} placeholder="Nombre del abogado" />
                </label>
                <label className={lblCls}>Expediente / radicado
                  <input value={form.expediente} onChange={(e) => setForm((p) => ({ ...p, expediente: e.target.value }))} className={inputCls} placeholder="Ej. 1393/2017" />
                </label>
                <label className={lblCls}>Jurisdicción
                  <input value={form.jurisdiccion} onChange={(e) => setForm((p) => ({ ...p, jurisdiccion: e.target.value }))} className={inputCls} placeholder="Ej. Civil, Mercantil, Juzgado 3º…" />
                </label>
                <label className={lblCls}>Ciudad de la demanda
                  <input value={form.ciudad} onChange={(e) => setForm((p) => ({ ...p, ciudad: e.target.value }))} className={inputCls} placeholder="Ej. Culiacán, Sinaloa" />
                </label>
                <label className={lblCls}>¿Quién recibió la demanda?
                  <input value={form.quienRecibio} onChange={(e) => setForm((p) => ({ ...p, quienRecibio: e.target.value }))} className={inputCls} placeholder="Nombre de quien recibió" />
                </label>
                <label className={lblCls}>Etapa
                  <input value={form.etapa} onChange={(e) => setForm((p) => ({ ...p, etapa: e.target.value }))} className={inputCls} placeholder="Ej. Contestación, audiencia, sentencia…" />
                </label>
                <label className={lblCls}>Apoderado(s) de DIIPA en la demanda
                  <input value={form.apoderadoEmpresa} onChange={(e) => setForm((p) => ({ ...p, apoderadoEmpresa: e.target.value }))} className={inputCls} placeholder="Nombre del apoderado de la empresa" />
                </label>
                <div className="flex items-center justify-between gap-2 rounded-xl border border-black/10 p-2.5">
                  <span className="text-[12px] font-semibold text-tinta">¿El cliente tiene apoderado?</span>
                  <SegmentoSiNo valor={form.clienteTieneApoderado} onCambio={(v: boolean) => setForm((p) => ({ ...p, clienteTieneApoderado: v }))} />
                </div>
                {form.clienteTieneApoderado && (
                  <label className={lblCls}>Apoderado del cliente (nombre y datos)
                    <input value={form.apoderadoCliente} onChange={(e) => setForm((p) => ({ ...p, apoderadoCliente: e.target.value }))} className={inputCls} placeholder="Nombre, cédula, contacto…" />
                  </label>
                )}
                <label className={lblCls}>Avance / estado procesal
                  <textarea value={form.avance} onChange={(e) => setForm((p) => ({ ...p, avance: e.target.value }))} rows={3} className={inputCls} placeholder="Cómo va la contingencia hoy" />
                </label>
                <label className={lblCls}>Nota
                  <textarea value={form.nota} onChange={(e) => setForm((p) => ({ ...p, nota: e.target.value }))} rows={3} className={inputCls} placeholder="Detalle (opcional)" />
                </label>
              </div>
            )}

            <button onClick={guardar} disabled={guardando} className="mt-4 w-full rounded-xl bg-teal px-3 py-2 text-sm font-semibold text-white hover:bg-teal-dark disabled:opacity-50">{guardando ? "Guardando…" : "Guardar"}</button>
          </div>
        </div>
      )}

      {activa && <SeguimientoJuridicoBloque cliente={cliente} abogado={c?.abogado} />}
      {activa && <DocumentosDemanda cliente={cliente} />}
    </div>
  );
}

export default function PanelContingencia({ cliente }: { cliente: Cliente }) {
  return (
    <div className="space-y-3">
      <BloqueContingencia cliente={cliente} inicialAbierto />
    </div>
  );
}
