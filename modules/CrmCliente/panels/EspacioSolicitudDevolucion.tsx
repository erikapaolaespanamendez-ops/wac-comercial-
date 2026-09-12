// Espacio de Solicitud de Devolución — el ÚNICO lugar al que llega el
// Asesor/Colaborador cuando dispara "Solicitar devolución formal". No
// llena ningún dato (eso lo hacen gerente/DGE/GAD/RAC después) — aquí
// solo entiende sus opciones: Modalidad 1, Modalidad 2, los tiempos del
// proceso, y la alternativa de quedarse con DIIPA (proceso R3, cambio de
// garantía, ya construido — no se duplica, solo se conecta).
import { useState } from "react";
import { validarNomenclatura, type Cliente } from "../../../data/clientes";
import {
  pedirGenerarRdc, previsualizarRDC,
  PLAZO_DEFINICION_DIAS, PLAZO_REVISION_MIN_DIAS, PLAZO_REVISION_MAX_DIAS, PLAZO_MESES_PARA_COMPENSACION,
  M2_NUM_PAGOS_MAX, M2_MESES_INICIO, MESES_ENTRE_PAGOS_MIN, MESES_ENTRE_PAGOS_MAX,
} from "../../../data/rdc";
import { useMiRol } from "../_compartido";

import { hayParametros } from "../../../data/parametrosDevolucion";
import AvisoParametros from "../../../components/AvisoParametros";
function money(n: number): string {
  return "$" + Math.round(n || 0).toLocaleString("es-MX");
}

type Seccion = "resumen" | "modalidad1" | "modalidad2" | "tiempos" | "quedarse";

export default function EspacioSolicitudDevolucion({ cliente, onCerrar, onAbrioR3 }: { cliente: Cliente; onCerrar: () => void; onAbrioR3: () => void }) {
  // 👇 Sin parámetros no se calcula nada — ver parametrosDevolucion.ts
  if (!hayParametros()) return <AvisoParametros onListo={() => window.location.reload()} />;

  const miRol = useMiRol();
  const [seccion, setSeccion] = useState<Seccion>("quedarse");
  const [enviando, setEnviando] = useState(false);
  const [abriendoR3, setAbriendoR3] = useState(false);

  const prev = previsualizarRDC(cliente);

  const MENU: { clave: Seccion; nombre: string }[] = [
    { clave: "quedarse", nombre: "💚 Prefiere quedarse con DIIPA" },
    { clave: "resumen", nombre: "Resumen" },
    { clave: "modalidad1", nombre: "Modalidad 1 · con compensación" },
    { clave: "modalidad2", nombre: "Modalidad 2 · convenio simple" },
    { clave: "tiempos", nombre: "Tiempos del proceso" },
  ];

  async function solicitar() {
    setEnviando(true);
    try {
      const nueva = await pedirGenerarRdc(cliente, miRol || "Sistema");
      if (nueva) { alert("Solicitud enviada. Un gerente o RAC la va a llenar con los datos del contrato."); onCerrar(); }
      else alert("No se pudo enviar la solicitud.");
    } finally {
      setEnviando(false);
    }
  }

  async function abrirCambioR3() {
    if (!window.confirm(`¿Seguro que ${cliente.nombre} prefiere un cambio de garantía (quedarse con DIIPA) en vez de pedir su devolución?`)) return;
    setAbriendoR3(true);
    try {
      const ok = await validarNomenclatura(cliente.id, "R3", cliente.area);
      if (ok) { alert("Listo, se abrió el proceso de cambio (R3) en la ficha del cliente."); onAbrioR3(); }
      else alert("No se pudo abrir el proceso R3.");
    } finally {
      setAbriendoR3(false);
    }
  }

  return (
    <div className="flex min-h-[70vh] flex-col sm:flex-row">
      {/* Menú vertical */}
      <div className="w-full shrink-0 border-b border-black/10 bg-nube/40 p-3 sm:w-56 sm:border-b-0 sm:border-r">
        <button onClick={onCerrar} className="mb-3 text-[12px] font-semibold text-humo hover:text-tinta">← Volver</button>
        <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-humo">{cliente.nombre}</p>
        <nav className="space-y-1">
          {MENU.map((m) => (
            <button
              key={m.clave}
              onClick={() => setSeccion(m.clave)}
              className={"block w-full rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold " + (seccion === m.clave ? "bg-teal text-white" : "text-tinta hover:bg-white")}
            >
              {m.nombre}
            </button>
          ))}
        </nav>
      </div>

      {/* Contenido */}
      <div className="flex-1 p-4 sm:p-6">
        {seccion === "resumen" && (
          <div>
            <h2 className="mb-1 font-display text-[19px] font-extrabold text-tinta">Antes de solicitar, esto es lo que le espera al cliente</h2>
            <p className="mb-4 text-[13px] text-humo">Este es solo un resumen — tú no llenas datos aquí. Al elegir una opción, la solicitud pasa a un gerente/RAC para que la complete con el contrato original.</p>

            <div className="mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <button onClick={() => setSeccion("modalidad1")} className="rounded-xl border border-black/10 bg-white p-3 text-left hover:border-teal">
                <p className="text-[13px] font-semibold text-tinta">Modalidad 1 · con compensación</p>
                <p className="text-[12px] text-humo">Gana 4-5% anual, pero espera mínimo 1 año</p>
              </button>
              <button onClick={() => setSeccion("modalidad2")} className="rounded-xl border border-black/10 bg-white p-3 text-left hover:border-teal">
                <p className="text-[13px] font-semibold text-tinta">Modalidad 2 · convenio simple</p>
                <p className="text-[12px] text-humo">Solo capital, entra a la fila más rápido</p>
              </button>
            </div>

            <div className="mb-4 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-3">
              <p className="mb-1 text-[13px] font-semibold text-emerald-800">💚 ¿Y si mejor se queda con nosotros?</p>
              <p className="mb-2 text-[12px] text-emerald-700">Antes de pedir la devolución, siempre vale la pena mostrarle la opción de cambio de garantía — conserva su antigüedad y su compensación acumulada.</p>
              <button onClick={abrirCambioR3} disabled={abriendoR3} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                {abriendoR3 ? "Abriendo…" : "Abrir proceso de cambio (R3) en vez de la devolución"}
              </button>
            </div>

            <button onClick={solicitar} disabled={enviando} className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
              {enviando ? "Enviando…" : "El cliente sí quiere su devolución — solicitar"}
            </button>
          </div>
        )}

        {seccion === "modalidad1" && (
          <div>
            <h2 className="mb-3 font-display text-[19px] font-extrabold text-tinta">Modalidad 1 — con compensación</h2>
            <ul className="mb-4 list-disc space-y-1.5 pl-5 text-[13px] text-tinta">
              <li>Gana 4% el primer año, 5% desde el segundo año en adelante</li>
              <li>La compensación crece cada día, aunque se cobre hasta cumplir cada año</li>
              <li>Si el contrato ya venció, también incluye la compensación por terminación</li>
              <li>El capital nunca deja de ser 100% del cliente — puede pedirlo antes, solo que ese beneficio en particular aún no se habría generado</li>
            </ul>

            <div className="mb-3 rounded-xl bg-nube/60 p-3">
              <p className="text-[11px] text-humo">Capital</p>
              <p className="text-lg font-semibold text-tinta">{money(prev.capital)}</p>
            </div>

            <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-[11px] text-emerald-700">Generando cada día, desde que se firme el convenio</p>
              <p className="text-xl font-semibold text-emerald-800">+{money(prev.compensacionDiaria)} <span className="text-[12px] font-normal">al día</span></p>
            </div>

            <div className="mb-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-nube/50 p-2.5 text-center">
                <p className="text-[11px] text-humo">Al año 1 (4%)</p>
                <p className="text-[14px] font-semibold text-tinta">{money(prev.compensacionAnio1)}</p>
              </div>
              <div className="rounded-lg bg-nube/50 p-2.5 text-center">
                <p className="text-[11px] text-humo">Al año 2 (5% más)</p>
                <p className="text-[14px] font-semibold text-tinta">{money(prev.compensacionAnio2)}</p>
              </div>
            </div>

            <div className="mb-3 rounded-xl bg-teal-soft/40 p-3">
              <p className="text-[11px] text-humo">Total estimado si espera 1 año</p>
              <p className="text-lg font-semibold text-teal-dark">{money(prev.totalAnio1)}</p>
              <p className="mt-1 text-[11px] text-humo">Total estimado si espera 2 años</p>
              <p className="text-lg font-semibold text-teal-dark">{money(prev.totalAnio2)}</p>
            </div>

            <p className="text-[11px] text-humo">*Estimado — el monto final y las fechas reales se confirman cuando el gerente/RAC llenen los datos del contrato.</p>
          </div>
        )}

        {seccion === "modalidad2" && (
          <div>
            <h2 className="mb-3 font-display text-[19px] font-extrabold text-tinta">Modalidad 2 — convenio simple</h2>
            <ul className="mb-4 list-disc space-y-1.5 pl-5 text-[13px] text-tinta">
              <li>No espera ningún plazo para entrar a la fila de pago</li>
              <li>Hasta {M2_NUM_PAGOS_MAX()} pagos de capital, cada {MESES_ENTRE_PAGOS_MIN()}-{MESES_ENTRE_PAGOS_MAX()} meses según ventas — empiezan a los {M2_MESES_INICIO()} meses de firmado</li>
              <li>Si el contrato ya venció, igual recibe la compensación por terminación (pago único)</li>
              <li>La firma es solo en sucursal, junto con su Gerente</li>
              <li>Entra a la fila de pago después de que se hayan cubierto todos los de Modalidad 1 del mes</li>
            </ul>

            <div className="mb-3 rounded-xl bg-nube/60 p-3">
              <p className="text-[11px] text-humo">Capital (sin compensación)</p>
              <p className="text-lg font-semibold text-tinta">{money(prev.capital)}</p>
            </div>

            {prev.contratoYaVencido && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-[11px] text-emerald-700">Compensación por terminación (pago único, el contrato ya venció)</p>
                <p className="text-lg font-semibold text-emerald-800">+{money(prev.capital * 0.05)}</p>
              </div>
            )}
          </div>
        )}

        {seccion === "tiempos" && (
          <div>
            <h2 className="mb-3 font-display text-[19px] font-extrabold text-tinta">Tiempos del proceso</h2>
            <ol className="space-y-2 text-[13px] text-tinta">
              <li><strong>1.</strong> Solicitud (hoy)</li>
              <li><strong>2.</strong> Gerente/RAC llena y valida los datos — {PLAZO_REVISION_MIN_DIAS()} a {PLAZO_REVISION_MAX_DIAS()} días</li>
              <li><strong>3.</strong> Sub-RAC/RAC liberan la solicitud con el tipo de compensación y términos</li>
              <li><strong>4.</strong> Definición de términos — hasta {PLAZO_DEFINICION_DIAS()} días</li>
              <li><strong>5.</strong> Se genera el Convenio y se firma en 24 horas</li>
              <li><strong>6.</strong> Entra a la cola de pago</li>
            </ol>
            <p className="mt-3 text-[12px] text-humo">Para la compensación (Modalidad 1): mínimo {PLAZO_MESES_PARA_COMPENSACION()} meses desde que se firma el convenio.</p>
          </div>
        )}

        {seccion === "quedarse" && (
          <div>
            <h2 className="mb-3 font-display text-[19px] font-extrabold text-tinta">💚 Prefiere quedarse con DIIPA</h2>
            <p className="mb-3 text-[13px] text-tinta">Antes de tramitar la devolución, siempre conviene ofrecerle al cliente la opción de <strong>cambio de garantía</strong> (proceso R3) — sigue con nosotros, sin esperar meses de trámite ni perder los beneficios de su contrato.</p>

            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-humo">Cuánto gana con cada opción</p>
            <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-black/10 bg-white p-3">
                <p className="text-[12px] font-semibold text-tinta">Modalidad 1</p>
                <p className="text-[11px] text-humo">Con compensación</p>
                <p className="mt-1 text-[19px] font-bold text-tinta">Hasta 15%</p>
                <p className="text-[10.5px] text-humo">5% terminación + hasta 10% por esperar (5%+5% si no pide antes)</p>
              </div>
              <div className="rounded-xl border border-black/10 bg-white p-3">
                <p className="text-[12px] font-semibold text-tinta">Modalidad 2</p>
                <p className="text-[11px] text-humo">Convenio simple</p>
                <p className="mt-1 text-[19px] font-bold text-tinta">5%</p>
                <p className="text-[10.5px] text-humo">Solo por terminación, pago único</p>
              </div>
              <div className="rounded-xl border-2 border-emerald-400 bg-emerald-50 p-3">
                <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[9.5px] font-bold text-white">RECOMENDADO</span>
                <p className="mt-1 text-[12px] font-semibold text-emerald-800">R3 · cambio de garantía</p>
                <p className="text-[11px] text-emerald-700">Se queda con DIIPA</p>
                <p className="mt-1 text-[19px] font-bold text-emerald-800">Hasta 45%</p>
                <p className="text-[10.5px] text-emerald-700">≈ {money(prev.capital * 0.45)} · garantía positiva ya predictaminada</p>
              </div>
            </div>

            <ul className="mb-4 list-disc space-y-1.5 pl-5 text-[13px] text-tinta">
              <li>No pasa por la espera de {PLAZO_REVISION_MIN_DIAS()}-{PLAZO_REVISION_MAX_DIAS()} días de validación ni los {PLAZO_DEFINICION_DIAS()} días de definición</li>
              <li>Conserva su garantía activa con DIIPA, con nuevos términos</li>
              <li>Suele ser la opción más rápida cuando el cliente solo quiere cambiar condiciones, no salirse</li>
            </ul>
            <button onClick={abrirCambioR3} disabled={abriendoR3} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              {abriendoR3 ? "Abriendo…" : "Abrir proceso de cambio (R3) en vez de la devolución"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
