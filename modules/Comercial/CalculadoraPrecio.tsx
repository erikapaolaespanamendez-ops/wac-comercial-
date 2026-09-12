// =====================================================================
//  MÓDULO COMERCIAL · Calculadora de precio
//  →  src/modules/Comercial/CalculadoraPrecio.tsx
//
//  Es el MOMENTO 3 del proceso: la garantía ya regresó del dictamen y
//  aquí se le pone el precio de verdad. Antes de esto solo había un
//  aproximado, calculado al subir la cartera con los adeudos fijos.
//
//  QUIÉN: GAD, DGE y RAC. Nadie más — ni siquiera para mirar.
//  CUÁNDO: solo si el dictamen quedó APTO o CONDICIONADO. Si salió no
//  apto, no hay precio que calcular.
//
//  Lo que cambia respecto al aproximado:
//   · los adeudos ya no son los tres fijos: se corrigen con lo que
//     apareció en el expediente (cofinanciamiento, cuotas, lo que sea);
//   · la contingencia llega marcada con la que dictaminó jurídico, pero
//     se puede cambiar;
//   · hay descuento, que se captura EN PESOS y se enseña en porcentaje.
//
//  Se guardan DOS números: el que dio la fórmula (precio_calculado) y el
//  que se decidió publicar (precio_venta). Si son distintos, el motivo es
//  obligatorio. Es dinero: tiene que quedar por qué.
// =====================================================================
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  calcularPrecio, adeudosOFijos, conPagoDeJuicio, sumaAdeudos, CONTINGENCIAS, nombreContingencia, estadoAlGuardar,
  puedeEditarBase, puedeUsarRutaPiso, compararRutas, pagosOPorOmision, pagosPorOmision, repartirPagos,
  money, resumenSobrePrecio, estimadoCierre, ETIQUETA_PISO, NOTA_PISO,
  type Adeudo, type Contingencia, type Pago, type RutaPrecio,
} from "../../lib/precio-garantia";
import { cargarEsquemasPago } from "../../data/esquemas-pago";
import type { GarantiaFicha } from "../../data/garantias";

const campo = "w-full rounded-lg border border-black/10 bg-nube px-3 py-2 text-[13px] text-tinta outline-none focus:border-teal focus:bg-white";


// ── Los dibujitos ────────────────────────────────────────────────────
// Van dibujados aquí y no con librería: son seis y agregar una
// dependencia entera por eso engorda el paquete sin ganancia.
function Ico({ d, className = "" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" className={"h-4 w-4 " + className}>
      <path d={d} />
    </svg>
  );
}
const I = {
  base:     "M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6",
  adeudos:  "M3 7h18v12H3zM3 11h18M7 15h4",
  balanza:  "M12 3v18M5 7h14M7 7l-3 6h6zM17 7l-3 6h6z",
  etiqueta: "M20 12l-8 8-9-9V4h7zM7.5 7.5h.01",
  regalo:   "M20 12v9H4v-9M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7",
  pagos:    "M3 6h18v12H3zM3 10h18M7 14h3",
  martillo: "M12 3v18M5 7h14M7 7l-3 6h6zM17 7l-3 6h6z",
  ok:       "M20 6 9 17l-5-5",
  alerta:   "M12 9v4M12 17h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  casa:     "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  dinero:   "M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
};

const n = (v: string) => { const x = parseFloat((v || "").replace(/[^0-9.]/g, "")); return isNaN(x) ? 0 : x; };

export default function CalculadoraPrecio({ g, rol, onGuardado }: {
  g: GarantiaFicha;
  rol: string;
  onGuardado: () => void;
}) {
  // Si la garantía todavía no tiene precio calculado, se le completa el
  // Pago de juicio, que no existía cuando se capturaron los costos. En
  // las ya calculadas se respeta lo guardado tal cual.
  const [adeudos, setAdeudos] = useState<Adeudo[]>(
    g.precioEn ? adeudosOFijos(g.adeudos) : conPagoDeJuicio(adeudosOFijos(g.adeudos)),
  );
  const [contingencia, setContingencia] = useState<Contingencia | null>(
    (g.contingencia as Contingencia) || null,
  );
  const [descuento, setDescuento] = useState(g.descuento ? String(g.descuento) : "");
  const [precioDecidido, setPrecioDecidido] = useState("");
  const [motivo, setMotivo] = useState(g.precioMotivo || "");
  const [guardando, setGuardando] = useState(false);
  // ── Editar la base ──
  // El precio piso y el avalúo se capturan al subir la cartera, pero a
  // veces llegan mal o de plano no llegan, y SIN PRECIO PISO NO HAY PRECIO.
  // Por eso se pueden corregir desde aquí, y solo DGE y RAC.
  const [editandoBase, setEditandoBase] = useState(false);
  const [piso, setPiso] = useState(g.precioPiso ? String(g.precioPiso) : "");
  const [avaluo, setAvaluo] = useState(g.avaluoComercial ? String(g.avaluoComercial) : "");
  const [comercial, setComercial] = useState(g.valorGarantia ? String(g.valorGarantia) : "");
  const [guardandoBase, setGuardandoBase] = useState(false);
  const puedeBase = puedeEditarBase(rol);

  const pisoVivo = editandoBase || g.precioPiso == null ? (n(piso) || null) : g.precioPiso;
  const avaluoVivo = editandoBase || g.avaluoComercial == null ? (n(avaluo) || null) : g.avaluoComercial;
  const comercialVivo = editandoBase || g.valorGarantia == null ? (n(comercial) || null) : g.valorGarantia;

  async function guardarBase() {
    setGuardandoBase(true);
    const { error } = await supabase.from("garantia").update({
      precio_piso: n(piso) || null,
      avaluo_comercial: n(avaluo) || null,
      valor_garantia: n(comercial) || null,
    }).eq("id", g.id);
    setGuardandoBase(false);
    if (error) { setAviso("No se pudo guardar la base: " + error.message); return; }
    setEditandoBase(false);
    onGuardado();
  }
  const [aviso, setAviso] = useState<string | null>(null);
  // Quien no ve el precio piso cotiza siempre por avalúo: no se le
  // ofrece la otra ruta ni se le pinta el número del piso en ningún lado.
  const usaPiso = puedeUsarRutaPiso(rol);
  // Las unidades de un proyecto no se cotizan aquí: su precio sale de
  // los metros por el precio por m² autorizado de la cartera, y lo
  // calcula la base sola.
  const esProyecto = g.rutaPrecio === "proyecto";
  // El selector sólo conoce piso y avalúo. Si la garantía viene marcada
  // como proyecto no se le pasa al selector, o quedaría en blanco.
  const rutaGuardada: RutaPrecio =
    g.rutaPrecio === "piso" || g.rutaPrecio === "avaluo" ? g.rutaPrecio : "piso";
  const [ruta, setRuta] = useState<RutaPrecio>(usaPiso ? rutaGuardada : "avaluo");
  // ── El reparto de pagos ──
  // Arranca con lo que la garantía ya tenga pactado; si no tiene nada,
  // con el reparto por omisión de su contingencia.
  const [pagos, setPagos] = useState<Pago[]>(
    pagosOPorOmision(g.esquemaPagos, (g.contingencia as Contingencia) || null),
  );
  // Si ya venía pactado, o si alguien mueve un renglón a mano, el
  // reparto YA NO se recarga solo al cambiar la contingencia: sería
  // borrarle el trabajo a quien lo ajustó.
  const [pagosTocados, setPagosTocados] = useState<boolean>(
    Array.isArray(g.esquemaPagos) && g.esquemaPagos.length > 0,
  );
  const [esquemasListos, setEsquemasListos] = useState(false);
  function cambiarPagos(nuevos: Pago[]) {
    setPagosTocados(true);
    setPagos(nuevos);
  }

  // Los porcentajes buenos viven en la base, para que la DGE los pueda
  // cambiar sin publicar. Se leen una vez al abrir la calculadora.
  useEffect(() => {
    let vivo = true;
    cargarEsquemasPago().finally(() => { if (vivo) setEsquemasListos(true); });
    return () => { vivo = false; };
  }, []);

  // Al cambiar la contingencia —o cuando acaban de llegar los
  // porcentajes de la base— se repone el reparto, salvo que ya se haya
  // tocado a mano.
  useEffect(() => {
    if (pagosTocados) return;
    setPagos(pagosPorOmision(contingencia));
    // `pagosTocados` se lee pero no se vigila a propósito: sólo importa
    // su valor en el momento en que cambia la contingencia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contingencia, esquemasListos]);
  const [apartado, setApartado] = useState(g.apartado ? String(g.apartado) : "10000");

  const r = useMemo(() => calcularPrecio({
    precioPiso: pisoVivo,
    adeudos,
    contingencia,
    m2Construccion: g.m2Construccion,
    valorReferencia: avaluoVivo ?? comercialVivo,
    descuento: n(descuento),
  }), [g, adeudos, contingencia, descuento, pisoVivo, avaluoVivo, comercialVivo]);

  // ── Las dos rutas ──
  // Siempre se calculan las dos y se guardan las dos. Manda la que se
  // escoja aquí; el sistema solo sugiere.
  const rutas = useMemo(
    () => compararRutas(r.precioVenta, avaluoVivo ?? comercialVivo, contingencia),
    [r.precioVenta, avaluoVivo, comercialVivo, contingencia],
  );
  const precioDeRuta = ruta === "avaluo" ? (rutas.porAvaluo ?? r.precioVenta) : r.precioVenta;

  // La habilitación se suma sobre CADA ruta, para poder comparar las
  // cuatro cifras: cada ruta con y sin habilitación.
  const conHabPiso = resumenSobrePrecio(rutas.porPiso, g.m2Construccion, avaluoVivo ?? comercialVivo);
  const conHabAvaluo = resumenSobrePrecio(rutas.porAvaluo, g.m2Construccion, avaluoVivo ?? comercialVivo);

  // ── El Resultado sigue la RUTA ESCOGIDA ──
  // Antes este bloque leía siempre de `r`, que solo sabe de la ruta del
  // piso: si se escogía avalúo, el Resultado y "lo que gana el cliente"
  // se quedaban con el número del piso y parecía que no se actualizaban.
  // `resumenRuta` recalcula habilitación y ganancia sobre el precio que
  // de verdad se está cotizando.
  const porAvaluoRuta = ruta === "avaluo";
  const resumenRuta = resumenSobrePrecio(precioDeRuta, g.m2Construccion, avaluoVivo ?? comercialVivo);
  const valorRef = avaluoVivo ?? comercialVivo ?? 0;
  const pctSobreValorRuta = valorRef > 0 ? Math.round((precioDeRuta / valorRef) * 100) : null;
  const arribaDelValorRuta = valorRef > 0 && precioDeRuta > valorRef;

  const reparto = useMemo(
    () => repartirPagos(
      precioDecidido.trim() ? n(precioDecidido) : precioDeRuta,
      pagos,
      n(apartado),
    ),
    [precioDecidido, precioDeRuta, pagos, apartado],
  );

  // El campo del precio a publicar arranca vacío y, mientras no se toque,
  // vale lo calculado. Así no hay que borrar nada para aceptar la fórmula.
  const publicar = precioDecidido.trim() ? n(precioDecidido) : precioDeRuta;
  // Estimado de cierre: informativo, sobre el precio que se va a publicar.
  const cierre = estimadoCierre(publicar);
  const difiere = Math.abs(publicar - precioDeRuta) > 0.5;
  const diferencia = publicar - precioDeRuta;

  function setAdeudo(i: number, campo: "concepto" | "monto" | "nota", v: string) {
    setAdeudos((prev) => prev.map((a, k) => (k === i ? { ...a, [campo]: campo === "monto" ? n(v) : v } : a)));
  }

  async function guardar() {
    setAviso(null);
    if (esProyecto) {
      setAviso("Esta unidad es de un proyecto: su precio sale de los metros por el precio por m² de la cartera, y lo calcula el sistema solo. Para cambiarlo se corrige el precio por m² de la cartera o los metros de la unidad.");
      return;
    }
    // Sin contingencia no hay precio: de ella salen los honorarios y el
    // reparto de pagos. Antes se dejaba pasar y se asumía derecho de
    // crédito —45% por la ruta del piso, 40% de descuento por la del
    // avalúo—, así que el mismo descuido encarecía o abarataba según la
    // ruta, y en pantalla se veía igual que un precio bien escogido.
    if (!contingencia) { setAviso("Escoge la contingencia antes de guardar: de ahí salen los honorarios y el reparto de pagos."); return; }
    if (usaPiso && !pisoVivo) { setAviso("Sin precio piso no se puede calcular. Usa Editar para capturarlo."); return; }
    if (!usaPiso && !precioDeRuta) { setAviso("Sin avalúo no se puede cotizar. Lo captura la DGE o RAC."); return; }
    if (difiere && !motivo.trim()) { setAviso("Cambiaste el precio: escribe por qué."); return; }
    if (reparto.sePaso) { setAviso("Los pagos anteriores suman más de 100%. Bájalos para que quede algo en el último pago."); return; }

    setGuardando(true);
    const estado = estadoAlGuardar(rol);
    const { error } = await supabase.from("garantia").update({
      adeudos,
      contingencia,
      descuento: n(descuento) || null,
      // NO se guarda "precio_calculado": era el mismo número que
      // precio_por_piso o precio_por_avaluo según la ruta escogida.
      // Tres columnas para dos datos es como se desincronizan.
      precio_por_piso: r.precioVenta,
      precio_por_avaluo: rutas.porAvaluo,
      ruta_precio: ruta,
      apartado: n(apartado) || null,
      // Se guarda el reparto YA resuelto: el último pago con el
      // porcentaje que le tocó, no con el que traía capturado.
      esquema_pagos: reparto.filas.map((f) => ({ concepto: f.concepto, pct: f.pct, nota: f.nota ?? null })),
      precio_venta: publicar,
      precio_motivo: difiere ? motivo.trim() : null,
      precio_por: rol,
      precio_en: new Date().toISOString(),
      precio_estado: estado,
      // Se recalcula: la autorización anterior ya no ampara este número,
      // así que su rastro se borra aquí mismo. Antes se quedaba pegado y
      // la garantía decía "aprobada por la DGE el día tal" con el precio
      // otra vez en validación. La base también lo limpia por su cuenta,
      // pero se escribe aquí para que se lea en el código qué pasa.
      precio_aprobado_por: null,
      precio_aprobado_en: null,
    }).eq("id", g.id);
    setGuardando(false);

    if (error) { setAviso("No se pudo guardar: " + error.message); return; }

    // ── Y se deja la propuesta en la bandeja de validaciones ──
    // Esta es la parte que de verdad cuenta: el precio no vale hasta que
    // lo firmen Contabilidad, Comercial y la DGE. Las columnas de arriba
    // son el borrador de trabajo; el renglón de garantia_precio es el
    // que lee el catálogo.
    //
    // Si ya hay una propuesta abierta y nadie ha votado, la base corrige
    // esa misma en vez de crear otra. Si ya tiene votos, no deja: avisa
    // y hay que esperar a que se resuelva.
    const { error: errProp } = await supabase.rpc("fn_precio_proponer", {
      p_garantia_id: g.id,
      p_usuario: rol ?? "",
      p_ruta: ruta,
      p_precio_final: publicar,
      p_precio_piso: usaPiso ? pisoVivo : null,
      p_avaluo_comercial: avaluoVivo ?? comercialVivo,
      p_adeudos: sumaAdeudos(adeudos),
      p_gastos_juridicos: 0,
      p_honorarios_pct: ruta === "avaluo" ? rutas.descuentoAvaluoPct : r.honorariosPct,
      p_descuento_pct: r.descuentoPct ?? 0,
      p_subtotal: r.base,
      p_costo_total: r.base,
      p_apartado: n(apartado) || null,
      p_esquema_pagos: reparto.filas.map((f) => ({ concepto: f.concepto, pct: f.pct, nota: f.nota ?? null })),
      p_notas: difiere ? motivo.trim() : null,
    });
    if (errProp) { setAviso("El precio se guardó, pero no entró a validación: " + errProp.message); return; }

    onGuardado();
  }

  return (
    <div className="grid grid-cols-1 gap-4">

      {esProyecto && (
        <div className="rounded-xl border border-aqua-dark/30 bg-aqua-dark/5 px-5 py-3 text-[13px] text-tinta">
          <span className="font-semibold">Unidad de proyecto.</span> El precio sale de los metros de
          construcción por el precio por m² autorizado de la cartera, y lo calcula el sistema solo.
          Esta calculadora no aplica: para cambiarlo se corrige el precio por m² de la cartera o los
          metros de la unidad.
        </div>
      )}

      {/* ── Base, adeudos y contingencia ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

        <section className="rounded-xl border border-black/10 bg-white px-5 py-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 font-display text-[14px] font-semibold text-tinta"><Ico d={I.casa} className="text-teal" /> Base</h3>
            {puedeBase && !editandoBase && (
              <button onClick={() => setEditandoBase(true)}
                className="rounded-lg border border-black/10 px-2.5 py-1 text-[12px] text-humo hover:bg-nube">
                Editar
              </button>
            )}
          </div>

          {editandoBase ? (
            <div className="flex flex-col gap-2">
              <div>
                <label className="mb-1 block text-[11px] text-humo">{ETIQUETA_PISO} *</label>
                <input className={campo + " font-mono"} inputMode="decimal" value={piso}
                  onChange={(e) => setPiso(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-humo">Avalúo comercial</label>
                <input className={campo + " font-mono"} inputMode="decimal" value={avaluo}
                  onChange={(e) => setAvaluo(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-humo">Valor comercial</label>
                <input className={campo + " font-mono"} inputMode="decimal" value={comercial}
                  onChange={(e) => setComercial(e.target.value)} />
                <p className="mt-1 text-[11px] text-humo">Se usa cuando no hay avalúo.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => void guardarBase()} disabled={guardandoBase}
                  className="rounded-lg bg-teal px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">
                  {guardandoBase ? "Guardando…" : "Guardar"}
                </button>
                <button onClick={() => { setEditandoBase(false); setPiso(g.precioPiso ? String(g.precioPiso) : ""); }}
                  className="rounded-lg border border-black/10 px-3 py-1.5 text-[12px] text-humo">
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <>
              {usaPiso ? (
                <>
                  <div className="text-[11px] text-humo">{ETIQUETA_PISO}</div>
                  <div className="font-mono text-[17px] font-semibold text-tinta">{money(pisoVivo)}</div>
                  <p className="mt-1 text-[11px] text-humo">{NOTA_PISO}</p>
                </>
              ) : (
                <>
                  <div className="text-[11px] text-humo">Avalúo comercial</div>
                  <div className="font-mono text-[17px] font-semibold text-tinta">{money(avaluoVivo ?? comercialVivo)}</div>
                  <p className="mt-1 text-[11px] text-humo">Se cotiza sobre el avalúo, menos la contingencia.</p>
                </>
              )}
              <p className="mt-3 text-[12px] text-humo">
                Avalúo {money(avaluoVivo ?? comercialVivo)}
                {g.m2Construccion ? " · " + g.m2Construccion + " m²" : ""}
              </p>
              {usaPiso && !pisoVivo && (
                <p className="mt-2 text-[12px] text-red-600">
                  Sin precio piso no se puede dar ningún precio.
                  {puedeBase ? " Usa Editar para capturarlo." : " Lo captura la DGE o RAC."}
                </p>
              )}
              {!usaPiso && !(avaluoVivo ?? comercialVivo) && (
                <p className="mt-2 text-[12px] text-red-600">
                  Sin avalúo no se puede cotizar. Lo captura la DGE o RAC.
                </p>
              )}
            </>
          )}
        </section>

        <section className="rounded-xl border border-black/10 bg-white px-5 py-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 font-display text-[14px] font-semibold text-tinta"><Ico d={I.adeudos} className="text-dorado-dark" /> Costos operativos</h3>
            <button onClick={() => setAdeudos([...adeudos, { concepto: "", monto: 0 }])}
              className="rounded-lg border border-black/10 px-2.5 py-1 text-[12px] text-humo hover:bg-nube">
              + Agregar
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {adeudos.map((a, i) => (
              <div key={i} className="rounded-lg border border-black/10 px-2 py-2">
                <div className="flex items-center gap-1.5">
                  <input className={campo + " min-w-0 flex-1"} value={a.concepto}
                    onChange={(e) => setAdeudo(i, "concepto", e.target.value)} placeholder="Concepto" />
                  <input className={campo + " w-[96px] shrink-0 text-right font-mono"} inputMode="decimal"
                    value={a.monto ? String(a.monto) : ""}
                    onChange={(e) => setAdeudo(i, "monto", e.target.value)} placeholder="0" />
                  <button onClick={() => setAdeudos(adeudos.filter((_, k) => k !== i))}
                    className="shrink-0 px-1 text-[15px] leading-none text-humo/60 hover:text-red-600" aria-label="Quitar">×</button>
                </div>
                <input className={campo + " mt-1.5 w-full text-[12px]"} value={a.nota ?? ""}
                  onChange={(e) => setAdeudo(i, "nota", e.target.value)}
                  placeholder="Para qué es (opcional)" />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between border-t border-black/5 pt-2 text-[12px] text-humo">
            <span>Suma</span><span className="font-mono">{money(r.totalAdeudos)}</span>
          </div>
        </section>

        <section className="rounded-xl border border-black/10 bg-white px-5 py-4">
          <h3 className="mb-1 flex items-center gap-1.5 font-display text-[14px] font-semibold text-tinta"><Ico d={I.balanza} className="text-aqua-dark" /> Contingencia</h3>
          <p className="mb-3 text-[11px] text-humo">
            {g.contingencia
              ? "Jurídico dictaminó: " + (CONTINGENCIAS.find((c) => c.clave === g.contingencia)?.nombre || "")
              : "Jurídico no la definió. Escógela: sin contingencia no se puede guardar el precio."}
          </p>
          <div className="flex flex-col gap-2">
            {CONTINGENCIAS.map((c) => (
              <label key={c.clave} className="flex cursor-pointer items-start gap-2 text-[13px]">
                <input type="radio" className="mt-0.5 accent-teal" checked={contingencia === c.clave}
                  onChange={() => setContingencia(c.clave)} />
                <span>
                  <span className={contingencia === c.clave ? "font-semibold text-tinta" : "text-humo"}>
                    {c.nombre} — {c.pct}%
                  </span>
                  <span className="block text-[11px] text-humo">{c.ayuda}</span>
                </span>
              </label>
            ))}
          </div>
        </section>
      </div>

      {/* ── Resultado ── */}
      <section className="rounded-xl border border-black/10 bg-white px-5 py-4">
        <h3 className="mb-3 flex items-center gap-1.5 font-display text-[14px] font-semibold text-tinta"><Ico d={I.dinero} className="text-teal" /> Resultado</h3>

        <div className="flex flex-col gap-1.5 text-[13px]">
          {porAvaluoRuta ? (
            <>
              <div className="flex justify-between">
                <span className="text-humo">Avalúo comercial</span>
                <span className="font-mono">{money(avaluoVivo)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-humo">Menos {rutas.descuentoAvaluoPct}% por la contingencia</span>
                <span className="font-mono">− {money((avaluoVivo ?? 0) - precioDeRuta)}</span>
              </div>
              {r.descuento > 0 && (
                <div className="flex justify-between text-[12px] text-humo">
                  <span>El descuento de {money(r.descuento)} no aplica en esta ruta</span>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex justify-between">
                <span className="text-humo">Precio piso + costos operativos</span>
                <span className="font-mono">{money(r.base)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-humo">Honorarios {r.honorariosPct}%</span>
                <span className="font-mono">{money(r.honorarios)}</span>
              </div>
              {r.descuento > 0 && (
                <div className="flex justify-between text-dorado-dark">
                  <span>Descuento{r.descuentoPct != null ? ` · ${r.descuentoPct}%` : ""}</span>
                  <span className="font-mono">− {money(r.descuento)}</span>
                </div>
              )}
            </>
          )}
          <div className="mt-1 flex items-center justify-between rounded-xl bg-teal-soft/60 px-3 py-2.5">
            <span className="flex items-center gap-1.5 text-[13px] font-semibold text-teal-dark">
              <Ico d={I.etiqueta} /> Precio calculado · ruta del {porAvaluoRuta ? "avalúo" : "piso"}
            </span>
            <span className="font-display text-[20px] font-bold text-teal-dark">{money(precioDeRuta)}</span>
          </div>
          {pctSobreValorRuta != null && (
            <div className={"flex justify-between text-[12px] " + (arribaDelValorRuta ? "text-dorado-dark" : "text-humo")}>
              <span>{pctSobreValorRuta}% del avalúo</span>
              {arribaDelValorRuta && <span>por encima del valor</span>}
            </div>
          )}
        </div>

        {/* ── Lo que gana el cliente ── */}
        {(resumenRuta.ganaSinHabilitacion || resumenRuta.ganaConHabilitacion) && (
          <div className="mt-4 rounded-xl border border-aqua/30 bg-aqua-soft/50 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-aqua-dark"><Ico d={I.regalo} /> El cliente gana con nosotros</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {resumenRuta.ganaSinHabilitacion && (
                <div>
                  <div className="text-[11px] text-aqua-dark">Sin habilitación</div>
                  <div className="font-display text-lg font-bold text-tinta">
                    {money(resumenRuta.ganaSinHabilitacion.gana)}
                    <span className="ml-1.5 text-[13px] font-semibold text-aqua-dark">
                      {resumenRuta.ganaSinHabilitacion.pct}%
                    </span>
                  </div>
                  <div className="text-[11px] text-aqua-dark">Paga {money(resumenRuta.ganaSinHabilitacion.paga)}</div>
                </div>
              )}
              {resumenRuta.ganaConHabilitacion ? (
                <div>
                  <div className="text-[11px] text-aqua-dark">Con habilitación</div>
                  <div className="font-display text-lg font-bold text-tinta">
                    {money(resumenRuta.ganaConHabilitacion.gana)}
                    <span className="ml-1.5 text-[13px] font-semibold text-aqua-dark">
                      {resumenRuta.ganaConHabilitacion.pct}%
                    </span>
                  </div>
                  <div className="text-[11px] text-aqua-dark">Paga {money(resumenRuta.ganaConHabilitacion.paga)}</div>
                </div>
              ) : (
                <div className="text-[12px] text-aqua-dark">
                  Con habilitación: {resumenRuta.habilitacion.sinMedidas ? "faltan los metros" : "cotización manual, fuera del catálogo"}
                </div>
              )}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-aqua-dark/85">
              Es la diferencia entre lo que vale el inmueble y lo que paga, sobre lo que paga.
              Con habilitación paga más, pero recibe la casa habitable.
            </p>
          </div>
        )}

        {/* ── Las dos rutas ── */}
        <div className="mt-4 border-t border-black/5 pt-4">
          <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-tinta"><Ico d={I.etiqueta} className="text-teal" /> ¿Sobre cuál se cotiza?</p>
          <div className={"grid grid-cols-1 gap-2 " + (usaPiso ? "sm:grid-cols-2" : "")}>
            {usaPiso && <button onClick={() => setRuta("piso")}
              className={"rounded-xl border px-4 py-3 text-left " +
                (ruta === "piso" ? "border-teal bg-teal-soft/50" : "border-black/10 hover:bg-nube")}>
              <div className="flex items-center gap-1.5 text-[11px] text-humo">
                {ruta === "piso" && <Ico d={I.ok} className="h-3.5 w-3.5 text-teal" />}
                Ruta del precio piso · para calcular
              </div>
              <div className="font-display text-[17px] font-bold text-tinta">{money(rutas.porPiso)}</div>
              <div className="text-[11px] text-humo">Piso + costos, más {r.honorariosPct}% de honorarios</div>
              <div className="mt-1 border-t border-black/5 pt-1 text-[11px] text-humo">
                Con habilitación {conHabPiso.precioConHabilitacion != null
                  ? money(conHabPiso.precioConHabilitacion)
                  : conHabPiso.habilitacion.sinMedidas ? "— faltan metros" : "— cotización manual"}
              </div>
            </button>}
            <button onClick={() => setRuta("avaluo")}
              className={"rounded-xl border px-4 py-3 text-left " +
                (ruta === "avaluo" ? "border-teal bg-teal-soft/50" : "border-black/10 hover:bg-nube")}>
              <div className="flex items-center gap-1.5 text-[11px] text-humo">
                {ruta === "avaluo" && <Ico d={I.ok} className="h-3.5 w-3.5 text-teal" />}
                Ruta del avalúo
              </div>
              <div className="font-display text-[17px] font-bold text-tinta">{money(rutas.porAvaluo)}</div>
              <div className="text-[11px] text-humo">Avalúo menos {rutas.descuentoAvaluoPct}% por la contingencia</div>
              <div className="mt-1 border-t border-black/5 pt-1 text-[11px] text-humo">
                Con habilitación {conHabAvaluo.precioConHabilitacion != null
                  ? money(conHabAvaluo.precioConHabilitacion)
                  : conHabAvaluo.habilitacion.sinMedidas ? "— faltan metros" : "— cotización manual"}
              </div>
            </button>
          </div>
          <p className={"mt-2 rounded-lg px-3 py-2 text-[12px] " +
            (rutas.semaforo === "sin_negocio" ? "bg-red-50 text-red-700"
              : rutas.semaforo === "piso_barato" ? "bg-dorado/10 text-dorado-dark"
              : rutas.semaforo === "sano" ? "bg-teal-soft/60 text-teal-dark"
              : "bg-nube text-humo")}>
            <span className="flex items-start gap-1.5">
              <Ico d={rutas.semaforo === "sano" ? I.ok : I.alerta} className="mt-px shrink-0" />
              <span>{rutas.mensaje}</span>
            </span>
          </p>
        </div>

        {/* ── Esquema de pagos ── */}
        <div className="mt-4 border-t border-black/5 pt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-tinta"><Ico d={I.pagos} className="text-aqua-dark" /> Cómo se cobra</p>
            <button onClick={() => cambiarPagos([...pagos, { concepto: "", pct: 0 }])}
              className="rounded-lg border border-black/10 px-2.5 py-1 text-[12px] text-humo hover:bg-nube">
              + Agregar pago
            </button>
          </div>

          {/* De dónde salió este reparto. Sin esto, quien lo ve no sabe
              si son los porcentajes de su contingencia o unos que
              alguien movió a mano. */}
          <p className="mb-2 text-[11px] text-humo">
            {pagosTocados
              ? "Reparto ajustado a mano. No se repone solo aunque cambie la contingencia."
              : contingencia
                ? "Reparto por omisión de " + nombreContingencia(contingencia) + "."
                : "Escoge la contingencia para que el reparto se acomode solo."}
          </p>

          <div className="mb-2 max-w-[240px]">
            <label className="mb-1 block text-[11px] text-humo">Apartado</label>
            <input className={campo + " font-mono"} inputMode="decimal" value={apartado}
              onChange={(e) => setApartado(e.target.value)} />
            <p className="mt-1 text-[11px] text-humo">Se descuenta del último pago.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            {pagos.map((p, i) => {
              const ultimo = i === pagos.length - 1;
              return (
                <div key={i} className="rounded-lg border border-black/10 px-2 py-2">
                 <div className="flex items-center gap-1.5">
                  <span className="w-5 shrink-0 text-[12px] text-humo">{i + 1}</span>
                  <input className={campo + " min-w-0 flex-1"} value={p.concepto} placeholder="Concepto del pago"
                    onChange={(e) => cambiarPagos(pagos.map((x, k) => k === i ? { ...x, concepto: e.target.value } : x))} />
                  {/* El último no se captura: es lo que falte para el 100. */}
                  {ultimo ? (
                    <span className="w-[70px] rounded-lg border border-dashed border-black/15 bg-nube px-2 py-2 text-right font-mono text-[13px] text-humo"
                      title="Se calcula solo: es lo que falta para llegar al 100%.">
                      {reparto.remanentePct}
                    </span>
                  ) : (
                    <input className={campo + " w-[70px] text-right font-mono"} inputMode="decimal"
                      value={p.pct ? String(p.pct) : ""}
                      onChange={(e) => cambiarPagos(pagos.map((x, k) => k === i ? { ...x, pct: n(e.target.value) } : x))} />
                  )}
                  <span className="text-[12px] text-humo">%</span>
                  <span className="w-[110px] text-right font-mono text-[13px] text-tinta">
                    {money(reparto.filas[i]?.monto)}
                  </span>
                  {ultimo ? (
                    <span className="px-1 text-[15px] leading-none text-transparent" aria-hidden>×</span>
                  ) : (
                    <button onClick={() => cambiarPagos(pagos.filter((_, k) => k !== i))}
                      className="shrink-0 px-1 text-[15px] leading-none text-humo/60 hover:text-red-600" aria-label="Quitar">×</button>
                  )}
                 </div>
                 <input className={campo + " mt-1.5 w-full text-[12px]"} value={p.nota ?? ""}
                   onChange={(e) => cambiarPagos(pagos.map((x, k) => k === i ? { ...x, nota: e.target.value } : x))}
                   placeholder="Para qué es este pago (opcional)" />
                </div>
              );
            })}
          </div>

          <p className="mt-1.5 text-[11px] text-humo">
            El último pago no se captura: es lo que falta para llegar al 100%.
          </p>
          {reparto.filas[reparto.filas.length - 1]?.avisoApartado && (
            <p className="mt-0.5 text-[11px] text-humo">
              Y ya viene {reparto.filas[reparto.filas.length - 1]?.avisoApartado}.
            </p>
          )}
          <p className={"mt-2 rounded-lg px-3 py-2 text-[12px] " +
            (reparto.cuadra ? "bg-teal-soft/60 text-teal-dark" : "bg-red-50 text-red-700")}>
            <span className="flex items-center gap-1.5">
              <Ico d={reparto.cuadra ? I.ok : I.alerta} />
              {reparto.cuadra
                ? "Los pagos cuadran en 100%."
                : "Los pagos anteriores ya se pasaron de 100%: bájalos para que quede algo en el último."}
            </span>
          </p>
        </div>

        {/* ── Estimado de cierre ──
            NO entra al precio. Es para poder contestarle al cliente
            cuando pregunta cuánto le costará la cesión o la escritura. */}
        {cierre && (
          <div className="mt-4 rounded-xl border border-dashed border-black/15 bg-nube px-5 py-4">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-tinta">
              <Ico d={I.etiqueta} className="text-dorado-dark" /> Para decirle al cliente · no está incluido en el precio
            </p>
            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
              <div className="rounded-lg bg-white px-3 py-2">
                <p className="text-[11px] text-humo">Si escritura con su propio notario</p>
                <p className="font-mono text-[15px] text-tinta">{money(cierre.soloCesion)}</p>
                <p className="text-[11px] text-humo">{cierre.soloCesionPct}% · sólo la cesión de derechos</p>
              </div>
              <div className="rounded-lg bg-white px-3 py-2">
                <p className="text-[11px] text-humo">Si la escritura va con la notaría de DIIPA</p>
                <p className="font-mono text-[15px] text-tinta">{money(cierre.conEscritura)}</p>
                <p className="text-[11px] text-humo">{cierre.conEscrituraPct}% · cesión y escritura</p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-humo">
              Son estimados sobre el precio de venta y van encima de él. El alcance lo
              escoge el cliente al firmar contrato, no aquí. Los honorarios de la
              notaría los cubre el cliente directo con ella.
            </p>
          </div>
        )}

        {/* ── Descuento y precio a publicar ── */}
        <div className="mt-4 grid grid-cols-1 gap-3 border-t border-black/5 pt-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-[12px] text-humo">Descuento en pesos</label>
            <input className={campo + " font-mono"} inputMode="decimal" value={descuento}
              onChange={(e) => setDescuento(e.target.value)} placeholder="0" />
            <p className="mt-1 text-[11px] text-humo">
              {r.descuentoPct != null ? `Equivale al ${r.descuentoPct}% del precio.` : "Se captura en pesos y se muestra en porcentaje."}
            </p>
          </div>
          <div>
            <label className="mb-1 block text-[12px] text-humo">Precio que se publica</label>
            <input className={campo + " font-mono text-[15px]"} inputMode="decimal"
              value={precioDecidido} onChange={(e) => setPrecioDecidido(e.target.value)}
              placeholder={String(precioDeRuta)} />
            <p className="mt-1 text-[11px] text-humo">
              {difiere
                ? (diferencia > 0 ? "Sube " : "Baja ") + money(Math.abs(diferencia)) + " contra el de la ruta escogida."
                : "Vacío = se publica el calculado."}
            </p>
          </div>
          <div>
            <label className="mb-1 block text-[12px] text-humo">
              Motivo del cambio {difiere && <span className="text-red-600">*</span>}
            </label>
            <input className={campo} value={motivo} onChange={(e) => setMotivo(e.target.value)}
              placeholder={difiere ? "Obligatorio" : "Solo si cambias el precio"} />
          </div>
        </div>

        {aviso && (
          <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[12px] font-medium text-red-700">{aviso}</div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-black/5 pt-3">
          <button onClick={() => void guardar()} disabled={guardando || (usaPiso ? !pisoVivo : !precioDeRuta)}
            className={"rounded-lg px-4 py-2 text-[13px] font-semibold text-white " +
              (guardando || (usaPiso ? !pisoVivo : !precioDeRuta) ? "cursor-not-allowed bg-humo/40" : "bg-teal hover:bg-teal-dark")}>
            <span className="flex items-center gap-1.5">
              {!guardando && <Ico d={I.ok} className="h-4 w-4" />}
              {guardando ? "Guardando…" : "Guardar precio"}
            </span>
          </button>
          <span className="text-[12px] text-humo">
            Queda como precio por aprobar: entra a la bandeja y lo firman
            Contabilidad, Comercial y la DGE.
          </span>
        </div>

        {/* De dónde sale el monto de la habilitación. Se explica para que
            nadie tenga que ir a buscar el catálogo. */}
        {r.habilitacion.montoCatalogo != null ? (
          <div className="mt-3 rounded-lg bg-nube px-3 py-2 text-[11px] leading-relaxed text-humo">
            <b className="text-tinta">Habilitación:</b> con {g.m2Construccion} m² cae en el tramo del catálogo
            de {money(r.habilitacion.montoCatalogo)}, más 45% con IVA incluido ={" "}
            <b className="text-tinta">{money(r.habilitacion.precioAlCliente)}</b>.
            Le suma {resumenSobrePrecio(precioDeRuta, g.m2Construccion, null).incrementoHabilitacionPct}% al precio.
            Se cobra aparte: no entra al precio de catálogo.
          </div>
        ) : (
          <p className="mt-3 text-[11px] text-humo">
            Habilitación: {resumenRuta.habilitacion.sinMedidas
              ? "faltan los metros de construcción para calcularla."
              : "los metros quedan fuera del catálogo (45 a 200 m²), va a cotización manual."}
          </p>
        )}
      </section>
    </div>
  );
}
