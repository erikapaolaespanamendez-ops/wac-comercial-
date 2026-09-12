import { useState } from "react";
import { enviarCorreoGmail } from "../../lib/gmail";
import { pulirCorreo } from "../../lib/pulirCorreo";
import { generarExpediente } from "../../data/expediente";
import { borrarRastreo } from "../../data/correosRastreo";
import type { Cliente } from "../../data/clientes";

// Ventana reutilizable: redactar un correo, pulirlo con IA y enviarlo por Gmail.
// Evidencia (fotos/archivos) OPCIONAL: se pueden adjuntar VARIOS. Si hay cliente,
// además se guardan en la carpeta del cliente en Drive (reusa generarExpediente,
// que no duplica). Se puede enviar SIN adjuntar nada.
const MAX_TOTAL = 20 * 1024 * 1024; // 20 MB sumando todos los archivos (límite de Gmail ~25MB)

export default function RedactarCorreo({ paraCorreo, paraNombre, asuntoInicial, cuerpoInicial, cliente, exigeEvidencia, onCerrar, onEnviado, onCorreoReal, onEnviadoDetalle, prepararRastreo }: {
  paraCorreo: string;
  paraNombre?: string;
  asuntoInicial?: string;
  cuerpoInicial?: string;
  cliente?: Cliente;
  exigeEvidencia?: boolean;
  onCerrar: () => void;
  onEnviado?: () => void;
  onCorreoReal?: (info: { link: string | null }) => void;
  onEnviadoDetalle?: (info: { asunto: string; cuerpo: string; cc: string[]; adjuntos: number }) => void;
  prepararRastreo?: () => Promise<string | null>;
}) {
  const [asunto, setAsunto] = useState(asuntoInicial || "");
  const [cuerpo, setCuerpo] = useState(cuerpoInicial || "");
  const [cc, setCc] = useState("");
  const [puliendo, setPuliendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [original, setOriginal] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "err"; texto: string } | null>(null);

  // Evidencia (VARIAS fotos o archivos, opcional)
  const [evidencias, setEvidencias] = useState<File[]>([]);
  const [correoEnviado, setCorreoEnviado] = useState(false); // ya salió el correo (no reenviar)
  const [driveOk, setDriveOk] = useState(false);             // las evidencias ya quedaron en Drive

  const ocupado = puliendo || enviando;
  const pesoTotal = evidencias.reduce((s, f) => s + f.size, 0);

  function leerBase64(f: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(String(r.result).split(",")[1] || "");
      r.onerror = reject;
      r.readAsDataURL(f);
    });
  }

  // Agrega archivos a la lista (sin repetir por nombre+tamaño) y valida el peso total.
  function agregarArchivos(files: FileList | null) {
    setAviso(null);
    if (!files || files.length === 0) return;
    const nuevos = Array.from(files);
    setEvidencias((prev) => {
      const combinados = [...prev];
      for (const f of nuevos) {
        if (!combinados.some((x) => x.name === f.name && x.size === f.size)) combinados.push(f);
      }
      const total = combinados.reduce((s, f) => s + f.size, 0);
      if (total > MAX_TOTAL) {
        setAviso({ tipo: "err", texto: "Los archivos juntos pasan de 20 MB. Quita alguno o usa archivos más ligeros." });
        return prev; // no aceptamos el cambio que se pasa del límite
      }
      return combinados;
    });
  }

  function quitarArchivo(i: number) {
    setAviso(null);
    setEvidencias((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function pulir() {
    if (!cuerpo.trim()) { setAviso({ tipo: "err", texto: "Escribe algo primero para que la IA lo pula." }); return; }
    setPuliendo(true); setAviso(null);
    const r = await pulirCorreo(cuerpo, paraNombre);
    setPuliendo(false);
    if (!r.ok || !r.texto) { setAviso({ tipo: "err", texto: r.error || "No se pudo pulir." }); return; }
    setOriginal(cuerpo);
    setCuerpo(r.texto);
    setAviso({ tipo: "ok", texto: "✨ Pulido por la IA. Revísalo y ajústalo si quieres antes de enviar." });
  }

  // Sube TODAS las evidencias a Drive, a la carpeta del cliente (subcarpeta "Evidencia correo").
  // Reusa generarExpediente (candado: si ya tiene carpeta, la abre; no duplica).
  // Si NO hay evidencias, igual avisa que el correo salió (para que Seguimiento registre el contacto).
  async function guardarEvidenciasDrive(): Promise<boolean> {
    if (!cliente || evidencias.length === 0) {
      onCorreoReal?.({ link: null }); // el correo salió, sin evidencia
      return true;
    }
    try {
      setAviso({ tipo: "ok", texto: "Guardando evidencia en Drive…" });
      const exp = await generarExpediente(cliente);
      const carpetaId = exp?.carpetaId || "";
      if (!carpetaId) { setAviso({ tipo: "err", texto: "No se pudo ubicar la carpeta del cliente en Drive: " + (exp?.error || "intenta de nuevo") }); return false; }

      let primerLink: string | null = null;
      for (const f of evidencias) {
        const base64 = await leerBase64(f);
        const r = await fetch("/.netlify/functions/subir-grabacion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ archivo: base64, nombre: f.name || "evidencia", tipo: f.type || "application/octet-stream", carpetaId, subcarpeta: "Evidencia correo" }),
        });
        const data = await r.json();
        if (!(data.ok && data.link)) {
          setAviso({ tipo: "err", texto: `El correo salió, pero "${f.name}" no se guardó en Drive: ` + (data.error || "desconocido") });
          return false;
        }
        if (!primerLink) primerLink = data.link;
      }
      setDriveOk(true);
      onCorreoReal?.({ link: primerLink });
      return true;
    } catch (e: any) {
      setAviso({ tipo: "err", texto: "El correo salió, pero falló guardar en Drive: " + (e?.message || e) });
      return false;
    }
  }

  async function enviar() {
    if (!paraCorreo) { setAviso({ tipo: "err", texto: "Este cliente no tiene correo en su ficha." }); return; }
    if (!asunto.trim() && !cuerpo.trim()) { setAviso({ tipo: "err", texto: "Falta el asunto y el mensaje." }); return; }
    if (exigeEvidencia && evidencias.length === 0) { setAviso({ tipo: "err", texto: "Adjunta al menos una evidencia (foto o archivo) para poder enviar el correo." }); return; }
    if (pesoTotal > MAX_TOTAL) { setAviso({ tipo: "err", texto: "Los archivos juntos pasan de 20 MB. Quita alguno." }); return; }

    setEnviando(true); setAviso(null);

    // 1) Mandar el correo (con los adjuntos pegados, si hay). Solo una vez.
    if (!correoEnviado) {
      const adjuntos: { nombre: string; tipo: string; base64: string }[] = [];
      for (const f of evidencias) {
        const base64 = await leerBase64(f);
        adjuntos.push({ nombre: f.name || "archivo", tipo: f.type || "application/octet-stream", base64 });
      }
      const pixelUrl = prepararRastreo ? (await prepararRastreo()) || undefined : undefined;
      const r = await enviarCorreoGmail({ to: paraCorreo, asunto, cuerpo, cc: cc.trim() || undefined, pixelUrl, adjuntos });
      if (!r.ok) {
        setEnviando(false); setAviso({ tipo: "err", texto: r.error || "No se pudo enviar." });
        // El envío falló: si ya se había creado la fila de rastreo (para el pixel),
        // hay que borrarla — si no, queda un "Enviado" fantasma sin haberse mandado nada.
        if (pixelUrl) {
          try { const id = new URL(pixelUrl).searchParams.get("id"); if (id) await borrarRastreo(id); } catch { /* no bloquea */ }
        }
        return;
      }
      setCorreoEnviado(true);
      onEnviadoDetalle?.({ asunto, cuerpo, cc: cc.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean), adjuntos: evidencias.length });
    }

    // 2) Guardar las evidencias en Drive (si hay).
    const okDrive = await guardarEvidenciasDrive();
    setEnviando(false);

    if (okDrive) {
      const conEvid = cliente && evidencias.length > 0;
      setAviso({ tipo: "ok", texto: conEvid ? "✅ Correo enviado con evidencia y guardado en Drive. Quedó en tus Enviados." : "✅ Correo enviado. Quedó en tus Enviados." });
      onEnviado?.();
    }
    // Si falló Drive, el aviso de error ya quedó puesto y aparece el botón de reintento.
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 p-4" onClick={ocupado ? undefined : onCerrar}>
      <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-base font-extrabold text-tinta">Redactar correo</h2>
        <p className="mt-0.5 text-sm text-humo">Para: <strong>{paraNombre || paraCorreo || "—"}</strong>{paraNombre && paraCorreo ? ` · ${paraCorreo}` : ""}</p>

        <label className="mt-3 block text-[11px] font-semibold uppercase tracking-wide text-humo">Asunto</label>
        <input value={asunto} onChange={(e) => setAsunto(e.target.value)} disabled={ocupado || correoEnviado}
          className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:border-teal disabled:opacity-50"
          placeholder="Ej. Seguimiento de tu trámite · DIIPA" />

        <label className="mt-3 block text-[11px] font-semibold uppercase tracking-wide text-humo">Con copia (CC) — opcional</label>
        <input value={cc} onChange={(e) => setCc(e.target.value)} disabled={ocupado || correoEnviado}
          className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:border-teal disabled:opacity-50"
          placeholder="correos separados por coma" />

        <div className="mt-3 flex items-center justify-between">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-humo">Mensaje</label>
          <button onClick={pulir} disabled={ocupado || correoEnviado}
            className="flex items-center gap-1 rounded-lg border border-violet-300 px-2.5 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50">
            {puliendo ? "Puliendo…" : "✏️ Pulir con IA"}
          </button>
        </div>
        <textarea value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} disabled={ocupado || correoEnviado} rows={8}
          className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:border-teal disabled:opacity-50"
          placeholder="Escríbelo como salga (hasta informal) y dale a ✏️ Pulir con IA para dejarlo formal." />

        {original !== null && !correoEnviado && (
          <button onClick={() => { setCuerpo(original); setOriginal(null); setAviso(null); }} disabled={ocupado}
            className="mt-1 text-[11px] font-medium text-humo underline disabled:opacity-50">↩ Volver a mi texto original</button>
        )}

        {/* Evidencia (varias fotos o archivos, opcional) */}
        <div className="mt-3 rounded-xl border border-dorado/40 bg-dorado/5 p-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-dorado-dark">
            Evidencia {exigeEvidencia ? "(obligatoria)" : "(opcional)"}
          </span>
          <p className="mt-0.5 text-[11px] text-humo">Puedes adjuntar varios archivos o fotos. Se pegan al correo y se guardan en la carpeta del cliente en Drive. Máximo 20 MB en total.</p>
          <input type="file" multiple accept="image/*,application/pdf" disabled={ocupado || correoEnviado}
            onChange={(e) => { agregarArchivos(e.target.files); e.currentTarget.value = ""; }}
            className="mt-2 block w-full text-xs text-tinta file:mr-3 file:rounded-lg file:border-0 file:bg-teal file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white disabled:opacity-50" />
          {evidencias.length > 0 && (
            <div className="mt-2 space-y-1">
              {evidencias.map((f, i) => (
                <div key={f.name + f.size + i} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2 py-1">
                  <span className="min-w-0 truncate text-[11px] font-semibold text-emerald-700">📎 {f.name} {driveOk ? "· ✓ en Drive" : ""}</span>
                  {!correoEnviado && (
                    <button onClick={() => quitarArchivo(i)} disabled={ocupado} className="shrink-0 text-[11px] font-medium text-red-600 hover:underline disabled:opacity-50">Quitar</button>
                  )}
                </div>
              ))}
              <p className="text-[10px] text-humo">{evidencias.length} archivo{evidencias.length === 1 ? "" : "s"} · {(pesoTotal / (1024 * 1024)).toFixed(1)} MB en total</p>
            </div>
          )}
        </div>

        {aviso && (
          <p className={"mt-3 rounded-xl px-3 py-2 text-sm " + (aviso.tipo === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>{aviso.texto}</p>
        )}

        {/* Si el correo ya salió pero Drive falló, deja reintentar SOLO la subida (sin reenviar). */}
        {correoEnviado && !driveOk && evidencias.length > 0 && (
          <button onClick={async () => { setEnviando(true); setAviso(null); const ok = await guardarEvidenciasDrive(); setEnviando(false); if (ok) { setAviso({ tipo: "ok", texto: "✅ Evidencia guardada en Drive." }); onEnviado?.(); } }}
            disabled={ocupado}
            className="mt-3 w-full rounded-xl bg-dorado px-3 py-2 text-sm font-semibold text-tinta hover:brightness-95 disabled:opacity-50">
            {enviando ? "Guardando…" : "🔁 Reintentar guardar evidencia en Drive"}
          </button>
        )}

        <div className="mt-4 flex gap-2">
          <button onClick={onCerrar} disabled={ocupado} className="flex-1 rounded-xl px-3 py-2 text-sm text-humo hover:bg-nube disabled:opacity-50">{correoEnviado ? "Listo" : "Cerrar"}</button>
          {!correoEnviado && (
            <button onClick={enviar} disabled={ocupado} className="flex-1 rounded-xl bg-teal px-3 py-2 text-sm font-semibold text-white hover:bg-teal-dark disabled:opacity-50">
              {enviando ? "Enviando…" : "Enviar"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
