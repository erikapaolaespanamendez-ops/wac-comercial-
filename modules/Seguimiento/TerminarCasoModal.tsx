// ===================================================================
// Terminar caso  →  src/modules/Seguimiento/TerminarCasoModal.tsx
// Pregunta si el cierre fue DEVOLUCIÓN o ENTREGA de propiedad.
//   Devolución -> total + ¿con compensación por la espera? (suma a KPIs)
//   Entrega    -> foto de evidencia (Drive del expediente). NO suma.
// ===================================================================
import { useState } from "react";
import { type Cliente } from "../../data/clientes";
import { terminarCaso } from "../../data/cierreCaso";
import { generarExpediente } from "../../data/expediente";
import { subirArchivoDrive } from "../../data/expedienteDocs";

function leerBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] || "");
    r.onerror = () => rej(new Error("No se pudo leer " + file.name));
    r.readAsDataURL(file);
  });
}

export default function TerminarCasoModal({ cliente, por, onCerrar }: { cliente: Cliente; por: string; onCerrar: (ok?: boolean) => void }) {
  const soloNum = (s: string) => String(s ?? "").replace(/[^0-9.]/g, "");
  const num = (s: string) => Number(soloNum(s)) || 0;
  const [tipo, setTipo] = useState<"devolucion" | "entrega" | null>(null);
  const [apartado, setApartado] = useState(soloNum(cliente.montoApartado));
  const [firma, setFirma] = useState(soloNum(cliente.valorFirma));
  const [formaliz, setFormaliz] = useState(soloNum(cliente.pagoEscritura));
  const [otros, setOtros] = useState(soloNum(cliente.otrosPagos));
  const [conComp, setConComp] = useState<boolean | null>(null);
  const [compensacion, setCompensacion] = useState("");
  const hoy = new Date().toISOString().slice(0, 10);
  const [formaPago, setFormaPago] = useState<"" | "exhibicion" | "abonos">("");
  const [maneraPago, setManeraPago] = useState<"" | "efectivo" | "transferencia">("");
  const [evidExhib, setEvidExhib] = useState<File | null>(null);
  type AbonoUI = { fecha: string; monto: number; manera: string; evidencia: { url: string; nombre: string } | null };
  const [abonos, setAbonos] = useState<AbonoUI[]>([]);
  const [abFecha, setAbFecha] = useState(hoy);
  const [abMonto, setAbMonto] = useState("");
  const [abManera, setAbManera] = useState<"" | "efectivo" | "transferencia">("");
  const [abArchivo, setAbArchivo] = useState<File | null>(null);
  const [subiendoAbono, setSubiendoAbono] = useState(false);
  const [nota, setNota] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [paso, setPaso] = useState("");
  const [err, setErr] = useState("");

  const baseDev = num(apartado) + num(firma) + num(formaliz) + num(otros);
  const totalDev = baseDev + (conComp ? num(compensacion) : 0);
  const sumaAbonos = abonos.reduce((a, b) => a + (b.monto || 0), 0);

  // Sube un comprobante a la subcarpeta "Devolución" del Drive del cliente.
  async function subirComprobante(file: File): Promise<{ url: string; nombre: string }> {
    let carpetaId = (cliente.carpetaDriveId || "").trim();
    if (!carpetaId) {
      const exp = await generarExpediente(cliente);
      if (!exp.ok || !exp.carpetaId) throw new Error("No se pudo abrir la carpeta de Drive del cliente. " + (exp.error || ""));
      carpetaId = exp.carpetaId;
    }
    const base64 = await leerBase64(file);
    const up = await subirArchivoDrive({ carpetaId, nombre: file.name, base64, subcarpeta: "Devolución", mime: file.type });
    if (!up.ok || !up.link) throw new Error("Falló la subida del comprobante. " + (up.error || ""));
    return { url: up.link, nombre: up.nombre || file.name };
  }

  async function agregarAbono() {
    if (num(abMonto) <= 0) { setErr("Pon el monto del abono."); return; }
    setErr(""); setSubiendoAbono(true);
    try {
      let evid: { url: string; nombre: string } | null = null;
      if (abArchivo) { setPaso("Subiendo comprobante del abono…"); evid = await subirComprobante(abArchivo); }
      setAbonos((prev) => [...prev, { fecha: abFecha, monto: num(abMonto), manera: abManera, evidencia: evid }]);
      setAbFecha(hoy); setAbMonto(""); setAbManera(""); setAbArchivo(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo agregar el abono.");
    } finally {
      setSubiendoAbono(false); setPaso("");
    }
  }
  function quitarAbono(i: number) { setAbonos((prev) => prev.filter((_, idx) => idx !== i)); }

  async function guardarDevolucion() {
    if (num(apartado) <= 0) { setErr("Pon cuánto dio al apartado (obligatorio)."); return; }
    if (num(firma) <= 0) { setErr("Pon cuánto dio a la firma del contrato (obligatorio)."); return; }
    if (conComp === null) { setErr("Indica si tiene compensación contractual."); return; }
    setErr(""); setGuardando(true);
    try {
      let evidencia: { url: string; nombre: string } | null = null;
      if (formaPago === "exhibicion" && evidExhib) { setPaso("Subiendo comprobante…"); evidencia = await subirComprobante(evidExhib); }
      setPaso("Cerrando caso…");
      const r = await terminarCaso({
        clienteId: cliente.id, tipo: "devolucion", total: totalDev, conCompensacion: conComp,
        compensacion: conComp ? (num(compensacion) || null) : null,
        valApartado: num(apartado), valFirma: num(firma),
        valFormalizaciones: num(formaliz) || null, valOtros: num(otros) || null,
        formaPago: formaPago || null,
        maneraPago: formaPago === "exhibicion" ? (maneraPago || null) : null,
        abonos: formaPago === "abonos" ? abonos : null,
        evidencia, nota, por,
      });
      if (!r.ok) throw new Error(r.error || "No se pudo guardar.");
      onCerrar(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ocurrió un error.");
    } finally {
      setGuardando(false); setPaso("");
    }
  }

  async function guardarEntrega() {
    if (!foto) { setErr("La foto de evidencia de entrega es obligatoria."); return; }
    setErr(""); setGuardando(true);
    try {
      let carpetaId = (cliente.carpetaDriveId || "").trim();
      if (!carpetaId) {
        setPaso("Preparando carpeta de Drive…");
        const exp = await generarExpediente(cliente);
        if (!exp.ok || !exp.carpetaId) throw new Error("No se pudo abrir la carpeta de Drive del cliente. " + (exp.error || ""));
        carpetaId = exp.carpetaId;
      }
      setPaso("Subiendo evidencia de entrega…");
      const base64 = await leerBase64(foto);
      const up = await subirArchivoDrive({ carpetaId, nombre: foto.name, base64, subcarpeta: "Garantías culminadas y entregadas", mime: foto.type, publico: true });
      if (!up.ok || !up.link) throw new Error("Falló la subida de la foto. " + (up.error || ""));
      setPaso("Cerrando caso…");
      const r = await terminarCaso({ clienteId: cliente.id, tipo: "entrega", evidencia: { url: up.link, nombre: up.nombre || foto.name }, nota, por });
      if (!r.ok) throw new Error(r.error || "No se pudo guardar.");
      onCerrar(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ocurrió un error.");
    } finally {
      setGuardando(false); setPaso("");
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-tinta/40 p-4" onClick={() => !guardando && onCerrar(false)}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-start justify-between gap-2">
          <h3 className="font-display text-lg font-extrabold text-tinta">✅ Terminar caso</h3>
          <button onClick={() => !guardando && onCerrar(false)} className="rounded-md px-1.5 text-humo hover:bg-nube" aria-label="Cerrar">✕</button>
        </div>
        <p className="mb-4 text-sm text-humo">{cliente.nombre}</p>

        {tipo === null && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-tinta">¿Cómo se cerró el caso?</p>
            <button onClick={() => setTipo("devolucion")} className="flex w-full items-center gap-3 rounded-xl border border-black/10 px-4 py-3 text-left hover:bg-nube">
              <span className="text-2xl">💰</span>
              <span><span className="block font-semibold text-tinta">Devolución</span><span className="block text-xs text-humo">Se devolvió dinero · suma a las KPIs</span></span>
            </button>
            <button onClick={() => setTipo("entrega")} className="flex w-full items-center gap-3 rounded-xl border border-black/10 px-4 py-3 text-left hover:bg-nube">
              <span className="text-2xl">🏠</span>
              <span><span className="block font-semibold text-tinta">Entrega de propiedad</span><span className="block text-xs text-humo">Garantía culminada y entregada · con foto</span></span>
            </button>
          </div>
        )}

        {tipo === "devolucion" && (
          <div className="space-y-3">
            <p className="text-xs text-humo">Captura los valores que el cliente había pagado. Los traje de la ficha; revísalos.</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-humo">Apartado *</label>
                <input type="number" inputMode="decimal" value={apartado} onChange={(e) => setApartado(e.target.value)} placeholder="0.00"
                  className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-humo">Firma del contrato *</label>
                <input type="number" inputMode="decimal" value={firma} onChange={(e) => setFirma(e.target.value)} placeholder="0.00"
                  className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-humo">Formalizaciones</label>
                <input type="number" inputMode="decimal" value={formaliz} onChange={(e) => setFormaliz(e.target.value)} placeholder="0.00"
                  className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-humo">Otros pagos</label>
                <input type="number" inputMode="decimal" value={otros} onChange={(e) => setOtros(e.target.value)} placeholder="0.00"
                  className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-humo">¿Tiene compensación contractual?</label>
              <p className="mb-1 text-[11px] text-humo">Normalmente 5% por terminación de contrato (no se recuperó la garantía / no pasó a proceso de compra).</p>
              <div className="flex gap-2">
                <button onClick={() => setConComp(true)} className={"flex-1 rounded-xl border px-3 py-2 text-sm font-semibold " + (conComp === true ? "border-teal bg-teal-soft text-teal-dark" : "border-black/10 text-humo hover:bg-nube")}>Sí, tiene</button>
                <button onClick={() => { setConComp(false); setCompensacion(""); }} className={"flex-1 rounded-xl border px-3 py-2 text-sm font-semibold " + (conComp === false ? "border-teal bg-teal-soft text-teal-dark" : "border-black/10 text-humo hover:bg-nube")}>No</button>
              </div>
              {conComp === true && (
                <div className="mt-2">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-humo">Valor de la compensación</label>
                  <div className="flex gap-2">
                    <input type="number" inputMode="decimal" value={compensacion} onChange={(e) => setCompensacion(e.target.value)} placeholder="0.00"
                      className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20" />
                    <button type="button" onClick={() => setCompensacion((baseDev * 0.05).toFixed(2))} className="shrink-0 rounded-xl border border-teal/30 bg-white px-3 text-xs font-semibold text-teal-dark hover:bg-teal-soft/40">Sugerir 5%</button>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl bg-teal-soft/40 px-3 py-2 text-sm font-semibold text-teal-dark">
              Total a devolver: ${totalDev.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
              {conComp && num(compensacion) > 0 && <span className="block text-[11px] font-normal text-humo">Base ${baseDev.toLocaleString("es-MX", { minimumFractionDigits: 2 })} + compensación ${num(compensacion).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>}
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-humo">¿Cómo se pagó la devolución?</label>
              <div className="flex gap-2">
                <button onClick={() => setFormaPago("exhibicion")} className={"flex-1 rounded-xl border px-3 py-2 text-sm font-semibold " + (formaPago === "exhibicion" ? "border-teal bg-teal-soft text-teal-dark" : "border-black/10 text-humo hover:bg-nube")}>Una sola exhibición</button>
                <button onClick={() => setFormaPago("abonos")} className={"flex-1 rounded-xl border px-3 py-2 text-sm font-semibold " + (formaPago === "abonos" ? "border-teal bg-teal-soft text-teal-dark" : "border-black/10 text-humo hover:bg-nube")}>Varios abonos</button>
              </div>
            </div>

            {formaPago === "exhibicion" && (
              <div className="space-y-2 rounded-xl border border-black/10 p-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-humo">Manera de pago (opcional)</label>
                  <div className="flex gap-2">
                    <button onClick={() => setManeraPago(maneraPago === "efectivo" ? "" : "efectivo")} className={"flex-1 rounded-xl border px-3 py-1.5 text-sm font-semibold " + (maneraPago === "efectivo" ? "border-teal bg-teal-soft text-teal-dark" : "border-black/10 text-humo hover:bg-nube")}>Efectivo</button>
                    <button onClick={() => setManeraPago(maneraPago === "transferencia" ? "" : "transferencia")} className={"flex-1 rounded-xl border px-3 py-1.5 text-sm font-semibold " + (maneraPago === "transferencia" ? "border-teal bg-teal-soft text-teal-dark" : "border-black/10 text-humo hover:bg-nube")}>Transferencia</button>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-humo">Comprobante (opcional)</label>
                  <input type="file" onChange={(e) => setEvidExhib(e.target.files?.[0] || null)} className="w-full text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-teal-soft file:px-2 file:py-1 file:text-xs file:font-semibold file:text-teal-dark" />
                  {evidExhib && <span className="mt-1 block truncate text-[11px] text-humo">{evidExhib.name}</span>}
                </div>
              </div>
            )}

            {formaPago === "abonos" && (
              <div className="space-y-2 rounded-xl border border-black/10 p-3">
                <p className="text-xs font-semibold text-humo">Suma de abonos: ${sumaAbonos.toLocaleString("es-MX", { minimumFractionDigits: 2 })} de ${totalDev.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</p>
                {abonos.map((ab, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-nube/60 px-2.5 py-1.5 text-xs">
                    <span className="min-w-0 truncate text-tinta"><b>${ab.monto.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</b> · {ab.fecha}{ab.manera ? ` · ${ab.manera}` : ""}{ab.evidencia ? " · 📎" : ""}</span>
                    <button onClick={() => quitarAbono(i)} className="shrink-0 text-humo hover:text-red-600">🗑️</button>
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-2 rounded-lg bg-nube/40 p-2">
                  <input type="date" value={abFecha} onChange={(e) => setAbFecha(e.target.value)} className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs outline-none focus:border-teal" />
                  <input type="number" inputMode="decimal" value={abMonto} onChange={(e) => setAbMonto(e.target.value)} placeholder="Monto" className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs outline-none focus:border-teal" />
                  <select value={abManera} onChange={(e) => setAbManera(e.target.value as "" | "efectivo" | "transferencia")} className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs outline-none focus:border-teal">
                    <option value="">Manera…</option>
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                  </select>
                  <input type="file" onChange={(e) => setAbArchivo(e.target.files?.[0] || null)} className="text-[10px] file:mr-1 file:rounded file:border-0 file:bg-teal-soft file:px-1.5 file:py-0.5 file:text-[10px] file:font-semibold file:text-teal-dark" />
                  <button onClick={agregarAbono} disabled={subiendoAbono || num(abMonto) <= 0} className="col-span-2 rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-dark disabled:opacity-50">{subiendoAbono ? "Subiendo…" : "➕ Agregar abono"}</button>
                </div>
              </div>
            )}
            <textarea value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (opcional)" rows={2}
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20" />
            {err && <p className="text-sm text-red-600">{err}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setTipo(null)} disabled={guardando} className="rounded-xl border border-black/10 px-4 py-2 text-sm font-semibold text-tinta hover:bg-nube disabled:opacity-50">← Atrás</button>
              <button onClick={guardarDevolucion} disabled={guardando} className="flex-1 rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-dark disabled:opacity-50">{guardando ? "Guardando…" : "Terminar caso"}</button>
            </div>
          </div>
        )}

        {tipo === "entrega" && (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-humo">Foto de evidencia de entrega</label>
              <input type="file" accept="image/*" onChange={(e) => setFoto(e.target.files?.[0] || null)}
                className="w-full text-sm text-tinta file:mr-3 file:rounded-lg file:border-0 file:bg-teal-soft file:px-3 file:py-2 file:text-sm file:font-semibold file:text-teal-dark" />
              {foto && <p className="mt-1 text-xs text-humo">📎 {foto.name}</p>}
            </div>
            <textarea value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (opcional)" rows={2}
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20" />
            {paso && <p className="text-sm text-teal-dark">{paso}</p>}
            {err && <p className="text-sm text-red-600">{err}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setTipo(null)} disabled={guardando} className="rounded-xl border border-black/10 px-4 py-2 text-sm font-semibold text-tinta hover:bg-nube disabled:opacity-50">← Atrás</button>
              <button onClick={guardarEntrega} disabled={guardando} className="flex-1 rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-dark disabled:opacity-50">{guardando ? "Subiendo…" : "Terminar caso"}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
