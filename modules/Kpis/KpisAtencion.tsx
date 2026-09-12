// ===================================================================
// H5 — KPIs de Atención (cumplimiento del seguimiento)  + H6 (exportar)
// ===================================================================
import { useEffect, useMemo, useState } from "react";
import { fetchSeguimiento, type ClienteSeguimiento } from "../../data/seguimiento";
import { agregarAtencion, cumpl, exportarKpisExcel, exportarClientesExcel, imprimirReporteAtencion, type Conteo } from "../../data/exportarAtencion";

function Card({ valor, etiqueta, color, bg }: { valor: number | string; etiqueta: string; color: string; bg?: string }) {
  return (
    <div className="rounded-xl border border-black/5 px-3 py-2.5 shadow-sm" style={{ background: bg || "white" }}>
      <div className="font-display text-2xl font-extrabold leading-none" style={{ color }}>{valor}</div>
      <div className="mt-1 text-[11px] font-medium text-humo">{etiqueta}</div>
    </div>
  );
}

function Tabla({ titulo, etiquetaCol, filas, conCumpl = true }: {
  titulo: string; etiquetaCol: string; filas: { nombre: string; c: Conteo }[]; conCumpl?: boolean;
}) {
  if (filas.length === 0) return null;
  return (
    <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
      <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-teal-dark">{titulo}</h2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-humo">
              <th className="px-1.5 py-1.5 font-medium">{etiquetaCol}</th>
              <th className="px-1.5 py-1.5 text-center font-medium">Total</th>
              <th className="px-1.5 py-1.5 text-center font-medium">Al día</th>
              <th className="px-1.5 py-1.5 text-center font-medium">Por vencer</th>
              <th className="px-1.5 py-1.5 text-center font-medium">Vencidos</th>
              {conCumpl && <th className="px-1.5 py-1.5 text-center font-medium">Cumpl.</th>}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.nombre} className="border-t border-black/5">
                <td className="px-1.5 py-2 font-medium text-tinta">{f.nombre}</td>
                <td className="px-1.5 py-2 text-center">{f.c.total}</td>
                <td className="px-1.5 py-2 text-center text-emerald-600">{f.c.alDia}</td>
                <td className="px-1.5 py-2 text-center text-amber-600">{f.c.porVencer}</td>
                <td className="px-1.5 py-2 text-center text-red-600">{f.c.vencidos}</td>
                {conCumpl && <td className="px-1.5 py-2 text-center font-semibold">{cumpl(f.c)}%</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function KpisAtencion() {
  const [items, setItems] = useState<ClienteSeguimiento[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchSeguimiento().then(setItems).catch(() => setError(true));
  }, []);

  const d = useMemo(() => agregarAtencion(items ?? []), [items]);

  if (error) return <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-16 text-center text-amber-800">No se pudo cargar la información.</div>;
  if (!items) return <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-16 text-center text-humo">Cargando indicadores…</div>;

  return (
    <div className="space-y-6">
      {/* Botones de exportación (H6) */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => exportarKpisExcel(items)} className="rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-dark">📥 Excel — KPIs</button>
        <button onClick={() => exportarClientesExcel(items)} className="rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-dark">📥 Excel — Lista de clientes</button>
        <button onClick={() => imprimirReporteAtencion(items)} className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-humo hover:bg-teal-soft">🖨️ Guardar PDF</button>
      </div>

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Card valor={d.resumen.total} etiqueta="En seguimiento" color="#1E50A0" />
        <Card valor={d.resumen.alDia} etiqueta="Al día" color="#0F6E56" bg="#E1F5EE" />
        <Card valor={d.resumen.porVencer} etiqueta="Por vencer" color="#854F0B" bg="#FAEEDA" />
        <Card valor={d.resumen.vencidos} etiqueta="Vencidos" color="#A32D2D" bg="#FCEBEB" />
        <Card valor={`${cumpl(d.resumen)}%`} etiqueta="Cumplimiento (sin vencer)" color="#0B7285" />
      </div>

      <Tabla titulo="Por área" etiquetaCol="Área" filas={d.porArea} />
      <Tabla titulo="Por sucursal" etiquetaCol="Sucursal" filas={d.porSucursal} />
      <Tabla titulo="Por código" etiquetaCol="Código" filas={d.porCodigo} conCumpl={false} />
      <Tabla titulo="Por colaborador (quién atiende cuánto)" etiquetaCol="Colaborador" filas={d.porColaborador} />

      <p className="text-[13px] text-humo">📞 Atendidos últimos 7 días: <span className="font-bold text-tinta">{d.atendidos7}</span></p>
    </div>
  );
}
