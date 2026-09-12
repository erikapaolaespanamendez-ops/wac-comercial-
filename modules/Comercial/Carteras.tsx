// =====================================================================
//  MÓDULO COMERCIAL · Carteras
//  →  src/modules/Comercial/Carteras.tsx
//
//  Dos vistas en un solo archivo:
//   · el listado de carteras, con su conteo
//   · la cartera abierta, con sus garantías
//
//  Lo que se puede hacer depende del NIVEL del rol en "carteras":
//   ver → solo mira · capturar → agrega y edita · validar → además cierra
// =====================================================================
import { useEffect, useMemo, useState } from "react";
import {
  listarCarteras, listarAdministradoras, garantiasDeCartera, money,
  type Cartera, type Administradora, type GarantiaCartera,
} from "../../data/carteras";
import {
  listarNiveles, listarVisibilidad, puedeCapturar, nivelDe, mostrarCampo, puedeVerCampo,
  type NivelModulo, type CampoVisibilidad,
} from "../../data/niveles";
import { useMiRol } from "../CrmCliente/_compartido";
import NuevaGarantia from "./NuevaGarantia";
import MandarPredictamen from "./MandarPredictamen";
import EditarGarantia from "./EditarGarantia";
import { estadoEnJF, type EstadoJF } from "../../lib/jf-predictamen";

// ── Tarjeta de una cartera ───────────────────────────────────────────
function TarjetaCartera({ c, nombre, admin, onAbrir }: {
  c: Cartera; nombre: string; admin: string; onAbrir: () => void;
}) {
  const sinDictaminar = c.total - c.dictaminadas;
  const propia = c.tipoOrigen === "PRO";

  return (
    <button onClick={onAbrir}
      className={"rounded-xl border bg-white p-3.5 text-left transition hover:shadow-sm " +
        (propia ? "border-aqua/60" : "border-black/10")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {/* El código de la cartera lo ve cualquiera; el nombre de la
              administradora ya viene enmascarado desde arriba según el
              permiso de quien entró. */}
          <div className="font-mono text-[10px] text-humo">{c.codigo ?? "sin código"}</div>
          <div className="truncate font-display text-[14px] font-semibold text-tinta">{nombre}</div>
          <div className="mt-0.5 truncate text-[11px] text-humo">{admin}</div>
          {c.actor && (
            <div className="mt-0.5 truncate text-[11px] text-humo" title={c.actor}>
              Actor: {c.actor}
            </div>
          )}
          <div className="mt-0.5 text-[11px] text-humo">
            {c.corteMes
              ? "Corte " + new Date(c.corteMes + "T12:00:00").toLocaleDateString("es-MX", { month: "long", year: "numeric" })
              : "Sin mes de corte"}
          </div>
        </div>
        <div className="shrink-0 font-mono text-[19px] font-bold text-teal-dark">{c.total}</div>
      </div>

      <div className="mt-3 flex h-[5px] overflow-hidden rounded-full bg-nube">
        {c.dictaminadas > 0 && <div className="bg-aqua-dark" style={{ flex: c.dictaminadas }} />}
        {sinDictaminar > 0 && <div className="bg-teal-light" style={{ flex: sinDictaminar }} />}
      </div>
      <div className="mt-1.5 text-[11px] text-humo">
        {c.total === 0
          ? "Sin garantías todavía"
          : c.dictaminadas > 0
            ? c.dictaminadas + " dictaminadas · " + sinDictaminar + " sin dictaminar"
            : c.total + " sin dictaminar"}
      </div>
    </button>
  );
}

// ── Un renglón de garantía ───────────────────────────────────────────
const DICTAMEN_NOMBRE: Record<string, string> = {
  apto: "Apto", no_apto: "No apto", condicionado: "Condicionado",
};

const ETAPAS_VIDA = [
  { clave: "en_cartera", nombre: "En cartera" },
  { clave: "en_predictamen", nombre: "Pre-dictamen" },
  { clave: "aprobada", nombre: "Aprobada" },
  { clave: "publicada", nombre: "Publicada" },
  { clave: "apartada", nombre: "Apartada" },
];

function LineaVida({ etapa }: { etapa: string }) {
  const idx = ETAPAS_VIDA.findIndex((e) => e.clave === etapa);
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto border-t border-black/5 bg-nube px-4 py-2.5">
      {ETAPAS_VIDA.map((e, i) => {
        const actual = i === idx, paso = idx >= 0 && i < idx;
        return (
          <div key={e.clave} className="flex shrink-0 items-center gap-1.5">
            {i > 0 && <span className={"h-px w-4 " + (paso || actual ? "bg-humo/40" : "bg-black/10")} />}
            <span className={"whitespace-nowrap rounded px-2 py-1 text-[10.5px] " +
              (actual ? "bg-teal font-semibold text-white" : paso ? "text-humo" : "text-black/25")}>
              {e.nombre}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Renglon({ g, vis, miRol, seleccionada, onSeleccionar, puedeMarcar, jf, onEditar }: {
  g: GarantiaCartera; vis: CampoVisibilidad[]; miRol: string | null;
  seleccionada: boolean; onSeleccionar: () => void; puedeMarcar: boolean;
  jf: EstadoJF | null; onEditar: (g: GarantiaCartera) => void;
}) {
  const enPredictamen = g.etapa !== "en_cartera";
  const credito = mostrarCampo(vis, miRol, "num_credito", g.numCredito);
  const chips = [g.etapaProcesal, g.sucursal, g.deudor].filter(Boolean) as string[];

  return (
    <article className={"overflow-hidden rounded-xl border bg-white " +
      (seleccionada ? "border-teal" : "border-black/10")}>
      <div className="flex">
        {/* Foto de fachada */}
        <div className="relative h-[104px] w-32 shrink-0 border-r border-black/10 bg-nube">
          {g.fotoFachada
            ? <img src={g.fotoFachada} alt="" className="h-full w-full object-cover" />
            : <div className="flex h-full w-full items-center justify-center text-humo/50">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" className="h-6 w-6">
                  <rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m21 16-5-5-6 6" />
                </svg>
              </div>}
          {g.lat != null && g.lng != null && (
            <a href={g.mapsLink || `https://www.google.com/maps?q=${g.lat},${g.lng}`}
              target="_blank" rel="noreferrer"
              className="absolute bottom-1.5 left-1.5 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-medium text-white">
              Ver mapa
            </a>
          )}
        </div>

        <div className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3">
          <button onClick={onSeleccionar} disabled={enPredictamen || !puedeMarcar}
            aria-label={seleccionada ? "Quitar de la selección" : "Seleccionar"}
            className={"mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded " +
              (enPredictamen || !puedeMarcar ? "cursor-not-allowed border border-black/10 bg-nube"
                : seleccionada ? "bg-teal text-white" : "border border-black/20 hover:border-teal")}>
            {seleccionada && <span className="text-[10px] leading-none">✓</span>}
          </button>

          <div className="min-w-0 flex-1">
            <div className="font-mono text-[11px] text-humo">
              {g.folio} · Créd. {credito}{g.estadoMx ? " · " + g.estadoMx : ""}
            </div>
            <h3 onClick={() => onEditar(g)} className="mt-0.5 cursor-pointer truncate font-display text-[14px] font-semibold text-tinta hover:text-teal">{g.direccion}</h3>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {chips.map((c, i) => (
                <span key={i} className={"rounded px-2 py-0.5 text-[10.5px] " +
                  (i === 0 ? "bg-teal-soft text-teal-dark" : "bg-nube text-humo")}>{c}</span>
              ))}
              {!g.m2Construccion && <span className="rounded bg-dorado/15 px-2 py-0.5 text-[10.5px] text-dorado-dark">Sin metros</span>}
              {!g.fotoFachada && <span className="rounded bg-dorado/15 px-2 py-0.5 text-[10.5px] text-dorado-dark">Sin foto</span>}
              {(g.lat == null || g.lng == null) && <span className="rounded bg-dorado/15 px-2 py-0.5 text-[10.5px] text-dorado-dark">Sin mapa</span>}
              {!g.avaluoComercial && <span className="rounded bg-dorado/15 px-2 py-0.5 text-[10.5px] text-dorado-dark">Sin avalúo</span>}
              {g.jfPredictamenId && <span className="rounded bg-teal-soft px-2 py-0.5 text-[10.5px] text-teal-dark">{g.jfPredictamenId}</span>}
            </div>
          </div>

          <div className="shrink-0 text-right">
            <div className="text-[10.5px] text-humo">Adeudo</div>
            <div className="mt-0.5 font-mono text-[15px] font-semibold text-teal-dark">{money(g.adeudoInicial)}</div>
            {jf?.resultado && (
              <div className={"mt-1 rounded px-2 py-0.5 text-[10.5px] font-semibold " +
                (jf.resultado === "apto" ? "bg-aqua-soft text-aqua-dark"
                  : jf.resultado === "condicionado" ? "bg-dorado/15 text-dorado-dark"
                  : "bg-red-50 text-red-700")}>
                {DICTAMEN_NOMBRE[jf.resultado] || jf.resultado}
              </div>
            )}
            {jf && !jf.resultado && (
              <div className="mt-1 text-[10.5px] text-humo">{jf.abogado ? "Con " + jf.abogado : "Sin dictaminar"}</div>
            )}
          </div>
        </div>
      </div>
      <LineaVida etapa={g.etapa} />
    </article>
  );
}

// ── La pantalla ──────────────────────────────────────────────────────
export default function Carteras() {
  const miRol = useMiRol();

  const [carteras, setCarteras] = useState<Cartera[]>([]);
  const [admins, setAdmins] = useState<Administradora[]>([]);
  const [niveles, setNiveles] = useState<NivelModulo[]>([]);
  const [vis, setVis] = useState<CampoVisibilidad[]>([]);
  const [cargando, setCargando] = useState(true);

  const [abierta, setAbierta] = useState<Cartera | null>(null);
  const [garantias, setGarantias] = useState<GarantiaCartera[]>([]);
  const [cargandoG, setCargandoG] = useState(false);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [dandoAlta, setDandoAlta] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [mandando, setMandando] = useState(false);
  const [editando, setEditando] = useState<GarantiaCartera | null>(null);
  const [estadosJF, setEstadosJF] = useState<Record<string, EstadoJF | null>>({});

  async function recargarCarteras() {
    const c = await listarCarteras();
    setCarteras(c);
    return c;
  }

  useEffect(() => {
    Promise.all([listarCarteras(), listarAdministradoras(), listarNiveles(), listarVisibilidad()])
      .then(([c, a, n, v]) => {
        setCarteras(c); setAdmins(a); setNiveles(n); setVis(v); setCargando(false);
      });
  }, []);

  async function abrir(c: Cartera) {
    setAbierta(c); setCargandoG(true); setMarcadas(new Set()); setBusqueda("");
    const g = await garantiasDeCartera(c.id);
    setGarantias(g); setCargandoG(false);

    // Para las que ya tienen asunto en JusticiaFácil, se lee en vivo cómo
    // va el dictamen. Si no responde, el renglón se queda igual.
    const conCaso = g.filter((x) => x.jfCasoId);
    if (conCaso.length) {
      const pares = await Promise.all(
        conCaso.map(async (x) => [x.id, await estadoEnJF(x.jfCasoId as string)] as const));
      setEstadosJF(Object.fromEntries(pares));
    } else { setEstadosJF({}); }
  }

  const puedeEditar = puedeCapturar(niveles, miRol, "carteras");
  const nivel = nivelDe(niveles, miRol, "carteras");

  // El nombre real de la administradora se enmascara con el código.
  // Si este rol puede ver el nombre real de la administradora. Sale de
  // campo_visibilidad, la misma regla que usa el resto del sistema.
  const verNombreAdmin = puedeVerCampo(vis, miRol, "administradora_nombre");

  function nombreAdmin(codigo: string | null): string {
    if (!codigo) return "Sin administradora";
    const a = admins.find((x) => x.codigo === codigo);
    return mostrarCampo(vis, miRol, "administradora_nombre", a?.nombre ?? null, codigo);
  }

  // Igual que la administradora: el nombre de la cartera solo lo ve quien
  // tenga el permiso. Los demas ven el codigo de la cartera.
  function nombreCartera(k: Cartera): string {
    return mostrarCampo(vis, miRol, "cartera_nombre", k.nombre ?? null, k.codigo ?? null);
  }

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return garantias;
    return garantias.filter((g) =>
      g.direccion.toLowerCase().includes(q) ||
      (g.numCredito || "").toLowerCase().includes(q) ||
      (g.deudor || "").toLowerCase().includes(q));
  }, [garantias, busqueda]);

  function alternar(id: string) {
    setMarcadas((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }

  if (cargando) return <p className="py-16 text-center text-sm text-humo">Cargando carteras…</p>;

  if (nivel === "sin_acceso") {
    return (
      <div className="px-6 py-20 text-center">
        <p className="font-display text-base font-semibold text-tinta">Sin acceso a Carteras</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-humo">
          Tu rol no tiene permiso para esta pantalla. Se cambia en Configuración, Roles y permisos.
        </p>
      </div>
    );
  }

  // ── Cartera abierta ──
  if (abierta) {
    return (
      <div className="px-6 pb-8">
        <button onClick={() => { setAbierta(null); setDandoAlta(false); recargarCarteras(); }}
          className="mt-4 text-[12px] text-humo hover:text-tinta">← Carteras</button>

        <div className="mt-2 flex flex-wrap items-start justify-between gap-3 border-b border-black/5 pb-4">
          <div>
            <h1 className="font-display text-xl font-bold text-tinta">{nombreCartera(abierta)}</h1>
            <p className="mt-0.5 text-[12px] text-humo">
              {/* Se muestra SIEMPRE el código de la administradora, además
                  del nombre cuando el rol lo puede ver. Así contingencias
                  y el director comercial —que ven ADM-00X y no el nombre—
                  igual saben de quién llegó esta cartera. */}
              <span className="font-mono">{abierta.codigo ?? "sin código"}</span>
              {abierta.administradoraCodigo && (
                <> · <span className="font-mono">{abierta.administradoraCodigo}</span></>
              )}
              {verNombreAdmin && abierta.administradoraCodigo && (
                <> · {nombreAdmin(abierta.administradoraCodigo)}</>
              )}
              {" · "}{garantias.length} garantías
              {abierta.actor && <> · Actor: {abierta.actor}</>}
            </p>
          </div>
          {puedeEditar && !dandoAlta && (
            <button onClick={() => setDandoAlta(true)}
              className="rounded-lg border border-black/10 px-3 py-2 text-[12px] font-medium text-humo hover:bg-nube">
              + Agregar garantía
            </button>
          )}
        </div>

        {editando && (
          <EditarGarantia garantiaId={editando.id} miRol={miRol}
            onCerrar={() => setEditando(null)}
            onGuardado={() => abrir(abierta)} />
        )}

        {mandando && (
          <div className="mt-4">
            <MandarPredictamen
              miRol={miRol}
              garantias={garantias.filter((x) => marcadas.has(x.id)).map((x) => ({
                id: x.id, folio: x.folio, numCredito: x.numCredito, direccion: x.direccion,
                deudor: x.deudor, estadoMx: x.estadoMx, etapaProcesal: x.etapaProcesal,
                m2Terreno: x.m2Terreno, m2Construccion: x.m2Construccion, fotoFachada: x.fotoFachada,
                lat: x.lat, lng: x.lng, avaluoComercial: x.avaluoComercial,
                administradoraCodigo: abierta?.administradoraCodigo ?? null,
              }))}
              onCerrar={() => setMandando(false)}
              onListo={async () => { setMandando(false); setMarcadas(new Set()); await abrir(abierta); }}
            />
          </div>
        )}

        {dandoAlta && (
          <div className="mt-4">
            <NuevaGarantia
              carteraId={abierta.id}
              carteraNombre={nombreCartera(abierta)}
              miRol={miRol}
              onCancelar={() => setDandoAlta(false)}
              onListo={async () => { setDandoAlta(false); await abrir(abierta); }}
            />
          </div>
        )}

        {marcadas.size > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-teal-soft px-4 py-3">
            <span className="text-[12.5px] font-semibold text-teal-dark">
              {marcadas.size} garantía{marcadas.size === 1 ? "" : "s"} seleccionada{marcadas.size === 1 ? "" : "s"}
            </span>
            <div className="flex gap-2">
              <button onClick={() => setMarcadas(new Set())}
                className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-[12px] font-medium text-humo">
                Quitar selección
              </button>
              {/* Aquí había un segundo botón de "Mandar a pre-dictaminar".
                  Se quitó el 07-09-2026: mandar se hace desde el Catálogo,
                  en la ficha o en el menú de Acciones del renglón. Tener el
                  mismo botón en tres pantallas era pedir que se mandara dos
                  veces la misma garantía. */}
            </div>
          </div>
        )}

        <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Crédito, deudor o dirección"
          className="mt-4 w-full rounded-lg border border-black/10 bg-nube px-3 py-2 text-[12.5px] outline-none focus:border-teal focus:bg-white" />

        <div className="mt-2 space-y-2.5">
          {cargandoG && <p className="py-12 text-center text-sm text-humo">Cargando garantías…</p>}
          {!cargandoG && garantias.length === 0 && (
            <div className="rounded-xl border border-dashed border-black/15 px-6 py-14 text-center">
              <p className="font-display text-[15px] font-semibold text-tinta">Esta cartera está vacía</p>
              <p className="mx-auto mt-1 max-w-sm text-[13px] text-humo">
                {puedeEditar ? "Usa “Agregar garantía” para dar de alta la primera." : "Todavía no tiene garantías."}
              </p>
            </div>
          )}
          {!cargandoG && garantias.length > 0 && filtradas.length === 0 && (
            <p className="py-12 text-center text-sm text-humo">Ninguna coincide con esa búsqueda.</p>
          )}
          {filtradas.map((g) => (
            <Renglon key={g.id} g={g} vis={vis} miRol={miRol}
              seleccionada={marcadas.has(g.id)} onSeleccionar={() => alternar(g.id)}
              puedeMarcar={puedeEditar} jf={estadosJF[g.id] ?? null} onEditar={setEditando} />
          ))}
        </div>
      </div>
    );
  }

  // ── Listado ──
  const totalGarantias = carteras.reduce((s, c) => s + c.total, 0);

  return (
    <div className="px-6 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black/5 py-4">
        <div>
          <h1 className="font-display text-xl font-bold text-tinta">Carteras</h1>
          <p className="mt-0.5 text-[12px] text-humo">
            {carteras.length} carteras · {totalGarantias} garantías
          </p>
        </div>
        {nivel === "validar" && (
          <button disabled title="El importador de Excel es el siguiente paso"
            className="cursor-not-allowed rounded-lg border border-black/10 px-3 py-2 text-[12px] font-medium text-humo/50">
            Subir Excel
          </button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {carteras.map((c) => (
          <TarjetaCartera key={c.id} c={c} nombre={nombreCartera(c)} admin={nombreAdmin(c.administradoraCodigo)} onAbrir={() => abrir(c)} />
        ))}
      </div>

      {carteras.length === 0 && (
        <p className="py-16 text-center text-sm text-humo">Todavía no hay carteras dadas de alta.</p>
      )}
    </div>
  );
}
