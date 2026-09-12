// ⚠️ NOMBRE ADREDE DISTINTO A "SolicitudFormalRDC.tsx" — son archivos
// completamente diferentes, y antes se confundían fácil por lo parecido
// del nombre (alguien subió a este por error pensando que era el otro).
// ESTE archivo es SOLO el indicador chiquito de la pestaña "Ficha técnica"
// del expediente general — el formulario real de RDC vive en
// SolicitudFormalRDC.tsx (dentro de Ficha de Devolución).
//
// Indicador compacto de "solicitud de devolución" (RDC) para la ficha.
// Muestra si tiene solicitud + fecha (+ doc opcional). Edición en línea, sin ocupar mucho espacio.
//
// El formulario RDC (llenar/validar/generar) YA NO se llena aquí — vive en
// Control de Devoluciones (Ficha de Devolución). Solo queda un link. El
// bloque de "subida a mano" de abajo SÍ se queda igual — es la forma en que
// alguien adjunta el documento físico escaneado, no forma parte del proceso
// interactivo que se movió.
import { useState } from "react";
import { type Cliente, guardarSolicitudDevolucion } from "../../../data/clientes";
import { puedeAccion } from "../../../data/roles";
import { generarExpediente } from "../../../data/expediente";
import { subirArchivoDrive } from "../../../data/expedienteDocs";
import { irADevolucion } from "../../../lib/navegarDevolucion";
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

export default function IndicadorSolicitudDevolucion({ cliente }: { cliente: Cliente }) {
  const miRol = useMiRol();
  const puede = puedeAccion(miRol, "subir_devolucion");

  const [tiene, setTiene] = useState(cliente.tieneSolicitudDevolucion);
  const [fecha, setFecha] = useState(cliente.fechaSolicitudDevolucion || "");
  const [doc, setDoc] = useState(cliente.docSolicitudDevolucion);
  const [editar, setEditar] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [paso, setPaso] = useState("");

  async function guardar() {
    if (tiene && !fecha) { alert("La fecha de solicitud es obligatoria."); return; }
    setGuardando(true);
    try {
      let docFinal = doc;
      if (tiene && archivo) {
        setPaso("Subiendo documento…");
        let carpetaId = (cliente.carpetaDriveId || "").trim();
        if (!carpetaId) {
          const exp = await generarExpediente(cliente);
          if (!exp.ok || !exp.carpetaId) throw new Error("No se pudo abrir la carpeta de Drive.");
          carpetaId = exp.carpetaId;
        }
        const base64 = await leerBase64(archivo);
        const up = await subirArchivoDrive({ carpetaId, nombre: archivo.name, base64, subcarpeta: "Solicitud de devolución", mime: archivo.type, publico: true });
        if (!up.ok || !up.link) throw new Error("Falló la subida del documento.");
        docFinal = { url: up.link, nombre: up.nombre || archivo.name };
      }
      const ok = await guardarSolicitudDevolucion(cliente.id, { tiene, fecha, doc: docFinal });
      if (!ok) throw new Error("No se pudo guardar.");
      setDoc(tiene ? docFinal : null);
      setArchivo(null); setEditar(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false); setPaso("");
    }
  }

  // Vista compacta (no editando)
  if (!editar) {
    return (
      <div>
        <div className="mb-2 flex items-center justify-between rounded-xl border border-teal/20 bg-teal-soft/20 px-3 py-2">
          <p className="text-[12.5px] font-semibold text-tinta">💰 Proceso de Devolución (RDC)</p>
          <button onClick={() => irADevolucion(cliente)} className="rounded-lg bg-teal px-3 py-1 text-[11.5px] font-semibold text-white hover:bg-teal-dark">
            Ver proceso →
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50/60 px-3 py-1.5 text-[12.5px]">
          <span className="font-semibold text-rose-700">💰 Solicitud de devolución:</span>
          {tiene ? (
            <>
              {fecha
                ? <span className="text-tinta">Sí · {fechaCorta(fecha)}</span>
                : <span className="font-semibold text-amber-700">Sí · ⚠️ falta fecha</span>}
              {doc?.url && <a href={doc.url} target="_blank" rel="noreferrer" className="font-semibold text-teal hover:underline">📎 Doc</a>}
            </>
          ) : (
            <span className="text-humo">No</span>
          )}
          {puede && <button onClick={() => setEditar(true)} className="ml-auto rounded-md border border-rose-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-50">✏️ Editar</button>}
        </div>
        {tiene && doc?.url && (
          <div className="mt-2">
            <VistaPreviaDoc url={doc.url} nombre={doc.nombre} alto={240} />
          </div>
        )}
      </div>
    );
  }

  // Edición en línea (compacta)
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 text-[12.5px]">
      <p className="mb-1.5 font-semibold text-rose-700">💰 Solicitud de devolución</p>
      <div className="flex gap-2">
        <button onClick={() => setTiene(true)} className={"rounded-lg border px-3 py-1 text-sm font-semibold " + (tiene ? "border-rose-400 bg-white text-rose-700" : "border-black/10 text-humo")}>Sí tiene</button>
        <button onClick={() => setTiene(false)} className={"rounded-lg border px-3 py-1 text-sm font-semibold " + (!tiene ? "border-rose-400 bg-white text-rose-700" : "border-black/10 text-humo")}>No</button>
      </div>
      {tiene && (
        <div className="mt-2 space-y-2">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-humo">Fecha de solicitud *
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="mt-0.5 block rounded-lg border border-black/10 bg-white px-2 py-1 text-sm outline-none focus:border-rose-400" />
          </label>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-humo">Documento (opcional)</label>
            <input type="file" onChange={(e) => setArchivo(e.target.files?.[0] || null)} className="w-full text-[11px] file:mr-1 file:rounded file:border-0 file:bg-rose-100 file:px-1.5 file:py-0.5 file:text-[11px] file:font-semibold file:text-rose-700" />
            {doc?.url && !archivo && <a href={doc.url} target="_blank" rel="noreferrer" className="mt-0.5 inline-block text-[11px] font-semibold text-teal hover:underline">📎 {doc.nombre}</a>}
            {archivo && <span className="mt-0.5 block truncate text-[10px] text-humo">{archivo.name}</span>}
          </div>
        </div>
      )}
      {paso && <p className="mt-1 text-[11px] text-rose-700">{paso}</p>}
      <div className="mt-2 flex gap-2">
        <button onClick={guardar} disabled={guardando} className="rounded-lg bg-rose-600 px-3 py-1 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50">{guardando ? "Guardando…" : "Guardar"}</button>
        <button onClick={() => { setEditar(false); setTiene(cliente.tieneSolicitudDevolucion); setFecha(cliente.fechaSolicitudDevolucion || ""); setArchivo(null); }} disabled={guardando} className="rounded-lg px-3 py-1 text-sm font-semibold text-humo hover:bg-nube">Cancelar</button>
      </div>
    </div>
  );
}
