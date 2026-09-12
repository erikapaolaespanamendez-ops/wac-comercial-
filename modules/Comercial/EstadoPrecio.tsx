// =====================================================================
//  MÓDULO COMERCIAL · Validación e historial del precio
//  →  src/modules/Comercial/EstadoPrecio.tsx
//
//  Se pinta en la pestaña Precios de la garantía. Dos cosas:
//
//    1. QUIÉN FALTA POR VALIDAR — las tres firmas del precio vivo, con
//       su motivo cuando alguien rechazó y la marca de suplencia.
//    2. EL HISTORIAL — una fila por versión, para ver por qué una
//       garantía va en su tercer precio.
//
//  Lee de `garantia_precio`, la MISMA tabla que alimenta la bandeja del
//  Tablero. No se guarda nada aquí y no hay dato repetido: las dos
//  pantallas muestran el mismo renglón desde ángulos distintos.
//
//  NO se muestra ganancia de DIIPA ni margen, por decisión de la DGE del
//  8 de septiembre de 2026: con el precio de venta y el margen a la
//  vista, cualquiera despeja el precio piso con una resta, y ese dato
//  solo lo ven cuatro roles.
// =====================================================================
import { useEffect, useState } from "react";
import {
  leerPreciosDe, precioVigente, comoTermino, aQuienLeToca, MOTIVOS,
  pesos, fecha,
  type PrecioBandeja,
} from "../../lib/validacion-precio";

export default function EstadoPrecio({ garantiaId }: { garantiaId: string }) {
  const [lista, setLista] = useState<PrecioBandeja[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    leerPreciosDe(garantiaId)
      .then((l) => { if (vivo) { setLista(l); setError(null); } })
      .catch((e) => { if (vivo) setError(String((e as Error).message)); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [garantiaId]);

  if (cargando) return <p className="mt-4 text-[12px] text-humo/70">Cargando validación…</p>;
  if (error) return <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</p>;

  if (lista.length === 0) {
    return (
      <div className="mt-4 rounded-lg bg-nube px-3 py-2.5 text-[12px] text-humo">
        Todavía no se ha propuesto ningún precio para esta garantía. En cuanto se
        calcule y se guarde, aparece aquí para que lo firmen Contabilidad,
        Comercial y la Dirección.
      </div>
    );
  }

  const vivo = precioVigente(lista);

  return (
    <div className="mt-5">
      {/* ── Quién falta por validar ── */}
      {vivo && (
        <>
          <p className="mb-2 text-[11px] uppercase tracking-wide text-humo/70">
            Validación del precio · versión {vivo.version}
          </p>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Firma area="Contabilidad" voto={vivo.voto_contabilidad}
              motivo={vivo.voto_contabilidad_motivo} nota={vivo.voto_contabilidad_nota}
              quien={vivo.firma_contabilidad} cuando={vivo.firma_contabilidad_fecha}
              suplido={vivo.voto_contabilidad_suplido} />
            <Firma area="Comercial" voto={vivo.voto_comercial}
              motivo={vivo.voto_comercial_motivo} nota={vivo.voto_comercial_nota}
              quien={vivo.firma_comercial} cuando={vivo.firma_comercial_fecha}
              suplido={vivo.voto_comercial_suplido} />
            <Firma area="Dirección" voto={vivo.voto_dge}
              motivo={vivo.voto_dge_motivo} nota={vivo.voto_dge_nota}
              quien={vivo.firma_dge} cuando={vivo.firma_dge_fecha} suplido={false} />
          </div>

          <p className={"mt-2 rounded-lg px-3 py-2 text-[12px] " +
            (vivo.estado === "autorizado" ? "bg-teal-soft/60 text-teal-dark"
              : vivo.estado === "desempate" ? "bg-red-50 text-red-700"
              : "bg-dorado-soft/40 text-dorado-dark")}>
            {aQuienLeToca(vivo)}
            {vivo.estado !== "autorizado" && ". Las firmas se ponen en el Tablero."}
          </p>

          {/* La opinión de contingencias: se asienta, no firma. */}
          {vivo.opinion_contingencias && (
            <div className="mt-2 rounded-lg border border-black/10 px-3 py-2">
              <div className="text-[11px] text-humo">
                Contingencias · opina, no firma
              </div>
              <p className="mt-0.5 text-[13px] text-tinta">{vivo.opinion_contingencias}</p>
              <div className="text-[11px] text-humo">
                {vivo.opinion_contingencias_por} · {fecha(vivo.opinion_contingencias_en)}
              </div>
            </div>
          )}

          {vivo.version >= 3 && (
            <p className="mt-2 rounded-lg bg-dorado-soft/40 px-3 py-2 text-[12px] text-dorado-dark">
              Esta garantía va en su tercer precio. Ya no es discusión de precio:
              toca decidir si se renegocia con la administradora o se cierra.
            </p>
          )}
        </>
      )}

      {/* ── El historial ── */}
      <p className="mb-2 mt-5 text-[11px] uppercase tracking-wide text-humo/70">
        Historial de precios · {lista.length} {lista.length === 1 ? "versión" : "versiones"}
      </p>
      <div className="overflow-x-auto rounded-lg border border-black/10">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-nube text-left text-humo">
              <th className="px-3 py-2">Ver.</th>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Propuso</th>
              <th className="px-3 py-2">Ruta</th>
              <th className="px-3 py-2 text-right">Precio</th>
              <th className="px-3 py-2">Cómo terminó</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.id} className={"border-t border-black/5 " +
                (p.estado === "rechazado" ? "text-humo" : "")}>
                <td className="px-3 py-2 font-mono">{p.version}</td>
                <td className="px-3 py-2">{fecha(p.creado_en)}</td>
                <td className="px-3 py-2">{p.creado_por ?? "—"}</td>
                <td className="px-3 py-2">{p.ruta === "avaluo" ? "Avalúo" : p.ruta === "piso" ? "Piso" : "—"}</td>
                <td className="px-3 py-2 text-right font-mono">{pesos(p.precio_final)}</td>
                <td className={"px-3 py-2 " +
                  (p.estado === "autorizado" ? "text-teal-dark"
                    : p.estado === "rechazado" ? "text-red-700" : "text-dorado-dark")}>
                  {comoTermino(p)}
                  {p.notas && <div className="text-[11px] text-humo">{p.notas}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Una firma ────────────────────────────────────────────────────────
function Firma({ area, voto, motivo, nota, quien, cuando, suplido }: {
  area: string;
  voto: "aprobado" | "rechazado" | null;
  motivo: keyof typeof MOTIVOS | null;
  nota: string | null;
  quien: string | null;
  cuando: string | null;
  suplido: boolean;
}) {
  const color = voto === "aprobado" ? "text-teal-dark"
    : voto === "rechazado" ? "text-red-700" : "text-humo";
  const marca = voto === "aprobado" ? "✓" : voto === "rechazado" ? "✕" : "—";

  return (
    <div className="rounded-lg border border-black/10 px-3 py-2">
      <div className="flex items-center gap-1.5">
        <span className={"font-mono text-[15px] " + color}>{marca}</span>
        <span className="text-[12px] font-semibold text-tinta">{area}</span>
        {suplido && <span className="text-[11px] text-dorado-dark">suplencia</span>}
      </div>
      {motivo && <p className={"mt-1 text-[11px] " + color}>{MOTIVOS[motivo]}</p>}
      {nota && <p className="mt-0.5 text-[11px] text-tinta">{nota}</p>}
      <div className="mt-0.5 text-[11px] text-humo">
        {quien ? quien + " · " + fecha(cuando) : "Sin pronunciarse"}
      </div>
    </div>
  );
}
