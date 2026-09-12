// =====================================================================
//  MÓDULO COMERCIAL · Catálogo de Garantías (vitrina de tarjetas)
//  →  src/modules/Comercial/CatalogoGarantias.tsx
//
//  La vitrina: los cuatro números de arriba, los filtros y la rejilla de
//  tarjetas. Todo lo que tenga que ver con la base de datos vive en
//  src/data/garantias.ts — aquí solo se pinta.
//
//  CAMBIO DEL 07-09-2026:
//  Antes era una lista de renglones anchos con la foto a la izquierda.
//  Ahora son TARJETAS en rejilla, como se ven los portales inmobiliarios:
//  foto grande arriba, etiqueta de etapa encima de la foto, y abajo el
//  folio, la dirección, la plaza, los datos del inmueble y el precio.
//  Se cambió CÓMO se ve, no QUÉ se ve: los mismos filtros, los mismos
//  cuatro números y las mismas reglas de quién ve el margen.
//
//  CAMBIO DEL 08-09-2026:
//  El precio que todavía no firman las tres áreas ya no se pinta igual
//  que el firmado. Ahora sale con el indicador "Próximo precio" en oro y
//  la nota "En validación", con su monto a la vista para que comercial
//  sepa por dónde va a andar el número sin tomarlo como definitivo. El
//  margen se dejó SOLO para los precios ya aprobados. Además, a las que
//  no tienen precio piso capturado se les pone el aviso "Falta precio
//  piso", visible solo para quien tiene permiso de ver ese dato.
// =====================================================================
import { useEffect, useMemo, useState } from "react";
import {
  listarGarantias, resumenCatalogo, precioMostrado, margenPct,
  money, moneyCorto, ETAPAS, etapaNombre,
  type Garantia, type EstadoPrecioMostrado,
} from "../../data/garantias";
import { useMiRol } from "../CrmCliente/_compartido";
import { listarVisibilidad, puedeVerCampo, type CampoVisibilidad } from "../../data/niveles";
import { SUCURSALES } from "../../data/roles";

// Quién puede ver el margen de utilidad. Un asesor comercial NO.
const ROLES_VEN_MARGEN = ["Super_Admin", "DGE", "DGC", "GAD", "DTR"];

// ── Los cuadritos de números de arriba ───────────────────────────────
function Numerito({ etiqueta, valor, color }: {
  etiqueta: string; valor: string; color?: string;
}) {
  return (
    <div className="rounded-xl bg-nube px-3.5 py-3">
      <div className="text-[11px] text-humo">{etiqueta}</div>
      <div className={"mt-0.5 font-display text-2xl font-bold " + (color || "text-tinta")}>
        {valor}
      </div>
    </div>
  );
}

// ── El color de la etiqueta de etapa que va sobre la foto ────────────
// Cada etapa trae su color para que se distingan de un vistazo, sin
// tener que leer. En cartera y pre-dictamen son las que todavía no se
// venden, por eso van en gris y ámbar.
function colorEtapa(etapa: string): string {
  switch (etapa) {
    case "en_cartera":     return "bg-humo/85 text-white";
    case "en_predictamen": return "bg-dorado text-white";
    case "aprobada":       return "bg-teal-dark text-white";
    case "publicada":      return "bg-teal text-white";
    case "apartada":       return "bg-aqua-dark text-white";
    case "vendida":        return "bg-tinta text-white";
    default:               return "bg-humo/85 text-white";
  }
}

// ── El color del número del precio ───────────────────────────────────
// Verde marino cuando el precio ya está firmado o congelado en contrato;
// oro cuando todavía anda en validación; gris cuando no hay número.
// El color por sí solo NO carga el mensaje: arriba del número se escribe
// "Próximo precio" con todas sus letras, para quien no distinga colores.
function colorMonto(estado: EstadoPrecioMostrado): string {
  switch (estado) {
    case "aprobado":
    case "contrato":  return "text-teal-dark";
    case "propuesto": return "text-dorado-dark";
    default:          return "text-humo";
  }
}

// ── Una tarjeta ──────────────────────────────────────────────────────
function Tarjeta({ g, verMargen, verCredito, verPiso, onAbrir }: {
  g: Garantia; verMargen: boolean; verCredito: boolean; verPiso: boolean;
  onAbrir?: (id: string) => void;
}) {
  const precio = precioMostrado(g);
  const margen = verMargen ? margenPct(g) : null;

  // Sin precio piso capturado no hay de dónde sacar el margen ni con qué
  // calcular. Se avisa en la tarjeta, pero SOLO a quien tiene permiso de
  // ver el precio piso — a los demás no les dice nada y les estorbaría.
  const faltaPiso = verPiso && g.costoTotal == null;

  // Los datos chiquitos de abajo: metros de terreno, de construcción y
  // la plaza. Solo se pintan los que sí existen, para no dejar huecos.
  const datos = [
    g.recamaras ? g.recamaras + " rec." : null,
    g.banos ? g.banos + " baños" : null,
    g.m2Terreno ? g.m2Terreno + " m² terreno" : null,
    g.m2Construccion ? g.m2Construccion + " m² const." : null,
  ].filter(Boolean) as string[];

  return (
    <article
      onClick={() => onAbrir?.(g.id)}
      className={
        "flex flex-col overflow-hidden rounded-xl border border-black/10 bg-white transition hover:border-teal/40 hover:shadow-sm " +
        (onAbrir ? "cursor-pointer" : "")
      }
    >
      {/* ── La foto, con sus dos etiquetas encima ── */}
      <div className="relative flex h-44 items-center justify-center bg-nube">
        {g.fotoFachada ? (
          <img src={g.fotoFachada} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-humo/45">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className="h-9 w-9">
              <path d="M3 21V10l9-6 9 6v11" /><path d="M9 21v-7h6v7" />
            </svg>
            <span className="text-[11px]">Sin foto</span>
          </div>
        )}

        {/* Etapa, arriba a la izquierda */}
        <span className={"absolute left-2.5 top-2.5 rounded-full px-2.5 py-1 text-[11px] font-semibold " + colorEtapa(g.etapa)}>
          {etapaNombre(g.etapa)}
        </span>

        {/* Tipo de inmueble, arriba a la derecha */}
        {g.tipoInmueble && (
          <span className="absolute right-2.5 top-2.5 rounded-full bg-black/55 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-white">
            {g.tipoInmueble}
          </span>
        )}

        {/* Avisos que importan, abajo de la foto */}
        <div className="absolute bottom-2.5 left-2.5 flex gap-1.5">
          {g.bloqueada && (
            <span className="rounded bg-dorado px-2 py-0.5 text-[10.5px] font-semibold text-white">
              Bloqueada
            </span>
          )}
          {g.clienteId && (
            <span className="rounded bg-aqua-dark px-2 py-0.5 text-[10.5px] font-semibold text-white">
              Cliente ligado
            </span>
          )}
        </div>
      </div>

      {/* ── El cuerpo de la tarjeta ── */}
      <div className="flex flex-1 flex-col px-3.5 py-3">
        {/* Folio y referencias, en letra de máquina para que se distingan */}
        <div className="truncate font-mono text-[11px] text-humo">
          {g.folio}
          {verCredito && g.numCredito ? " · " + g.numCredito : ""}
        </div>

        {/* La dirección es el título: dos renglones y se corta */}
        <h3 className="mt-1 line-clamp-2 font-display text-[14.5px] font-semibold leading-snug text-tinta">
          {g.direccion}
        </h3>

        {/* Plaza y municipio, con el pinito */}
        <div className="mt-1.5 flex items-center gap-1 text-[12px] text-humo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-3.5 w-3.5 shrink-0">
            <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" />
          </svg>
          <span className="truncate">
            {[g.sucursal, g.municipio].filter(Boolean).join(" · ") || "Sin plaza"}
          </span>
        </div>

        {/* Metros */}
        {datos.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 border-t border-black/5 pt-2.5 text-[11.5px] text-humo">
            {datos.map((d, i) => <span key={i}>{d}</span>)}
          </div>
        )}

        {/* El precio, hasta abajo y pegado al borde */}
        <div className="mt-auto pt-3">
          {/* Aviso de que ese número todavía no está firmado. Va ARRIBA
              del monto, no abajo, porque comercial lee el precio primero
              y hay que frenarlo antes de que lo cotice como definitivo. */}
          {precio.estado === "propuesto" && (
            <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-dorado-dark">
              <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-dorado" />
              Próximo precio
            </div>
          )}

          {precio.monto != null ? (
            <div className="flex items-baseline gap-1.5">
              <span className={"font-display text-lg font-bold " + colorMonto(precio.estado)}>
                {money(precio.monto)}
              </span>
              <span className="text-[10.5px] text-humo">MXN</span>
            </div>
          ) : (
            <span className="text-[12.5px] italic text-humo">Precio no publicado</span>
          )}

          {/* El margen solo aparece con el precio ya aprobado: eso lo
              decide margenPct en data/garantias.ts, no esta pantalla. */}
          {margen != null && (
            <div className="mt-0.5 text-[11px] text-aqua-dark">Margen {margen}%</div>
          )}
          {margen == null && precio.nota && (
            <div className={"mt-0.5 text-[11px] " + (precio.estado === "propuesto" ? "text-dorado-dark" : "text-humo")}>
              {precio.nota}
            </div>
          )}

          {/* Falta el precio piso: sin ese dato no sale margen ni se puede
              calcular precio. Lo capturan la DGE y el RAC. */}
          {faltaPiso && (
            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-humo">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-3 w-3 shrink-0">
                <circle cx="12" cy="12" r="9" /><path d="M12 8v5" /><path d="M12 16.5v.01" />
              </svg>
              Falta precio piso
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

// ── La pantalla ──────────────────────────────────────────────────────
// `onAbrir` la manda ListaGarantias: es lo que abre la ficha por dentro.
// Si no se le pasa, el catálogo funciona igual pero las tarjetas no abren.
export default function CatalogoGarantias({ onAbrir }: { onAbrir?: (id: string) => void }) {
  const rol = useMiRol();
  const verMargen = ROLES_VEN_MARGEN.includes(rol || "");

  const [lista, setLista] = useState<Garantia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [vis, setVis] = useState<CampoVisibilidad[]>([]);
  const verCredito = puedeVerCampo(vis, rol, "num_credito");
  // Quién puede enterarse de que a una garantía le falta el precio piso.
  // Sale del mismo permiso de Configuración que gobierna el dato, para no
  // escribir la regla en dos lados: hoy DGE, GAD, RAC y DGC.
  const verPiso = puedeVerCampo(vis, rol, "precio_piso");

  const [busqueda, setBusqueda] = useState("");
  const [cartera, setCartera] = useState("");
  const [etapa, setEtapa] = useState("");
  const [plaza, setPlaza] = useState("");

  useEffect(() => { listarVisibilidad().then(setVis); }, []);

  useEffect(() => {
    let vivo = true;
    listarGarantias().then((r) => {
      if (!vivo) return;
      setLista(r);
      setCargando(false);
    });
    return () => { vivo = false; };
  }, []);

  // Las carteras que existen de verdad en los datos, sin repetir.
  const carteras = useMemo(
    () => Array.from(new Set(lista.map((g) => g.cartera).filter(Boolean))) as string[],
    [lista],
  );

  // Los filtros se aplican aquí, sobre lo que ya se trajo. No hay que
  // volver a consultar la base cada vez que se escribe una letra.
  const filtrada = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return lista.filter((g) => {
      if (q && !(g.folio.toLowerCase().includes(q) || g.direccion.toLowerCase().includes(q))) return false;
      if (cartera && g.cartera !== cartera) return false;
      if (etapa && g.etapa !== etapa) return false;
      if (plaza && g.sucursal !== plaza) return false;
      return true;
    });
  }, [lista, busqueda, cartera, etapa, plaza]);

  const r = useMemo(() => resumenCatalogo(lista), [lista]);
  const claseFiltro = "rounded-lg border border-black/10 bg-nube px-3 py-2 text-xs text-tinta outline-none focus:border-teal focus:bg-white";

  return (
    <>
      {/* Los cuatro números */}
      <div className="grid grid-cols-2 gap-2.5 px-6 pt-4 md:grid-cols-4">
        <Numerito etiqueta="En catálogo" valor={String(r.total)} />
        <Numerito etiqueta="Publicadas" valor={String(r.publicadas)} color="text-teal" />
        <Numerito etiqueta="Apartadas" valor={String(r.apartadas)} color="text-aqua-dark" />
        <Numerito etiqueta="Valor en vitrina" valor={moneyCorto(r.valorVitrina)} />
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 gap-2 px-6 py-4 md:grid-cols-[2fr_1fr_1fr_1fr]">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Folio o dirección"
          className={claseFiltro}
        />
        <select value={cartera} onChange={(e) => setCartera(e.target.value)} className={claseFiltro}>
          <option value="">Cartera</option>
          {carteras.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={etapa} onChange={(e) => setEtapa(e.target.value)} className={claseFiltro}>
          <option value="">Etapa</option>
          {ETAPAS.map((e) => <option key={e.clave} value={e.clave}>{e.nombre}</option>)}
        </select>
        <select value={plaza} onChange={(e) => setPlaza(e.target.value)} className={claseFiltro}>
          <option value="">Plaza</option>
          {SUCURSALES.map((s) => <option key={s.clave} value={s.clave}>{s.nombre}</option>)}
        </select>
      </div>

      {/* La rejilla de tarjetas.
          Cuántas caben por renglón lo decide el ancho del monitor:
          una en celular, dos en tableta, tres o cuatro en escritorio. */}
      <div className="px-6 pb-8">
        {cargando && (
          <p className="py-16 text-center text-sm text-humo">Cargando garantías…</p>
        )}

        {!cargando && lista.length === 0 && (
          <div className="rounded-xl border border-dashed border-black/15 px-6 py-16 text-center">
            <p className="font-display text-base font-semibold text-tinta">
              Todavía no hay garantías
            </p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-humo">
              Se dan de alta aquí o se traen desde carteras.
            </p>
          </div>
        )}

        {!cargando && lista.length > 0 && filtrada.length === 0 && (
          <p className="py-16 text-center text-sm text-humo">
            Ninguna garantía coincide con esos filtros.
          </p>
        )}

        {!cargando && filtrada.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtrada.map((g) => (
              <Tarjeta key={g.id} g={g} verMargen={verMargen} verCredito={verCredito} verPiso={verPiso} onAbrir={onAbrir} />
            ))}
          </div>
        )}

        {!cargando && filtrada.length > 0 && (
          <p className="mt-4 text-[12px] text-humo">
            {filtrada.length} garantía(s) en vitrina
          </p>
        )}
      </div>
    </>
  );
}
