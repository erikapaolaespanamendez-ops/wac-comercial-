// =====================================================================
//  MÓDULO COMERCIAL · Ficha de una unidad de proyecto
//  →  src/modules/Comercial/FichaUnidad.tsx
//
//  Lo que el asesor abre cuando el cliente pregunta por un local. Trae
//  las tres cosas que se necesitan para cotizar por teléfono sin buscar
//  en otro lado: las imágenes, las características y el precio ya
//  repartido en pesos según cada forma de pago.
//
//  POR QUÉ LOS PAGOS SE MUESTRAN EN PESOS Y NO EN PORCENTAJES:
//  Al cliente no le sirve "35% a la firma". Le sirve "$655,497 a la
//  firma". El porcentaje vive en la cartera; aquí se convierte a dinero
//  contra el precio de ESTA unidad.
// =====================================================================
import { useEffect, useState } from "react";
import { useMiRol } from "../CrmCliente/_compartido";
import { generarFichaProyecto, puedeGenerarFicha } from "../../lib/ficha-proyecto";
import { money, type Proyecto, type Unidad, type EsquemaPago } from "../../data/proyectos";

// ── Cómo se llama cada imagen ────────────────────────────────────────
// La etiqueta guardada sirve para las fotos de una garantía normal
// (Fachada, Lateral…), pero un plano no cabe en esa lista y queda como
// "Otro". Aquí se lee el nombre del archivo, que sí dice qué es.
function nombreImagen(url: string, i: number): string {
  const f = url.toLowerCase();
  if (f.includes("planta")) return "Planta";
  if (f.includes("corte")) return "Corte";
  if (f.includes("nivel-1")) return "Nivel 1";
  if (f.includes("nivel-2")) return "Nivel 2";
  if (f.includes("fachada")) return "Fachada";
  return "Imagen " + (i + 1);
}

// ── Un renglón de pago ───────────────────────────────────────────────
function Renglon({ etiqueta, monto, detalle, acento }: {
  etiqueta: string; monto: string; detalle?: string | null; acento: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-black/5 py-2.5 last:border-0">
      <div className="min-w-0">
        <div className="text-[13px] text-tinta">{etiqueta}</div>
        {detalle && <div className="mt-0.5 text-[11px] leading-snug text-humo">{detalle}</div>}
      </div>
      <div
        className="shrink-0 font-display text-[15px] font-semibold"
        style={{ color: acento, fontVariantNumeric: "tabular-nums" }}
      >
        {monto}
      </div>
    </div>
  );
}

// ── Un esquema de pago, ya convertido a pesos ────────────────────────
function Esquema({ e, precio, acento }: {
  e: EsquemaPago; precio: number; acento: string;
}) {
  return (
    <div>
      {e.pagos.map((p, i) => {
        const monto = (precio * p.pct) / 100;
        const mensual = p.meses && p.meses > 0 ? monto / p.meses : null;
        return (
          <Renglon
            key={i}
            etiqueta={p.etiqueta + " · " + p.pct + "%"}
            monto={mensual ? money(mensual) + " al mes" : money(monto)}
            detalle={
              mensual
                ? p.meses + " pagos · " + money(monto) + " en total" +
                  (p.momento ? " · " + p.momento : "")
                : p.momento
            }
            acento={acento}
          />
        );
      })}
      {e.nota && (
        <p className="mt-3 text-[11.5px] leading-relaxed text-humo">{e.nota}</p>
      )}
    </div>
  );
}

// ── Calculadora de precio ────────────────────────────────────────────
//  El precio de lista NO se toca. Aquí se arma la COTIZACIÓN de un
//  cliente: cuánto se le descuenta y en qué condiciones se le entrega.
//  Por eso no se guarda en la unidad — un descuento es de una venta, no
//  del local. Se guardará cuando exista Apartados, amarrado al cliente.
//
//  Los dos descuentos son INDEPENDIENTES y los dos se calculan sobre el
//  precio de lista, tal como está escrito en la presentación: el
//  comercial es negociación, el de obra gris es porque el cliente
//  recibe menos. Por eso se suman y no se encadenan.
function Calculadora({ p, precio, comercial, setComercial, acabado, setAcabado }: {
  p: Proyecto; precio: number;
  comercial: number; setComercial: (n: number) => void;
  acabado: string; setAcabado: (s: string) => void;
}) {
  const r = p.reglas;
  if (!r) return null;

  const ac = r.acabados.find((a) => a.clave === acabado) ?? r.acabados[0] ?? null;
  const pctAcabado = ac?.pct ?? 0;
  const excede = comercial > r.comercialMaxPct;
  // El paquete se da por cerrar SIN DESCUENTO COMERCIAL. El 10% de obra
  // gris no lo apaga: ése no es negociación, es que el cliente recibe
  // menos acabado. Decisión de la DGE del 08-sep-2026.
  const conPromocion = comercial === 0 && r.promocion !== null;

  return (
    <div className="mt-6 rounded-xl border border-black/10 p-4">
      <h4 className="font-display text-[13px] font-semibold text-tinta">
        Cotización para el cliente
      </h4>

      {/* Descuento comercial */}
      <div className="mt-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="desc-com" className="text-[12px] text-tinta">
            Descuento comercial
          </label>
          <span className="text-[12px] font-medium text-tinta">{comercial}%</span>
        </div>
        <input
          id="desc-com"
          type="range"
          min={0}
          max={p.descuentoTopePct || r.comercialMaxPct}
          step={0.5}
          value={comercial}
          onChange={(e) => setComercial(Number(e.target.value))}
          className="mt-2 w-full accent-teal"
        />
        <p className="mt-1 text-[11px] leading-snug text-humo">
          Hasta {r.comercialMaxPct}% lo aplica el asesor; del {r.comercialMaxPct}% al{" "}
          {p.descuentoTopePct}% va con autorización. Más de {p.descuentoTopePct}% no se ofrece.
        </p>
        {excede && (
          <p
            className="mt-1.5 rounded-md px-2.5 py-1.5 text-[11.5px] leading-snug"
            style={{ backgroundColor: p.colorAcento + "22", color: p.colorMarca }}
          >
            Pasa del {r.comercialMaxPct}%: esta cotización necesita autorización de {r.comercialAutoriza}
            {" "}antes de ofrecerse.
          </p>
        )}
      </div>

      {/* Condición de entrega */}
      {r.acabados.length > 1 && (
        <div className="mt-4">
          <div className="text-[12px] text-tinta">Se entrega en</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {r.acabados.map((a) => (
              <button
                key={a.clave}
                onClick={() => setAcabado(a.clave)}
                className={
                  "rounded-lg px-3 py-1.5 text-[12px] font-medium transition focus-visible:outline focus-visible:outline-2 " +
                  (a.clave === ac?.clave ? "text-white" : "bg-nube text-humo hover:text-tinta")
                }
                style={a.clave === ac?.clave ? { backgroundColor: p.colorMarca } : undefined}
              >
                {a.nombre}{a.pct > 0 ? " −" + a.pct + "%" : ""}
              </button>
            ))}
          </div>
          {ac?.incluye.length ? (
            <p className="mt-2 text-[11px] leading-relaxed text-humo">
              Incluye {ac.incluye.join(", ").toLowerCase()}.
            </p>
          ) : null}
          {ac?.condicion && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-humo">{ac.condicion}</p>
          )}
        </div>
      )}

      {/* El desglose */}
      <div className="mt-4 border-t border-black/10 pt-3">
        <Renglon etiqueta="Precio de lista" monto={money(precio)} acento="#64748B" />
        {comercial > 0 && (
          <Renglon
            etiqueta={"Descuento comercial · " + comercial + "%"}
            monto={"− " + money((precio * comercial) / 100)}
            acento="#64748B"
          />
        )}
        {pctAcabado > 0 && ac && (
          <Renglon
            etiqueta={ac.nombre + " · " + pctAcabado + "%"}
            monto={"− " + money((precio * pctAcabado) / 100)}
            acento="#64748B"
          />
        )}
      </div>

      {conPromocion && r.promocion && (
        <div className="mt-3 rounded-lg bg-nube px-4 py-3">
          <div className="text-[12px] font-medium text-tinta">{r.promocion.titulo}</div>
          <ul className="mt-1.5 space-y-1">
            {r.promocion.incluye.map((x) => (
              <li key={x} className="text-[11.5px] leading-snug text-humo">· {x}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Tabulador de pagos ───────────────────────────────────────────────
//  Los tres esquemas de la presentación son los de lista. Esto es para
//  cuando el cliente pregunta "¿y si doy más de apartado?" o "¿y en seis
//  meses en cuánto me sale?". El asesor mueve apartado, enganche y
//  plazo, y la tabla de abajo enseña TODOS los plazos de un jalón para
//  no ir probando uno por uno enfrente del cliente.
//
//  Los pisos son de la DGE y aquí no se cruzan: enganche mínimo, apartado
//  mínimo. El descuento sí se puede pedir por arriba del tope del asesor,
//  pero queda marcado como que necesita autorización.
function Tabulador({ p, precio, apartado, setApartado, enganchePct, setEnganchePct }: {
  p: Proyecto; precio: number;
  apartado: number; setApartado: (n: number) => void;
  enganchePct: number; setEnganchePct: (n: number) => void;
}) {
  if (precio <= 0) return null;

  const enganche = (precio * enganchePct) / 100;
  const aCuentaEnganche = p.apartadoAplica === "enganche";
  const aLaFirma = Math.max(enganche - (aCuentaEnganche ? apartado : 0), 0);
  const saldo = Math.max(precio - enganche - (aCuentaEnganche ? 0 : apartado), 0);

  const plazos: number[] = [];
  for (let m = p.plazoMin; m <= p.plazoMax; m++) plazos.push(m);

  const engancheBajo = enganchePct < p.engancheListaPct;
  const engancheInvalido = enganchePct < p.engancheMinPct;
  const apartadoInvalido = apartado < p.apartadoMin;

  const campo =
    "w-full rounded-lg border border-black/10 bg-nube px-3 py-2 text-[12.5px] text-tinta outline-none focus:border-teal focus:bg-white";

  return (
    <div className="mt-6 rounded-xl border border-black/10 p-4">
      <h4 className="font-display text-[13px] font-semibold text-tinta">
        Tabulador de pagos
      </h4>
      <p className="mt-1 text-[11px] leading-snug text-humo">
        Para cotizar fuera de los esquemas de lista. Sin intereses.
      </p>

      <div className="mt-3.5 grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="apart" className="text-[11.5px] text-tinta">Apartado</label>
          <input
            id="apart"
            type="number"
            step={1000}
            min={p.apartadoMin}
            value={apartado}
            onChange={(e) => setApartado(Number(e.target.value))}
            className={campo + " mt-1"}
          />
          <p className={"mt-1 text-[11px] leading-snug " + (apartadoInvalido ? "text-tinta" : "text-humo")}>
            {apartadoInvalido
              ? "El mínimo es " + money(p.apartadoMin) + "."
              : "Mínimo " + money(p.apartadoMin) + " · de lista " + money(p.apartado ?? 0)}
          </p>
        </div>
        <div>
          <label htmlFor="eng" className="text-[11.5px] text-tinta">Enganche</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              id="eng"
              type="number"
              step={1}
              min={p.engancheMinPct}
              max={100}
              value={enganchePct}
              onChange={(e) => setEnganchePct(Number(e.target.value))}
              className={campo}
            />
            <span className="text-[12.5px] text-humo">%</span>
          </div>
          <p className={"mt-1 text-[11px] leading-snug " + (engancheInvalido ? "text-tinta" : "text-humo")}>
            {engancheInvalido
              ? "No puede bajar del " + p.engancheMinPct + "%."
              : "Mínimo " + p.engancheMinPct + "% · de lista " + p.engancheListaPct + "%"}
          </p>
        </div>
      </div>

      {(engancheInvalido || apartadoInvalido) && (
        <p
          className="mt-3 rounded-md px-2.5 py-1.5 text-[11.5px] leading-snug"
          style={{ backgroundColor: p.colorAcento + "22", color: p.colorMarca }}
        >
          Esta combinación está abajo del piso autorizado y no se puede ofrecer.
        </p>
      )}

      {/* El desglose de lo que da el cliente */}
      <div className="mt-4 border-t border-black/10 pt-3">
        <Renglon
          etiqueta="Apartado"
          monto={money(apartado)}
          detalle={aCuentaEnganche ? "A cuenta del enganche" : "A cuenta del último pago"}
          acento="#64748B"
        />
        <Renglon
          etiqueta={"Enganche · " + enganchePct + "%"}
          monto={money(enganche)}
          detalle={
            (aCuentaEnganche ? "Resta a la firma: " + money(aLaFirma) + " · " : "") +
            "A la firma del Contrato de Promesa de Compraventa" +
            (engancheBajo && !engancheInvalido ? " · abajo del " + p.engancheListaPct + "% de lista" : "")
          }
          acento={p.colorMarca}
        />
        <Renglon
          etiqueta="Saldo a financiar"
          monto={money(saldo)}
          detalle="Se reparte en los pagos de la tabla"
          acento="#64748B"
        />
      </div>

      {/* Todos los plazos, de un jalón */}
      {saldo > 0 && (
        <table className="mt-3 w-full">
          <thead>
            <tr className="border-b border-black/10">
              <th className="pb-1.5 text-left text-[11px] font-medium text-humo">Plazo</th>
              <th className="pb-1.5 text-right text-[11px] font-medium text-humo">Pago mensual</th>
            </tr>
          </thead>
          <tbody>
            {plazos.map((m) => (
              <tr key={m} className="border-b border-black/5 last:border-0">
                <td className="py-1.5 text-[12.5px] text-tinta">{m} meses</td>
                <td
                  className="py-1.5 text-right font-display text-[13.5px] font-semibold"
                  style={{ color: p.colorMarca, fontVariantNumeric: "tabular-nums" }}
                >
                  {money(saldo / m)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-humo">
        La entrega física del local se hace hasta que el cliente termina de pagar
        la totalidad.
      </p>
    </div>
  );
}

// ── La ficha ─────────────────────────────────────────────────────────
export default function FichaUnidad({ u, p, onCerrar }: {
  u: Unidad; p: Proyecto; onCerrar: () => void;
}) {
  const imagenes = Array.from(
    new Set([u.fotoFachada, ...u.galeria.map((g) => g.url)].filter(Boolean) as string[]),
  );
  const [i, setI] = useState(0);
  const [esquema, setEsquema] = useState(p.esquemas[0]?.clave ?? "");
  const [comercial, setComercial] = useState(0);
  const [acabado, setAcabado] = useState(p.reglas?.acabados[0]?.clave ?? "");
  const [apartadoMonto, setApartadoMonto] = useState(p.apartado ?? 0);
  const [enganchePct, setEnganchePct] = useState(p.engancheListaPct);
  const [cliente, setCliente] = useState("");
  const [generando, setGenerando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const rol = useMiRol();

  // Escape cierra, como cualquier ventana del sistema.
  useEffect(() => {
    const f = (ev: KeyboardEvent) => { if (ev.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [onCerrar]);

  const activo = p.esquemas.find((e) => e.clave === esquema) ?? p.esquemas[0] ?? null;
  const lista = u.precio ?? 0;

  // El precio que se cotiza: lista menos los dos descuentos, cada uno
  // sobre la lista. Nunca baja de cero por si alguien mete un número
  // absurdo en la barra.
  const acabadoPct = p.reglas?.acabados.find((a) => a.clave === acabado)?.pct ?? 0;
  const descuento = (lista * (comercial + acabadoPct)) / 100;
  const precio = Math.max(lista - descuento, 0);
  const hayDescuento = descuento > 0;

  // Lo que se le entrega al cliente es la cotización que está en
  // pantalla, no el precio de lista: si el asesor movió el descuento,
  // ese es el número que va en el papel.
  const cotizacion = {
    lista,
    precio,
    comercialPct: comercial,
    acabadoNombre: p.reglas?.acabados.find((a) => a.clave === acabado)?.nombre ?? "Obra blanca",
    acabadoPct,
    esquema: activo,
  };
  const permiso = puedeGenerarFicha(u, p, cotizacion);

  async function descargar() {
    setAviso(null);
    setGenerando(true);
    const r = await generarFichaProyecto(u, p, cotizacion, {
      clienteNombre: cliente.trim() || undefined,
      quien: rol || "sin identificar",
    });
    setGenerando(false);
    setAviso(r.ok ? "Ficha " + r.folio + " generada. Guárdela como PDF desde la ventana que se abrió." : r.error);
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Barra de marca */}
        <header
          className="flex items-center justify-between gap-4 px-6 py-4"
          style={{ backgroundColor: p.colorMarca }}
        >
          <div className="flex min-w-0 items-center gap-4">
            {p.logoUrl && <img src={p.logoUrl} alt={p.nombre} className="h-8 w-auto" />}
            <div className="min-w-0">
              <div className="font-display text-[16px] font-semibold text-white">{u.nombre}</div>
              <div className="truncate text-[11.5px] text-white/70">
                {[u.planta?.replace(/^planta /, "Planta "), p.municipio].filter(Boolean).join(" · ")}
              </div>
            </div>
          </div>
          <button
            onClick={onCerrar}
            aria-label="Cerrar la ficha"
            className="shrink-0 rounded-lg px-3 py-2 text-[12px] text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            Cerrar
          </button>
        </header>

        <div className="grid gap-6 p-6 lg:grid-cols-[1.25fr_1fr]">
          {/* ── Imágenes ── */}
          <div>
            {imagenes.length > 0 ? (
              <>
                <div className="rounded-xl bg-nube p-2">
                  <img
                    src={imagenes[i]}
                    alt={nombreImagen(imagenes[i], i) + " de " + u.nombre}
                    className="h-[300px] w-full object-contain md:h-[420px]"
                  />
                </div>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {imagenes.map((src, k) => (
                    <button
                      key={src}
                      onClick={() => setI(k)}
                      className={
                        "overflow-hidden rounded-lg border bg-nube p-1 transition focus-visible:outline focus-visible:outline-2 " +
                        (k === i ? "border-transparent" : "border-black/10 opacity-70 hover:opacity-100")
                      }
                      style={k === i ? { boxShadow: "0 0 0 2px " + p.colorMarca } : undefined}
                      title={nombreImagen(src, k)}
                    >
                      <img src={src} alt="" className="h-12 w-16 object-contain" />
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[11.5px] text-humo">
                  {nombreImagen(imagenes[i], i)} · {i + 1} de {imagenes.length}
                </p>
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-black/15 px-6 py-16 text-center text-sm text-humo">
                Esta unidad todavía no tiene imágenes cargadas.
              </div>
            )}
          </div>

          {/* ── Precio, datos y pagos ── */}
          <div>
            <div className="rounded-xl px-5 py-5" style={{ backgroundColor: p.colorMarca }}>
              {hayDescuento && (
                <div className="text-[12.5px] text-white/55 line-through">{money(lista)}</div>
              )}
              <div
                className={
                  "font-display text-[32px] font-bold leading-none tracking-tight text-white " +
                  (hayDescuento ? "mt-1" : "")
                }
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {money(precio)}
              </div>
              <div className="mt-2 text-[12px] text-white/70">
                MXN · {u.m2 ? u.m2.toFixed(2) + " m²" : "—"}
                {u.m2 ? " · " + money(precio / u.m2) + " por m²" : ""}
              </div>
              {hayDescuento && (
                <div className="mt-1.5 text-[11.5px]" style={{ color: p.colorAcento }}>
                  Precio cotizado · {money(descuento)} menos que la lista
                </div>
              )}
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3">
              {[
                ["Superficie", u.m2 ? u.m2.toFixed(2) + " m²" : "—"],
                ["Nivel", u.planta ? u.planta.replace(/^planta /, "Planta ") : "—"],
                ["Baños", u.banos != null ? String(u.banos) : "—"],
                ["Folio", u.folio],
              ].map(([et, val]) => (
                <div key={et}>
                  <dt className="text-[11px] text-humo">{et}</dt>
                  <dd className="mt-0.5 text-[13.5px] font-medium text-tinta">{val}</dd>
                </div>
              ))}
            </dl>

            <Calculadora
              p={p}
              precio={lista}
              comercial={comercial}
              setComercial={setComercial}
              acabado={acabado}
              setAcabado={setAcabado}
            />

            {/* Formas de pago */}
            {activo && precio > 0 && (
              <div className="mt-6">
                <div className="mb-3 flex flex-wrap gap-2">
                  {p.esquemas.map((e) => (
                    <button
                      key={e.clave}
                      onClick={() => setEsquema(e.clave)}
                      className={
                        "rounded-lg px-3 py-2 text-[12px] font-medium transition focus-visible:outline focus-visible:outline-2 " +
                        (e.clave === activo.clave ? "text-white" : "bg-nube text-humo hover:text-tinta")
                      }
                      style={e.clave === activo.clave ? { backgroundColor: p.colorMarca } : undefined}
                    >
                      {e.nombre}
                    </button>
                  ))}
                </div>

                <Esquema e={activo} precio={precio} acento={p.colorMarca} />

                {p.apartado != null && (
                  <div className="mt-4 rounded-lg bg-nube px-4 py-3">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-[12.5px] text-tinta">Apartado para iniciar</span>
                      <span
                        className="font-display text-[14px] font-semibold text-tinta"
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {money(p.apartado)}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-snug text-humo">
                      Con el apartado arranca el proceso; el enganche se paga a la
                      firma del Contrato de Promesa de Compraventa.
                    </p>
                  </div>
                )}

                {p.cuotaMantenimiento != null && (
                  <p className="mt-3 text-[11.5px] leading-relaxed text-humo">
                    Aparte del precio, la plaza tiene una cuota de mantenimiento y
                    administración de {money(p.cuotaMantenimiento)} al mes.
                  </p>
                )}

                <Tabulador
                  p={p}
                  precio={precio}
                  apartado={apartadoMonto}
                  setApartado={setApartadoMonto}
                  enganchePct={enganchePct}
                  setEnganchePct={setEnganchePct}
                />

                {/* ── Entregar la ficha ── */}
                <div className="mt-6 border-t border-black/10 pt-4">
                  <label htmlFor="cli" className="text-[12px] text-tinta">
                    A nombre de quién se entrega
                  </label>
                  <input
                    id="cli"
                    value={cliente}
                    onChange={(e) => setCliente(e.target.value)}
                    placeholder="Nombre del cliente (opcional)"
                    className="mt-1.5 w-full rounded-lg border border-black/10 bg-nube px-3 py-2 text-[12.5px] text-tinta outline-none focus:border-teal focus:bg-white"
                  />
                  <button
                    onClick={descargar}
                    disabled={!permiso.puede || generando}
                    className="mt-2.5 w-full rounded-lg px-4 py-2.5 text-[13px] font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2"
                    style={{ backgroundColor: p.colorMarca }}
                  >
                    {generando ? "Generando…" : "Descargar ficha para el cliente"}
                  </button>
                  {!permiso.puede && permiso.motivo && (
                    <p className="mt-2 text-[11.5px] leading-snug text-humo">{permiso.motivo}</p>
                  )}
                  {aviso && (
                    <p className="mt-2 text-[11.5px] leading-snug text-tinta">{aviso}</p>
                  )}
                  <p className="mt-2 text-[11px] leading-relaxed text-humo">
                    Sale con marca de agua, folio de entrega y el nombre de quien la
                    descargó. Ese folio queda registrado.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
