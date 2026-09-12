// =====================================================================
//  MÓDULO COMERCIAL · Ficha de la garantía (la vista "por dentro")
//  →  src/modules/Comercial/FichaGarantia.tsx
//
//  Se abre al hacer clic en una tarjeta del catálogo o en un renglón de
//  la lista. Trae, de arriba abajo:
//
//    1. Encabezado con la miga de pan y el botón de regresar
//    2. Foto de fachada, folio, dirección y los dos estatus
//    3. LA LÍNEA DE VIDA: las seis etapas con su dibujito, la de hoy
//       encendida y las que ya pasó en gris
//    4. Pestañas: General, Características, Precios, Legal y Galería
//
//  QUIÉN VE QUÉ:
//  la pestaña de Precios enseña el precio de COMPRA y el margen solo a
//  DGE, GAD y RAC. Un asesor comercial entra a la misma pestaña, pero
//  solo ve el precio de venta autorizado.
// =====================================================================
import { useEffect, useState } from "react";
import { traerGarantia, money, ETAPAS, etapaNombre, faltantesParaPredictamen, faltaParaPublicar, traerOrigenes, mesCorte, type GarantiaFicha, type OrigenGarantia } from "../../data/garantias";
import MandarPredictamen from "./MandarPredictamen";
import EditarGarantia from "./EditarGarantia";
import {
  calcularPrecio, adeudosOFijos, etiquetaEstadoPrecio, puedeCalcularPrecio,
  resumenSobrePrecio, ETIQUETA_PISO, NOTA_PISO, type Contingencia,
} from "../../lib/precio-garantia";
import { useMiRol } from "../CrmCliente/_compartido";
import { listarVisibilidad, puedeVerCampo, type CampoVisibilidad } from "../../data/niveles";
import { todasLasFotos } from "../../data/fotos-garantia";
import { generarFichaTecnica, puedeGenerarFicha } from "../../lib/ficha-tecnica";


type Pestana = "general" | "caracteristicas" | "precios" | "legal" | "galeria";

// ── Los dibujitos de la línea de vida ────────────────────────────────
// Van aquí mismo, dibujados a mano, para no depender de ninguna
// librería de íconos.
const ICONO_ETAPA: Record<string, JSX.Element> = {
  en_cartera: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  ),
  en_predictamen: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M12 3v18M5 7h14M7 7l-3 6h6zM17 7l-3 6h6z" />
    </svg>
  ),
  aprobada: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 4.5-5" />
    </svg>
  ),
  publicada: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z" /><path d="M17 9a4 4 0 0 1 0 6" />
    </svg>
  ),
  apartada: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
    </svg>
  ),
  vendida: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <circle cx="8" cy="15" r="4" /><path d="m11 12 8-8 2 2-2 2 2 2-3 3-2-2-2 2" />
    </svg>
  ),
};

// ── La línea de vida ─────────────────────────────────────────────────
// Es la misma idea del catálogo, pero grande: círculo con dibujito,
// nombre debajo y una rayita que une una etapa con la siguiente.
function LineaDeVida({ etapa }: { etapa: string }) {
  const idx = ETAPAS.findIndex((e) => e.clave === etapa);

  return (
    <div className="rounded-xl border border-black/10 bg-white px-4 py-5">
      <div className="flex items-start justify-between gap-1 overflow-x-auto">
        {ETAPAS.map((e, i) => {
          const esActual = i === idx;
          const yaPaso = idx >= 0 && i < idx;

          return (
            <div key={e.clave} className="flex min-w-0 flex-1 items-start">
              {/* La rayita que une con la etapa anterior */}
              {i > 0 && (
                <span
                  className={"mt-5 h-px flex-1 " + (yaPaso || esActual ? "bg-teal/40" : "bg-black/10")}
                  aria-hidden="true"
                />
              )}

              <div className="flex w-[86px] shrink-0 flex-col items-center gap-1.5">
                <span
                  className={
                    "flex h-10 w-10 items-center justify-center rounded-full " +
                    (esActual
                      ? "bg-teal text-white"
                      : yaPaso
                      ? "bg-teal-soft text-teal-dark"
                      : "bg-nube text-humo/45")
                  }
                >
                  {ICONO_ETAPA[e.clave]}
                </span>
                <span
                  className={
                    "text-center text-[11px] leading-tight " +
                    (esActual ? "font-semibold text-tinta" : yaPaso ? "text-humo" : "text-black/30")
                  }
                >
                  {e.nombre}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── LA GALERÍA GRANDE ────────────────────────────────────────────────
//  Ocupa todo el ancho y es alta, como en los portales inmobiliarios.
//
//  Cómo se acomoda, según cuántas fotos haya:
//    · una foto      → una sola, a todo lo ancho
//    · dos fotos     → dos parejas, mitad y mitad
//    · tres o más    → la principal grande a la izquierda y dos apiladas
//                      a la derecha; si hay más, la última dice "+N"
//
//  IMPORTANTE para las fotos verticales: en el mosaico se recortan
//  (object-cover) para que el acomodo no se desbarate, pero al abrirlas
//  se ven COMPLETAS (object-contain), sin recorte y sin deformar. Así una
//  foto de celular parada se aprecia entera.
function Galeria({ fotos, onSubir }: {
  fotos: string[];
  /** Cuando no hay fotos y la garantía sigue en cartera, se ofrece abrir
   *  el volante desde aquí mismo. */
  onSubir?: () => void;
}) {
  const [abierta, setAbierta] = useState<number | null>(null);

  if (fotos.length === 0) {
    return (
      <div className="flex h-[380px] items-center justify-center rounded-xl border border-black/10 bg-nube">
        <div className="flex flex-col items-center gap-2 text-humo/45">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="h-12 w-12">
            <rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m21 16-5-5-6 6" />
          </svg>
          <span className="text-[12px]">Todavía no hay fotos de esta garantía</span>
          {onSubir && (
            <button onClick={onSubir}
              className="mt-1 rounded-lg bg-teal px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-teal-dark">
              Subir fotos y completar datos
            </button>
          )}
        </div>
      </div>
    );
  }

  const principal = fotos[0];
  const lado = fotos.slice(1, 3);
  const sobran = fotos.length - 3;

  function mover(paso: number) {
    setAbierta((i) => (i == null ? i : (i + paso + fotos.length) % fotos.length));
  }

  return (
    <>
      <div className="grid h-[380px] grid-cols-1 gap-2 md:grid-cols-[2fr_1fr]">
        {/* La principal */}
        <button
          onClick={() => setAbierta(0)}
          className="group relative h-full overflow-hidden rounded-xl bg-nube"
        >
          <img src={principal} alt="" className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
          <span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-3 py-1 text-[11.5px] font-semibold text-white">
            {fotos.length} foto{fotos.length === 1 ? "" : "s"}
          </span>
        </button>

        {/* Las dos de al lado, apiladas */}
        {lado.length > 0 && (
          <div className="grid h-full grid-rows-2 gap-2">
            {lado.map((f, i) => {
              const esUltima = i === lado.length - 1 && sobran > 0;
              return (
                <button
                  key={i}
                  onClick={() => setAbierta(i + 1)}
                  className="group relative h-full overflow-hidden rounded-xl bg-nube"
                >
                  <img src={f} alt="" className="h-full w-full object-cover transition group-hover:scale-[1.03]" />
                  {esUltima && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/50 font-display text-xl font-bold text-white">
                      +{sobran}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── El visor ──
          Se abre encima de todo. Aquí la foto se ve COMPLETA, se pase
          de alta o de ancha, y se puede recorrer con las flechas. */}
      {abierta != null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setAbierta(null)}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setAbierta(null); }}
            className="absolute right-5 top-5 rounded-full bg-white/15 px-3 py-1.5 text-sm text-white hover:bg-white/25"
          >
            Cerrar
          </button>

          {fotos.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); mover(-1); }}
                className="absolute left-4 rounded-full bg-white/15 px-3.5 py-2.5 text-white hover:bg-white/25"
                aria-label="Foto anterior"
              >
                ‹
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); mover(1); }}
                className="absolute right-4 rounded-full bg-white/15 px-3.5 py-2.5 text-white hover:bg-white/25"
                aria-label="Foto siguiente"
              >
                ›
              </button>
            </>
          )}

          <img
            src={fotos[abierta]}
            alt=""
            onClick={(e) => e.stopPropagation()}
            className="max-h-[88vh] max-w-[88vw] rounded-lg object-contain"
          />

          <span className="absolute bottom-5 rounded-full bg-white/15 px-3 py-1 text-[12px] text-white">
            {abierta + 1} de {fotos.length}
          </span>
        </div>
      )}
    </>
  );
}

// ── Un dato suelto (etiqueta arriba, valor abajo) ────────────────────
function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null | undefined }) {
  return (
    <div>
      <div className="text-[11px] text-humo">{etiqueta}</div>
      <div className="mt-0.5 text-[13.5px] text-tinta">{valor || "—"}</div>
    </div>
  );
}

// ── Una caja con título ──────────────────────────────────────────────
function Caja({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-black/10 bg-white px-5 py-4">
      <h3 className="mb-3 font-display text-[14px] font-semibold text-tinta">{titulo}</h3>
      {children}
    </section>
  );
}

// ── La pantalla ──────────────────────────────────────────────────────
export default function FichaGarantia({ id, abrirEnPrecios, onCerrar }: {
  id: string;
  /** Viene del menú de Acciones: abre de una vez el editor en Precios. */
  abrirEnPrecios?: boolean;
  onCerrar: () => void;
}) {
  const rol = useMiRol() ?? "";

  const [g, setG] = useState<GarantiaFicha | null>(null);
  const [cargando, setCargando] = useState(true);
  const [pestana, setPestana] = useState<Pestana>("general");
  // Abre el MISMO volante de la lista, con esta sola garantía. No se
  // duplica la pantalla: se reusa, para que los datos se pidan igual.
  const [mandando, setMandando] = useState(false);
  // Ficha técnica: el cuadro que pregunta a nombre de quién va.
  const [pidiendoFicha, setPidiendoFicha] = useState(false);
  const [nombreCliente, setNombreCliente] = useState("");
  const [generandoFicha, setGenerandoFicha] = useState(false);
  const [errorFicha, setErrorFicha] = useState<string | null>(null);
  // De dónde llegó la garantía. Se lee de garantia_origen cruzando con
  // administradora y cartera: no se guarda nada repetido en la ficha.
  const [origenes, setOrigenes] = useState<OrigenGarantia[]>([]);
  const gid = g?.id ?? null;
  useEffect(() => {
    if (!gid) { setOrigenes([]); return; }
    void traerOrigenes(gid).then(setOrigenes);
  }, [gid]);
  // El ÚNICO editor. La ficha solo muestra; todo lo que se edita, se edita ahí.
  // Con qué pestaña abre el editor. null = cerrado.
  const [editando, setEditando] = useState<null | "general" | "precios">(abrirEnPrecios ? "precios" : null);
  const [vis, setVis] = useState<CampoVisibilidad[]>([]);
  useEffect(() => { listarVisibilidad().then(setVis); }, []);
  // Solo DGE y RAC ven el número de crédito. Los demás ven el folio.
  const verCredito = puedeVerCampo(vis, rol, "num_credito");
  // Los mismos permisos que ya viven en campo_visibilidad, no otros:
  // el nombre de la administradora y el precio piso tienen su renglón.
  const verNombreAdmin = puedeVerCampo(vis, rol, "administradora_nombre");
  // El nombre de la cartera tiene su propio permiso, aparte del de la
  // administradora: antes se decidia con el mismo, y no era correcto.
  const verNombreCartera = puedeVerCampo(vis, rol, "cartera_nombre");
  const verPiso = puedeVerCampo(vis, rol, "precio_piso");

  useEffect(() => {
    let vivo = true;
    traerGarantia(id).then((r) => {
      if (!vivo) return;
      setG(r);
      setCargando(false);
    });
    return () => { vivo = false; };
  }, [id]);

  if (cargando) {
    return <p className="py-20 text-center text-sm text-humo">Cargando garantía…</p>;
  }
  if (!g) {
    return (
      <div className="px-6 py-20 text-center">
        <p className="text-sm text-humo">No se encontró esa garantía.</p>
        <button onClick={onCerrar} className="mt-3 text-[13px] text-teal underline">Regresar al catálogo</button>
      </div>
    );
  }

  // El estatus jurídico: el mismo semáforo de la lista.
  const juridico =
    g.etapa === "en_cartera" ? "SIN REVISAR"
    : g.etapa === "en_predictamen" ? "EN ANÁLISIS"
    : g.dictamenResultado === "apto" ? "APTO"
    : g.dictamenResultado === "condicionado" ? "CONDICIONADO"
    : g.dictamenResultado === "no_apto" ? "NO APTO"
    : "SIN REVISAR";


  // Los precios que se enseñan arriba. Si ya hay precio guardado se usa
  // ese; si no, el aproximado con los adeudos fijos, para no dejar el
  // hueco en blanco mientras la garantía va en camino.
  // EL PRECIO QUE MANDA es el que ya se decidió y se guardó. Si todavía no
  // hay, se usa el de la ruta que se escogió, y si tampoco, el aproximado
  // con adeudos fijos — solo para no dejar el hueco en blanco.
  const aproximado = calcularPrecio({
    precioPiso: g.precioPiso,
    adeudos: adeudosOFijos(g.adeudos),
    contingencia: (g.contingencia as Contingencia) || null,
    m2Construccion: g.m2Construccion,
    valorReferencia: g.avaluoComercial ?? g.valorGarantia,
    descuento: g.descuento,
  });

  const precioDeRutaGuardado = g.rutaPrecio === "avaluo" ? g.precioPorAvaluo : g.precioPorPiso;
  const precioFinal = g.precioAutorizado ?? precioDeRutaGuardado ?? aproximado.precioVenta;

  // Todo lo que cuelga del precio —habilitación y ganancias— se calcula
  // SOBRE ESE número, no sobre el de la otra ruta.
  const precios = resumenSobrePrecio(
    precioFinal,
    g.m2Construccion,
    g.avaluoComercial ?? g.valorGarantia,
  );

  // Todas las fotos en una sola lista: primero la de fachada y luego la
  // galería. Se quitan las repetidas, por si la fachada también viene
  // adentro de la galería.
  const fotos = Array.from(
    new Set(todasLasFotos(g.fotoFachada, g.galeriaFotos).map((f) => f.url)),
  );

  // Cuadro de la ficha técnica: pide a nombre de quién va (opcional) y
  // registra el folio de entrega antes de imprimir.
  const permisoFicha = puedeGenerarFicha(g);
  // La ficha buena pide las tres firmas. El BORRADOR —con su banda en el
  // oro de la marca y sin folio de entrega— lo puede sacar la Dirección
  // para revisar el formato antes de que el precio esté autorizado.
  const puedeBorrador = rol === "DGE" || rol === "Super_Admin";
  const esBorrador = !permisoFicha.puede && puedeBorrador;

  async function descargarFicha() {
    if (!g) return;
    setGenerandoFicha(true);
    setErrorFicha(null);
    const r = await generarFichaTecnica(g, {
      clienteNombre: nombreCliente.trim() || undefined,
      quien: rol || "sin identificar",
      borrador: esBorrador,
    });
    setGenerandoFicha(false);
    if (!r.ok) { setErrorFicha(r.error); return; }
    setPidiendoFicha(false);
  }

  const clasePestana = (p: Pestana) =>
    "flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] " +
    (pestana === p ? "bg-teal text-white" : "text-humo hover:bg-nube");

  return (
    <div className="px-6 py-4">
      {/* ── Miga de pan y regreso ── */}
      <div className="mb-3 flex items-center gap-2 text-[12px] text-humo">
        <button onClick={onCerrar} className="hover:text-teal">Comercial</button>
        <span>›</span>
        <button onClick={onCerrar} className="hover:text-teal">Garantías</button>
        <span>›</span>
        <span className="text-tinta">{g.folio}</span>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-xl font-bold tracking-tight text-tinta">
          Garantía {g.folio}
        </h1>
        <div className="flex flex-wrap gap-2">
          {/* Solo mientras esté en cartera. Ya mandada, el renglón se
              bloquea y este botón no tiene nada que hacer. */}
          {/* Sirve en cartera y también en pre-dictamen: si ya se mandó pero
              le faltan fotos o metros, se completan desde aquí sin volver a
              mandarla. */}
          {!g.bloqueada && (
            <button
              onClick={() => setEditando("general")}
              className="rounded-lg border border-black/10 px-3.5 py-2 text-[13px] font-semibold text-tinta hover:bg-nube"
            >
              Editar garantía
            </button>
          )}

          {/* Ficha técnica para el cliente. Deshabilitada mientras el
              precio esté en validación: si sale antes, se entrega un
              papel con logo y precio que las tres firmas todavía pueden
              mover, y ese papel ya no se recoge. */}
          <button
            onClick={() => { setNombreCliente(""); setPidiendoFicha(true); }}
            disabled={!permisoFicha.puede && !puedeBorrador}
            title={permisoFicha.motivo ?? "Genera la ficha en PDF para el cliente"}
            className={
              "rounded-lg border px-3.5 py-2 text-[13px] font-semibold hover:bg-nube disabled:cursor-not-allowed disabled:opacity-40 " +
              (esBorrador ? "border-dorado-dark/40 text-dorado-dark" : "border-black/10 text-tinta")
            }
          >
            {esBorrador ? "Ficha técnica · borrador" : "Ficha técnica"}
          </button>

          {/* Calcular precio. Abre el editor directo en la pestaña de
              Precios: es el mismo editor, no otra pantalla. Cambia de
              nombre cuando ya hay precio, para que se note que se está
              reemplazando uno que ya existe. */}
          {!g.bloqueada && puedeCalcularPrecio(rol) && g.dictamenResultado !== "no_apto" && (
            <button
              onClick={() => setEditando("precios")}
              className="rounded-lg bg-aqua-dark px-3.5 py-2 text-[13px] font-semibold text-white hover:opacity-90"
            >
              {g.precioAutorizado != null ? "Recalcular precio" : "Calcular precio"}
            </button>
          )}

          {/* Mientras no tenga las tres firmas, el número se ve pero se
              avisa que va en camino. La firma se pone en la bandeja de
              validaciones del Tablero, no aquí. */}
          {g.precioEstado === "propuesto" && (
            <span
              title="Esperando las firmas de Contabilidad, Comercial y la DGE"
              className="rounded-lg border border-dorado-dark/40 bg-dorado-soft/40 px-3.5 py-2 text-[12px] text-dorado-dark">
              Próximo precio · en aprobación
            </span>
          )}
          {g.precioAutorizado != null && (
            <button disabled title="En construcción"
              className="cursor-not-allowed rounded-lg border border-black/10 px-3.5 py-2 text-[13px] text-humo/50">
              Eliminar precio
            </button>
          )}
          {/* EL ÚNICO botón de mandar a pre-dictaminar de todo el sistema.
              Se quitó de Carteras y de la barra de la lista; en la lista
              quedó dentro del menú de Acciones, que llama a esta misma
              pantalla. Aquí NO se habilita mientras falten datos, y debajo
              dice exactamente qué falta. */}
          {g.etapa === "en_cartera" && !g.bloqueada && !mandando && (
            <div className="flex flex-col items-end">
              <button
                onClick={() => setMandando(true)}
                disabled={faltantesParaPredictamen(g).length > 0}
                className={"rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white " +
                  (faltantesParaPredictamen(g).length > 0
                    ? "cursor-not-allowed bg-humo/40"
                    : "bg-teal hover:bg-teal-dark")}
              >
                Mandar a pre-dictaminar
              </button>
              {faltantesParaPredictamen(g).length > 0 && (
                <span className="mt-1 text-[11px] text-dorado-dark">
                  Falta {faltantesParaPredictamen(g).join(", ")}
                </span>
              )}
            </div>
          )}
          {/* ── Indicador, ya no botón ──
              "Completar datos" desapareció: pedía exactamente los mismos
              campos que Editar garantía, en otra pantalla. Ahora solo se
              avisa qué falta y se corrige en un único lugar. */}
          {g.etapa !== "en_cartera" && faltaParaPublicar(g).length > 0 && (
            <button
              onClick={() => setEditando("general")}
              title="Se captura en Editar garantía"
              className="rounded-lg border border-dorado-dark/40 bg-dorado-soft/40 px-3.5 py-2 text-left text-[12px] text-dorado-dark hover:bg-dorado-soft/70"
            >
              Falta editar garantía para publicar
              <span className="mt-0.5 block text-[11px] opacity-80">
                {faltaParaPublicar(g).join(", ")}
              </span>
            </button>
          )}
          <button
            onClick={onCerrar}
            className="rounded-lg border border-black/10 px-3.5 py-2 text-[13px] text-humo hover:bg-nube"
          >
            Regresar
          </button>
        </div>
      </div>

      {editando && (
        <EditarGarantia
          garantiaId={g.id}
          miRol={rol}
          pestanaInicial={editando === "precios" ? "precios" : "general"}
          onCerrar={() => { setEditando(null); void traerGarantia(g.id).then((x) => x && setG(x)); }}
          onGuardado={() => { void traerGarantia(g.id).then((x) => x && setG(x)); }}
        />
      )}

      {/* ── El volante, aquí mismo ──
          SOLO para mandar a pre-dictaminar una garantía que está en
          cartera. Ya no se usa para corregir datos después: eso se hace
          en Editar garantía, que es el único editor. */}
      {mandando && (
        <div className="mb-4">
          <MandarPredictamen
            garantias={[{
              id: g.id, folio: g.folio, numCredito: g.numCredito,
              administradoraCodigo: g.administradoraCodigo, direccion: g.direccion,
              deudor: g.deudor, estadoMx: g.estadoMx, etapaProcesal: g.etapaProcesal,
              m2Terreno: g.m2Terreno, m2Construccion: g.m2Construccion,
              avaluoComercial: g.avaluoComercial, fotoFachada: g.fotoFachada,
              lat: g.lat, lng: g.lng,
            }]}
            miRol={rol}
            onCerrar={() => { setMandando(false); void traerGarantia(g.id).then((x) => x && setG(x)); }}
            onListo={() => { setMandando(false); void traerGarantia(g.id).then((x) => x && setG(x)); }}
          />
        </div>
      )}

      {/* ── LA GALERÍA, a todo lo ancho y alta ── */}
      <div className="mb-4">
        {/* El botón de subir fotos NO va aquí: ya está arriba, junto a
            Regresar. Tenerlo en los dos lados era el mismo botón dos veces. */}
        <Galeria fotos={fotos} />
      </div>

      {/* ── Precios, junto a las fotos ──
          En cuanto hay precio guardado se ve aquí mismo, sin entrar a la
          pestaña: avalúo, comercial, con y sin habilitación, y lo que gana
          el cliente. Es lo primero que pregunta cualquiera. */}
      {(g.precioAutorizado != null || g.precioPiso != null) && (
        <div className="mb-4 rounded-xl border border-black/10 bg-white p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h3 className="font-display text-[14px] font-semibold text-tinta">Precios</h3>
            <span className={"rounded px-2 py-0.5 text-[11px] font-semibold " +
              (g.precioEstado === "aprobado" ? "bg-teal-soft text-teal-dark"
                : g.precioEstado === "propuesto" ? "bg-dorado/15 text-dorado-dark"
                : "bg-nube text-humo")}>
              {etiquetaEstadoPrecio(g.precioEstado)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Dato etiqueta="Avalúo" valor={money(g.avaluoComercial)} />
            <Dato
              etiqueta={g.rutaPrecio === "avaluo" ? "Cotizado sobre avalúo" : "Cotizado sobre precio piso"}
              valor={g.rutaPrecio === "avaluo" ? money(g.precioPorAvaluo) : money(g.precioPorPiso ?? g.precioPiso)}
            />
            <div>
              <div className="text-[11px] text-humo">Precio de venta</div>
              <div className="mt-0.5 font-display text-[16px] font-bold text-teal-dark">
                {money(precios.precio)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-humo">Con habilitación</div>
              <div className="mt-0.5 font-display text-[16px] font-bold text-tinta">
                {precios.precioConHabilitacion != null
                  ? money(precios.precioConHabilitacion)
                  : <span className="text-[12px] font-medium text-humo">
                      {precios.habilitacion.sinMedidas ? "faltan metros" : "cotización manual"}
                    </span>}
              </div>
              {precios.incrementoHabilitacion != null && (
                <div className="text-[11px] text-humo">
                  +{money(precios.incrementoHabilitacion)} · {precios.incrementoHabilitacionPct}%
                  {g.m2Construccion ? " · " + g.m2Construccion + " m²" : ""}
                </div>
              )}
            </div>
          </div>

          {(precios.ganaSinHabilitacion || precios.ganaConHabilitacion) && (
            <div className="mt-3 flex flex-wrap gap-5 border-t border-black/5 pt-3">
              {precios.ganaSinHabilitacion && (
                <div>
                  <div className="text-[11px] text-humo">Gana sin habilitación</div>
                  <div className="font-display text-[15px] font-bold text-aqua-dark">
                    {money(precios.ganaSinHabilitacion.gana)} · {precios.ganaSinHabilitacion.pct}%
                  </div>
                </div>
              )}
              {precios.ganaConHabilitacion && (
                <div>
                  <div className="text-[11px] text-humo">Gana con habilitación</div>
                  <div className="font-display text-[15px] font-bold text-aqua-dark">
                    {money(precios.ganaConHabilitacion.gana)} · {precios.ganaConHabilitacion.pct}%
                  </div>
                </div>
              )}
              {(g.descuento ?? 0) > 0 && (
                <div>
                  <div className="text-[11px] text-humo">Descuento aplicado</div>
                  <div className="font-display text-[15px] font-bold text-dorado-dark">
                    {money(g.descuento)}
                  </div>
                </div>
              )}
            </div>
          )}

          {g.precioAutorizado == null && (
            <p className="mt-3 text-[11px] text-humo">
              Es un aproximado con los adeudos fijos. El precio bueno se calcula en la pestaña de Precios.
            </p>
          )}
        </div>
      )}

      {/* ── Los datos de cabecera, debajo de las fotos ── */}
      <div className="mb-4 grid grid-cols-1 gap-5 rounded-xl border border-black/10 bg-white p-5 md:grid-cols-[minmax(0,1fr)_220px]">
        <div>
          <div className="text-[11px] text-humo">
            {verCredito ? "No. de crédito / Referencia" : "Folio de la garantía"}
          </div>
          <div className="mt-0.5 font-mono text-[15px] font-semibold text-tinta">
            {verCredito ? (g.numCredito || "Sin crédito") : g.folio}
          </div>
          {verCredito && g.referenciaAdministradora && (
            <div className="font-mono text-[12px] text-humo">{g.referenciaAdministradora}</div>
          )}

          <div className="mt-4 text-[11px] text-humo">Dirección de la garantía</div>
          <div className="mt-0.5 text-[13.5px] text-tinta">{g.direccion}</div>

          {g.mapsLink && (
            <a
              href={g.mapsLink}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-[12px] text-teal underline"
            >
              Ver en el mapa
            </a>
          )}

          {/* ── De dónde llegó ──
              El actor sale de la cartera, no de la garantía: se captura
              una vez y todas lo heredan. El nombre de la administradora
              se enmascara con su código para quien no tiene permiso. */}
          {origenes.length > 0 && (
            <div className="mt-4 border-t border-black/5 pt-3">
              <div className="flex items-center gap-2 text-[11px] text-humo">
                Origen
                {origenes.length > 1 && (
                  <span className="rounded-full bg-dorado-soft/60 px-2 py-0.5 font-semibold text-dorado-dark">
                    llega por {origenes.length} administradoras
                  </span>
                )}
              </div>

              {origenes.map((o) => (
                <div key={o.id} className="mt-2 rounded-lg border border-black/10 px-3 py-2">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[13px]">
                    <span className="font-semibold text-tinta">
                      {verNombreAdmin ? (o.administradoraNombre ?? o.administradoraCodigo ?? "—")
                                      : (o.administradoraCodigo ?? "—")}
                    </span>
                    <span className="text-humo">·</span>
                    <span className="text-tinta">
                      {verNombreCartera ? (o.carteraNombre ?? "sin cartera") : (o.carteraCodigo ?? "sin cartera")}
                    </span>
                    <span className="text-[12px] text-humo">· corte {mesCorte(o.corteMes)}</span>
                    {o.yaNoAparece && (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                        ya no aparece en cartera
                      </span>
                    )}
                  </div>
                  {o.actor && (
                    <div className="mt-1 text-[12px] text-humo">
                      <span className="text-tinta">Actor:</span> {o.actor}
                    </div>
                  )}
                  {!o.actor && (
                    <div className="mt-1 text-[12px] text-dorado-dark">
                      Falta el actor de esta cartera. Se captura en Configuración.
                    </div>
                  )}
                  {verPiso && o.precioPiso != null && (
                    <div className="text-[12px] text-humo">
                      Precio piso que pide: <span className="font-mono">{money(o.precioPiso)}</span>
                    </div>
                  )}
                </div>
              ))}

              {/* Mismo crédito por dos lados: se comparan los pisos. */}
              {verPiso && origenes.filter((o) => o.precioPiso != null).length > 1 && (
                <p className="mt-2 rounded-lg bg-dorado-soft/40 px-3 py-2 text-[12px] text-dorado-dark">
                  Este crédito lo ofrecen varias administradoras. La diferencia entre el
                  piso más bajo y el más alto es{" "}
                  <span className="font-mono">
                    {money(
                      Math.max(...origenes.map((o) => o.precioPiso ?? 0)) -
                        Math.min(...origenes.filter((o) => o.precioPiso != null).map((o) => o.precioPiso ?? 0)),
                    )}
                  </span>.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <div className="text-[11px] text-humo">Estatus comercial</div>
            <span className="mt-1 inline-block rounded bg-nube px-2.5 py-1 text-[11.5px] font-semibold text-tinta">
              {etapaNombre(g.etapa).toUpperCase()}
            </span>
          </div>
          <div>
            <div className="text-[11px] text-humo">Estatus jurídico</div>
            <span
              className={
                "mt-1 inline-block rounded px-2.5 py-1 text-[11.5px] font-semibold " +
                (juridico === "APTO" ? "bg-teal-soft text-teal-dark"
                  : juridico === "NO APTO" ? "bg-red-50 text-red-700"
                  : juridico === "EN ANÁLISIS" || juridico === "CONDICIONADO" ? "bg-dorado/15 text-dorado-dark"
                  : "bg-nube text-humo")
              }
            >
              {juridico}
            </span>
          </div>
          {g.bloqueada && (
            <span className="inline-block rounded bg-dorado px-2.5 py-1 text-[11.5px] font-semibold text-white">
              BLOQUEADA
            </span>
          )}
        </div>
      </div>

      {/* ── La línea de vida ── */}
      <div className="mb-4">
        <LineaDeVida etapa={g.etapa} />
      </div>

      {/* ── Pestañas ── */}
      <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-black/10 bg-white p-1.5">
        <button className={clasePestana("general")} onClick={() => setPestana("general")}>Información general</button>
        <button className={clasePestana("caracteristicas")} onClick={() => setPestana("caracteristicas")}>Características</button>
        <button className={clasePestana("precios")} onClick={() => setPestana("precios")}>Precios</button>
        <button className={clasePestana("legal")} onClick={() => setPestana("legal")}>Legal</button>
        <button className={clasePestana("galeria")} onClick={() => setPestana("galeria")}>
          Galería
          {g.galeriaFotos.length > 0 && (
            <span className="rounded bg-black/10 px-1.5 text-[10.5px]">{g.galeriaFotos.length}</span>
          )}
        </button>
      </div>

      {/* ── Contenido de cada pestaña ── */}
      {pestana === "general" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Caja titulo="Origen de la garantía">
            <div className="grid grid-cols-2 gap-4">
              <Dato etiqueta="Cartera" valor={g.cartera} />
              <Dato etiqueta="Administradora" valor={g.administradoraNombre || g.administradoraCodigo} />
              <Dato etiqueta="Acreedor" valor={g.acreedor} />
              <Dato etiqueta="Deudor" valor={g.deudor} />
            </div>
          </Caja>

          <Caja titulo="Ubicación de la garantía">
            <div className="grid grid-cols-2 gap-4">
              <Dato etiqueta="Estado" valor={g.estadoMx} />
              <Dato etiqueta="Municipio" valor={g.municipio} />
              <Dato etiqueta="Colonia" valor={g.colonia} />
              <Dato etiqueta="Código postal" valor={g.codigoPostal} />
              <Dato etiqueta="Plaza" valor={g.sucursal} />
              <Dato
                etiqueta="Coordenadas"
                valor={g.lat != null && g.lng != null ? g.lat + ", " + g.lng : null}
              />
            </div>
          </Caja>

          <Caja titulo="Asignación administrativa">
            <div className="grid grid-cols-2 gap-4">
              <Dato etiqueta="Capturó" valor={g.creadoPor} />
              <Dato
                etiqueta="Fecha de alta"
                valor={g.creadoEn ? new Date(g.creadoEn).toLocaleDateString("es-MX") : null}
              />
              <Dato etiqueta="Cliente ligado" valor={g.clienteId ? "Sí" : "No"} />
            </div>
          </Caja>
        </div>
      )}

      {pestana === "caracteristicas" && (
        <Caja titulo="Características del inmueble">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Dato etiqueta="Tipo de inmueble" valor={g.tipoInmueble} />
            <Dato etiqueta="Recámaras" valor={g.recamaras != null ? String(g.recamaras) : null} />
            <Dato etiqueta="Baños" valor={g.banos != null ? String(g.banos) : null} />
            <Dato etiqueta="Terreno" valor={g.m2Terreno ? g.m2Terreno + " m²" : null} />
            <Dato etiqueta="Construcción" valor={g.m2Construccion ? g.m2Construccion + " m²" : null} />
            <Dato etiqueta="Crédito Infonavit" valor={g.creditoInfonavit} />
          </div>
        </Caja>
      )}

      {pestana === "precios" && (
        <Caja titulo="Precios">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Dato etiqueta={ETIQUETA_PISO} valor={money(g.precioPiso)} />
            <Dato etiqueta="Avalúo comercial" valor={money(g.avaluoComercial)} />
            <Dato etiqueta="Precio de venta" valor={money(g.precioAutorizado)} />
            <Dato etiqueta="Estado del precio" valor={etiquetaEstadoPrecio(g.precioEstado)} />
          </div>
          <p className="mt-2 text-[11px] text-humo">{NOTA_PISO}</p>
          {g.precioMotivo && (
            <p className="mt-3 text-[12px] text-humo">Motivo del ajuste: {g.precioMotivo}</p>
          )}
          <p className="mt-3 text-[12px] text-humo">
            {puedeCalcularPrecio(rol)
              ? "Para calcular o cambiar el precio, entra a Editar garantía · Precios y legal."
              : "El precio lo calculan Contabilidad, Dirección, GAD y RAC."}
          </p>
        </Caja>
      )}

      {pestana === "legal" && (
        <Caja titulo="Situación jurídica">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Dato etiqueta="Etapa procesal" valor={g.etapaProcesal} />
            <Dato etiqueta="Resultado del dictamen" valor={g.dictamenResultado} />
            <Dato etiqueta="Asunto en JusticiaFácil" valor={g.jfCasoId} />
            <Dato etiqueta="Pre-dictamen" valor={g.jfPredictamenId} />
          </div>
          {g.etapa === "en_cartera" && (
            <p className="mt-4 rounded-lg bg-nube px-3 py-2 text-[12px] text-humo">
              Esta garantía todavía no se manda a pre-dictaminar. Se hace desde
              la vista de Lista, escogiéndola con su casilla.
            </p>
          )}
        </Caja>
      )}

      {pestana === "galeria" && (
        <Caja titulo="Galería">
          {fotos.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-humo">Todavía no hay fotos.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {fotos.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg bg-nube">
                  <img src={url} alt="" className="h-56 w-full object-cover transition hover:scale-[1.03]" />
                </a>
              ))}
            </div>
          )}
        </Caja>
      )}

      {/* ── Cuadro de la ficha técnica ──────────────────────────────
          El nombre es OPCIONAL. Sin él la ficha sale igual y el rastro
          llega hasta quien la descargó; con él, llega hasta la persona
          a la que se le entregó. */}
      {pidiendoFicha && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5">
            <h3 className="font-display text-[15px] font-bold text-tinta">Ficha técnica · {g.folio}</h3>
            {esBorrador ? (
              <p className="mt-1 rounded-lg bg-dorado/10 px-3 py-2 text-[12.5px] leading-relaxed text-dorado-dark">
                El precio de esta garantía todavía no tiene las tres firmas, así que
                sale un <strong>borrador</strong>: lleva una banda roja de “no entregar”,
                no gasta folio y no queda registrado como entrega. Es para revisar el
                formato, no para darle a un cliente.
              </p>
            ) : (
              <p className="mt-1 text-[13px] leading-relaxed text-humo">
                Se genera un ejemplar con folio propio, marca de agua y la leyenda de
                confidencialidad. Queda registrado quién lo descargó y cuándo.
              </p>
            )}

            {!esBorrador && (
            <>
            <label className="mt-4 block text-[12px] text-humo">¿A nombre de quién? (opcional)</label>
            <input
              value={nombreCliente}
              onChange={(e) => setNombreCliente(e.target.value)}
              placeholder="Nombre del cliente o prospecto"
              className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-[13px] outline-none focus:border-teal"
            />
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-humo/80">
              Si lo escribes, queda impreso en el pie: así, si la ficha se reenvía sin
              autorización, el folio dice a quién se le entregó y no solo quién la bajó.
            </p>
            </>
            )}

            {errorFicha && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700">{errorFicha}</p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setPidiendoFicha(false)}
                className="rounded-lg border border-black/10 px-3.5 py-2 text-[13px] text-humo hover:bg-nube">
                Cancelar
              </button>
              <button
                onClick={() => void descargarFicha()}
                disabled={generandoFicha}
                className="rounded-lg bg-teal px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-50">
                {generandoFicha ? "Generando…" : esBorrador ? "Ver borrador" : "Generar e imprimir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
