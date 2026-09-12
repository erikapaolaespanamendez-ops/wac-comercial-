// =====================================================================
//  MÓDULO COMERCIAL · Catálogo de Proyectos
//  →  src/modules/Comercial/CatalogoProyectos.tsx
//
//  La vitrina de los DESARROLLOS PROPIOS. Aquí no hay créditos, ni
//  deudores, ni juicios, ni pre-dictamen: son inmuebles de DIIPA que se
//  venden por unidades, con precio de lista y Promesa de Compraventa.
//  Por eso viven en su propia pantalla y no revueltos con las cesiones.
//
//  Cada proyecto se pinta con SU marca —el logo y los dos colores que
//  trae la cartera—, no con la paleta de Inmuebles Accesibles. Un local
//  de Plaza Leville se le enseña al cliente con la cara de Leville.
// =====================================================================
import { useEffect, useMemo, useState } from "react";
import {
  listarProyectos, porPlanta, money,
  type Proyecto, type Unidad,
} from "../../data/proyectos";
import FichaUnidad from "./FichaUnidad";

// ── Qué se le dice al asesor de cada etapa ───────────────────────────
// La etapa de la base es de sistema; esto es lo que se lee en pantalla.
const DISPONIBILIDAD: Record<string, { texto: string; libre: boolean }> = {
  en_cartera:     { texto: "En preparación", libre: false },
  en_predictamen: { texto: "En preparación", libre: false },
  aprobada:       { texto: "Disponible",     libre: true },
  publicada:      { texto: "Disponible",     libre: true },
  apartada:       { texto: "Apartado",       libre: false },
  vendida:        { texto: "Vendido",        libre: false },
  cerrada:        { texto: "No disponible",  libre: false },
};

// ── El precio de una unidad ──────────────────────────────────────────
// Es lo más grande de la tarjeta a propósito: es lo primero que busca
// quien cotiza. La regla del catálogo se respeta igual aquí — mientras
// el precio no esté aprobado se marca que está en validación.
function Precio({ u, acento }: { u: Unidad; acento: string }) {
  const aprobado = u.precioEstado === "aprobado";
  return (
    <div>
      <div
        className="font-display text-[26px] font-bold leading-none tracking-tight text-white"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {money(u.precio)}
      </div>
      <div className="mt-1.5 text-[11px] text-white/70">
        {aprobado ? "MXN, precio de lista" : "MXN, en validación"}
        {u.m2 ? " · " + money(u.precio && u.m2 ? u.precio / u.m2 : null) + " por m²" : ""}
      </div>
      {!aprobado && (
        <div className="mt-1 text-[11px]" style={{ color: acento }}>
          Falta autorización de precio
        </div>
      )}
    </div>
  );
}

// ── Una unidad ───────────────────────────────────────────────────────
function TarjetaUnidad({ u, marca, acento, onAbrir }: {
  u: Unidad; marca: string; acento: string; onAbrir: () => void;
}) {
  const d = DISPONIBILIDAD[u.etapa] ?? DISPONIBILIDAD.en_cartera;

  // El plano es lo primero de la tarjeta: en un local vacío el dibujo
  // dice más que una foto de la fachada, que además es la misma para
  // los ocho. La fachada se ve en la portada, arriba.
  const plano = u.galeria[0]?.url ?? u.fotoFachada;

  return (
    <article
      className="overflow-hidden rounded-2xl border bg-white transition hover:shadow-md"
      style={{ borderColor: marca + "22" }}
    >
      {/* Toda la tarjeta abre la ficha. Va como botón y no como div con
          clic para que también se llegue con el tabulador. */}
      <button
        onClick={onAbrir}
        className="block w-full text-left focus-visible:outline focus-visible:outline-2"
        aria-label={"Abrir la ficha de " + u.nombre}
      >
      {plano && (
        <div className="bg-nube">
          <img
            src={plano}
            alt={"Plano de " + u.nombre}
            loading="lazy"
            className="h-40 w-full object-contain"
          />
        </div>
      )}

      {/* Franja de marca: número de la unidad y disponibilidad */}
      <header
        className="flex items-baseline justify-between gap-3 px-5 py-3.5"
        style={{ backgroundColor: marca }}
      >
        <h4 className="font-display text-[15px] font-semibold text-white">{u.nombre}</h4>
        <span
          className="shrink-0 text-[11px] font-medium"
          style={{ color: d.libre ? acento : "rgba(255,255,255,.55)" }}
        >
          {d.texto}
        </span>
      </header>

      {/* El precio, sobre el mismo fondo de marca para que pese */}
      <div className="px-5 pb-5" style={{ backgroundColor: marca }}>
        <Precio u={u} acento={acento} />
      </div>

      {/* Los datos duros */}
      </button>

      <dl className="grid grid-cols-3 gap-px bg-black/5">
        {[
          ["Superficie", u.m2 ? u.m2.toFixed(2) + " m²" : "—"],
          ["Nivel", u.planta ? u.planta.replace(/^planta /, "Planta ") : "—"],
          ["Baños", u.banos != null ? String(u.banos) : "—"],
        ].map(([et, val]) => (
          <div key={et} className="bg-white px-4 py-3">
            <dt className="text-[10.5px] text-humo">{et}</dt>
            <dd className="mt-0.5 text-[13px] font-medium text-tinta">{val}</dd>
          </div>
        ))}
      </dl>

      <footer className="flex items-center justify-between gap-3 px-5 py-3">
        <span className="font-mono text-[10.5px] text-humo">{u.folio}</span>
        {u.apartado != null && (
          <span className="text-[11px] text-humo">
            Apartado {money(u.apartado)}
          </span>
        )}
      </footer>
    </article>
  );
}

// ── La portada del proyecto ──────────────────────────────────────────
function Portada({ p }: { p: Proyecto }) {
  const disponibles = p.unidades.filter(
    (u) => (DISPONIBILIDAD[u.etapa] ?? DISPONIBILIDAD.en_cartera).libre,
  ).length;
  const m2 = p.unidades.reduce((s, u) => s + (u.m2 ?? 0), 0);
  const valor = p.unidades.reduce((s, u) => s + (u.precio ?? 0), 0);

  return (
    <section
      className="relative overflow-hidden rounded-2xl px-7 py-7 md:px-9"
      style={{ backgroundColor: p.colorMarca }}
    >
      {/* La fachada al atardecer, atrás. Va velada con el color de la
          marca para que el texto encima se siga leyendo; sin el velo,
          el cielo claro del render se come el nombre del proyecto. */}
      {p.portada && (
        <>
          <img
            src={p.portada}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(100deg, " + p.colorMarca + "F2 0%, " +
                p.colorMarca + "E0 46%, " + p.colorMarca + "99 100%)",
            }}
          />
        </>
      )}

      <div className="relative flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          {p.logoUrl ? (
            <img src={p.logoUrl} alt={p.nombre} className="h-14 w-auto md:h-16" />
          ) : (
            <h2 className="font-display text-2xl font-bold text-white">{p.nombre}</h2>
          )}
          <p className="mt-4 max-w-md text-[13px] leading-relaxed text-white/75">
            {[p.direccion, p.municipio, p.estado].filter(Boolean).join(", ")}
          </p>
        </div>

        {p.precioM2 != null && (
          <div className="text-right">
            <div
              className="font-display text-[30px] font-bold leading-none"
              style={{ color: p.colorAcento, fontVariantNumeric: "tabular-nums" }}
            >
              {money(p.precioM2)}
            </div>
            <div className="mt-1.5 text-[11px] text-white/65">precio de lista por m²</div>
          </div>
        )}
      </div>

      <div
        className="relative mt-7 grid grid-cols-2 gap-y-5 border-t pt-5 md:grid-cols-4"
        style={{ borderColor: p.colorAcento + "44" }}
      >
        {[
          ["Unidades", String(p.unidades.length)],
          ["Disponibles", String(disponibles)],
          ["Superficie vendible", m2 ? m2.toFixed(2) + " m²" : "—"],
          ["Valor del proyecto", money(valor)],
        ].map(([et, val]) => (
          <div key={et}>
            <div className="text-[11px] text-white/60">{et}</div>
            <div
              className="mt-1 font-display text-[17px] font-semibold text-white"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {val}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── La pantalla ──────────────────────────────────────────────────────
export default function CatalogoProyectos() {
  const [lista, setLista] = useState<Proyecto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [unidad, setUnidad] = useState<Unidad | null>(null);

  useEffect(() => {
    let vivo = true;
    listarProyectos().then((r) => {
      if (!vivo) return;
      setLista(r);
      setAbierto(r[0]?.id ?? null);
      setCargando(false);
    });
    return () => { vivo = false; };
  }, []);

  const proyecto = useMemo(
    () => lista.find((p) => p.id === abierto) ?? null,
    [lista, abierto],
  );

  if (cargando) {
    return <p className="py-20 text-center text-sm text-humo">Cargando proyectos…</p>;
  }

  if (!lista.length) {
    return (
      <div className="mx-6 my-8 rounded-2xl border border-dashed border-black/15 px-6 py-16 text-center">
        <p className="font-display text-base font-semibold text-tinta">
          Todavía no hay proyectos propios
        </p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-humo">
          Un proyecto es un desarrollo de DIIPA que se vende por unidades. Se da
          de alta como cartera propia y se marca como proyecto.
        </p>
      </div>
    );
  }

  return (
    <div className="px-6 py-6">
      {/* Si algún día hay más de un desarrollo, se escogen aquí. Con uno
          solo no se pinta nada: sería una fila con un botón. */}
      {lista.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {lista.map((p) => (
            <button
              key={p.id}
              onClick={() => setAbierto(p.id)}
              className={
                "rounded-lg px-3.5 py-2 text-xs font-medium transition " +
                (p.id === abierto ? "text-white" : "bg-nube text-humo hover:text-tinta")
              }
              style={p.id === abierto ? { backgroundColor: p.colorMarca } : undefined}
            >
              {p.nombre}
            </button>
          ))}
        </div>
      )}

      {proyecto && (
        <>
          <Portada p={proyecto} />

          {porPlanta(proyecto.unidades).map((grupo, i) => (
            <div key={i} className="mt-8">
              {grupo.titulo && (
                <h3 className="mb-3 font-display text-[13px] font-semibold text-tinta">
                  {grupo.titulo.replace(/^planta /, "Planta ")}
                </h3>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {grupo.unidades.map((u) => (
                  <TarjetaUnidad
                    key={u.id}
                    u={u}
                    marca={proyecto.colorMarca}
                    acento={proyecto.colorAcento}
                    onAbrir={() => setUnidad(u)}
                  />
                ))}
              </div>
            </div>
          ))}

          {unidad && (
            <FichaUnidad u={unidad} p={proyecto} onCerrar={() => setUnidad(null)} />
          )}

          {proyecto.notas && (
            <p className="mt-8 max-w-2xl text-[12.5px] leading-relaxed text-humo">
              {proyecto.notas}
            </p>
          )}
        </>
      )}
    </div>
  );
}
