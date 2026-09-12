// =====================================================================
//  MÓDULO COMERCIAL · Lista de garantías (con envío a pre-dictamen)
//  →  src/modules/Comercial/ListaGarantias.tsx
//
//  Esta pantalla es la que manda ahora en "Catálogo". Arriba trae el
//  conmutador de tres vistas —Lista, Catálogo y Mapa— y por dentro:
//
//    · Lista    → esta misma: renglones con CASILLAS para escoger varias
//                 garantías y mandarlas a pre-dictaminar de un jalón.
//    · Catálogo → la vitrina con fotos que ya existía. No se tocó ni una
//                 línea de ese archivo: se pinta tal cual desde aquí.
//    · Mapa     → src/modules/Comercial/MapaGarantias.tsx: mapa grande
//                 con un pin por garantía, del color de su etapa.
//
//  REGLA QUE SE APLICA AQUÍ (de la DGE):
//  una garantía NO se puede mandar a pre-dictaminar si le falta la foto
//  de fachada, los metros de construcción o las coordenadas. La casilla
//  ni siquiera se deja marcar y el renglón dice qué le falta.
//
//  Lo que decide si falta algo NO se escribe en esta pantalla: se le
//  pregunta a src/lib/jf-predictamen.ts, que es el mismo que hace el
//  envío. Así la pantalla nunca dice "sí se puede" y el envío contesta
//  "falta algo".
// =====================================================================
import { useEffect, useMemo, useState } from "react";
import {
  listarGarantias, faltantesParaPredictamen, etapaNombre,
  type Garantia,
} from "../../data/garantias";
import MandarPredictamen from "./MandarPredictamen";
import { sincronizarDictamenes } from "../../lib/regreso-dictamen";
import { supabase } from "../../lib/supabase";
import CatalogoGarantias from "./CatalogoGarantias";
import MapaGarantias from "./MapaGarantias";
import FichaGarantia from "./FichaGarantia";
import { useMiRol } from "../CrmCliente/_compartido";
import { listarVisibilidad, puedeVerCampo, type CampoVisibilidad } from "../../data/niveles";

type Vista = "lista" | "catalogo" | "mapa";

// Las acciones del renglón. Hoy funcionan MANDAR y ELIMINAR; calcular
// precio y apartar están puestos pero apagados, a la espera de que se
// definan.
type Accion = "mandar" | "eliminar" | "precio" | "apartar";

function ItemMenu({ texto, activo, nota, peligro, onClick }: {
  texto: string; activo: boolean; nota?: string; peligro?: boolean; onClick: () => void;
}) {
  return (
    <button onClick={activo ? onClick : undefined} disabled={!activo}
      className={"flex w-full flex-col items-start px-3 py-2 text-left text-[13px] " +
        (!activo ? "cursor-not-allowed text-humo/40"
          : peligro ? "text-red-600 hover:bg-red-50" : "text-tinta hover:bg-nube")}>
      <span>{texto}</span>
      {nota && <span className="text-[11px] text-humo/70">{nota}</span>}
    </button>
  );
}

// ── El semáforo jurídico de cada renglón ─────────────────────────────
// Es la misma columna que ya conoces como "SIN_REVISAR", pero con los
// estados de verdad: se lee de la etapa de la garantía y, cuando ya
// regresó dictaminada, del resultado.
function chipJuridico(g: Garantia) {
  if (g.etapa === "en_cartera") {
    return { texto: "Sin revisar", clase: "bg-nube text-humo" };
  }
  if (g.etapa === "en_predictamen") {
    return { texto: "En análisis", clase: "bg-dorado/15 text-dorado" };
  }
  if (g.dictamenResultado === "apto") {
    return { texto: "Apto", clase: "bg-teal-soft text-teal-dark" };
  }
  if (g.dictamenResultado === "condicionado") {
    return { texto: "Condicionado", clase: "bg-dorado/15 text-dorado" };
  }
  if (g.dictamenResultado === "no_apto") {
    return { texto: "No apto", clase: "bg-red-50 text-red-700" };
  }
  return { texto: etapaNombre(g.etapa), clase: "bg-nube text-humo" };
}

// ── Un renglón ───────────────────────────────────────────────────────
function Renglon({
  g, verNombreAdmin, verCredito, onAbrir, onAccion,
}: {
  g: Garantia;
  onAccion: (accion: Accion, g: Garantia) => void;
  verNombreAdmin: boolean;
  /** El número de crédito es la identidad de la garantía y solo lo ven DGE
   *  y RAC. Los demás ven el folio, que es el código público. */
  verCredito: boolean;
  onAbrir: (id: string) => void;
}) {
  const [menu, setMenu] = useState(false);
  const faltan = faltantesParaPredictamen(g);
  // Solo se puede escoger si está en cartera, no está bloqueada y no le
  // falta nada.
  const sePuede = g.etapa === "en_cartera" && !g.bloqueada && faltan.length === 0;
  const jur = chipJuridico(g);

  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)_120px_150px_120px_44px] items-center gap-3 border-b border-black/5 bg-white px-4 py-3"
    >

      {/* Garantía · al hacer clic aquí se abre la ficha por dentro.
          El clic va en esta celda y no en todo el renglón, para que marcar
          la casilla no abra la pantalla. */}
      <div className="min-w-0 cursor-pointer" onClick={() => onAbrir(g.id)}>
        <div className="font-mono text-[11px] text-humo">
          {g.folio}
          {verCredito && g.numCredito ? " · " + g.numCredito : ""}
          {verCredito && g.referenciaAdministradora ? " · " + g.referenciaAdministradora : ""}
        </div>
        <div className="truncate text-[13.5px] text-tinta">{g.deudor || "Sin deudor capturado"}</div>
        <div className="truncate text-[12px] text-humo">{g.direccion}</div>
      </div>

      {/* Cartera y administradora */}
      <div className="text-[12px] text-humo">
        <div className="truncate">{g.cartera || "—"}</div>
        <div className="truncate font-mono text-[11px]">
          {verNombreAdmin ? (g.administradoraNombre || "") : (g.administradoraCodigo || "")}
        </div>
      </div>

      {/* Requisitos */}
      <div className="text-[12px]">
        {g.etapa !== "en_cartera" ? (
          <span className="text-humo/60">—</span>
        ) : faltan.length === 0 ? (
          <span className="text-teal-dark">Completos</span>
        ) : (
          <span className="text-dorado">Falta {faltan.join(", ")}</span>
        )}
      </div>

      {/* Jurídico */}
      <div>
        <span className={"rounded px-2 py-1 text-[11px] " + jur.clase}>{jur.texto}</span>
      </div>

      {/* Acciones */}
      <div className="relative">
        <button onClick={() => setMenu((v) => !v)} aria-label="Acciones"
          className="rounded-lg px-2 py-1 text-[16px] leading-none text-humo hover:bg-nube">⋯</button>
        {menu && (
          <>
            {/* Capa invisible para cerrar el menú al hacer clic afuera */}
            <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
            <div className="absolute right-0 z-20 mt-1 w-[210px] overflow-hidden rounded-xl border border-black/10 bg-white py-1 shadow-lg">
              <ItemMenu texto="Mandar a pre-dictaminar" activo={sePuede}
                nota={g.etapa !== "en_cartera" ? "Ya salió de cartera" : faltan.length ? "Falta " + faltan[0] : undefined}
                onClick={() => { setMenu(false); onAccion("mandar", g); }} />
              <ItemMenu texto={g.precioAutorizado != null ? "Recalcular precio" : "Calcular precio"}
                activo={g.dictamenResultado !== "no_apto"}
                nota={g.dictamenResultado === "no_apto" ? "El dictamen salió no apto" : undefined}
                onClick={() => { setMenu(false); onAccion("precio", g); }} />
              <ItemMenu texto="Apartar" activo={false} nota="En construcción"
                onClick={() => setMenu(false)} />
              <div className="my-1 border-t border-black/5" />
              <ItemMenu texto="Eliminar" activo={!g.clienteId && !g.bloqueada} peligro
                nota={g.clienteId ? "Tiene cliente ligado" : g.bloqueada ? "Está bloqueada" : undefined}
                onClick={() => { setMenu(false); onAccion("eliminar", g); }} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── La pantalla ──────────────────────────────────────────────────────
export default function ListaGarantias() {
  // useMiRol() regresa string O null: cuando la pantalla apenas abre,
  // todavía no sabe quién entró. Se le pone "" mientras tanto, porque
  // includes() no acepta null y porque un rol vacío no coincide con
  // ninguno de la lista: ante la duda, NO se enseña el nombre.
  const rol = useMiRol() ?? "";
  // El NOMBRE de la administradora solo lo ven DGE y RAC. Los demás ven
  // el código. Es la misma regla que ya existe en JusticiaFácil.
  const verNombreAdmin = ["Super_Admin", "DGE", "RAC"].includes(rol);

  const [vista, setVista] = useState<Vista>("lista");
  const [lista, setLista] = useState<Garantia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  // La garantía sobre la que se está actuando desde el menú de Acciones.
  // Una a la vez: mandar en montón era lo que se saltaba el volante.
  const [mandando, setMandando] = useState<Garantia | null>(null);
  const [borrando, setBorrando] = useState<Garantia | null>(null);
  const [abrirEnPrecios, setAbrirEnPrecios] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  // Cuál garantía está abierta por dentro. En nulo = se ve la lista.
  const [abierta, setAbierta] = useState<string | null>(null);
  const [revisando, setRevisando] = useState(false);
  const [vis, setVis] = useState<CampoVisibilidad[]>([]);
  useEffect(() => { listarVisibilidad().then(setVis); }, []);
  // La regla vive en la BASE (tabla campo_visibilidad), no aquí. Si mañana
  // la DGE le da acceso a otro rol desde Configuración, esta pantalla se
  // entera sola, sin volver a publicar.
  const verCredito = puedeVerCampo(vis, rol, "num_credito");

  async function traer() {
    setCargando(true);
    setLista(await listarGarantias());
    setCargando(false);
  }

  // Al abrir la pantalla se pregunta primero si algún dictamen ya cerró
  // allá en URRJ, y luego se trae la lista. Así los renglones ya salen
  // con su resultado puesto, sin que nadie tenga que capturarlo.
  useEffect(() => {
    (async () => {
      await sincronizarDictamenes();
      await traer();
    })();
  }, []);

  // El mismo repaso, pero a mano. Sirve cuando el abogado acaba de
  // firmar y no se quiere esperar a recargar.
  async function repasarDictamenes() {
    if (revisando) return;
    setRevisando(true);
    const r = await sincronizarDictamenes();
    if (r.error) {
      setAviso("No se pudo consultar URRJ: " + r.error);
    } else if (r.aprobadas || r.anotadas) {
      setAviso(
        (r.aprobadas ? r.aprobadas + " garantía(s) pasaron a aprobadas. " : "") +
        (r.anotadas ? r.anotadas + " con dictamen no apto o condicionado. " : "") +
        (r.enEspera ? r.enEspera + " siguen esperando firmas." : ""),
      );
    } else {
      setAviso(
        r.enEspera
          ? r.enEspera + " garantía(s) siguen en pre-dictamen: la cadena de firmas no está completa."
          : "No hay dictámenes nuevos.",
      );
    }
    setRevisando(false);
    await traer();
  }

  const filtrada = useMemo(() => {
    const b = busqueda.trim().toLowerCase();
    if (!b) return lista;
    return lista.filter((g) =>
      // Quien no puede ver el crédito tampoco puede buscarlo: si no, lo
      // adivinaría probando números hasta que un renglón apareciera.
      [g.folio, g.direccion, g.deudor, g.cartera,
       ...(verCredito ? [g.numCredito, g.referenciaAdministradora] : [])]
        .filter(Boolean)
        .some((t) => String(t).toLowerCase().includes(b)),
    );
  }, [lista, busqueda, verCredito]);

  // Cuántas están listas, solo para el pie de la tabla.
  const listas = useMemo(
    () => filtrada.filter((g) =>
      g.etapa === "en_cartera" && !g.bloqueada && faltantesParaPredictamen(g).length === 0).length,
    [filtrada],
  );

  function accion(a: Accion, g: Garantia) {
    if (a === "mandar") setMandando(g);
    if (a === "eliminar") setBorrando(g);
    // Calcular precio no abre otra pantalla: entra a la ficha y la ficha
    // abre el editor en Precios. Una sola calculadora en todo el sistema.
    if (a === "precio") { setAbierta(g.id); setAbrirEnPrecios(true); }
  }

  // ── Eliminar ──
  // NO se borra el renglón: se ARCHIVA. La garantía deja de verse en el
  // catálogo pero sigue en la base con su folio, su historia y su liga con
  // el asunto de JusticiaFácil. Borrarla de verdad dejaría huérfano ese
  // asunto, apuntando a una garantía que ya no existe.
  async function eliminar() {
    if (!borrando) return;
    const { error } = await supabase.from("garantia")
      .update({ archivada: true }).eq("id", borrando.id);
    setAviso(error
      ? "No se pudo eliminar: " + error.message
      : borrando.folio + " se quitó del catálogo. Queda archivada, no se perdió.");
    setBorrando(null);
    await traer();
  }

  // ── Mandar a pre-dictaminar ────────────────────────────────────────
  // Aquí ANTES había una copia del envío: un ciclo que llamaba a
  // mandarAPredictamen() garantía por garantía. Se quitó el 07-09-2026.
  // Era código duplicado y, peor, se saltaba la pantalla donde se piden
  // los datos que faltan, así que dependía de que ya estuvieran completos.
  //
  // Ahora abre MandarPredictamen, que es el ÚNICO lugar desde donde se
  // manda. Se entre por la lista o por la cartera, los datos se piden
  // siempre igual.

  const claseTab = (v: Vista) =>
    "px-3.5 py-2 text-[13px] " +
    (vista === v ? "bg-teal text-white" : "bg-white text-humo hover:bg-nube");

  // Si hay una garantía abierta, se pinta su ficha en lugar de la lista.
  // Al cerrarla se vuelve a traer todo, por si allá adentro cambió algo.
  // El volante, con las garantías escogidas. Al cerrarlo se vuelve a traer
  // la lista para que los renglones salgan ya con su estado nuevo.
  if (mandando) {
    return (
      <div className="p-5">
        <MandarPredictamen
          garantias={[mandando].map((g) => ({
            id: g.id, folio: g.folio, numCredito: g.numCredito,
            administradoraCodigo: g.administradoraCodigo, direccion: g.direccion,
            deudor: g.deudor, estadoMx: g.estadoMx, etapaProcesal: g.etapaProcesal,
            m2Terreno: g.m2Terreno, m2Construccion: g.m2Construccion,
            avaluoComercial: g.avaluoComercial, fotoFachada: g.fotoFachada,
            lat: g.lat, lng: g.lng,
          }))}
          miRol={rol}
          onCerrar={() => { setMandando(null); void traer(); }}
          onListo={() => { setMandando(null); void traer(); }}
        />
      </div>
    );
  }

  if (abierta) {
    return (
      <FichaGarantia
        id={abierta}
        abrirEnPrecios={abrirEnPrecios}
        onCerrar={() => { setAbierta(null); setAbrirEnPrecios(false); void traer(); }}
      />
    );
  }

  return (
    <div className="p-5">
      {/* Conmutador de vistas */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => void repasarDictamenes()}
          disabled={revisando}
          className="order-last ml-auto rounded-lg border border-black/10 px-3.5 py-2 text-[13px] text-humo hover:bg-nube disabled:opacity-50"
          title="Pregunta a URRJ si ya cerró algún dictamen"
        >
          {revisando ? "Consultando URRJ…" : "Revisar dictámenes"}
        </button>

        <div className="flex overflow-hidden rounded-lg border border-black/10">
          <button className={claseTab("lista")} onClick={() => setVista("lista")}>Lista</button>
          <button className={claseTab("catalogo") + " border-l border-black/10"} onClick={() => setVista("catalogo")}>Catálogo</button>
          <button
            className={claseTab("mapa") + " border-l border-black/10"}
            onClick={() => setVista("mapa")}
          >
            Mapa
          </button>
        </div>

        {vista === "lista" && (
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder={verCredito ? "Buscar folio, crédito, deudor o dirección" : "Buscar folio, deudor o dirección"}
            className="min-w-[240px] flex-1 rounded-lg border border-black/10 px-3 py-2 text-[13px]"
          />
        )}
      </div>

      {/* La vitrina de siempre, sin tocarle nada */}
      {vista === "catalogo" && <CatalogoGarantias onAbrir={setAbierta} />}

      {/* El mapa. Los cuatro números de arriba NO se pintan aquí a
          propósito: en esta vista lo que importa es ver dónde están, y
          esos recuadros se llevan casi cien píxeles de altura. */}
      {vista === "mapa" && <MapaGarantias onAbrir={setAbierta} />}

      {/* Confirmar antes de eliminar. Es un clic de un menú: sin este paso
          se archiva una garantía sin querer. */}
      {borrando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5">
            <h3 className="font-display text-[15px] font-bold text-tinta">
              ¿Quitar {borrando.folio} del catálogo?
            </h3>
            <p className="mt-2 text-[13px] text-humo">{borrando.direccion}</p>
            <p className="mt-2 text-[12px] text-humo">
              Se archiva: deja de aparecer, pero no se borra. Su folio, su historia y su liga
              con el asunto jurídico se conservan.
            </p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => void eliminar()}
                className="rounded-lg bg-red-600 px-3.5 py-2 text-[13px] font-semibold text-white">
                Sí, quitar
              </button>
              <button onClick={() => setBorrando(null)}
                className="rounded-lg border border-black/10 px-3.5 py-2 text-[13px] text-humo">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {vista === "lista" && (
        <>
          {/* Barra de selección */}
          {aviso && (
            <div className="mb-3 rounded-lg border border-black/10 bg-nube px-4 py-2.5 text-[13px] text-tinta">
              {aviso}
            </div>
          )}

          {/* Encabezados */}
          <div className="overflow-hidden rounded-xl border border-black/10">
            <div className="grid grid-cols-[minmax(0,1fr)_120px_150px_120px_44px] items-center gap-3 border-b border-black/10 bg-nube px-4 py-2.5 text-[11px] text-humo">
              <div>Garantía</div>
              <div>Cartera</div>
              <div>Requisitos</div>
              <div>Jurídico</div>
              <div className="text-right">Acciones</div>
            </div>

            {cargando ? (
              <div className="px-4 py-10 text-center text-[13px] text-humo">Cargando…</div>
            ) : filtrada.length === 0 ? (
              <div className="px-4 py-10 text-center text-[13px] text-humo">
                No hay garantías que coincidan.
              </div>
            ) : (
              filtrada.map((g) => (
                <Renglon
                  key={g.id}
                  g={g}
                  verNombreAdmin={verNombreAdmin}
                  verCredito={verCredito}
                  onAbrir={setAbierta}
                  onAccion={accion}
                />
              ))
            )}
          </div>

          <div className="mt-3 text-[12px] text-humo">
            {filtrada.length} garantía(s) · {listas} listas para mandar a pre-dictaminar
          </div>
        </>
      )}
    </div>
  );
}
