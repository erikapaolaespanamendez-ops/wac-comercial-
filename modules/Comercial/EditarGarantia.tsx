// =====================================================================
//  MÓDULO COMERCIAL · Editar garantía  (EL ÚNICO EDITOR)
//  →  src/modules/Comercial/EditarGarantia.tsx
//
//  Un solo panel para editar TODO lo de una garantía, con pestañas:
//  Información general, Características, Precios y legal, y Fotos.
//
//  POR QUÉ UNO SOLO (regla de la DGE, 07-09-2026):
//  antes cada módulo tenía su propio "editar" —uno en la cartera, otro
//  en la ficha, otro dentro de precios— y cada uno escribía los campos
//  que le tocaban. Eso es lo que dejaba datos a medias: se llenaba la
//  dirección en un lado y los metros en otro, y nadie sabía dónde estaba
//  el hueco. Ahora TODO se edita aquí, y la ficha solo MUESTRA. Se abre
//  desde la ficha y desde la cartera, pero es la misma pantalla y la
//  misma tabla: `garantia`. Ni duplicados ni huérfanos.
//
//  SE GUARDA EN VIVO. No hay botón de guardar: cada campo se escribe al
//  salir de él y arriba dice "Guardado". Si algo falla, lo dice ahí
//  mismo y no se pierde lo demás.
//
//  PERMISOS, por área y no por pantalla:
//   · Información general, Características y Fotos → Comercial
//     (quien tenga nivel de capturar en el catálogo), más GRC.
//   · Cálculo de precios → Contabilidad, Dirección (DGE), GAD y RAC.
//   · PRECIO PISO, avalúo y valor comercial → SOLO DGE y RAC.
//     Es el número del que sale todo lo demás.
//   · Número de crédito → solo DGE. Es la identidad de la garantía.
// =====================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { coordenadasDe } from "./MandarPredictamen";
import { traerOrigenes, traerGarantia, type GarantiaFicha } from "../../data/garantias";
import { listarNiveles, puedeCapturar, type NivelModulo } from "../../data/niveles";
import { accionPermitida } from "../../data/permisos";
import {
  TIPOS_FOTO, todasLasFotos, agregarFotos, cambiarTipo, quitarFoto as quitarDeLista,
  galeriaParaGuardar, sinClasificar, type TipoFoto,
} from "../../data/fotos-garantia";
import {
  CONTINGENCIAS, puedeCalcularPrecio, puedeEditarBase, money,
  ETIQUETA_PISO, NOTA_PISO,
} from "../../lib/precio-garantia";
import CalculadoraPrecio from "./CalculadoraPrecio";
import EstadoPrecio from "./EstadoPrecio";

const campo = "w-full rounded-lg border border-black/10 bg-nube px-3 py-2 text-[13px] text-tinta outline-none focus:border-teal focus:bg-white disabled:cursor-not-allowed disabled:opacity-50";
const etiqueta = "mb-1 block text-[11px] text-humo";

const ESTADOS_MX = [
  "Aguascalientes", "Baja California", "Baja California Sur", "Campeche", "Chiapas",
  "Chihuahua", "Ciudad de México", "Coahuila", "Colima", "Durango", "Estado de México",
  "Guanajuato", "Guerrero", "Hidalgo", "Jalisco", "Michoacán", "Morelos", "Nayarit",
  "Nuevo León", "Oaxaca", "Puebla", "Querétaro", "Quintana Roo", "San Luis Potosí",
  "Sinaloa", "Sonora", "Tabasco", "Tamaulipas", "Tlaxcala", "Veracruz", "Yucatán",
  "Zacatecas",
];

const TIPOS = [
  "Terreno", "Casa de una planta", "Casa de dos plantas", "Casa en condominio",
  "Departamento", "Local comercial", "Bodega", "Otro",
];

type Pestana = "general" | "caracteristicas" | "precios" | "legal" | "fotos";

export default function EditarGarantia({ garantiaId, miRol, pestanaInicial, onCerrar, onGuardado }: {
  garantiaId: string;
  miRol: string | null;
  /** Con qué pestaña abre. El botón "Calcular precio" entra directo a
   *  Precios en vez de hacer que la persona la busque. */
  pestanaInicial?: Pestana;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const rol = miRol ?? "";
  const [g, setG] = useState<GarantiaFicha | null>(null);
  const [niveles, setNiveles] = useState<NivelModulo[]>([]);
  // El actor de la cartera de esta garantía. Se lee con la misma
  // función que usa la ficha: no hay consulta nueva ni dato repetido.
  const [actorCartera, setActorCartera] = useState<string | null>(null);
  useEffect(() => {
    void traerOrigenes(garantiaId).then((o) => {
      setActorCartera(o.find((x) => x.actor)?.actor ?? null);
    });
  }, [garantiaId]);

  const [pestana, setPestana] = useState<Pestana>(pestanaInicial ?? "general");
  const [maps, setMaps] = useState("");
  const [estado, setEstado] = useState<"listo" | "guardando" | "guardado" | "error">("listo");
  const [aviso, setAviso] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);

  useEffect(() => { listarNiveles().then(setNiveles); }, []);
  useEffect(() => {
    traerGarantia(garantiaId).then((r) => {
      setG(r);
      if (r) setMaps(r.lat != null && r.lng != null ? r.lat + "," + r.lng : (r.mapsLink || ""));
    });
  }, [garantiaId]);

  // ── Los permisos ──
  // "editaComercial" es la puerta de la pantalla: sin ella no se edita nada.
  // Adentro, cada pestana tiene su propio permiso, que se configura en
  // Configuracion › Roles y Permisos › Modulo Comercial.
  const editaComercial = puedeCapturar(niveles, rol, "catalogo_garantias") || rol === "GRC";

  // Si todavia no cargaron los permisos, accionPermitida devuelve null; en ese
  // caso se respeta lo de antes (la puerta de la pantalla) para no trabar a nadie.
  function puede(accion: Parameters<typeof accionPermitida>[1]): boolean {
    const r = accionPermitida(rol, accion);
    return r === null ? editaComercial : r;
  }

  const editaGeneral = editaComercial && puede("gar_editar_general");
  const editaOrigen = editaComercial && puede("gar_editar_origen");
  const editaCaracteristicas = editaComercial && puede("gar_editar_caracteristicas");
  const editaUbicacion = editaComercial && puede("gar_editar_ubicacion");
  const editaPrecios = editaComercial && puede("gar_editar_precios");
  const capturaAvaluo = editaComercial && (editaPrecios || puede("gar_capturar_avaluo"));
  const editaLegal = editaComercial && puede("gar_editar_legal");
  const subeFotos = editaComercial && puede("gar_fotos_subir");
  const organizaFotos = editaComercial && puede("gar_fotos_organizar");
  const calculaPrecio = puedeCalcularPrecio(rol) || rol === "Contabilidad";
  const editaBase = puedeEditarBase(rol);
  const editaCredito = rol === "DGE" || rol === "Super_Admin";

  const coords = useMemo(() => coordenadasDe(maps), [maps]);

  // ── Guardar en vivo ──
  // Cada campo llama aquí al salir. Se escribe solo lo que cambió.
  async function guardar(cambios: Record<string, unknown>) {
    if (!g) return;
    setEstado("guardando");
    const { error } = await supabase
      .from("garantia")
      .update({ ...cambios, actualizado_en: new Date().toISOString() })
      .eq("id", g.id);
    if (error) {
      setEstado("error");
      setAviso("No se guardó: " + error.message);
      return;
    }
    setG((p) => (p ? { ...p, ...traducir(cambios) } : p));
    setEstado("guardado");
    setAviso(null);
    onGuardado();
    setTimeout(() => setEstado((e) => (e === "guardado" ? "listo" : e)), 1500);
  }

  // Los nombres de la base a los de la pantalla, para no releer todo
  // después de cada tecleada.
  function traducir(c: Record<string, unknown>): Partial<GarantiaFicha> {
    const m: Record<string, string> = {
      num_credito: "numCredito", referencia_administradora: "referenciaAdministradora",
      direccion: "direccion", estado_mx: "estadoMx", municipio: "municipio",
      colonia: "colonia", codigo_postal: "codigoPostal", sucursal: "sucursal",
      deudor: "deudor", acreedor: "acreedor", tipo_inmueble: "tipoInmueble",
      m2_terreno: "m2Terreno", m2_construccion: "m2Construccion",
      recamaras: "recamaras", banos: "banos", etapa_procesal: "etapaProcesal",
      adeudo_inicial: "adeudoInicial", avaluo_comercial: "avaluoComercial",
      valor_garantia: "valorGarantia", precio_piso: "precioPiso",
      contingencia: "contingencia", foto_fachada: "fotoFachada",
      galeria_fotos: "galeriaFotos", maps_link: "mapsLink", lat: "lat", lng: "lng",
    };
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(c)) if (m[k]) out[m[k]] = v;
    return out as Partial<GarantiaFicha>;
  }

  // ── Fotos ──
  async function subirFotos(archivos: File[]) {
    if (!g || !archivos.length) return;
    const buenas = archivos.filter((f) => f.type.startsWith("image/") && f.size <= 10 * 1024 * 1024);
    if (!buenas.length) { setAviso("No son imágenes o pesan más de 10 MB."); return; }

    setSubiendo(true);
    const subidas: string[] = [];
    for (const f of buenas) {
      const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
      const ruta = `${g.folio}/foto-${Date.now()}-${subidas.length}.${ext}`;
      const { error } = await supabase.storage.from("garantias").upload(ruta, f, { upsert: true });
      if (error) { setAviso("No se pudo subir una foto: " + error.message); continue; }
      subidas.push(supabase.storage.from("garantias").getPublicUrl(ruta).data.publicUrl);
    }
    if (subidas.length) {
      // Las recién subidas entran SIN etiqueta: quien las sube es quien
      // sabe qué son. El aviso amarillo de abajo se encarga de que no se
      // queden así.
      const r = agregarFotos(g.fotoFachada, g.galeriaFotos, subidas);
      await guardar({ foto_fachada: r.fotoFachada, galeria_fotos: galeriaParaGuardar(r.galeria) });
    }
    setSubiendo(false);
  }

  /** Ponerle o cambiarle la etiqueta a una foto. Marcarla como Fachada
   *  es lo mismo que hacerla portada: por eso ya no hay botón aparte de
   *  "Hacer principal". Las reglas viven en src/data/fotos-garantia.ts,
   *  para que esta pantalla y la de pre-dictamen hagan lo mismo. */
  async function ponerTipo(url: string, tipo: TipoFoto | null) {
    if (!g) return;
    const r = cambiarTipo(g.fotoFachada, g.galeriaFotos, url, tipo);
    await guardar({ foto_fachada: r.fotoFachada, galeria_fotos: galeriaParaGuardar(r.galeria) });
  }

  async function quitarFoto(url: string) {
    if (!g) return;
    const r = quitarDeLista(g.fotoFachada, g.galeriaFotos, url);
    await guardar({ foto_fachada: r.fotoFachada, galeria_fotos: galeriaParaGuardar(r.galeria) });
  }

  if (!g) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <p className="rounded-xl bg-white px-6 py-4 text-sm text-humo">Cargando garantía…</p>
      </div>
    );
  }

  const num = (v: string) => { const x = parseFloat(v.replace(/[^0-9.]/g, "")); return isNaN(x) ? null : x; };
  const ent = (v: string) => { const x = parseInt(v.replace(/[^0-9]/g, "")); return isNaN(x) ? null : x; };
  const esTerreno = g.tipoInmueble === "Terreno";

  const clasePestana = (p: Pestana) =>
    "flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] " +
    (pestana === p ? "bg-teal text-white" : "text-humo hover:bg-nube");

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-3 md:p-6">
      <div className="mx-auto max-w-4xl overflow-hidden rounded-2xl bg-white">

        {/* Encabezado */}
        <div className="flex items-start justify-between gap-3 border-b border-black/5 px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-[16px] font-bold text-tinta">Editar {g.folio}</h2>
            <p className="mt-0.5 truncate text-[12px] text-humo">{g.direccion}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className={"text-[12px] " +
              (estado === "guardando" ? "text-humo"
                : estado === "guardado" ? "text-teal-dark"
                : estado === "error" ? "text-red-600" : "text-transparent")}>
              {estado === "guardando" ? "Guardando…" : estado === "guardado" ? "Guardado" : estado === "error" ? "Error" : "·"}
            </span>
            <button onClick={onCerrar} className="rounded-lg border border-black/10 px-3 py-1.5 text-[12px] text-humo hover:bg-nube">
              Cerrar
            </button>
          </div>
        </div>

        {aviso && (
          <p className="mx-5 mt-4 rounded-lg bg-red-50 px-3 py-2 text-[12px] font-medium text-red-700">{aviso}</p>
        )}

        {/* Pestañas */}
        <div className="flex flex-wrap gap-1 border-b border-black/5 px-5 py-3">
          <button className={clasePestana("general")} onClick={() => setPestana("general")}>Información general</button>
          <button className={clasePestana("caracteristicas")} onClick={() => setPestana("caracteristicas")}>Características</button>
          <button className={clasePestana("precios")} onClick={() => setPestana("precios")}>Precios</button>
          <button className={clasePestana("legal")} onClick={() => setPestana("legal")}>Legal</button>
          <button className={clasePestana("fotos")} onClick={() => setPestana("fotos")}>
            Fotos {todasLasFotos(g.fotoFachada, g.galeriaFotos).length > 0 &&
              <span className="rounded bg-black/10 px-1.5 text-[10.5px]">{todasLasFotos(g.fotoFachada, g.galeriaFotos).length}</span>}
          </button>
        </div>

        <div className="px-5 py-4">

          {/* ─────────── INFORMACIÓN GENERAL ─────────── */}
          {pestana === "general" && (
            <>
              {!editaGeneral && (
                <p className="mb-3 rounded-lg bg-nube px-3 py-2 text-[12px] text-humo">
                  Tu rol puede ver esta garantía pero no editarla.
                </p>
              )}
              <p className="mb-2 text-[11px] uppercase tracking-wide text-humo/70">Identidad</p>
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className={etiqueta}>Número de crédito {!editaCredito && "· solo DGE"}</label>
                  <input className={campo + " font-mono"} defaultValue={g.numCredito ?? ""} disabled={!editaCredito}
                    onBlur={(e) => guardar({ num_credito: e.target.value.trim() || null })} />
                </div>
                <div>
                  <label className={etiqueta}>Referencia de la administradora</label>
                  <input className={campo + " font-mono"} defaultValue={g.referenciaAdministradora ?? ""} disabled={!editaOrigen}
                    onBlur={(e) => guardar({ referencia_administradora: e.target.value.trim() || null })} />
                </div>
                <div>
                  <label className={etiqueta}>Deudor</label>
                  <input className={campo} defaultValue={g.deudor ?? ""} disabled={!editaGeneral}
                    onBlur={(e) => guardar({ deudor: e.target.value.trim() || null })} />
                </div>
                {/* Se retiró el campo Acreedor (08-09-2026): es el mismo
                    dato que el ACTOR de la cartera, y ahí se captura una
                    sola vez para todas sus garantías. Pedirlo aquí era
                    escribir el mismo banco quince veces. La columna
                    `acreedor` queda en la base sin usarse, para tirarla
                    después de unos días de prueba. */}
              </div>

              <p className="mb-2 text-[11px] uppercase tracking-wide text-humo/70">Ubicación</p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className={etiqueta}>Dirección completa *</label>
                  <input className={campo} defaultValue={g.direccion} disabled={!editaGeneral}
                    onBlur={(e) => guardar({ direccion: e.target.value.trim() })} />
                </div>
                <div>
                  <label className={etiqueta}>Estado</label>
                  <select className={campo} defaultValue={g.estadoMx ?? ""} disabled={!editaGeneral}
                    onChange={(e) => guardar({ estado_mx: e.target.value || null })}>
                    <option value="">—</option>
                    {ESTADOS_MX.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </div>
                <div>
                  <label className={etiqueta}>Municipio o alcaldía</label>
                  <input className={campo} defaultValue={g.municipio ?? ""} disabled={!editaGeneral}
                    onBlur={(e) => guardar({ municipio: e.target.value.trim() || null })} />
                </div>
                <div>
                  <label className={etiqueta}>Colonia o fraccionamiento</label>
                  <input className={campo} defaultValue={g.colonia ?? ""} disabled={!editaGeneral}
                    onBlur={(e) => guardar({ colonia: e.target.value.trim() || null })} />
                </div>
                <div>
                  <label className={etiqueta}>Código postal</label>
                  <input className={campo} defaultValue={g.codigoPostal ?? ""} disabled={!editaGeneral}
                    onBlur={(e) => guardar({ codigo_postal: e.target.value.trim() || null })} />
                </div>
                <div className="md:col-span-2">
                  <label className={etiqueta}>Link de Google Maps</label>
                  <input className={campo} value={maps} disabled={!editaUbicacion}
                    placeholder="Pega el link y las coordenadas salen solas"
                    onChange={(e) => setMaps(e.target.value)}
                    onBlur={() => {
                      if (!coords) return;
                      guardar({ maps_link: maps.trim() || null, lat: coords.lat, lng: coords.lng });
                    }} />
                  <p className="mt-1 text-[11px] text-humo">
                    {coords
                      ? `Coordenadas: ${coords.lat}, ${coords.lng}`
                      : maps.trim()
                        ? "De ese link no salen coordenadas. Abre el lugar en Google Maps y copia el link otra vez."
                        : "Se guardan aparte del link, para que el mapa no se pierda."}
                  </p>
                </div>
              </div>
            </>
          )}

          {/* ─────────── CARACTERÍSTICAS ─────────── */}
          {pestana === "caracteristicas" && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <div className="col-span-2 md:col-span-1">
                <label className={etiqueta}>Tipo de inmueble *</label>
                <select className={campo} defaultValue={g.tipoInmueble ?? ""} disabled={!editaCaracteristicas}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    // Un terreno no tiene recámaras ni baños: se limpian
                    // solos para no dejar datos que no existen.
                    guardar(v === "Terreno"
                      ? { tipo_inmueble: v, recamaras: null, banos: null, estacionamientos: null, m2_construccion: null }
                      : { tipo_inmueble: v });
                  }}>
                  <option value="">—</option>
                  {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={etiqueta}>Terreno m²</label>
                <input className={campo + " font-mono"} inputMode="decimal" defaultValue={g.m2Terreno ?? ""} disabled={!editaCaracteristicas}
                  onBlur={(e) => guardar({ m2_terreno: num(e.target.value) })} />
              </div>
              <div>
                <label className={etiqueta}>Construcción m²</label>
                <input className={campo + " font-mono"} inputMode="decimal" defaultValue={g.m2Construccion ?? ""}
                  disabled={!editaCaracteristicas || esTerreno}
                  onBlur={(e) => guardar({ m2_construccion: num(e.target.value) })} />
              </div>
              <div>
                <label className={etiqueta}>Recámaras</label>
                <input className={campo + " font-mono"} inputMode="numeric" defaultValue={g.recamaras ?? ""}
                  disabled={!editaCaracteristicas || esTerreno}
                  onBlur={(e) => guardar({ recamaras: ent(e.target.value) })} />
              </div>
              <div>
                <label className={etiqueta}>Baños</label>
                <input className={campo + " font-mono"} inputMode="decimal" defaultValue={g.banos ?? ""} placeholder="1.5"
                  disabled={!editaCaracteristicas || esTerreno}
                  onBlur={(e) => guardar({ banos: num(e.target.value) })} />
                <p className="mt-1 text-[11px] text-humo">Medio baño = .5</p>
              </div>
              <div>
                <label className={etiqueta}>Estacionamientos</label>
                <input className={campo + " font-mono"} inputMode="numeric" defaultValue={g.estacionamientos ?? ""}
                  disabled={!editaCaracteristicas || esTerreno}
                  onBlur={(e) => guardar({ estacionamientos: ent(e.target.value) })} />
              </div>
            </div>
          )}

          {/* ─────────── PRECIOS Y LEGAL ─────────── */}
          {/* ─────────── LEGAL ───────────
              Se separó de Precios el 8 de septiembre de 2026: venían
              pegadas en una sola pestaña. Son los MISMOS campos y las
              mismas columnas, solo repartidos. No se creó nada. */}
          {pestana === "legal" && (
            <>
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className={etiqueta}>Etapa procesal</label>
                  <input className={campo} defaultValue={g.etapaProcesal ?? ""} disabled={!editaLegal}
                    onBlur={(e) => guardar({ etapa_procesal: e.target.value.trim() || null })} />
                </div>
                <div>
                  <label className={etiqueta}>Adeudo inicial</label>
                  <input className={campo + " font-mono"} inputMode="decimal" defaultValue={g.adeudoInicial ?? ""} disabled={!editaLegal}
                    onBlur={(e) => guardar({ adeudo_inicial: num(e.target.value) })} />
                </div>
              </div>

              {/* El ACTOR no se captura aquí: se hereda de la cartera,
                  donde se escribe una sola vez para todas sus garantías.
                  Se muestra porque es lo que el abogado necesita para
                  promover, y es público en el juzgado. */}
              <p className="mb-2 text-[11px] uppercase tracking-wide text-humo/70">Actor del juicio</p>
              <div className="mb-4 rounded-lg border border-black/10 bg-nube/50 px-3 py-2.5">
                {actorCartera ? (
                  <>
                    <div className="text-[13px] text-tinta">{actorCartera}</div>
                    <p className="mt-1 text-[11px] text-humo">
                      Viene de la cartera. Para corregirlo, se cambia en Configuración
                      y se corrige en todas sus garantías a la vez.
                    </p>
                  </>
                ) : (
                  <p className="text-[12px] text-dorado-dark">
                    Su cartera todavía no tiene actor capturado. Se pone en
                    Configuración → Administradoras y carteras.
                  </p>
                )}
              </div>
            </>
          )}

          {pestana === "precios" && (
            <>
              <p className="mb-2 text-[11px] uppercase tracking-wide text-humo/70">
                Base del precio {!editaBase && "· solo DGE y RAC"}
              </p>
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                <div>
                  <label className={etiqueta}>{ETIQUETA_PISO} *</label>
                  <input className={campo + " font-mono"} inputMode="decimal" defaultValue={g.precioPiso ?? ""} disabled={!editaBase}
                    onBlur={(e) => guardar({ precio_piso: num(e.target.value) })} />
                  <p className="mt-1 text-[11px] text-humo">{NOTA_PISO}</p>
                </div>
                <div>
                  <label className={etiqueta}>Avalúo comercial</label>
                  {/* Unico campo de precios que el comercial de plaza SI captura. */}
                  <input className={campo + " font-mono"} inputMode="decimal" defaultValue={g.avaluoComercial ?? ""} disabled={!editaBase && !capturaAvaluo}
                    onBlur={(e) => guardar({ avaluo_comercial: num(e.target.value) })} />
                </div>
                <div>
                  <label className={etiqueta}>Valor comercial</label>
                  <input className={campo + " font-mono"} inputMode="decimal" defaultValue={g.valorGarantia ?? ""} disabled={!editaBase}
                    onBlur={(e) => guardar({ valor_garantia: num(e.target.value) })} />
                </div>
                <div className="md:col-span-2">
                  <label className={etiqueta}>Contingencia jurídica</label>
                  <select className={campo} defaultValue={g.contingencia ?? ""} disabled={!calculaPrecio}
                    onChange={(e) => guardar({ contingencia: e.target.value || null })}>
                    <option value="">Sin definir — se calcula al 45%</option>
                    {CONTINGENCIAS.map((c) => <option key={c.clave} value={c.clave}>{c.nombre} — {c.pct}%</option>)}
                  </select>
                </div>
              </div>

              <p className="mb-2 text-[11px] uppercase tracking-wide text-humo/70">
                Cálculo del precio {!calculaPrecio && "· Contabilidad, Dirección, GAD y RAC"}
              </p>
              {calculaPrecio ? (
                g.dictamenResultado === "no_apto" ? (
                  <p className="rounded-lg bg-nube px-3 py-2 text-[12px] text-humo">
                    El dictamen salió NO APTO: esta garantía no se pone a la venta.
                  </p>
                ) : (
                  <CalculadoraPrecio g={g} rol={rol}
                    onGuardado={() => { traerGarantia(g.id).then((x) => x && setG(x)); onGuardado(); }} />
                )
              ) : (
                <p className="rounded-lg bg-nube px-3 py-2 text-[12px] text-humo">
                  El precio de venta actual es {money(g.precioAutorizado)}. Calcularlo le toca al
                  director comercial, al GAD y a la Dirección; contingencias lo hace
                  solo por la ruta del avalúo.
                </p>
              )}

              {/* Quién falta por validar y el historial de versiones.
                  Lee de garantia_precio, la misma tabla que la bandeja
                  del Tablero: los dos dicen siempre lo mismo. */}
              <EstadoPrecio garantiaId={g.id} />
            </>
          )}

          {/* ─────────── FOTOS ─────────── */}
          {pestana === "fotos" && (
            <>
              <p className="mb-2 text-[12px] text-humo">
                Cada foto lleva su etiqueta: la que diga <strong className="font-semibold text-tinta">Fachada</strong> es
                la que sale en el catálogo, en el mapa y arriba de la ficha técnica. La de <strong className="font-semibold text-tinta">entre calles</strong> es
                la que va en la hoja de ubicación.
              </p>
              <button onClick={() => archivo.current?.click()} disabled={!subeFotos || subiendo}
                className="mb-3 rounded-lg bg-teal px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-50">
                {subiendo ? "Subiendo…" : "Subir fotos"}
              </button>
              <input ref={archivo} type="file" accept="image/*" multiple className="hidden"
                onChange={(e) => { subirFotos(Array.from(e.target.files || [])); e.target.value = ""; }} />

              {/* Aviso de las que les falta etiqueta. Sin él, una foto sin
                  clasificar se queda así para siempre y la ficha técnica
                  no sabe dónde ponerla. */}
              {sinClasificar(g.galeriaFotos) > 0 && (
                <div className="mb-3 rounded-lg bg-dorado/10 px-3 py-2 text-[12px] text-dorado-dark">
                  {sinClasificar(g.galeriaFotos)} foto(s) sin clasificar. Escoge abajo qué es cada una.
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {todasLasFotos(g.fotoFachada, g.galeriaFotos).map((foto) => (
                  <div key={foto.url} className="overflow-hidden rounded-lg border border-black/10">
                    <div className="group relative h-32">
                      <img src={foto.url} alt="" className="h-full w-full object-cover" />
                      {foto.tipo === "Fachada" && (
                        <span className="absolute left-1.5 top-1.5 rounded bg-teal px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          Portada
                        </span>
                      )}
                      {foto.tipo === null && (
                        <span className="absolute left-1.5 top-1.5 rounded bg-dorado px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          Sin clasificar
                        </span>
                      )}
                      {organizaFotos && (
                        <div className="absolute inset-0 hidden items-center justify-center bg-black/55 group-hover:flex">
                          <button onClick={() => quitarFoto(foto.url)} className="text-[11px] text-white/90">Quitar</button>
                        </div>
                      )}
                    </div>

                    {/* La etiqueta. Escoger "Fachada" la vuelve portada:
                        es una sola decisión, no dos. */}
                    <select
                      value={foto.tipo ?? ""}
                      disabled={!organizaFotos}
                      onChange={(e) => ponerTipo(foto.url, (e.target.value || null) as TipoFoto | null)}
                      className="w-full border-t border-black/10 bg-white px-2 py-1.5 text-[12px] text-tinta outline-none disabled:opacity-60"
                    >
                      <option value="">¿Qué es esta foto?</option>
                      {TIPOS_FOTO.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              {!g.fotoFachada && g.galeriaFotos.length === 0 && (
                <p className="py-8 text-center text-[13px] text-humo">Todavía no hay fotos.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
