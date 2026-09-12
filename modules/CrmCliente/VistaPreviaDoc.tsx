// ===================================================================
// VISOR DE DOCUMENTOS  →  src/modules/CrmCliente/VistaPreviaDoc.tsx
// Muestra un botón 👁️ que abre el documento en una VENTANA FLOTANTE,
// dentro del sistema (no manda a Drive):
//   - Imágenes (jpg/png/webp/gif…) -> se ven como foto.
//   - PDF -> vista previa embebida.
//   - Otros tipos / archivos viejos -> aviso + botón para abrir en Drive.
//
// OJO: para que la vista previa cargue, el archivo debe estar compartido
// por enlace (eso se hace al subirlo con publico: true).
// ===================================================================
import { useState } from "react";

function driveId(url: string): string {
  const m = url.match(/\/d\/([^/]+)/) || url.match(/[?&]id=([^&]+)/);
  return m ? m[1] : "";
}
function esImagen(nombre: string, url: string): boolean {
  return /\.(jpg|jpeg|png|webp|gif|bmp|heic)/.test((nombre + " " + url).toLowerCase());
}
function esPdf(nombre: string, url: string): boolean {
  return /\.pdf/.test((nombre + " " + url).toLowerCase());
}

// Contenido del visor (lo que va DENTRO de la ventana). Uso interno.
function Contenido({ url, nombre }: { url: string; nombre: string }) {
  const id = driveId(url);
  const [idx, setIdx] = useState(0);
  const [fallo, setFallo] = useState(false);

  if (id && esPdf(nombre, url)) {
    return (
      <iframe
        src={`https://drive.google.com/file/d/${id}/preview`}
        title={nombre || "Documento"}
        className="h-full w-full rounded-xl bg-white"
      />
    );
  }
  if (id && esImagen(nombre, url) && !fallo) {
    const fuentes = [
      `https://drive.google.com/thumbnail?id=${id}&sz=w1600`,
      `https://lh3.googleusercontent.com/d/${id}=w1600`,
    ];
    return (
      <img
        src={fuentes[idx]}
        alt={nombre || "Documento"}
        className="mx-auto h-full rounded-xl object-contain"
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => { if (idx < fuentes.length - 1) setIdx(idx + 1); else setFallo(true); }}
      />
    );
  }
  return (
    <div className="m-auto rounded-xl border border-dashed border-black/15 bg-white px-4 py-8 text-center">
      <p className="text-[14px] font-semibold text-tinta">📄 {nombre || "Documento"}</p>
      <p className="mt-1 text-[12.5px] text-humo">
        {fallo
          ? "No se pudo mostrar la vista previa. Si es un archivo viejo, vuelve a subirlo."
          : "Este tipo de archivo se abre en Drive."}
      </p>
      <a href={url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[13px] font-semibold text-teal hover:underline">↗️ Abrir en Drive</a>
    </div>
  );
}

// Botón 👁️ que abre la vista previa en una ventana flotante.
//   - etiqueta: texto del botón (por defecto "👁️ Vista previa").
//   - alto: se acepta por compatibilidad, ya no se usa (la ventana llena la pantalla).
export default function VistaPreviaDoc({ url, nombre = "", etiqueta, alto }: {
  url: string;
  nombre?: string;
  etiqueta?: string;
  alto?: number;
}) {
  const [abierto, setAbierto] = useState(false);
  void alto; // compatibilidad

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setAbierto(true); }}
        title="Ver vista previa"
        className="inline-flex max-w-[230px] items-center gap-1 truncate text-left text-[11.5px] font-semibold text-teal hover:underline"
      >
        {etiqueta || "👁️ Vista previa"}
      </button>

      {abierto && (
        <div className="fixed inset-0 z-[80] flex flex-col bg-black/70 p-3" onClick={() => setAbierto(false)}>
          <div className="mx-auto flex h-full w-full max-w-3xl flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2 pb-2 text-white">
              <span className="min-w-0 truncate text-sm font-semibold">{nombre || "Documento"}</span>
              <div className="flex shrink-0 gap-2">
                <a href={url} target="_blank" rel="noreferrer" className="rounded-lg bg-white/15 px-3 py-1 text-xs font-semibold text-white hover:bg-white/25">↗️ Abrir en Drive</a>
                <button onClick={() => setAbierto(false)} className="rounded-lg bg-white/15 px-3 py-1 text-xs font-semibold text-white hover:bg-white/25">✕ Cerrar</button>
              </div>
            </div>
            <div className="flex flex-1 overflow-auto rounded-xl bg-white p-2">
              <Contenido url={url} nombre={nombre} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
