// =====================================================================
//  MÓDULO COMERCIAL · Mandar a pre-dictaminar
//  →  src/modules/Comercial/MandarPredictamen.tsx
//
//  Se abre con las garantías que se marcaron en la cartera. Va de una
//  en una: se completan los datos que faltan y hasta el final se manda
//  todo junto.
//
//  Lo que se pide aquí y NO en el alta: metros, FOTOS y link de mapas.
//  Sin los tres, esa garantía no se puede mandar.
//
//  Las fotos se SUBEN de verdad al almacenamiento (bucket "garantias"),
//  no se pega una liga. Y el mapa se ve en pantalla, no solo el texto.
//
//  VARIAS FOTOS (07-09-2026): se pueden subir todas las que se quieran,
//  de una vez. La PRIMERA es la de fachada —la que sale en la tarjeta del
//  catálogo— y las demás quedan en la galería. Cualquiera se puede volver
//  la principal con un clic.
//
//  ESTE ES EL ÚNICO LUGAR desde donde se manda a pre-dictaminar. La lista
//  de garantías ya no manda por su cuenta: abre esta pantalla. Así los
//  datos que faltan se piden SIEMPRE, se entre por donde se entre.
//
//  YA NO SIRVE PARA CORREGIR (08-09-2026): el modo "solo completar"
//  desapareció junto con el botón "Completar datos" de la ficha. Pedía
//  los mismos campos que Editar garantía, en otra pantalla. Ahora los
//  datos se corrigen en un solo lugar y aquí solo se manda.
// =====================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { faltaParaMandar, mandarAPredictamen, type ParaPredictamen } from "../../lib/jf-predictamen";
import { supabase } from "../../lib/supabase";
import {
  leerGaleria, agregarFotos, cambiarTipo, quitarFoto as quitarDeLista,
  galeriaParaGuardar, type FotoGarantia,
} from "../../data/fotos-garantia";

// Saca las coordenadas de cualquiera de las formas en que Google Maps
// las mete en un link. Si no se encuentran, el candado sigue puesto:
// no se manda sin ubicación.
export function coordenadasDe(link: string): { lat: number; lng: number } | null {
  if (!link) return null;
  const patrones = [
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,
    /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/,
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
    /[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/,
    /^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/,
  ];
  for (const p of patrones) {
    const m = link.match(p);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  }
  return null;
}

const campo = "w-full rounded-lg border border-black/10 bg-nube px-3 py-2 text-[13px] text-tinta outline-none focus:border-teal focus:bg-white";
const etiqueta = "mb-1 block text-[12px] text-humo";

type Estado = "enviada" | "error";

export default function MandarPredictamen({ garantias, miRol, onCerrar, onListo }: {
  garantias: ParaPredictamen[];
  miRol: string | null;
  onCerrar: () => void;
  onListo: () => void;
}) {
  const [lista, setLista] = useState<ParaPredictamen[]>(garantias);
  const [i, setI] = useState(0);
  const [estados, setEstados] = useState<Record<string, Estado>>({});
  const [mensajes, setMensajes] = useState<Record<string, string>>({});
  const [maps, setMaps] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [errorFoto, setErrorFoto] = useState<string | null>(null);
  const [galeria, setGaleria] = useState<FotoGarantia[]>([]);
  const archivo = useRef<HTMLInputElement>(null);

  const g = lista[i];

  useEffect(() => {
    if (!g) return;
    setMaps(g.lat != null && g.lng != null ? g.lat + "," + g.lng : "");
    setErrorFoto(null);
    // La galería se trae de la base cada vez que se cambia de garantía.
    supabase.from("garantia").select("galeria_fotos").eq("id", g.id).single()
      .then(({ data }) => {
        const bruto = (data as { galeria_fotos?: unknown } | null)?.galeria_fotos;
        setGaleria(leerGaleria(bruto));
      });
  }, [i, g?.id]);

  const coords = useMemo(() => coordenadasDe(maps), [maps]);
  const falta = g ? faltaParaMandar({ ...g, lat: coords?.lat ?? g.lat, lng: coords?.lng ?? g.lng }) : [];
  const todasListas = lista.every((x) => faltaParaMandar(x).length === 0);

  async function guardarCampo(cambios: Record<string, unknown>, local: Partial<ParaPredictamen>) {
    if (!g) return;
    await supabase.from("garantia")
      .update({ ...cambios, actualizado_en: new Date().toISOString() })
      .eq("id", g.id);
    setLista((prev) => prev.map((x) => (x.id === g.id ? { ...x, ...local } : x)));
  }

  async function guardarMaps() {
    if (!g) return;
    const c = coordenadasDe(maps);
    await guardarCampo(
      { maps_link: maps || null, lat: c?.lat ?? null, lng: c?.lng ?? null },
      { lat: c?.lat ?? null, lng: c?.lng ?? null },
    );
  }

  // ── Subir fotos de verdad ──
  // Van al bucket "garantias", en una carpeta por folio, con nombre único
  // para que subir dos veces no se pise. Se pueden escoger VARIAS de un
  // jalón: la primera que llegue, si todavía no hay fachada, se vuelve la
  // principal; las demás se van a la galería.
  async function subirFotos(archivos: File[]) {
    if (!g || archivos.length === 0) return;
    setErrorFoto(null);

    const buenas = archivos.filter((f) => f.type.startsWith("image/") && f.size <= 10 * 1024 * 1024);
    if (buenas.length < archivos.length) {
      setErrorFoto("Se ignoraron " + (archivos.length - buenas.length) +
        " archivo(s): no son imagen o pesan más de 10 MB.");
    }
    if (!buenas.length) return;

    setSubiendo(true);
    const subidas: string[] = [];
    for (const f of buenas) {
      const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
      const ruta = `${g.folio}/foto-${Date.now()}-${subidas.length}.${ext}`;
      const { error } = await supabase.storage.from("garantias").upload(ruta, f, { upsert: true });
      if (error) { setErrorFoto("No se pudo subir una foto: " + error.message); continue; }
      subidas.push(supabase.storage.from("garantias").getPublicUrl(ruta).data.publicUrl);
    }

    if (subidas.length) {
      // Las reglas de la galería son las MISMAS que en Editar garantía:
      // viven en src/data/fotos-garantia.ts y las dos pantallas las usan,
      // para que la columna no termine con dos formas distintas adentro.
      const r = agregarFotos(g.fotoFachada, galeria, subidas);
      setGaleria(r.galeria);
      await guardarCampo(
        { foto_fachada: r.fotoFachada, galeria_fotos: galeriaParaGuardar(r.galeria) },
        { fotoFachada: r.fotoFachada },
      );
    }
    setSubiendo(false);
  }

  /** Vuelve portada una foto: es lo mismo que etiquetarla como Fachada.
   *  La que era portada baja a la galería sin etiqueta; no se pierde. */
  async function hacerPrincipal(url: string) {
    if (!g) return;
    const r = cambiarTipo(g.fotoFachada, galeria, url, "Fachada");
    setGaleria(r.galeria);
    await guardarCampo(
      { foto_fachada: r.fotoFachada, galeria_fotos: galeriaParaGuardar(r.galeria) },
      { fotoFachada: r.fotoFachada },
    );
  }

  /** Quita una foto. Si se quita la portada, la garantía se queda sin
   *  portada a propósito: es mejor que el catálogo diga "Sin foto" a que
   *  suba sola una foto del patio como si fuera la casa. */
  async function quitarFoto(url: string) {
    if (!g) return;
    const r = quitarDeLista(g.fotoFachada, galeria, url);
    setGaleria(r.galeria);
    await guardarCampo(
      { foto_fachada: r.fotoFachada, galeria_fotos: galeriaParaGuardar(r.galeria) },
      { fotoFachada: r.fotoFachada },
    );
  }

  async function mandarTodas() {
    setEnviando(true);
    for (const x of lista) {
      const r = await mandarAPredictamen(x, miRol || "");
      setEstados((p) => ({ ...p, [x.id]: r.ok ? "enviada" : "error" }));
      setMensajes((p) => ({ ...p, [x.id]: r.ok ? (r.folioPredictamen || "") : (r.error || "") }));
    }
    setEnviando(false);
  }

  const yaSeMando = Object.keys(estados).length > 0;
  const enviadas = Object.values(estados).filter((e) => e === "enviada").length;

  if (!g) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-black/10 bg-white">
      {/* Encabezado con la barrita de avance */}
      <div className="border-b border-black/5 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-tinta">Mandar a pre-dictaminar</h2>
            <p className="mt-0.5 text-[12px] text-humo">
              Garantía {i + 1} de {lista.length} · {g.folio}
            </p>
          </div>
          <button onClick={onCerrar} className="text-[12px] text-humo hover:text-tinta">Cerrar</button>
        </div>
        <div className="mt-3 flex gap-1">
          {lista.map((x, k) => (
            <div key={x.id}
              className={"h-[3px] flex-1 rounded-full " +
                (estados[x.id] === "enviada" ? "bg-aqua-dark"
                  : estados[x.id] === "error" ? "bg-red-400"
                  : k === i ? "bg-teal" : "bg-black/10")} />
          ))}
        </div>
      </div>

      {yaSeMando ? (
        <div className="px-5 py-5">
          <p className="font-display text-[15px] font-semibold text-tinta">
            Se mandaron {enviadas} de {lista.length}
          </p>
          <div className="mt-3 space-y-1.5">
            {lista.map((x) => (
              <div key={x.id} className="flex items-start justify-between gap-3 border-b border-black/5 py-2">
                <div className="min-w-0">
                  <div className="font-mono text-[11px] text-humo">{x.folio}</div>
                  <div className="truncate text-[12.5px] text-tinta">{x.direccion}</div>
                </div>
                <div className="shrink-0 text-right">
                  {estados[x.id] === "enviada"
                    ? <span className="font-mono text-[11px] font-semibold text-aqua-dark">{mensajes[x.id]}</span>
                    : <span className="text-[11px] text-red-600">{mensajes[x.id] || "No se mandó"}</span>}
                </div>
              </div>
            ))}
          </div>
          <button onClick={onListo}
            className="mt-4 rounded-lg bg-aqua-dark px-4 py-2 text-[12px] font-semibold text-white hover:bg-aqua">
            Volver a la cartera
          </button>
        </div>
      ) : (
        <div className="px-5 py-4">
          <p className="text-[14px] font-semibold text-tinta">{g.direccion}</p>
          <p className="mt-0.5 font-mono text-[11px] text-humo">
            Créd. {g.numCredito || "—"}{g.deudor ? " · " + g.deudor : ""}
          </p>

          {/* ── Foto y mapa, lado a lado ── */}
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">

            {/* Foto de fachada */}
            <div>
              <p className="mb-1.5 text-[11px] uppercase tracking-wide text-humo/70">Fotos * <span className="normal-case tracking-normal">· la primera es la de fachada</span></p>
              <div className="relative h-44 overflow-hidden rounded-xl border border-black/10 bg-nube">
                {g.fotoFachada ? (
                  <>
                    <img src={g.fotoFachada} alt="Fachada" className="h-full w-full object-cover" />
                    <span className="absolute left-2 top-2 rounded-lg bg-teal px-2 py-0.5 text-[10.5px] font-semibold text-white">
                      Fachada
                    </span>
                    <button onClick={() => quitarFoto(g.fotoFachada!)}
                      className="absolute right-2 top-2 rounded-lg bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white">
                      Quitar
                    </button>
                  </>
                ) : (
                  <button onClick={() => archivo.current?.click()} disabled={subiendo}
                    className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-humo hover:bg-black/[0.03]">
                    {subiendo ? (
                      <span className="text-[13px] font-medium">Subiendo…</span>
                    ) : (
                      <>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-8 w-8">
                          <rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m21 16-5-5-6 6" />
                        </svg>
                        <span className="text-[13px] font-medium text-tinta">Subir fotos</span>
                        <span className="text-[11px]">Puedes escoger varias de una vez</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              <input ref={archivo} type="file" accept="image/*" multiple className="hidden"
                onChange={(e) => { subirFotos(Array.from(e.target.files || [])); e.target.value = ""; }} />

              {/* La tira de las demás fotos */}
              {(galeria.length > 0 || g.fotoFachada) && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {galeria.map(({ url, tipo }) => (
                    <div key={url} className="group relative h-16 w-16 overflow-hidden rounded-lg border border-black/10">
                      <img src={url} alt="" className="h-full w-full object-cover" />
                      {tipo && (
                        <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 text-[9px] text-white">
                          {tipo}
                        </span>
                      )}
                      <div className="absolute inset-0 hidden flex-col items-center justify-center gap-0.5 bg-black/55 group-hover:flex">
                        <button onClick={() => hacerPrincipal(url)} className="text-[10px] font-semibold text-white">Principal</button>
                        <button onClick={() => quitarFoto(url)} className="text-[10px] text-white/85">Quitar</button>
                      </div>
                    </div>
                  ))}
                  {g.fotoFachada && (
                    <button onClick={() => archivo.current?.click()} disabled={subiendo}
                      className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-black/20 text-[20px] text-humo hover:bg-nube">
                      +
                    </button>
                  )}
                </div>
              )}

              {errorFoto && <p className="mt-1.5 text-[11px] text-red-600">{errorFoto}</p>}
              {!errorFoto && (
                <p className="mt-1.5 text-[11px] text-humo">
                  JPG o PNG, hasta 10 MB cada una. La etiqueta de cada foto
                  —fachada, lateral, entre calles— se pone en Editar garantía.
                  {galeria.length > 0 && ` ${galeria.length + 1} foto(s) en total.`}
                </p>
              )}
            </div>

            {/* Mapa */}
            <div>
              <p className="mb-1.5 text-[11px] uppercase tracking-wide text-humo/70">Ubicación en el mapa *</p>
              <div className="h-44 overflow-hidden rounded-xl border border-black/10 bg-nube">
                {coords ? (
                  <iframe
                    title="Mapa de la garantía"
                    className="h-full w-full border-0"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    src={`https://www.google.com/maps?q=${coords.lat},${coords.lng}&z=17&output=embed`}
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 px-4 text-center text-humo">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-8 w-8">
                      <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" />
                    </svg>
                    <span className="text-[12px]">Pega el link de Google Maps abajo</span>
                  </div>
                )}
              </div>
              <input className={campo + " mt-1.5"} value={maps} onChange={(e) => setMaps(e.target.value)}
                onBlur={guardarMaps} placeholder="Link de Google Maps o coordenadas" />
              {coords
                ? <p className="mt-1.5 font-mono text-[11px] text-aqua-dark">{coords.lat}, {coords.lng}</p>
                : maps
                  ? <p className="mt-1.5 text-[11px] text-red-600">De ese link no salen coordenadas. Abre el lugar en Google Maps y copia el link otra vez.</p>
                  : <p className="mt-1.5 text-[11px] text-humo">Se guardan aparte del link, para que el mapa no se pierda.</p>}
            </div>
          </div>

          {/* Qué es el inmueble.
              Se captura AQUÍ, antes de mandar a pre-dictaminar, porque es lo
              primero que pregunta un cliente y lo que el abogado necesita
              para dimensionar el asunto. Se guarda al salir de cada campo,
              igual que lo demás de esta pantalla. */}
          <p className="mb-1.5 mt-4 text-[11px] uppercase tracking-wide text-humo/70">Qué es el inmueble</p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <div className="col-span-2">
              <label className={etiqueta}>Tipo *</label>
              <select className={campo} defaultValue={g.tipoInmueble ?? ""}
                onChange={(e) => {
                  const v = e.target.value || null;
                  // Un terreno no tiene recámaras ni baños: se limpian solos
                  // para que no quede un dato que no existe.
                  const esTerreno = v === "Terreno";
                  guardarCampo(
                    esTerreno
                      ? { tipo_inmueble: v, niveles: null, recamaras: null, banos: null }
                      : { tipo_inmueble: v },
                    { tipoInmueble: v },
                  );
                }}>
                <option value="">—</option>
                <option value="Terreno">Terreno</option>
                <option value="Casa de una planta">Casa de una planta</option>
                <option value="Casa de dos plantas">Casa de dos plantas</option>
                <option value="Casa en condominio">Casa en condominio</option>
                <option value="Departamento">Departamento</option>
                <option value="Local comercial">Local comercial</option>
                <option value="Bodega">Bodega</option>
                <option value="Otro">Otro</option>
              </select>
            </div>
            <div>
              <label className={etiqueta}>Recámaras</label>
              <input className={campo + " font-mono"} inputMode="numeric"
                disabled={g.tipoInmueble === "Terreno"}
                defaultValue={g.recamaras ?? ""}
                onBlur={(e) => {
                  const v = parseInt(e.target.value) || null;
                  guardarCampo({ recamaras: v }, { recamaras: v });
                }} />
            </div>
            <div>
              <label className={etiqueta}>Baños</label>
              <input className={campo + " font-mono"} inputMode="decimal"
                disabled={g.tipoInmueble === "Terreno"}
                defaultValue={g.banos ?? ""}
                placeholder="1.5"
                onBlur={(e) => {
                  const v = parseFloat(e.target.value) || null;
                  guardarCampo({ banos: v }, { banos: v });
                }} />
              <p className="mt-1 text-[11px] text-humo">Medio baño = .5</p>
            </div>
          </div>

          {/* Medidas */}
          <p className="mb-1.5 mt-4 text-[11px] uppercase tracking-wide text-humo/70">Medidas</p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div>
              <label className={etiqueta}>Terreno m²</label>
              <input className={campo + " font-mono"} inputMode="decimal" defaultValue={g.m2Terreno ?? ""}
                onBlur={(e) => {
                  const v = parseFloat(e.target.value) || null;
                  guardarCampo({ m2_terreno: v }, { m2Terreno: v });
                }} />
            </div>
            <div>
              <label className={etiqueta}>Construcción m² *</label>
              <input className={campo + " font-mono"} inputMode="decimal" defaultValue={g.m2Construccion ?? ""}
                onBlur={(e) => {
                  const v = parseFloat(e.target.value) || null;
                  guardarCampo({ m2_construccion: v }, { m2Construccion: v });
                }} />
            </div>
          </div>

          {/* Avalúo · lo que vale el inmueble hoy */}
          <p className="mb-1.5 mt-4 text-[11px] uppercase tracking-wide text-humo/70">Avalúo comercial</p>
          <input className={campo + " font-mono"} inputMode="decimal"
            defaultValue={g.avaluoComercial ?? ""}
            placeholder="Estimado de campo, sin comas"
            onBlur={(e) => {
              const v = parseFloat(e.target.value.replace(/[^0-9.]/g, "")) || null;
              guardarCampo({ avaluo_comercial: v }, { avaluoComercial: v });
            }} />
          <p className="mt-1.5 text-[11px] text-humo">
            Lo que vale el inmueble hoy. Sirve para calcular el precio cuando se publique.
          </p>

          {/* Qué falta */}
          <div className="mt-4 rounded-xl border border-black/10 bg-nube p-3">
            <p className="mb-1.5 text-[12px] font-semibold text-tinta">Falta para mandar</p>
            {falta.length === 0
              ? <p className="text-[12px] font-medium text-aqua-dark">Esta garantía ya está completa.</p>
              : falta.map((f) => <p key={f} className="py-0.5 text-[12px] text-red-600">Falta {f}</p>)}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-black/5 pt-3">
            <div className="flex gap-2">
              <button disabled={i === 0} onClick={() => setI(i - 1)}
                className={"rounded-lg border border-black/10 px-3 py-2 text-[12px] font-medium " +
                  (i === 0 ? "cursor-not-allowed text-humo/40" : "text-humo hover:bg-nube")}>
                Anterior
              </button>
              <button disabled={i >= lista.length - 1} onClick={() => setI(i + 1)}
                className={"rounded-lg border border-black/10 px-3 py-2 text-[12px] font-medium " +
                  (i >= lista.length - 1 ? "cursor-not-allowed text-humo/40" : "text-humo hover:bg-nube")}>
                Siguiente
              </button>
            </div>
            <button disabled={!todasListas || enviando} onClick={mandarTodas}
              title={todasListas ? "" : "Todavía hay garantías incompletas"}
              className={"rounded-lg px-4 py-2 text-[12px] font-semibold text-white " +
                (todasListas && !enviando ? "bg-teal hover:bg-teal-dark" : "cursor-not-allowed bg-humo/40")}>
              {enviando ? "Mandando…" : "Mandar a pre-dictaminar" + (lista.length > 1 ? " · " + lista.length : "")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
