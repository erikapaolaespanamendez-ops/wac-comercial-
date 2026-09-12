// Pestaña "Correos" del expediente: redactar y rastrear correos al cliente.
// (Extraído de CrmCliente.tsx para dividir los módulos por archivo.)
import { useState, useEffect, useRef } from "react";
import { type Cliente } from "../../../data/clientes";
import { puedeAccion } from "../../../data/roles";
import { fetchComunicaciones, registrarComunicacion, type Comunicacion } from "../../../data/comunicaciones";
import { crearRastreo, actualizarAsuntoRastreo, fetchRastreoCliente, type CorreoRastreo } from "../../../data/correosRastreo";
import RedactarCorreo from "../../Correo/RedactarCorreo";
import { useMiRol, fechaLarga } from "../_compartido";

export default function PanelCorreos({ cliente }: { cliente: Cliente }) {
  const miRol = useMiRol();
  const [lista, setLista] = useState<Comunicacion[] | null>(null);
  const [error, setError] = useState(false);
  const [redactar, setRedactar] = useState(false);
  const [rastreos, setRastreos] = useState<CorreoRastreo[]>([]);
  const yaReg = useRef(false);
  const rastreoIdRef = useRef<string | null>(null);

  function cargarRastreos() {
    fetchRastreoCliente(String(cliente.id)).then(setRastreos).catch(() => {});
  }

  useEffect(() => {
    let vivo = true;
    fetchComunicaciones(String(cliente.id))
      .then((todas) => {
        const correos = todas.filter((m) => m.tipo === "correo");
        if (vivo) setLista(correos);
      })
      .catch(() => { if (vivo) setError(true); });
    fetchRastreoCliente(String(cliente.id)).then((r) => { if (vivo) setRastreos(r); }).catch(() => {});
    return () => { vivo = false; };
  }, [cliente.id]);

  // Justo antes de enviar: crea la fila de rastreo y devuelve la URL del pixel.
  async function prepararRastreo(): Promise<string | null> {
    const yo = (() => { try { return JSON.parse(localStorage.getItem("chat_yo") || "null")?.nombre || null; } catch { return null; } })();
    const r = await crearRastreo({ clienteId: String(cliente.id), para: cliente.email || null, enviadoPor: yo });
    if (!r) { rastreoIdRef.current = null; return null; }
    rastreoIdRef.current = r.id;
    return window.location.origin + "/.netlify/functions/pixel?id=" + r.id;
  }

  async function registrarEnviado(info: { asunto: string; cuerpo: string; cc: string[]; adjuntos: number }) {
    if (yaReg.current) return;
    yaReg.current = true;
    const yo = (() => { try { return JSON.parse(localStorage.getItem("chat_yo") || "null")?.nombre || null; } catch { return null; } })();
    const ccTxt = info.cc.length ? `\n\n📋 Copia a ${info.cc.length} persona${info.cc.length === 1 ? "" : "s"}: ${info.cc.join(", ")}` : "";
    const evidTxt = info.adjuntos > 0 ? `\n\n📎 Enviado con ${info.adjuntos} archivo${info.adjuntos === 1 ? "" : "s"} de evidencia (en Drive).` : "\n\n(Sin evidencia adjunta.)";
    const detalle = `Asunto: ${info.asunto || "(sin asunto)"}\n\n${info.cuerpo}${ccTxt}${evidTxt}`;
    const r = await registrarComunicacion({ clienteId: String(cliente.id), clienteNombre: cliente.nombre, tipo: "correo", detalle, autor: yo });
    if (r) setLista((prev) => [r, ...(prev || [])]);
    // Ponerle el asunto a la fila de rastreo y recargar las lecturas.
    if (rastreoIdRef.current) {
      await actualizarAsuntoRastreo(rastreoIdRef.current, info.asunto || "(sin asunto)");
      rastreoIdRef.current = null;
      cargarRastreos();
    }
  }

  if (error) return <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-10 text-center text-amber-800">No se pudieron cargar los correos.</div>;
  if (lista === null) return <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-10 text-center text-humo">Cargando correos…</div>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-teal-soft px-2.5 py-0.5 font-semibold text-teal-dark">{lista.length} correo{lista.length === 1 ? "" : "s"} registrado{lista.length === 1 ? "" : "s"}</span>
          {cliente.email && <span className="rounded-full bg-nube px-2.5 py-0.5 font-semibold text-tinta">✉️ {cliente.email}</span>}
        </div>
        {puedeAccion(miRol, "redactar_correo") && <button onClick={() => { yaReg.current = false; setRedactar(true); }} disabled={!cliente.email} className="rounded-lg bg-teal px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-teal-dark disabled:opacity-50">✉️ Redactar correo</button>}
      </div>

      {!cliente.email && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">Este cliente no tiene correo capturado. Agrégalo en su ficha para poder enviarle.</p>
      )}

      {rastreos.length > 0 && (
        <div className="rounded-2xl border border-teal/20 bg-teal-soft/30 p-3.5">
          <p className="text-[13px] font-bold uppercase tracking-wide text-teal-dark">📨 Lecturas (rastreo de apertura)</p>
          <div className="mt-2 space-y-1.5">
            {rastreos.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-tinta">{r.asunto || "(sin asunto)"}</p>
                  <p className="text-[13px] text-humo">Enviado {fechaLarga(r.enviadoAt)}</p>
                </div>
                {r.aperturas > 0 ? (
                  <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[13px] font-semibold text-emerald-700">
                    ✓ Abierto{r.aperturas > 1 ? ` · ${r.aperturas} veces` : ""}{r.abiertoAt ? ` · ${fechaLarga(r.abiertoAt)}` : ""}
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-nube px-2.5 py-0.5 text-[13px] font-semibold text-humo">Sin abrir aún</span>
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-[12px] text-humo">El rastreo depende de que el cliente cargue imágenes en su correo; si las bloquea, puede no registrarse.</p>
        </div>
      )}

      {lista.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-10 text-center text-humo">Aún no hay correos registrados para este cliente.</div>
      ) : (
        lista.map((m) => (
          <div key={m.id} className="rounded-2xl border border-black/5 bg-white p-3.5 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-tinta">✉️ Correo</span>
              <span className="text-xs text-humo">{fechaLarga(m.created_at)}</span>
            </div>
            {m.detalle && <p className="mt-1.5 whitespace-pre-wrap text-[14px] text-tinta">{m.detalle}</p>}
            {m.autor && <p className="mt-1 text-[13px] text-humo">Por {m.autor}</p>}
          </div>
        ))
      )}

      <p className="rounded-xl bg-nube/50 px-3 py-2 text-[13px] text-humo">
        📎 Puedes adjuntar uno o varios archivos como <b>evidencia</b> (opcional); si los adjuntas, quedan en la carpeta de Drive del cliente.
      </p>

      {redactar && cliente.email && (
        <RedactarCorreo
          paraCorreo={cliente.email}
          paraNombre={cliente.nombre}
          cliente={cliente}
          onCerrar={() => setRedactar(false)}
          onEnviadoDetalle={(info) => registrarEnviado(info)}
          prepararRastreo={prepararRastreo}
        />
      )}
    </div>
  );
}
