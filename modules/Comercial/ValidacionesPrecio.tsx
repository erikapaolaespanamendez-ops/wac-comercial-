// =====================================================================
//  src/modules/Comercial/ValidacionesPrecio.tsx · JurisConecta
//
//  La bandeja de validaciones del Tablero. Dos partes:
//
//    1. La HOJA: un renglon por precio propuesto, como hoja de calculo,
//       con filtros y boton para bajarla a Excel.
//    2. El MINI BANNER: al hacer clic en un renglon se abre arriba una
//       tarjeta con TODO el precio y lo que puso cada quien —
//       Contabilidad, Comercial, la opinion de contingencias y la DGE —
//       con sus botones de aprobar y rechazar.
//
//  Las reglas NO viven aqui: viven en la base (fn_precio_votar) y en
//  src/lib/validacion-precio.ts. Esta pantalla solo pinta y pregunta.
// =====================================================================

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useMiRol } from "../CrmCliente/_compartido";
import {
  leerBandeja, votar, opinar, aQuienLeToca, puedeVotar, puedeSuplir,
  difZona, semaforoZona, pasoElTope, publicaraAlAutorizar, pesos, fecha,
  MOTIVOS,
  type PrecioBandeja, type RolVoto, type Motivo,
} from "../../lib/validacion-precio";

// El azul de Inmuebles Accesibles.
const C = {
  marino: "#0B2A4A",
  azul: "#1B5E9E",
  claro: "#EAF1F8",
  borde: "#D3DEEA",
  gris: "#6B7A8C",
  verde: "#1E7B4D",
  amarillo: "#B07A00",
  rojo: "#B3261E",
  blanco: "#FFFFFF",
};

const COLOR_SEMAFORO = {
  verde: C.verde, amarillo: C.amarillo, rojo: C.rojo, gris: C.gris,
} as const;

// A que rol de validacion corresponde cada rol del sistema.
//   GAD  -> firma Contabilidad
//   DGC  -> firma Comercial
//   DGE  -> firma al ultimo y desempata
//   GRC  -> opina la contingencia, no firma
// Los demas entran de mirones: ven la hoja pero sin botones.
function rolDeValidacion(rol: string): RolVoto | "CONTINGENCIAS" | null {
  if (rol === "GAD") return "CONTABILIDAD";
  if (rol === "DGC") return "COMERCIAL";
  if (rol === "DGE" || rol === "Super_Admin") return "DGE";
  if (rol === "GRC") return "CONTINGENCIAS";
  return null;
}

export default function ValidacionesPrecio() {
  const rolSistema = useMiRol() ?? "";
  const rol = rolDeValidacion(rolSistema);
  const [usuario, setUsuario] = useState("");
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setUsuario(data.session?.user?.email ?? ""));
  }, []);
  const [filas, setFilas] = useState<PrecioBandeja[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ver, setVer] = useState<"abiertos" | "cerrados">("abiertos");
  const [busca, setBusca] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);

  async function recargar() {
    setCargando(true);
    setError(null);
    try {
      setFilas(await leerBandeja(ver));
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { void recargar(); }, [ver]);

  const visibles = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return filas;
    return filas.filter((p) =>
      [p.garantia?.folio, p.garantia?.direccion, p.garantia?.municipio, p.garantia?.cartera?.nombre]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(t))
    );
  }, [filas, busca]);

  const seleccionado = visibles.find((p) => p.id === abierto) ?? null;

  // ── Bajar la hoja a Excel ──────────────────────────────────────────
  // Es un CSV con separador de punto y coma y BOM al inicio: asi Excel
  // en espanol lo abre en columnas y respeta los acentos.
  function descargar() {
    const cols = [
      "Folio", "Direccion", "Municipio", "Cartera", "m2", "Ruta", "Base",
      "Adeudos", "Descuento %", "Precio final", "Precio zona", "Dif zona %",
      "Contabilidad", "Comercial", "DGE", "Estado", "Propuso", "Fecha",
    ];
    const linea = (p: PrecioBandeja) => [
      p.garantia?.folio ?? "",
      p.garantia?.direccion ?? "",
      p.garantia?.municipio ?? "",
      p.garantia?.cartera?.nombre ?? "",
      p.garantia?.m2_construccion ?? "",
      p.ruta ?? "",
      (p.ruta === "avaluo" ? p.avaluo_comercial : p.precio_piso) ?? "",
      p.adeudos ?? "",
      p.descuento_pct ?? "",
      p.precio_final ?? "",
      p.precio_zona ?? p.precio_zona_sugerido ?? "",
      difZona(p)?.toFixed(1) ?? "",
      p.voto_contabilidad ?? "pendiente",
      p.voto_comercial ?? "pendiente",
      p.voto_dge ?? "pendiente",
      p.estado,
      p.creado_por ?? "",
      fecha(p.creado_en),
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";");

    const csv = "\uFEFF" + [cols.join(";"), ...visibles.map(linea)].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `validaciones-precio-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div style={{ padding: 20, background: C.blanco, minHeight: "100%" }}>
      {/* ── Encabezado ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ color: C.marino, margin: 0, fontSize: 22 }}>Validaciones de precio</h2>
        <span style={{ color: C.gris, fontSize: 14 }}>
          {visibles.length} {visibles.length === 1 ? "precio" : "precios"}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar folio, direccion, cartera…"
            style={inputBusca}
          />
          <select value={ver} onChange={(e) => setVer(e.target.value as typeof ver)} style={inputBusca}>
            <option value="abiertos">Pendientes</option>
            <option value="cerrados">Cerrados</option>
          </select>
          <button onClick={descargar} style={btnSecundario}>Descargar Excel</button>
          <button onClick={() => void recargar()} style={btnSecundario}>Actualizar</button>
        </div>
      </div>

      {error && <div style={aviso(C.rojo)}>{error}</div>}

      {/* ── El mini banner del renglon abierto ──────────────────────── */}
      {seleccionado && (
        <Banner
          p={seleccionado}
          rol={rol}
          usuario={usuario}
          onCerrar={() => setAbierto(null)}
          onListo={() => { setAbierto(null); void recargar(); }}
        />
      )}

      {/* ── La hoja ────────────────────────────────────────────────── */}
      <div style={{ overflowX: "auto", marginTop: 16, border: `1px solid ${C.borde}`, borderRadius: 8 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13, minWidth: 1180 }}>
          <thead>
            <tr style={{ background: C.claro, color: C.marino }}>
              {["Folio", "Direccion", "Municipio", "Cartera", "m2", "Ruta", "Base",
                "Adeudos", "Desc.", "Precio final", "Zona", "Dif.", "Cont.", "Com.",
                "DGE", "A quien le toca"].map((h) => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr><td colSpan={16} style={{ ...td, textAlign: "center", color: C.gris }}>Cargando…</td></tr>
            )}

            {!cargando && visibles.length === 0 && (
              <tr>
                <td colSpan={16} style={{ ...td, textAlign: "center", color: C.gris, padding: 24 }}>
                  No hay precios esperando validacion.
                </td>
              </tr>
            )}

            {!cargando && visibles.map((p) => {
              const d = difZona(p);
              return (
                <tr
                  key={p.id}
                  onClick={() => setAbierto(p.id === abierto ? null : p.id)}
                  style={{
                    cursor: "pointer",
                    background: p.id === abierto ? C.claro : C.blanco,
                    borderTop: `1px solid ${C.borde}`,
                  }}
                >
                  <td style={{ ...td, fontWeight: 600, color: C.marino }}>{p.garantia?.folio ?? "—"}</td>
                  <td style={{ ...td, maxWidth: 260, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {p.garantia?.direccion ?? "—"}
                  </td>
                  <td style={td}>{p.garantia?.municipio ?? "—"}</td>
                  <td style={td}>{p.garantia?.cartera?.nombre ?? "—"}</td>
                  <td style={tdNum}>{p.garantia?.m2_construccion ?? "—"}</td>
                  <td style={td}>{p.ruta === "avaluo" ? "Avaluo" : p.ruta === "piso" ? "Piso" : "—"}</td>
                  <td style={tdNum}>{pesos(p.ruta === "avaluo" ? p.avaluo_comercial : p.precio_piso)}</td>
                  <td style={tdNum}>{pesos(p.adeudos)}</td>
                  <td style={tdNum}>{p.descuento_pct ? `${p.descuento_pct}%` : "—"}</td>
                  <td style={{ ...tdNum, fontWeight: 700, color: C.marino }}>{pesos(p.precio_final)}</td>
                  <td style={tdNum}>{pesos(p.precio_zona ?? p.precio_zona_sugerido)}</td>
                  <td style={{ ...tdNum, color: COLOR_SEMAFORO[semaforoZona(p)], fontWeight: 600 }}>
                    {d === null ? "sin ref." : `${d > 0 ? "+" : ""}${d.toFixed(0)}%`}
                  </td>
                  <td style={td}><Pastilla voto={p.voto_contabilidad} suplido={p.voto_contabilidad_suplido} /></td>
                  <td style={td}><Pastilla voto={p.voto_comercial} suplido={p.voto_comercial_suplido} /></td>
                  <td style={td}><Pastilla voto={p.voto_dge} suplido={false} /></td>
                  <td style={{ ...td, color: p.estado === "desempate" ? C.rojo : C.gris }}>
                    {aQuienLeToca(p)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Pastilla de voto ─────────────────────────────────────────────────
function Pastilla({ voto, suplido }: { voto: string | null; suplido: boolean }) {
  const color = voto === "aprobado" ? C.verde : voto === "rechazado" ? C.rojo : C.gris;
  return (
    <span style={{ color, fontWeight: 600, whiteSpace: "nowrap" }}>
      {voto === "aprobado" ? "Si" : voto === "rechazado" ? "No" : "—"}
      {suplido && <span style={{ color: C.amarillo, fontWeight: 400 }} title="Firmado en suplencia por la DGE"> (supl.)</span>}
    </span>
  );
}

// =====================================================================
//  EL MINI BANNER
//  Todo el precio y lo que puso cada quien, en una sola tarjeta.
// =====================================================================
function Banner({
  p, rol, usuario, onCerrar, onListo,
}: {
  p: PrecioBandeja;
  rol: RolVoto | "CONTINGENCIAS" | null;
  usuario: string;
  onCerrar: () => void;
  onListo: () => void;
}) {
  const [motivo, setMotivo] = useState<Motivo>("zona");
  const [nota, setNota] = useState("");
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const meToca = rol !== null && rol !== "CONTINGENCIAS" && puedeVotar(p, rol);
  const puedoSuplir = rol !== null && rol !== "CONTINGENCIAS" && puedeSuplir(p, rol);
  const d = difZona(p);

  async function mandar(voto: "aprobado" | "rechazado", suplencia = false) {
    if (rol === null || rol === "CONTINGENCIAS") return;
    setOcupado(true);
    setErr(null);
    try {
      await votar({
        precioId: p.id, rol, usuario, voto,
        motivo: voto === "rechazado" ? motivo : undefined,
        nota: nota.trim() || undefined,
        suplencia,
      });
      onListo();
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setOcupado(false);
    }
  }

  async function mandarOpinion() {
    setOcupado(true);
    setErr(null);
    try {
      await opinar(p.id, usuario, texto);
      onListo();
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div style={{ marginTop: 16, border: `2px solid ${C.azul}`, borderRadius: 10, overflow: "hidden" }}>
      {/* Barra de titulo */}
      <div style={{ background: C.marino, color: C.blanco, padding: "10px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <strong>{p.garantia?.folio ?? "Garantia"}</strong>
        <span style={{ opacity: 0.85, fontSize: 13 }}>{p.garantia?.direccion}</span>
        <span style={{ marginLeft: "auto", fontSize: 13, opacity: 0.85 }}>Version {p.version}</span>
        <button onClick={onCerrar} style={{ ...btnSecundario, background: "transparent", color: C.blanco, borderColor: "rgba(255,255,255,.4)" }}>
          Cerrar
        </button>
      </div>

      <div style={{ padding: 16, background: C.blanco }}>
        {/* Avisos ------------------------------------------------------ */}
        {pasoElTope(p) && (
          <div style={aviso(C.amarillo)}>
            Esta garantia va en su tercer precio. Ya no es discusion de precio:
            toca decidir si se renegocia con la administradora o se cierra.
          </div>
        )}
        {p.estado === "desempate" && (
          <div style={aviso(C.rojo)}>
            Contabilidad y Comercial no coinciden. Este precio espera el desempate de la DGE.
          </div>
        )}
        {!publicaraAlAutorizar(p) && p.estado !== "autorizado" && (
          <div style={aviso(C.gris)}>
            Al autorizarse, el precio queda sellado pero la garantia NO se publica:
            le falta foto o link de mapas.
          </div>
        )}

        {/* Los numeros ------------------------------------------------- */}
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginTop: 12 }}>
          <Dato etiqueta="Ruta" valor={p.ruta === "avaluo" ? "Avaluo comercial" : "Precio piso"} />
          <Dato etiqueta="Base" valor={pesos(p.ruta === "avaluo" ? p.avaluo_comercial : p.precio_piso)} />
          <Dato etiqueta="Adeudos" valor={pesos(p.adeudos)} />
          <Dato etiqueta="Gastos juridicos" valor={pesos(p.gastos_juridicos)} />
          <Dato etiqueta="Honorarios" valor={p.honorarios_pct ? `${p.honorarios_pct}%` : "—"} />
          <Dato etiqueta="Descuento" valor={p.descuento_pct ? `${p.descuento_pct}%` : "—"} />
          <Dato etiqueta="Precio final" valor={pesos(p.precio_final)} grande />
          <Dato
            etiqueta="Precio en la zona"
            valor={
              p.precio_zona
                ? `${pesos(p.precio_zona)} (${p.precio_zona_fuente ?? "capturado"})`
                : p.precio_zona_sugerido
                ? `${pesos(p.precio_zona_sugerido)} (sugerido)`
                : "sin referencia todavia"
            }
          />
          {d !== null && (
            <Dato
              etiqueta="Contra la zona"
              valor={`${d > 0 ? "+" : ""}${d.toFixed(0)}%`}
              color={COLOR_SEMAFORO[semaforoZona(p)]}
            />
          )}
        </div>

        {p.notas && (
          <p style={{ marginTop: 12, color: C.gris, fontSize: 13 }}>
            <strong style={{ color: C.marino }}>Nota de quien lo calculo:</strong> {p.notas}
          </p>
        )}
        <p style={{ color: C.gris, fontSize: 12, marginTop: 4 }}>
          Propuesto por {p.creado_por ?? "—"} el {fecha(p.creado_en)}
        </p>

        {/* Lo que puso cada quien -------------------------------------- */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12, marginTop: 16 }}>
          <Voz
            area="Contabilidad"
            voto={p.voto_contabilidad}
            motivo={p.voto_contabilidad_motivo}
            nota={p.voto_contabilidad_nota}
            quien={p.firma_contabilidad}
            cuando={p.firma_contabilidad_fecha}
            suplido={p.voto_contabilidad_suplido}
          />
          <Voz
            area="Comercial"
            voto={p.voto_comercial}
            motivo={p.voto_comercial_motivo}
            nota={p.voto_comercial_nota}
            quien={p.firma_comercial}
            cuando={p.firma_comercial_fecha}
            suplido={p.voto_comercial_suplido}
          />
          <Voz
            area="DGE"
            voto={p.voto_dge}
            motivo={p.voto_dge_motivo}
            nota={p.voto_dge_nota}
            quien={p.firma_dge}
            cuando={p.firma_dge_fecha}
            suplido={false}
          />
          {/* Contingencias opina, no firma. */}
          <div style={caja}>
            <div style={{ color: C.marino, fontWeight: 700, fontSize: 13 }}>
              Contingencias <span style={{ fontWeight: 400, color: C.gris }}>· opina, no firma</span>
            </div>
            {p.opinion_contingencias ? (
              <>
                <p style={{ margin: "6px 0", fontSize: 13 }}>{p.opinion_contingencias}</p>
                <div style={{ color: C.gris, fontSize: 12 }}>
                  {p.opinion_contingencias_por} · {fecha(p.opinion_contingencias_en)}
                </div>
              </>
            ) : (
              <p style={{ margin: "6px 0", color: C.gris, fontSize: 13 }}>Sin opinion.</p>
            )}
          </div>
        </div>

        {err && <div style={aviso(C.rojo)}>{err}</div>}

        {/* Acciones ---------------------------------------------------- */}
        {rol === "CONTINGENCIAS" && p.estado !== "autorizado" && p.estado !== "rechazado" && (
          <div style={{ marginTop: 16 }}>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Tu opinion sobre la contingencia de este inmueble…"
              style={{ ...inputBusca, width: "100%", minHeight: 64 }}
            />
            <button onClick={() => void mandarOpinion()} disabled={ocupado || !texto.trim()} style={btnPrimario}>
              Asentar opinion
            </button>
          </div>
        )}

        {(meToca || puedoSuplir) && (
          <div style={{ marginTop: 16, borderTop: `1px solid ${C.borde}`, paddingTop: 14 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <select value={motivo} onChange={(e) => setMotivo(e.target.value as Motivo)} style={inputBusca}>
                {Object.entries(MOTIVOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Tu argumento (opcional al aprobar, recomendado al rechazar)"
                style={{ ...inputBusca, flex: 1, minWidth: 260 }}
              />
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button onClick={() => void mandar("aprobado", !meToca)} disabled={ocupado} style={btnPrimario}>
                Aprobar
              </button>
              <button onClick={() => void mandar("rechazado", !meToca)} disabled={ocupado} style={btnRechazo}>
                Rechazar
              </button>
              {!meToca && puedoSuplir && (
                <span style={{ color: C.amarillo, fontSize: 12, alignSelf: "center" }}>
                  Vas a firmar en suplencia. Queda asentado que lo firmo la DGE, no el area.
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Piezas chicas ────────────────────────────────────────────────────
function Dato({ etiqueta, valor, grande, color }: { etiqueta: string; valor: string; grande?: boolean; color?: string }) {
  return (
    <div>
      <div style={{ color: C.gris, fontSize: 11, textTransform: "uppercase", letterSpacing: .3 }}>{etiqueta}</div>
      <div style={{ color: color ?? C.marino, fontSize: grande ? 20 : 15, fontWeight: grande ? 800 : 600 }}>{valor}</div>
    </div>
  );
}

function Voz({ area, voto, motivo, nota, quien, cuando, suplido }: {
  area: string; voto: string | null; motivo: Motivo | null; nota: string | null;
  quien: string | null; cuando: string | null; suplido: boolean;
}) {
  const color = voto === "aprobado" ? C.verde : voto === "rechazado" ? C.rojo : C.gris;
  return (
    <div style={caja}>
      <div style={{ color: C.marino, fontWeight: 700, fontSize: 13 }}>
        {area}{" "}
        <span style={{ color, fontWeight: 700 }}>
          {voto === "aprobado" ? "· aprobo" : voto === "rechazado" ? "· rechazo" : "· pendiente"}
        </span>
        {suplido && <span style={{ color: C.amarillo, fontWeight: 400 }}> (suplencia DGE)</span>}
      </div>
      {motivo && <p style={{ margin: "6px 0 2px", fontSize: 13, color }}>{MOTIVOS[motivo]}</p>}
      {nota && <p style={{ margin: "2px 0", fontSize: 13 }}>{nota}</p>}
      <div style={{ color: C.gris, fontSize: 12, marginTop: 4 }}>
        {quien ? `${quien} · ${fecha(cuando)}` : "Sin pronunciarse"}
      </div>
    </div>
  );
}

// ── Estilos ──────────────────────────────────────────────────────────
const th: React.CSSProperties = { textAlign: "left", padding: "9px 10px", fontWeight: 700, whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "8px 10px", verticalAlign: "middle" };
const tdNum: React.CSSProperties = { ...td, textAlign: "right", whiteSpace: "nowrap" };
const caja: React.CSSProperties = { border: `1px solid ${C.borde}`, borderRadius: 8, padding: 12, background: C.blanco };
const inputBusca: React.CSSProperties = { padding: "7px 10px", border: `1px solid ${C.borde}`, borderRadius: 6, fontSize: 13, color: C.marino };
const btnPrimario: React.CSSProperties = { padding: "8px 18px", background: C.azul, color: C.blanco, border: "none", borderRadius: 6, fontWeight: 700, cursor: "pointer" };
const btnRechazo: React.CSSProperties = { ...btnPrimario, background: C.blanco, color: C.rojo, border: `1px solid ${C.rojo}` };
const btnSecundario: React.CSSProperties = { padding: "7px 12px", background: C.blanco, color: C.marino, border: `1px solid ${C.borde}`, borderRadius: 6, fontSize: 13, cursor: "pointer" };

function aviso(color: string): React.CSSProperties {
  return { marginTop: 12, padding: "9px 12px", borderLeft: `4px solid ${color}`, background: C.claro, color: C.marino, fontSize: 13, borderRadius: 4 };
}
