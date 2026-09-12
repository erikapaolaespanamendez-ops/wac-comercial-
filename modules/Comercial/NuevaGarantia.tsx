// =====================================================================
//  MÓDULO COMERCIAL · Alta de garantía
//  →  src/modules/Comercial/NuevaGarantia.tsx
//
//  El formulario que se abre con "+ Agregar garantía" dentro de una
//  cartera. Pide poco a propósito: identidad, ubicación y lo del
//  crédito. Los metros, la foto y el link de mapas NO van aquí — se
//  piden al mandar a pre-dictaminar.
//
//  El "mínimo de la administradora" solo lo ven y lo editan los roles
//  que estén en la tabla campo_visibilidad. A los demás ni les aparece.
// =====================================================================
import { useEffect, useState } from "react";
import {
  crearGarantia, buscarRepetida, type NuevaGarantia as Datos,
} from "../../data/carteras";
import { listarVisibilidad, puedeVerCampo, type CampoVisibilidad } from "../../data/niveles";
import { SUCURSALES } from "../../data/roles";
import {
  calcularPrecio, CONTINGENCIAS, adeudosOFijos, money,
  ETIQUETA_PISO, NOTA_PISO, type Contingencia,
} from "../../lib/precio-garantia";

const ETAPAS_PROCESALES = [
  "Sin demanda", "Extrajudicial", "Demanda", "Emplazamiento", "Contestación",
  "Pruebas", "Sentencia", "Apelación", "Remate", "Adjudicación",
];

const VACIO: Omit<Datos, "carteraId"> = {
  numCredito: "", deudor: "", direccion: "", estadoMx: "",
  sucursal: "", codigoPostal: "", adeudoInicial: "", etapaProcesal: "",
  avaluoComercial: "", precioCompra: "",
  precioPiso: "", contingencia: "", valorGarantia: "",
  municipio: "", colonia: "",
  m2Terreno: "", m2Construccion: "",
};

const campo = "w-full rounded-lg border border-black/10 bg-nube px-3 py-2 text-[13px] text-tinta outline-none focus:border-teal focus:bg-white";
// Los 32 estados. Antes era texto libre y se guardaba "Sinaloa", "SINALOA"
// y "sinaloa" como si fueran tres estados distintos.
const ESTADOS_MX = [
  "Aguascalientes", "Baja California", "Baja California Sur", "Campeche", "Chiapas",
  "Chihuahua", "Ciudad de México", "Coahuila", "Colima", "Durango", "Estado de México",
  "Guanajuato", "Guerrero", "Hidalgo", "Jalisco", "Michoacán", "Morelos", "Nayarit",
  "Nuevo León", "Oaxaca", "Puebla", "Querétaro", "Quintana Roo", "San Luis Potosí",
  "Sinaloa", "Sonora", "Tabasco", "Tamaulipas", "Tlaxcala", "Veracruz", "Yucatán",
  "Zacatecas",
];

const etiqueta = "mb-1 block text-[12px] text-humo";

export default function NuevaGarantia({ carteraId, carteraNombre, miRol, onListo, onCancelar }: {
  carteraId: string;
  carteraNombre: string;
  miRol: string | null;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const [d, setD] = useState({ ...VACIO });
  const [vis, setVis] = useState<CampoVisibilidad[]>([]);
  // Dos avisos distintos: el del CRÉDITO bloquea el alta, el de la
  // DIRECCIÓN solo advierte. Antes eran uno solo y por eso se colaban
  // créditos repetidos con la dirección escrita de otra forma.
  const [repetida, setRepetida] = useState<{ texto: string; motivo: "credito" | "direccion" } | null>(null);
  const [revisado, setRevisado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { listarVisibilidad().then(setVis); }, []);

  const veAvaluo = puedeVerCampo(vis, miRol, "avaluo_comercial");
  const veCompra = puedeVerCampo(vis, miRol, "precio_compra");

  // ── El aproximado ──
  // En cuanto hay precio piso ya se puede estimar. Los adeudos van con los
  // tres fijos —predial, agua y luz—; al calcular el precio de verdad, ya
  // con el dictamen, se podrán cambiar. El valor de referencia es el avalúo
  // y, si la cartera no lo trae, el valor comercial.
  const num = (v: string) => { const x = parseFloat((v || "").replace(/[^0-9.]/g, "")); return isNaN(x) ? null : x; };
  const estimado = calcularPrecio({
    precioPiso: num(d.precioPiso),
    adeudos: adeudosOFijos(null),
    contingencia: (d.contingencia || null) as Contingencia | null,
    m2Construccion: num(d.m2Construccion),
    valorReferencia: num(d.avaluoComercial) ?? num(d.valorGarantia),
  });

  function set(k: keyof typeof VACIO, v: string) {
    setD((p) => ({ ...p, [k]: v }));
    if (k === "direccion" || k === "numCredito") { setRepetida(null); setRevisado(false); }
  }

  // Se revisa cuando el usuario sale del campo, no en cada letra.
  async function revisarRepetida() {
    if (!d.direccion.trim() && !d.numCredito.trim()) return;
    const r = await buscarRepetida(d.direccion, d.numCredito);
    setRepetida(r ? { texto: r.folio + " · " + r.direccion, motivo: r.motivo } : null);
    setRevisado(true);
  }

  const faltantes: string[] = [];
  if (!d.numCredito.trim()) faltantes.push("número de crédito");
  if (!d.direccion.trim()) faltantes.push("dirección");
  if (!d.precioPiso.trim()) faltantes.push("precio piso");
  // Solo el crédito repetido impide guardar.
  const bloqueada = repetida?.motivo === "credito";
  const puedeGuardar = faltantes.length === 0 && !bloqueada && !guardando;

  async function guardar() {
    setError(null);
    if (faltantes.length) { setError("Falta " + faltantes.join(" y ") + "."); return; }
    if (bloqueada) { setError("Ese número de crédito ya está dado de alta."); return; }

    setGuardando(true);
    const r = await crearGarantia({ ...d, carteraId }, miRol || "");
    setGuardando(false);

    if (!r.ok) { setError(r.error || "No se pudo guardar."); return; }
    onListo();
  }

  return (
    <div className="rounded-2xl border border-black/10 bg-white">
      <div className="border-b border-black/5 px-5 py-4">
        <h2 className="font-display text-lg font-bold text-tinta">Nueva garantía</h2>
        <p className="mt-0.5 text-[12px] text-humo">Cartera: {carteraNombre}</p>
      </div>

      <div className="px-5 py-4">
        <p className="mb-2 text-[11px] uppercase tracking-wide text-humo/70">Identidad</p>
        <div className="mb-2 grid grid-cols-1 gap-2 md:grid-cols-2">
          <div>
            <label className={etiqueta}>Número de crédito *</label>
            <input className={campo + " font-mono"} value={d.numCredito}
              onChange={(e) => set("numCredito", e.target.value)} onBlur={revisarRepetida} />
          </div>
          <div>
            <label className={etiqueta}>Deudor</label>
            <input className={campo} placeholder="Nombre del acreditado" value={d.deudor}
              onChange={(e) => set("deudor", e.target.value)} />
          </div>
        </div>

        <div className="mb-2">
          <label className={etiqueta}>Dirección de la garantía *</label>
          <input className={campo} value={d.direccion}
            onChange={(e) => set("direccion", e.target.value)} onBlur={revisarRepetida} />
        </div>

        {repetida?.motivo === "credito" && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-[12px] font-medium text-red-700">
            Ese número de crédito ya está dado de alta en {repetida.texto}. Es la misma garantía.
          </div>
        )}
        {repetida?.motivo === "direccion" && (
          <div className="mb-4 rounded-lg bg-dorado/10 px-3 py-2 text-[12px] font-medium text-dorado-dark">
            Ojo: ya hay una garantía en esa dirección ({repetida.texto}), pero con otro crédito.
            Puede ser legítimo —dos créditos sobre un mismo domicilio, o un departamento sin número
            interior—. Revísalo antes de guardar; si es correcto, adelante.
          </div>
        )}
        {revisado && !repetida && (
          <div className="mb-4 rounded-lg bg-aqua-soft px-3 py-2 text-[12px] font-medium text-aqua-dark">
            No hay otra garantía con ese crédito ni en esa dirección
          </div>
        )}
        {!revisado && <div className="mb-4" />}

        <p className="mb-2 text-[11px] uppercase tracking-wide text-humo/70">Ubicación</p>
        <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-3">
          <div>
            <label className={etiqueta}>Estado</label>
            <select className={campo} value={d.estadoMx} onChange={(e) => set("estadoMx", e.target.value)}>
              <option value="">—</option>
              {ESTADOS_MX.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <label className={etiqueta}>Municipio o ciudad</label>
            <input className={campo} value={d.municipio} onChange={(e) => set("municipio", e.target.value)} />
          </div>
          <div>
            <label className={etiqueta}>Colonia o fraccionamiento</label>
            <input className={campo} value={d.colonia} onChange={(e) => set("colonia", e.target.value)} />
          </div>
          <div>
            <label className={etiqueta}>Plaza</label>
            <select className={campo} value={d.sucursal} onChange={(e) => set("sucursal", e.target.value)}>
              <option value="">—</option>
              {SUCURSALES.map((s) => <option key={s.clave} value={s.clave}>{s.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className={etiqueta}>Código postal</label>
            <input className={campo} value={d.codigoPostal} onChange={(e) => set("codigoPostal", e.target.value)} />
          </div>
        </div>

        <p className="mb-2 text-[11px] uppercase tracking-wide text-humo/70">Del crédito</p>
        <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-2">
          <div>
            <label className={etiqueta}>Adeudo inicial</label>
            <input className={campo + " font-mono"} inputMode="decimal" value={d.adeudoInicial}
              onChange={(e) => set("adeudoInicial", e.target.value)} />
          </div>
          <div>
            <label className={etiqueta}>Etapa procesal</label>
            <select className={campo} value={d.etapaProcesal} onChange={(e) => set("etapaProcesal", e.target.value)}>
              <option value="">—</option>
              {ETAPAS_PROCESALES.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
        </div>

        <p className="mb-2 text-[11px] uppercase tracking-wide text-humo/70">Precio para calcular y medidas</p>
        <div className="mb-2 grid grid-cols-1 gap-2 md:grid-cols-2">
          <div>
            <label className={etiqueta}>{ETIQUETA_PISO} *</label>
            <input className={campo + " font-mono"} inputMode="decimal" value={d.precioPiso}
              onChange={(e) => set("precioPiso", e.target.value)} />
            <p className="mt-1 text-[11px] text-humo">Lo que pide la administradora. {NOTA_PISO}</p>
          </div>
          <div>
            <label className={etiqueta}>Contingencia jurídica</label>
            <select className={campo} value={d.contingencia}
              onChange={(e) => set("contingencia", e.target.value)}>
              <option value="">Sin definir — se calcula al 45%</option>
              {CONTINGENCIAS.map((c) => (
                <option key={c.clave} value={c.clave}>{c.nombre} — {c.pct}%</option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-humo">
              {CONTINGENCIAS.find((c) => c.clave === d.contingencia)?.ayuda
                || "Jurídico la puede corregir al dictaminar."}
            </p>
          </div>
          <div>
            <label className={etiqueta}>m² de terreno</label>
            <input className={campo + " font-mono"} inputMode="decimal" value={d.m2Terreno}
              onChange={(e) => set("m2Terreno", e.target.value)} />
          </div>
          <div>
            <label className={etiqueta}>m² de construcción</label>
            <input className={campo + " font-mono"} inputMode="decimal" value={d.m2Construccion}
              onChange={(e) => set("m2Construccion", e.target.value)} />
            <p className="mt-1 text-[11px] text-humo">Si la cartera no los trae, se dejan en blanco.</p>
          </div>
        </div>

        {/* El aproximado. Aparece solo, en cuanto hay precio piso. */}
        {!estimado.incompleto && (
          <div className="mb-4 rounded-xl border border-aqua/30 bg-aqua-soft/50 p-3">
            <p className="mb-2 text-[12px] font-semibold text-aqua-dark">Precio aproximado</p>
            <div className="flex flex-wrap gap-5">
              <div>
                <div className="text-[11px] text-aqua-dark">Sin habilitación</div>
                <div className="font-display text-xl font-bold text-tinta">{money(estimado.precioVenta)}</div>
              </div>
              <div>
                <div className="text-[11px] text-aqua-dark">Con habilitación</div>
                <div className="font-display text-xl font-bold text-tinta">
                  {estimado.precioConHabilitacion != null
                    ? money(estimado.precioConHabilitacion)
                    : <span className="text-[13px] font-medium text-humo">
                        {estimado.habilitacion.sinMedidas ? "faltan metros" : "cotización manual"}
                      </span>}
                </div>
              </div>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-aqua-dark">
              {money(estimado.precioPiso)} de piso + {money(estimado.totalAdeudos)} de adeudos fijos
              (predial, agua y luz) + {estimado.honorariosPct}% de honorarios.
              {estimado.pctSobreValor != null && ` Es el ${estimado.pctSobreValor}% del valor de referencia.`}
            </p>
            {estimado.arribaDelValor && (
              <p className="mt-1 text-[11px] font-semibold text-dorado-dark">
                Ojo: el precio queda por encima del valor del inmueble.
              </p>
            )}
            <p className="mt-1 text-[11px] text-aqua-dark/80">
              Es un estimado. El precio bueno se calcula cuando la garantía regrese apta del dictamen.
            </p>
          </div>
        )}

        {(veAvaluo || veCompra) && (
          <div className="mb-4 rounded-xl border border-teal/30 bg-teal-soft p-3">
            <p className="mb-2 text-[12px] font-semibold text-teal-dark">Dinero · acceso restringido</p>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {veAvaluo && (
                <div>
                  <label className="mb-1 block text-[12px] text-teal-dark">Avalúo comercial</label>
                  <input className="w-full rounded-lg border border-teal/30 bg-white px-3 py-2 font-mono text-[13px] text-tinta outline-none focus:border-teal"
                    inputMode="decimal" value={d.avaluoComercial}
                    onChange={(e) => set("avaluoComercial", e.target.value)} />
                  <p className="mt-1 text-[11px] text-teal-dark">Lo que vale el inmueble.</p>
                </div>
              )}
              {veAvaluo && (
                <div>
                  <label className="mb-1 block text-[12px] text-teal-dark">Valor comercial</label>
                  <input className="w-full rounded-lg border border-teal/30 bg-white px-3 py-2 font-mono text-[13px] text-tinta outline-none focus:border-teal"
                    inputMode="decimal" value={d.valorGarantia}
                    onChange={(e) => set("valorGarantia", e.target.value)} />
                  <p className="mt-1 text-[11px] text-teal-dark">Se llena cuando la cartera no trae avalúo.</p>
                </div>
              )}
              {/* Aquí estaba "Precio de compra · lo que nos cuesta la cesión".
                  Se quitó el 07-09-2026: era EL MISMO precio piso con otro
                  nombre, capturado dos veces en la misma pantalla. El precio
                  piso está arriba y es el único. */}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-teal-dark">
              El precio de venta al cliente no se pone aquí: se define hasta el final,
              cuando la garantía ya pasó el dictamen.
            </p>
          </div>
        )}

        {error && (
          <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-[12px] font-medium text-red-700">{error}</div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/5 pt-3">
          <p className="flex-1 text-[11px] leading-relaxed text-humo" style={{ minWidth: 180 }}>
            Si la cartera no trae metros, se dejan en blanco: el de sucursal los pone al mandar a
            pre-dictaminar, junto con la foto y el link de mapas.
          </p>
          <div className="flex gap-2">
            <button onClick={onCancelar}
              className="rounded-lg border border-black/10 px-3 py-2 text-[12px] font-medium text-humo hover:bg-nube">
              Cancelar
            </button>
            <button onClick={guardar} disabled={!puedeGuardar}
              className={"rounded-lg px-3.5 py-2 text-[12px] font-semibold text-white " +
                (puedeGuardar ? "bg-aqua-dark hover:bg-aqua" : "cursor-not-allowed bg-humo/40")}>
              {guardando ? "Guardando…" : "Guardar en cartera"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
