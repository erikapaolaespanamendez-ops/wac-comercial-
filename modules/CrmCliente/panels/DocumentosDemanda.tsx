// Documentos de la demanda (varios): sube uno y agrega, agrega…
// Se muestra dentro de Contingencia cuando hay demanda activa.
import { useState, useEffect } from "react";
import { type Cliente } from "../../../data/clientes";
import { puedeAccion } from "../../../data/roles";
import { fetchDocumentosDemanda, agregarDocumentoDemanda, borrarDocumentoDemanda, type DocumentoDemanda } from "../../../data/documentosDemanda";
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

export default function DocumentosDemanda({ cliente }: { cliente: Cliente }) {
  const miRol = useMiRol();
  const puede = puedeAccion(miRol, "gestionar_actuaciones") || puedeAccion(miRol, "gestionar_convenio_contingencia");
  const yo = (() => { try { return JSON.parse(localStorage.getItem("chat_yo") || "null"); } catch { return null; } })();
  const autor: string | null = yo?.nombre || null;

  const [lista, setLista] = useState<DocumentoDemanda[] | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [paso, setPaso] = useState("");

  useEffect(() => {
    let vivo = true;
    fetchDocumentosDemanda(String(cliente.id)).then((r) => { if (vivo) setLista(r); }).catch(() => { if (vivo) setLista([]); });
    return () => { vivo = false; };
  }, [cliente.id]);

  async function subir(file: File) {
    setSubiendo(true);
    try {
      setPaso("Preparando carpeta…");
      let carpetaId = (cliente.carpetaDriveId || "").trim();
      if (!carpetaId) {
        const exp = await generarExpediente(cliente);
        if (!exp.ok || !exp.carpetaId) throw new Error("No se pudo abrir la carpeta de Drive del cliente.");
        carpetaId = exp.carpetaId;
      }
      setPaso("Subiendo documento…");
      const base64 = await leerBase64(file);
      const up = await subirArchivoDrive({ carpetaId, nombre: file.name, base64, subcarpeta: "Demanda", mime: file.type, publico: true });
      if (!up.ok || !up.link) throw new Error("Falló la subida del documento.");
      const r = await agregarDocumentoDemanda({ clienteId: String(cliente.id), nombre: up.nombre || file.name, url: up.link, autor });
      if (r) setLista((prev) => [r, ...(prev || [])]);
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo subir el documento.");
    } finally {
      setSubiendo(false); setPaso("");
    }
  }

  async function borrar(id: string) {
    if (!confirm("¿Quitar este documento de la lista? (no se borra del Drive)")) return;
    const ok = await borrarDocumentoDemanda(id);
    if (ok) setLista((prev) => (prev || []).filter((x) => x.id !== id));
  }

  return (
    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/40 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-base">📁</span>
          <h3 className="font-display text-[13px] font-extrabold text-amber-800">Documentos de la demanda</h3>
          <span className="rounded-full bg-white px-2 py-0.5 text-[12px] font-semibold text-humo">{lista?.length ?? "…"}</span>
        </div>
        {puede && (
          <label className={"shrink-0 cursor-pointer rounded-lg bg-amber-600 px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-amber-700 " + (subiendo ? "opacity-60" : "")}>
            {subiendo ? "Subiendo…" : "➕ Agregar documento"}
            <input type="file" className="hidden" disabled={subiendo} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) subir(f); }} />
          </label>
        )}
      </div>
      {paso && <p className="mt-1.5 text-[12px] text-amber-700">{paso}</p>}

      <div className="mt-2.5 space-y-1.5">
        {lista === null ? (
          <p className="text-[12px] text-humo">Cargando…</p>
        ) : lista.length === 0 ? (
          <p className="text-[12px] text-humo">Aún no hay documentos. Sube el primero con "➕ Agregar documento".</p>
        ) : lista.map((d) => (
          <div key={d.id} className="rounded-xl border border-black/5 bg-white px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <a href={d.url} target="_blank" rel="noreferrer" className="block truncate text-[13px] font-semibold text-teal hover:underline">📎 {d.nombre}</a>
                <p className="text-[11px] text-humo">{fechaCorta(d.createdAt)}{d.autor ? ` · ${d.autor}` : ""}</p>
              </div>
              {puede && <button onClick={() => borrar(d.id)} className="shrink-0 rounded px-1 text-humo hover:text-red-600" aria-label="Quitar">🗑️</button>}
            </div>
            <div className="mt-2">
              <VistaPreviaDoc url={d.url} nombre={d.nombre} alto={240} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
