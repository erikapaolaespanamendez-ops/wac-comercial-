// Bitácora de seguimiento jurídico cada 15 días (tabla estilo Excel).
// Cada avance: estado procesal, avance, evidencia (Drive), próxima actuación + fecha.
// El borrado manda a la papelera (recuperable). Se muestra en Contingencia con demanda activa.
import { useState, useEffect } from "react";
import { type Cliente } from "../../../data/clientes";
import { puedeAccion } from "../../../data/roles";
import {
  fetchSeguimientoJuridico, fetchPapeleraJuridico, agregarSeguimientoJuridico,
  mandarPapeleraJuridico, restaurarJuridico, borrarSeguimientoJuridico,
  proximoCiclo, DIAS_CICLO, type SeguimientoJuridico,
} from "../../../data/seguimientoJuridico";
import { fetchCorreoPorRol, fetchCorreoPorNombre } from "../../../data/usuarios";
import { generarExpediente } from "../../../data/expediente";
import { subirArchivoDrive } from "../../../data/expedienteDocs";
import { useMiRol, fechaCorta } from "../_compartido";
import VistaPreviaDoc from "../VistaPreviaDoc";

function leerBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] || "");
    r.onerror = () => rej(new Error("No se pudo leer " + file.name));
    r.readAsDataURL(file);
  });
}

export default function SeguimientoJuridicoBloque({ cliente, abogado }: { cliente: Cliente; abogado?: string }) {
  const miRol = useMiRol();
  const puede = puedeAccion(miRol, "gestionar_actuaciones") || puedeAccion(miRol, "gestionar_convenio_contingencia");
  const puedePedir = ["DGE", "RAC", "Super_Admin"].includes(miRol || "");
  const yo = (() => { try { return JSON.parse(localStorage.getItem("chat_yo") || "null"); } catch { return null; } })();
  const autor: string | null = yo?.nombre || null;

  const [lista, setLista] = useState<SeguimientoJuridico[] | null>(null);
  const [papelera, setPapelera] = useState<SeguimientoJuridico[]>([]);
  const [verPapelera, setVerPapelera] = useState(false);

  const hoy = new Date().toISOString().slice(0, 10);
  const [fecha, setFecha] = useState(hoy);
  const [estado, setEstado] = useState("");
  const [avance, setAvance] = useState("");
  const [proxima, setProxima] = useState("");
  const [fechaProx, setFechaProx] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [paso, setPaso] = useState("");

  useEffect(() => {
    let vivo = true;
    fetchSeguimientoJuridico(String(cliente.id)).then((r) => { if (vivo) setLista(r); }).catch(() => { if (vivo) setLista([]); });
    fetchPapeleraJuridico(String(cliente.id)).then((r) => { if (vivo) setPapelera(r); }).catch(() => {});
    return () => { vivo = false; };
  }, [cliente.id]);

  async function guardar() {
    if (!estado.trim() && !avance.trim()) return;
    setGuardando(true);
    let evidencia: { url: string; nombre: string } | null = null;
    try {
      if (archivo) {
        setPaso("Subiendo evidencia…");
        let carpetaId = (cliente.carpetaDriveId || "").trim();
        if (!carpetaId) {
          const exp = await generarExpediente(cliente);
          if (!exp.ok || !exp.carpetaId) throw new Error("No se pudo abrir la carpeta de Drive.");
          carpetaId = exp.carpetaId;
        }
        const base64 = await leerBase64(archivo);
        const up = await subirArchivoDrive({ carpetaId, nombre: archivo.name, base64, subcarpeta: "Seguimiento jurídico", mime: archivo.type, publico: true });
        if (!up.ok || !up.link) throw new Error("Falló la subida de la evidencia.");
        evidencia = { url: up.link, nombre: up.nombre || archivo.name };
      }
      const r = await agregarSeguimientoJuridico({
        clienteId: String(cliente.id), fecha, estadoProcesal: estado.trim(), avance: avance.trim(),
        evidencia, proximaActuacion: proxima.trim(), fechaProxima: fechaProx, autor,
      });
      if (r) {
        setLista((prev) => [r, ...(prev || [])]);
        setEstado(""); setAvance(""); setProxima(""); setFechaProx(""); setArchivo(null); setFecha(hoy);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false); setPaso("");
    }
  }

  async function aPapelera(id: string) {
    const ok = await mandarPapeleraJuridico(id);
    if (ok) {
      const item = (lista || []).find((x) => x.id === id);
      setLista((prev) => (prev || []).filter((x) => x.id !== id));
      if (item) setPapelera((prev) => [item, ...prev]);
    }
  }
  async function restaurar(id: string) {
    const ok = await restaurarJuridico(id);
    if (ok) {
      const item = papelera.find((x) => x.id === id);
      setPapelera((prev) => prev.filter((x) => x.id !== id));
      if (item) setLista((prev) => [item, ...(prev || [])]);
    }
  }
  async function borrarDef(id: string) {
    if (!confirm("¿Borrar definitivamente? Esto no se puede deshacer.")) return;
    const ok = await borrarSeguimientoJuridico(id);
    if (ok) setPapelera((prev) => prev.filter((x) => x.id !== id));
  }

  // 📧 DGE/RAC: arma un correo (mailto) pidiendo avances al abogado + DIL. Tú lo revisas y envías.
  async function solicitarAvances() {
    const [dil, abog] = await Promise.all([
      fetchCorreoPorRol("DIL"),
      abogado && abogado.trim() ? fetchCorreoPorNombre(abogado) : Promise.resolve(null),
    ]);
    const tos = [dil?.email, abog?.email].filter(Boolean) as string[];
    if (tos.length === 0) {
      alert("No encontré el correo del DIL ni del abogado. Verifica que estén registrados en Usuarios (el abogado debe tener el mismo nombre).");
      return;
    }
    const asunto = `Solicitud de avances y estado procesal · ${cliente.nombre}`;
    const cuerpo =
      `Buen día,\n\n` +
      `Por este medio solicito de la manera más atenta los avances y el estado procesal del seguimiento jurídico del cliente ${cliente.nombre}.\n\n` +
      `Agradezco indicar la última actuación y los próximos pasos del expediente.\n\n` +
      `Quedo al pendiente. Saludos.`;
    window.location.href = `mailto:${tos.join(",")}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
  }

  // Próxima actuación: si el último avance tiene fecha de próxima, la usamos; si no, ciclo de 15 días.
  const ultima = lista && lista.length > 0 ? lista[0].fecha : null;
  const proxExplicita = (lista || []).find((s) => s.fechaProxima)?.fechaProxima || "";
  const ciclo = proximoCiclo(ultima);
  let proximoTxt: { fecha: string; atrasoDias: number } | null = null;
  if (proxExplicita) {
    const d = new Date(proxExplicita + "T00:00:00"); const h = new Date(); h.setHours(0, 0, 0, 0);
    proximoTxt = { fecha: proxExplicita, atrasoDias: Math.floor((h.getTime() - d.getTime()) / 86400000) };
  } else if (ciclo.proximaFecha) {
    proximoTxt = { fecha: ciclo.proximaFecha, atrasoDias: ciclo.diasAtraso };
  }

  const cellCls = "border border-black/10 px-2 py-1 align-top text-[13px]";
  const inCls = "w-full rounded-md border border-black/10 px-2 py-1 text-[13px] outline-none focus:border-indigo-400";
  const nCols = puede ? 7 : 6;

  return (
    <div className="mt-3 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-base">⚖️</span>
          <h3 className="font-display text-[13px] font-extrabold text-indigo-800">Seguimiento jurídico (cada {DIAS_CICLO} días)</h3>
          <span className="rounded-full bg-white px-2 py-0.5 text-[12px] font-semibold text-humo">{lista?.length ?? "…"}</span>
        </div>
        {puedePedir && <button onClick={solicitarAvances} className="shrink-0 rounded-lg border border-indigo-300 bg-white px-2.5 py-1 text-[12px] font-semibold text-indigo-700 hover:bg-indigo-50">📧 Solicitar avances</button>}
      </div>

      {/* Próxima actuación / aviso de atraso */}
      {!proximoTxt ? (
        <p className="mt-1.5 text-[12px] text-humo">Aún no hay seguimiento. Registra el primero en la tabla.</p>
      ) : proximoTxt.atrasoDias > 0 ? (
        <p className="mt-1.5 rounded-lg bg-red-100 px-2.5 py-1 text-[12px] font-semibold text-red-700">⏰ Vencido: tocaba el {fechaCorta(proximoTxt.fecha)} (hace {proximoTxt.atrasoDias} {proximoTxt.atrasoDias === 1 ? "día" : "días"}). Hay que actualizar con jurídico.</p>
      ) : (
        <p className="mt-1.5 text-[12px] text-indigo-700">Próxima actuación: <b>{fechaCorta(proximoTxt.fecha)}</b> (en {Math.abs(proximoTxt.atrasoDias)} {Math.abs(proximoTxt.atrasoDias) === 1 ? "día" : "días"}).</p>
      )}

      <div className="mt-2.5 overflow-x-auto">
        <table className="w-full border-collapse bg-white">
          <thead>
            <tr className="bg-indigo-100/60 text-left text-[12px] font-semibold text-indigo-900">
              <th className={cellCls} style={{ width: 96 }}>Fecha</th>
              <th className={cellCls} style={{ width: 160 }}>Estado procesal</th>
              <th className={cellCls}>Avance</th>
              <th className={cellCls} style={{ width: 150 }}>Próxima actuación</th>
              <th className={cellCls} style={{ width: 110 }}>Fecha próxima</th>
              <th className={cellCls} style={{ width: 90 }}>Evidencia</th>
              {puede && <th className={cellCls} style={{ width: 40 }}></th>}
            </tr>
          </thead>
          <tbody>
            {lista === null && <tr><td className={cellCls + " text-center text-humo"} colSpan={nCols}>Cargando…</td></tr>}
            {lista !== null && lista.length === 0 && <tr><td className={cellCls + " text-center text-humo"} colSpan={nCols}>Aún no hay seguimientos.</td></tr>}
            {(lista || []).map((s) => (
              <tr key={s.id}>
                <td className={cellCls + " whitespace-nowrap text-tinta"}>{fechaCorta(s.fecha)}{s.autor ? <span className="block text-[10px] text-humo">{s.autor}</span> : null}</td>
                <td className={cellCls + " text-tinta"}>{s.estadoProcesal || "—"}</td>
                <td className={cellCls + " whitespace-pre-wrap text-tinta"}>{s.avance || "—"}</td>
                <td className={cellCls + " text-tinta"}>{s.proximaActuacion || "—"}</td>
                <td className={cellCls + " whitespace-nowrap text-tinta"}>{s.fechaProxima ? fechaCorta(s.fechaProxima) : "—"}</td>
                <td className={cellCls}>{s.evidencia?.url ? <VistaPreviaDoc url={s.evidencia.url} nombre={s.evidencia.nombre} etiqueta="👁️ Ver" /> : <span className="text-[12px] text-humo">—</span>}</td>
                {puede && <td className={cellCls + " text-center"}><button onClick={() => aPapelera(s.id)} className="rounded px-1 text-humo hover:text-red-600" title="Mandar a la papelera" aria-label="Mandar a la papelera">🗑️</button></td>}
              </tr>
            ))}
            {puede && (
              <tr className="bg-indigo-50">
                <td className={cellCls}><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inCls} /></td>
                <td className={cellCls}><input value={estado} onChange={(e) => setEstado(e.target.value)} placeholder="Ej. En contestación…" className={inCls} /></td>
                <td className={cellCls}><input value={avance} onChange={(e) => setAvance(e.target.value)} placeholder="Qué se hizo o qué sigue" className={inCls} /></td>
                <td className={cellCls}><input value={proxima} onChange={(e) => setProxima(e.target.value)} placeholder="Ej. Audiencia…" className={inCls} /></td>
                <td className={cellCls}><input type="date" value={fechaProx} onChange={(e) => setFechaProx(e.target.value)} className={inCls} /></td>
                <td className={cellCls}>
                  <input type="file" onChange={(e) => setArchivo(e.target.files?.[0] || null)} className="w-full text-[10px] file:mr-1 file:rounded file:border-0 file:bg-indigo-100 file:px-1 file:py-0.5 file:text-[10px] file:font-semibold file:text-indigo-700" />
                  {archivo && <span className="mt-0.5 block truncate text-[10px] text-humo">{archivo.name}</span>}
                </td>
                <td className={cellCls + " text-center"}>
                  <button onClick={guardar} disabled={guardando || (!estado.trim() && !avance.trim())} className="rounded-md bg-indigo-600 px-2 py-1 text-[12px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50" aria-label="Agregar">➕</button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {paso && <p className="mt-1.5 text-[12px] text-indigo-700">{paso}</p>}

      {/* Papelera */}
      {puede && papelera.length > 0 && (
        <div className="mt-2">
          <button onClick={() => setVerPapelera((v) => !v)} className="text-[12px] font-semibold text-humo hover:text-tinta">🗑️ Papelera ({papelera.length}) {verPapelera ? "▲" : "▼"}</button>
          {verPapelera && (
            <div className="mt-1.5 space-y-1.5">
              {papelera.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-black/10 bg-white px-2.5 py-1.5">
                  <div className="min-w-0 text-[12px] text-humo">
                    <span className="font-semibold text-tinta">{s.estadoProcesal || s.avance || "Avance"}</span> · {fechaCorta(s.fecha)}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => restaurar(s.id)} className="rounded-md border border-black/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50">↩️ Restaurar</button>
                    <button onClick={() => borrarDef(s.id)} className="rounded-md px-1.5 py-0.5 text-[11px] text-humo hover:text-red-600">Borrar</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
