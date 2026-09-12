// Control de Devoluciones — tablero de TODAS las Devoluciones Compensadas
// (RDC) de la empresa. 3 charolas + bolsa mensual + cola FIFO con montos
// por convenio + calculadora + solicitud de prioridad/monto mayor.
import { useEffect, useMemo, useState } from "react";
import { fetchClientes, type Cliente } from "../../data/clientes";
import {
  listarRdcActivas,
  solicitarPrioridadRdc, listarSolicitudesPrioridad, calcularBolsaMensual, obtenerConteoAbonos,
  previsualizarRDC, calcularRDC, iniciarDevolucion,
  cambiarAModalidad1, solicitarCompensacionPendiente,
  TOPE_ABONO_SIN_APROBACION, PLAZO_MESES_PARA_COMPENSACION,
  type RdcDevolucion, type BolsaMensual,
} from "../../data/rdc";
import { fetchTodosAbonos } from "../../data/convenioDevolucion";
import { puedeAccion } from "../../data/roles";
import { previewExplicacionCliente, previewSolicitudFormal, previewConvenioModalidad1, previewConvenioModalidad2, abrirVistaPrevia } from "../../data/plantillasRdc";
import { useMiRol, fechaCorta } from "../CrmCliente/_compartido";
import FichaDevolucion from "./FichaDevolucion";
import TerminarAsuntoModal, { puedeTerminarAsunto } from "./TerminarAsuntoModal";
import { listarColasSelladas, type MesSellado } from "../../data/dineroDelMes";

import { hayParametros } from "../../data/parametrosDevolucion";
import AvisoParametros from "../../components/AvisoParametros";
import DineroDelMes from "./DineroDelMes";
type Charola = "procedimientos" | "solicitudes" | "atrasados" | "calendario" | "convenio" | "dinero";

function money(n: number): string {
  return "$" + Math.round(n || 0).toLocaleString("es-MX");
}

function diasEntre(fechaIso: string): number {
  const f = new Date(fechaIso + "T00:00:00").getTime();
  return Math.floor((Date.now() - f) / 86400000);
}

function mesesEntre(fechaIso: string): number {
  const f = new Date(fechaIso + "T00:00:00").getTime();
  return Math.floor((Date.now() - f) / (86400000 * 30.44));
}

export default function ControlDevoluciones({ target }: { target?: { cliente: Cliente; nonce: number } | null }) {
  // 👇 Sin parámetros no se calcula nada — ver parametrosDevolucion.ts
  if (!hayParametros()) return <AvisoParametros onListo={() => window.location.reload()} />;

  const miRol = useMiRol();
  const [cargando, setCargando] = useState(true);
  const [rdcs, setRdcs] = useState<RdcDevolucion[]>([]);
  const [clientesPorId, setClientesPorId] = useState<Map<string, Cliente>>(new Map());
  const [bolsa, setBolsa] = useState<BolsaMensual | null>(null);
  const [prioridadesAprobadas, setPrioridadesAprobadas] = useState<Set<string>>(new Set());
  const [conteoAbonos, setConteoAbonos] = useState<Map<string, number>>(new Map());
  const [charola, setCharola] = useState<Charola>("solicitudes");
  const [colasSelladas, setColasSelladas] = useState<MesSellado[] | null>(null);
  const [cargandoCalendario, setCargandoCalendario] = useState(false);
  const [subModalidad, setSubModalidad] = useState<"1" | "2">("1");
  const [resumenPagos, setResumenPagos] = useState<Map<string, { capital: number; compensacion: number }> | null>(null);
  const [cargandoConvenio, setCargandoConvenio] = useState(false);
  const [terminando, setTerminando] = useState<{ clienteId: string; nombre: string; folio: string; capital: number; abonado: number } | null>(null);
  const [cambiandoId, setCambiandoId] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<Cliente | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [iniciandoId, setIniciandoId] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    try {
      const [rdcList, clientesList, bolsaCalc, prioridades, conteo] = await Promise.all([
        listarRdcActivas(), fetchClientes(), calcularBolsaMensual(), listarSolicitudesPrioridad("aprobada"), obtenerConteoAbonos(),
      ]);
      const clientesMapa = new Map(clientesList.map((c) => [String(c.id), c]));
      // 👇 Si el cliente ya eligió R3 (cambio de garantía), ya NO está en
      // proceso de devolución — sale de Control de Devoluciones. Su
      // seguimiento ahora vive en Seguimiento, no aquí.
      const rdcListFiltrada = rdcList.filter((r) => clientesMapa.get(r.clienteId)?.codigo !== "R3");
      setRdcs(rdcListFiltrada);
      setClientesPorId(clientesMapa);
      setBolsa(bolsaCalc);
      setPrioridadesAprobadas(new Set(prioridades.map((p) => p.clienteId)));
      setConteoAbonos(conteo);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  // 👇 Las colas selladas se leen bajo demanda, solo al abrir esa pestaña.
  useEffect(() => {
    if (charola !== "calendario" || cargando) return;
    if (colasSelladas !== null) return;
    setCargandoCalendario(true);
    // 👇 Única fuente: las colas que la DGE ya selló en cola_pago_mes.
    listarColasSelladas()
      .then(setColasSelladas)
      .finally(() => setCargandoCalendario(false));
  }, [charola, cargando, colasSelladas]);

  // 👇 Resumen del sub-módulo Convenio: cuánto capital y cuánto de
  // compensación ya se le dio a cada cliente, para las listas de Modalidad
  // 1 y Modalidad 2. Se calcula bajo demanda igual que el calendario.
  useEffect(() => {
    if (charola !== "convenio" || cargando) return;
    if (resumenPagos !== null) return;
    setCargandoConvenio(true);
    fetchTodosAbonos().then((abonos) => {
      const mapa = new Map<string, { capital: number; compensacion: number }>();
      for (const a of abonos) {
        const actual = mapa.get(a.clienteId) || { capital: 0, compensacion: 0 };
        if (a.tipo === "compensacion") actual.compensacion += a.monto;
        else actual.capital += a.monto;
        mapa.set(a.clienteId, actual);
      }
      setResumenPagos(mapa);
    }).finally(() => setCargandoConvenio(false));
  }, [charola, cargando, resumenPagos]);

  async function manejarCambioModalidad(r: RdcDevolucion) {
    const pagado = resumenPagos?.get(r.clienteId)?.capital || 0;
    const capitalRestante = Math.max(0, r.capital - pagado);
    const ok = window.confirm(`¿Cambiar a Modalidad 1? El capital restante (${money(capitalRestante)}) entra al calendario de Modalidad 1 desde hoy — esto no se puede deshacer.`);
    if (!ok) return;
    setCambiandoId(r.clienteId);
    try {
      const exito = await cambiarAModalidad1(r.clienteId, capitalRestante, miRol || "Sistema");
      if (exito) { setResumenPagos(null); setColasSelladas(null); await cargar(); }
      else alert("No se pudo cambiar la modalidad.");
    } finally {
      setCambiandoId(null);
    }
  }

  async function manejarSolicitarCompensacion(r: RdcDevolucion) {
    setCambiandoId(r.clienteId);
    try {
      const exito = await solicitarCompensacionPendiente(r.clienteId, miRol || "Sistema");
      if (exito) await cargar();
      else alert("No se pudo registrar la solicitud.");
    } finally {
      setCambiandoId(null);
    }
  }


  // Si llegamos aquí desde CRM Cliente (link "Ver proceso de devolución"),
  // abrimos directo la ficha de ese cliente.
  useEffect(() => {
    if (target?.cliente) setAbierto(target.cliente);
  }, [target?.nonce]);

  const hoy = new Date().toISOString().slice(0, 10);

  const { solicitudes, atrasados } = useMemo(() => {
    const s: RdcDevolucion[] = [];
    const p: RdcDevolucion[] = [];
    const a: RdcDevolucion[] = [];
    for (const r of rdcs) {
      if (r.estado !== "habilitada") { s.push(r); continue; }
      if (r.fechaProximoAbono && r.fechaProximoAbono <= hoy) a.push(r);
      else p.push(r);
    }
    s.sort((x, y) => (y.fechaSolicitudDev || "").localeCompare(x.fechaSolicitudDev || ""));
    // Cola en 3 niveles: 1) prioridad aprobada, 2) los que ya están EN CURSO
    // (con abonos previos) nunca se dejan colgados por un caso nuevo,
    // 3) entre los nuevos: el que venció primero (FIFO), y si empatan,
    // el monto más chico primero (cierra más casos con la misma bolsa).
    const porPrioridad = (x: RdcDevolucion, y: RdcDevolucion) => {
      const px = prioridadesAprobadas.has(x.clienteId) ? 0 : 1;
      const py = prioridadesAprobadas.has(y.clienteId) ? 0 : 1;
      if (px !== py) return px - py;

      // 👇 RDC (Modalidad 1, esperó su compensación) SIEMPRE antes que
      // Convenio simple (Modalidad 2, quiso su capital rápido sin esperar)
      // — esto manda por encima de todo lo demás, salvo prioridad aprobada.
      const modX = x.modalidad === "rdc" ? 0 : 1;
      const modY = y.modalidad === "rdc" ? 0 : 1;
      if (modX !== modY) return modX - modY;

      const enCursoX = (conteoAbonos.get(x.clienteId) || 0) > 0 ? 0 : 1;
      const enCursoY = (conteoAbonos.get(y.clienteId) || 0) > 0 ? 0 : 1;
      if (enCursoX !== enCursoY) return enCursoX - enCursoY;

      const fifo = (x.fechaVencimiento || "9999").localeCompare(y.fechaVencimiento || "9999");
      if (fifo !== 0) return fifo;

      return x.capital - y.capital;
    };
    p.sort(porPrioridad);
    a.sort((x, y) => (x.fechaProximoAbono || "").localeCompare(y.fechaProximoAbono || ""));

    // Último pagado: entre los que ya tienen abonos, el de fecha_proximo_abono
    // más reciente hacia atrás es una aproximación razonable de "a quién le
    // tocó su último pago más recientemente".
    const conAbonos = rdcs.filter((r) => (conteoAbonos.get(r.clienteId) || 0) > 0);
    const ultimoPagado = conAbonos.length
      ? conAbonos.reduce((mas, r) => ((r.fechaProximoAbono || "") > (mas.fechaProximoAbono || "") ? r : mas))
      : null;

    return { solicitudes: s, proximos: p, atrasados: a, ultimoPagado };
  }, [rdcs, hoy, prioridadesAprobadas, conteoAbonos]);

  // Mapa rápido rdc por cliente, para saber en qué estado va cada quien.
  const rdcPorClienteId = useMemo(() => new Map(rdcs.map((r) => [r.clienteId, r])), [rdcs]);

  // Resultados del buscador universal — busca en TODOS los clientes, no
  // solo los que ya tienen un proceso RDC. Clasifica en 3 estados: sin
  // proceso, solicitud subida a mano sin folio, o con abonos pero sin
  // convenio escrito todavía.
  const resultadosBusqueda = useMemo(() => {
    const q = busquedaCliente.trim().toLowerCase();
    if (q.length < 2) return [];
    return Array.from(clientesPorId.values())
      .filter((c) => c.nombre.toLowerCase().includes(q))
      .filter((c) => c.codigo !== "R3") // 👈 ya eligió quedarse — su seguimiento vive en Seguimiento, no aquí
      .slice(0, 8)
      .map((c) => {
        const r = rdcPorClienteId.get(String(c.id));
        const enCurso = (conteoAbonos.get(String(c.id)) || 0) > 0;
        let estado: "sin_proceso" | "solicitud_a_mano" | "convenio_no_escrito" | "en_proceso";
        if (!r && !c.docSolicitudDevolucion) estado = "sin_proceso";
        else if (r?.folio) estado = "en_proceso";
        else if (enCurso) estado = "convenio_no_escrito";
        else estado = "solicitud_a_mano";
        return { cliente: c, estado };
      });
  }, [busquedaCliente, clientesPorId, rdcPorClienteId, conteoAbonos]);

  async function iniciar(cliente: Cliente) {
    setIniciandoId(String(cliente.id));
    try {
      const ok = await iniciarDevolucion(String(cliente.id), cliente.area, miRol || "Sistema");
      if (ok) { setBusquedaCliente(""); setAbierto(cliente); await cargar(); }
      else alert("No se pudo iniciar el proceso.");
    } finally {
      setIniciandoId(null);
    }
  }

  const indicadores = useMemo(() => {
    const totalPendiente = rdcs.reduce((sum, r) => sum + (r.estado === "habilitada" ? r.capital : 0), 0);
    const conVencimiento = rdcs.filter((r) => r.fechaVencimiento);
    const promedioMeses = conVencimiento.length ? Math.round(conVencimiento.reduce((s, r) => s + mesesEntre(r.fechaVencimiento!), 0) / conVencimiento.length) : 0;
    const vencidasDeFirma = rdcs.filter((r) => r.descargaVencida).length;
    return { totalPendiente, promedioMeses, vencidasDeFirma };
  }, [rdcs]);

  const listaActiva = charola === "solicitudes" ? solicitudes : atrasados;
  const listaFiltrada = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    let base = listaActiva;
    // 👇 Sub-módulos de "Próximos a pagar": filtra por lo que cada cliente
    if (!q) return base;
    return base.filter((r) => {
      const cli = clientesPorId.get(r.clienteId);
      return (cli?.nombre || "").toLowerCase().includes(q) || (r.folio || "").toLowerCase().includes(q);
    });
  }, [listaActiva, busqueda, clientesPorId]);



  async function pedirPrioridad(clienteId: string) {
    const motivo = window.prompt("¿Por qué debe pasar antes que los demás? (se manda a validar con GAD/DGE)");
    if (motivo === null || !motivo.trim()) return;
    const ok = await solicitarPrioridadRdc(clienteId, miRol || "Sistema", motivo);
    if (ok) { alert("Solicitud de prioridad enviada a validar."); await cargar(); }
    else alert("No se pudo enviar la solicitud.");
  }

  if (abierto) {
    return <FichaDevolucion cliente={abierto} onCerrar={() => { setAbierto(null); cargar(); }} />;
  }

  const TABS: { clave: Charola; nombre: string; cuenta: number; color: string }[] = [
    { clave: "procedimientos", nombre: "📋 Procedimientos", cuenta: -1, color: "gray" },
    { clave: "solicitudes", nombre: "Solicitudes de devolución", cuenta: solicitudes.length, color: "amber" },
    { clave: "atrasados", nombre: "Atrasados", cuenta: atrasados.length, color: "rose" },
    { clave: "calendario", nombre: "📅 Calendario de pagos", cuenta: -1, color: "blue" },
    { clave: "convenio", nombre: "📄 Convenio", cuenta: -1, color: "violet" },
    { clave: "dinero", nombre: "💵 Dinero del mes", cuenta: -1, color: "teal" },
  ];

  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <h1 className="font-display text-lg font-extrabold text-tinta">💰 Control de Devoluciones</h1>
        <span className="text-[12px] text-humo">Devolución Compensada (RDC) — {rdcs.length} en total</span>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar cliente o folio…"
          className="w-full rounded-lg border border-black/10 px-3 py-1.5 text-[12.5px] outline-none focus:border-teal sm:ml-auto sm:w-56"
        />
      </div>

      {/* Buscador universal: cualquier cliente, tenga o no proceso ya iniciado */}
      <div className="mb-4 rounded-2xl border border-black/10 bg-white p-4">
        <p className="mb-2 text-[13px] font-semibold text-tinta">Buscar cliente</p>
        <input
          value={busquedaCliente}
          onChange={(e) => setBusquedaCliente(e.target.value)}
          placeholder="Nombre del cliente…"
          className="w-full rounded-lg border border-black/10 px-3 py-2 text-[13px] outline-none focus:border-teal"
        />
        {resultadosBusqueda.length > 0 && (
          <div className="mt-3 space-y-2">
            {resultadosBusqueda.map(({ cliente: c, estado }) => (
              <div
                key={c.id}
                className={
                  "flex items-center justify-between gap-3 rounded-xl border p-3 " +
                  (estado === "solicitud_a_mano" ? "border-amber-300" : estado === "convenio_no_escrito" ? "border-blue-300" : "border-black/10")
                }
              >
                <div>
                  <p className="text-[13.5px] font-semibold text-tinta">{c.nombre}</p>
                  <p className={"text-[11.5px] " + (estado === "solicitud_a_mano" ? "text-amber-700" : estado === "convenio_no_escrito" ? "text-blue-700" : "text-humo")}>
                    {estado === "sin_proceso" && "Sin proceso de devolución"}
                    {estado === "solicitud_a_mano" && "Solicitud subida a mano · falta validar y descargar convenio"}
                    {estado === "convenio_no_escrito" && "Ya tiene pagos en curso · convenio no escrito aún"}
                    {estado === "en_proceso" && "Ya tiene proceso en curso"}
                  </p>
                </div>
                {estado === "sin_proceso" ? (
                  <button onClick={() => iniciar(c)} disabled={iniciandoId === String(c.id)} className="shrink-0 rounded-lg bg-teal px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-teal-dark disabled:opacity-50">
                    {iniciandoId === String(c.id) ? "Iniciando…" : "Iniciar devolución"}
                  </button>
                ) : estado === "convenio_no_escrito" ? (
                  <button onClick={() => setAbierto(c)} className="shrink-0 rounded-lg bg-blue-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-blue-800">
                    Formalizar convenio →
                  </button>
                ) : (
                  <button onClick={() => setAbierto(c)} className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-amber-700">
                    Continuar →
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {busquedaCliente.trim().length >= 2 && resultadosBusqueda.length === 0 && (
          <p className="mt-2 text-[12px] text-humo">Sin resultados.</p>
        )}
      </div>

      {/* Bolsa mensual */}
      {bolsa && (
        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-xl bg-nube/60 p-3">
            <p className="text-[11px] text-humo">Bolsa de este mes (15% de ventas)</p>
            <p className="text-lg font-semibold text-tinta">{money(bolsa.bolsa)}</p>
          </div>
          <div className="rounded-xl bg-nube/60 p-3">
            <p className="text-[11px] text-humo">Ya asignado a convenios</p>
            <p className="text-lg font-semibold text-tinta">{money(bolsa.asignado)}</p>
          </div>
          <div className="rounded-xl bg-nube/60 p-3">
            <p className="text-[11px] text-humo">Disponible sin asignar</p>
            <p className={"text-lg font-semibold " + (bolsa.disponible > 0 ? "text-emerald-700" : "text-rose-700")}>{money(bolsa.disponible)}</p>
          </div>
        </div>
      )}

      {/* Indicadores */}
      <div className="mb-4 grid grid-cols-1 gap-2 text-[11.5px] sm:grid-cols-3">
        <div className="rounded-lg border border-black/10 px-3 py-2">
          <span className="text-humo">Capital pendiente en RDC: </span>
          <span className="font-semibold text-tinta">{money(indicadores.totalPendiente)}</span>
        </div>
        <div className="rounded-lg border border-black/10 px-3 py-2">
          <span className="text-humo">Espera promedio: </span>
          <span className="font-semibold text-tinta">{indicadores.promedioMeses} meses</span>
        </div>
        <div className="rounded-lg border border-black/10 px-3 py-2">
          <span className="text-humo">Folios con firma vencida: </span>
          <span className={"font-semibold " + (indicadores.vencidasDeFirma > 0 ? "text-rose-700" : "text-tinta")}>{indicadores.vencidasDeFirma}</span>
        </div>
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-black/10 sm:gap-2">
        {TABS.map((t) => (
          <button
            key={t.clave}
            onClick={() => setCharola(t.clave)}
            className={
              "shrink-0 border-b-2 px-2.5 py-2 text-[12px] font-semibold transition sm:px-3 sm:text-[12.5px] " +
              (charola === t.clave ? "border-teal text-teal-dark" : "border-transparent text-humo hover:text-tinta")
            }
          >
            {t.nombre}
            {t.cuenta >= 0 && (
              <span className={
                "ml-1.5 rounded-full px-1.5 py-0.5 text-[10.5px] font-bold " +
                (t.color === "amber" ? "bg-amber-100 text-amber-700" : t.color === "teal" ? "bg-teal-soft text-teal-dark" : t.color === "rose" ? "bg-rose-100 text-rose-700" : "bg-nube text-humo")
              }>
                {t.cuenta}
              </span>
            )}
          </button>
        ))}
      </div>

      {charola === "procedimientos" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Columna izquierda: cómo funciona el proceso, visual */}
          <div className="rounded-2xl border border-black/10 bg-white p-5 lg:p-6">
            <h2 className="mb-1 font-display text-[17px] font-extrabold text-tinta">Cómo funciona el proceso</h2>
            <p className="mb-5 text-[13px] text-humo">De la solicitud a la cola de pago, paso por paso.</p>

            <ol className="space-y-4">
              {[
                { t: "Solicitud", d: "Asesor/Colaborador solicita — no llena datos. El cliente elige Modalidad 1 (con compensación) o Modalidad 2 (convenio simple). ⚠️ Este paso NO se hace aquí: se hace en Clientes → ficha del cliente → pestaña Solicitud Formal." },
                { t: "Sucursal", d: "Gerente local/comercial, DGE, GAD o RAC llenan y validan los valores, fechas y documentos, presencial con INE en mano. ⚠️ Tampoco se hace aquí: es en Clientes → ficha del cliente → pestaña Solicitud Formal. Los gerentes de sucursal no ven este tablero, pero sí entran por Clientes." },
                { t: "Revisión", d: "Sub-RAC/RAC liberan la solicitud en 15-30 días, con el tipo de compensación y términos." },
                { t: "Definición", d: "Hasta 90 días para definir montos y plazos finales." },
                { t: "Convenio", d: "Se genera el Convenio (según la modalidad), se descarga y firma dentro de 24 horas." },
                { t: "Cola de pago", d: "Entra al calendario — Modalidad 1 siempre antes que Modalidad 2." },
              ].map((etapa, i) => (
                <li key={etapa.t} className="flex gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-soft text-[13px] font-bold text-teal-dark">{i + 1}</div>
                  <div>
                    <p className="text-[13.5px] font-semibold text-tinta">{etapa.t}</p>
                    <p className="text-[13px] text-humo">{etapa.d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Columna derecha: vista previa de los 3 documentos */}
          <div className="rounded-2xl border border-black/10 bg-white p-5 lg:p-6">
            <h2 className="mb-1 font-display text-[17px] font-extrabold text-tinta">Vista previa de los documentos</h2>
            <p className="mb-5 text-[13px] text-humo">Con datos de ejemplo y marca de agua — para mostrarle al cliente qué va a firmar, sin gastar descargas reales ni activar el candado de 24 horas.</p>

            <div className="space-y-3">
              {[
                { nombre: "💚 Explicación para el cliente", desc: "Ganancia de esperar + siempre recomienda quedarse", fn: previewExplicacionCliente, destacado: true },
                { nombre: "Solicitud Formal de Devolución", desc: "Paso 1 — elección de modalidad", fn: previewSolicitudFormal },
                { nombre: "Convenio RDC — Modalidad 1", desc: "Con compensación", fn: previewConvenioModalidad1 },
                { nombre: "Convenio — Modalidad 2", desc: "Convenio simple, sin compensación", fn: previewConvenioModalidad2 },
              ].map((doc) => (
                <div key={doc.nombre} className={"flex items-center justify-between gap-3 rounded-xl border p-3.5 " + (doc.destacado ? "border-emerald-300 bg-emerald-50" : "border-black/10")}>
                  <div>
                    <p className={"text-[13.5px] font-semibold " + (doc.destacado ? "text-emerald-800" : "text-tinta")}>{doc.nombre}</p>
                    <p className={"text-[12px] " + (doc.destacado ? "text-emerald-700" : "text-humo")}>{doc.desc}</p>
                  </div>
                  <button
                    onClick={() => abrirVistaPrevia(doc.fn())}
                    className={"shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white " + (doc.destacado ? "bg-emerald-600 hover:bg-emerald-700" : "bg-tinta hover:bg-black")}
                  >
                    👁️ Vista previa
                  </button>
                </div>
              ))}
            </div>

            <p className="mt-5 rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] text-amber-700">
              ⚠️ Estas vistas previas usan datos de ejemplo (no de un cliente real) y llevan marca de agua "BORRADOR · SIN FOLIO". No cuentan como descarga oficial.
            </p>
          </div>
        </div>
      )}

      {charola === "calendario" && (
        <div className="rounded-2xl border border-black/10 bg-white p-5 lg:p-6">
          <h2 className="mb-1 font-display text-[17px] font-extrabold text-tinta">📅 Calendario de pagos</h2>
          <p className="mb-5 text-[13px] text-humo">Cuándo empieza cada pago y en cuántas partes, contado siempre desde la FIRMA del convenio.</p>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-teal/20 bg-teal-soft/10 p-4">
              <p className="mb-3 text-[14px] font-extrabold text-teal-dark">Modalidad 1 · RDC (con compensación)</p>
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-soft text-[12px] font-bold text-teal-dark">1</div>
                  <div>
                    <p className="text-[13px] font-semibold text-tinta">Día de la firma</p>
                    <p className="text-[12.5px] text-humo">Si el contrato original ya venció: compensación por terminación, pago único (5%).</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-soft text-[12px] font-bold text-teal-dark">2</div>
                  <div>
                    <p className="text-[13px] font-semibold text-tinta">Desde los 12 meses de firmado</p>
                    <p className="text-[12.5px] text-humo">Inicia el <strong>capital</strong>: 6 pagos, cada 2-3 meses según ventas — no mensual, no monto fijo.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-soft text-[12px] font-bold text-teal-dark">3</div>
                  <div>
                    <p className="text-[13px] font-semibold text-tinta">Desde los 24 meses de firmado</p>
                    <p className="text-[12.5px] text-humo">Inicia la <strong>compensación</strong> (4% año 1, 5% desde año 2): 3 pagos, cada 2-3 meses — siempre DESPUÉS de terminar el capital, nunca antes ni mezclados.</p>
                  </div>
                </div>
              </div>
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-700">⚠️ Si a los 24 meses el cliente pide solo compensación (sin sacar su capital), el plazo se extiende un año más antes de pagarla.</p>
            </div>

            <div className="rounded-xl border border-black/10 bg-nube/30 p-4">
              <p className="mb-3 text-[14px] font-extrabold text-tinta">Modalidad 2 · simple (sin compensación)</p>
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-nube text-[12px] font-bold text-humo">1</div>
                  <div>
                    <p className="text-[13px] font-semibold text-tinta">Día de la firma</p>
                    <p className="text-[12.5px] text-humo">Si el contrato original ya venció: compensación por terminación, pago único (5%).</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-nube text-[12px] font-bold text-humo">2</div>
                  <div>
                    <p className="text-[13px] font-semibold text-tinta">Desde los 3 meses de firmado</p>
                    <p className="text-[12.5px] text-humo">Inicia el <strong>capital</strong>: hasta 15 pagos, cada 2-3 meses según ventas — no mensual, no monto fijo.</p>
                  </div>
                </div>
              </div>
              <p className="mt-3 rounded-lg bg-nube/60 px-3 py-2 text-[12px] text-humo">Entra con menor prioridad en la fila de pago que Modalidad 1 — firma con Gerente de sucursal.</p>
            </div>
          </div>

          <div className="mt-6 border-t border-black/10 pt-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[14px] font-extrabold text-tinta">Quién le toca y cuándo</p>
              <p className="text-[12px] text-humo">Cola autorizada por la Dirección · orden FIFO por turno</p>
            </div>

            {/* 👇 LO REAL: colas ya selladas en cola_pago_mes, con su bolsa
                registrada y quién las autorizó. Antes esta pestaña mostraba
                una proyección que se recalculaba sola y no coincidía con lo
                que de verdad se había autorizado pagar. */}
            {cargandoCalendario ? (
              <p className="text-[14px] text-humo">Cargando…</p>
            ) : colasSelladas && colasSelladas.length > 0 ? (
              <div className="space-y-4">
                {colasSelladas.map((mes) => (
                  <div key={mes.anioMes} className="rounded-xl border border-black/10 bg-white p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-bold text-tinta">{mes.anioMes}</p>
                        {mes.cerrado && <span className="rounded-full bg-nube px-2 py-0.5 text-[10.5px] font-semibold text-humo">Cola congelada</span>}
                      </div>
                      <p className="text-[12px] font-semibold text-humo">
                        {money(mes.repartido)} de {money(mes.bolsaRegistrada)}
                        {mes.sobrante > 0 && <span className="text-emerald-700"> · sobran {money(mes.sobrante)}</span>}
                      </p>
                    </div>
                    <ul className="divide-y divide-black/5">
                      {mes.renglones.map((r) => (
                        <li key={r.anioMes + r.clienteId + r.concepto} className="flex items-center justify-between py-2 text-[13px]">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-semibold text-humo">#{r.turno}</span>
                            <button onClick={() => { const c = clientesPorId.get(r.clienteId); if (c) setAbierto(c); }} className="font-semibold text-tinta hover:underline">
                              {r.nombre}
                            </button>
                            {r.sucursal && <span className="text-[11px] text-humo">{r.sucursal}</span>}
                            <span className={"rounded-full px-2 py-0.5 text-[10.5px] font-semibold " + (r.concepto === "liquidacion" ? "bg-emerald-50 text-emerald-700" : "bg-nube text-humo")}>
                              {r.concepto === "liquidacion" ? "Liquidación" : "Cuota"}
                            </span>
                            {r.pagado && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700">Pagado</span>}
                          </div>
                          <span className="font-semibold text-tinta">{money(r.monto)}</span>
                        </li>
                      ))}
                    </ul>
                    {mes.renglones[0]?.autorizadoPor && (
                      <p className="mt-2 text-[10.5px] text-humo">Autorizó: {mes.renglones[0].autorizadoPor}</p>
                    )}
                  </div>
                ))}
                <p className="text-[11.5px] text-humo">
                  Los clientes con demanda —penal, PROFECO o mercantil— no aparecen aquí: van por convenio aparte.
                </p>
              </div>
            ) : (
              <p className="rounded-lg bg-nube/60 px-3 py-2 text-[13px] text-humo">
                Todavía no se ha generado ninguna cola. Ve a <strong>Dinero del mes</strong>, registra la bolsa y genera el reparto.
              </p>
            )}
          </div>
        </div>
      )}

      {/* 👇 Dinero del mes: registrar la bolsa real, repartirla y congelar la cola */}
      {charola === "dinero" && <DineroDelMes miRol={miRol} />}

      {charola === "convenio" && (
        <div className="rounded-2xl border border-black/10 bg-white p-5 lg:p-6">
          <h2 className="mb-1 font-display text-[17px] font-extrabold text-tinta">📄 Convenio</h2>
          <p className="mb-4 text-[13px] text-humo">Todos los que ya firmaron convenio, con cuánto capital y cuánto de compensación ya se les ha dado.</p>

          <div className="mb-4 flex gap-2">
            <button onClick={() => setSubModalidad("1")} className={"rounded-full px-3 py-1.5 text-[12px] font-semibold " + (subModalidad === "1" ? "bg-tinta text-white" : "bg-nube text-humo hover:bg-black/10")}>
              Modalidad 1 · RDC
            </button>
            <button onClick={() => setSubModalidad("2")} className={"rounded-full px-3 py-1.5 text-[12px] font-semibold " + (subModalidad === "2" ? "bg-tinta text-white" : "bg-nube text-humo hover:bg-black/10")}>
              Modalidad 2 · simple
            </button>
          </div>

          {cargandoConvenio || !resumenPagos ? (
            <p className="text-[14px] text-humo">Cargando…</p>
          ) : (() => {
            const modalidadClave = subModalidad === "1" ? "rdc" : "convenio_simple";
            // 👇 Modalidad 1 exige firma REAL del convenio (firmadoEn) — no
            // basta con tener folio generado. Modalidad 2 sí puede venir sin
            // firmadoEn (la mayoría son casos heredados de antes del sistema).
            const lista = rdcs.filter((r) => r.folio && r.modalidad === modalidadClave && (modalidadClave === "convenio_simple" || !!r.firmadoEn));
            if (lista.length === 0) {
              return <p className="rounded-xl border border-black/10 bg-nube/40 p-4 text-center text-[13px] text-humo">No hay clientes con convenio firmado en esta modalidad todavía.</p>;
            }
            return (
              <div className="space-y-2">
                {lista.map((r) => {
                  const pagos = resumenPagos.get(r.clienteId) || { capital: 0, compensacion: 0 };
                  const capitalRestante = Math.max(0, r.capital - pagos.capital);
                  const terminado = capitalRestante <= 0;
                  const cli = clientesPorId.get(r.clienteId);
                  return (
                    <div key={r.id} className="rounded-xl border border-black/10 bg-white p-3 text-[12.5px]">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <button onClick={() => cli && setAbierto(cli)} className="font-semibold text-tinta hover:underline">{cli?.nombre || "Cliente no encontrado"}</button>
                          <span className={"ml-2 rounded-full px-2 py-0.5 text-[10.5px] font-semibold " + (terminado ? "bg-emerald-100 text-emerald-800" : "bg-nube text-humo")}>
                            {terminado ? "Capital terminado" : "En curso"}
                          </span>
                        </div>
                        <span className="text-[11px] text-humo">{r.folio}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <div><p className="text-[10.5px] text-humo">Capital total</p><p className="font-semibold text-tinta">{money(r.capital)}</p></div>
                        <div><p className="text-[10.5px] text-humo">Ya se le dio (capital)</p><p className="font-semibold text-emerald-700">{money(pagos.capital)}</p></div>
                        <div><p className="text-[10.5px] text-humo">Ya se le dio (compensación)</p><p className="font-semibold text-teal-dark">{money(pagos.compensacion)}</p></div>
                        <div><p className="text-[10.5px] text-humo">Capital restante</p><p className="font-semibold text-amber-700">{money(capitalRestante)}</p></div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {subModalidad === "2" && puedeAccion(miRol, "habilitar_compensacion") && (
                          <button onClick={() => manejarCambioModalidad(r)} disabled={cambiandoId === r.clienteId} className="rounded-lg bg-violet-600 px-3 py-1.5 text-[11.5px] font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
                            {cambiandoId === r.clienteId ? "Cambiando…" : "🔄 Cambiar a Modalidad 1"}
                          </button>
                        )}
                        {subModalidad === "1" && terminado && !r.compensacionSolicitadaEn && (
                          <button onClick={() => manejarSolicitarCompensacion(r)} disabled={cambiandoId === r.clienteId} className="rounded-lg bg-teal px-3 py-1.5 text-[11.5px] font-semibold text-white hover:bg-teal-dark disabled:opacity-50">
                            {cambiandoId === r.clienteId ? "Guardando…" : "💰 Solicitar compensación pendiente"}
                          </button>
                        )}
                        {subModalidad === "1" && terminado && r.compensacionSolicitadaEn && (
                          <span className="rounded-lg bg-teal-soft/40 px-3 py-1.5 text-[11.5px] font-semibold text-teal-dark">✓ Compensación ya solicitada — {fechaCorta(r.compensacionSolicitadaEn.slice(0, 10))}</span>
                        )}
                        {puedeTerminarAsunto(miRol) && (
                          <button
                            onClick={() => setTerminando({ clienteId: r.clienteId, nombre: cli?.nombre || "Cliente", folio: r.folio || "", capital: r.capital, abonado: pagos.capital })}
                            className="rounded-lg bg-tinta px-3 py-1.5 text-[11.5px] font-semibold text-white hover:bg-black">
                            🔒 Dar por terminado
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {charola !== "procedimientos" && (cargando ? (
        <p className="text-[12.5px] text-humo">Cargando…</p>
      ) : listaFiltrada.length === 0 ? (
        <p className="rounded-xl border border-black/10 bg-nube/40 p-4 text-center text-[12.5px] text-humo">
          {charola === "solicitudes" && "No hay solicitudes de devolución pendientes de definir."}
          {charola === "atrasados" && "🎉 No hay abonos atrasados."}
        </p>
      ) : (
        <div className="space-y-2">
          {listaFiltrada.map((r) => {
            const cli = clientesPorId.get(r.clienteId);
            const dias = r.fechaProximoAbono ? diasEntre(r.fechaProximoAbono) : null;
            const esPrioridad = prioridadesAprobadas.has(r.clienteId);
            return (
              <div key={r.id} className={"rounded-xl border p-3 text-[12.5px] " + (esPrioridad ? "border-purple-300 bg-purple-50/50" : "border-black/10 bg-white")}>
                <div className="mb-2">
                  <p className="font-semibold text-tinta">
                    {cli?.nombre || "Cliente no encontrado"}
                    {esPrioridad && <span className="ml-1.5 rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-700">★ prioridad</span>}
                  </p>
                  <p className="text-[11px] text-humo">
                    {r.folio || "sin folio"} · Capital {money(r.capital)}
                    {r.fechaVencimiento && ` · venció ${fechaCorta(r.fechaVencimiento)}`}
                  </p>
                  {r.modalidad === "rdc" && cli && (() => {
                    const prev = previsualizarRDC(cli);
                    const generadoHoy = calcularRDC(cli, r).compensacion;
                    return (
                      <p className="mt-1 text-[10.5px] text-emerald-700">
                        💰 {r.docFirmado ? "Generado a la fecha" : "Si firma el convenio, ganará"}: {money(r.docFirmado ? generadoHoy : 0)}
                        {" · "}a 1 año: +{money(prev.compensacionAnio1)} · a 2 años: +{money(prev.compensacionAnio1 + prev.compensacionAnio2)}
                      </p>
                    );
                  })()}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                {charola === "solicitudes" && (
                  <>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                      Solicitada {r.fechaSolicitudDev ? fechaCorta(r.fechaSolicitudDev) : "—"}
                    </span>
                    {r.solicitadoIniciarPor && !r.revisadoPor && r.fechaLimiteRevision && (() => {
                      const dias = Math.ceil((new Date(r.fechaLimiteRevision + "T00:00:00").getTime() - Date.now()) / 86400000);
                      return (
                        <span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold " + (dias < 0 ? "bg-rose-100 text-rose-700" : dias <= 5 ? "bg-amber-100 text-amber-700" : "bg-nube text-humo")}>
                          {dias < 0 ? `⏰ Vencida hace ${Math.abs(dias)}d` : `Pedida por ${r.solicitadoIniciarPor} · ${dias}d para revisar`}
                        </span>
                      );
                    })()}
                  </>
                )}

                {charola === "atrasados" && (
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                    Vencido hace {dias ?? "—"} día(s) · debía {money(r.abonoMensual || 0)} el {fechaCorta(r.fechaProximoAbono || "")}
                  </span>
                )}

                {charola === "solicitudes" && !esPrioridad && (
                  <button onClick={() => pedirPrioridad(r.clienteId)} className="rounded-lg border border-purple-200 bg-white px-2 py-1 text-[11px] font-semibold text-purple-700 hover:bg-purple-50">
                    + Prioridad
                  </button>
                )}

                <button
                  onClick={() => { if (cli) setAbierto(cli); }}
                  disabled={!cli}
                  className="ml-auto rounded-lg border border-black/10 bg-white px-2.5 py-1 text-[11px] font-semibold text-tinta hover:bg-nube disabled:opacity-40"
                >
                  Ver ficha de devolución →
                </button>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      <p className="mt-4 text-[10.5px] text-humo">
        El 5% de compensación solo se genera después de {PLAZO_MESES_PARA_COMPENSACION()} meses de espera. Los montos arriba de {money(TOPE_ABONO_SIN_APROBACION())}/mes necesitan aprobación de GAD/DGE.
      </p>
      {!miRol && <p className="mt-2 text-[11px] text-humo">Cargando permisos…</p>}

      {terminando && (
        <TerminarAsuntoModal
          clienteId={terminando.clienteId}
          nombreCliente={terminando.nombre}
          folio={terminando.folio}
          capital={terminando.capital}
          yaAbonado={terminando.abonado}
          rol={miRol}
          onCerrar={(ok) => {
            setTerminando(null);
            if (ok) { setResumenPagos(null); cargar(); }
          }}
        />
      )}
    </div>
  );
}
