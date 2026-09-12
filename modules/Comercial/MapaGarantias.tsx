// =====================================================================
//  MÓDULO COMERCIAL · Mapa de garantías
//  →  src/modules/Comercial/MapaGarantias.tsx
//
//  La tercera vista del Catálogo (Lista / Catálogo / Mapa). Enseña en un
//  mapa grande dónde está cada garantía que tenga coordenadas.
//
//  DE DÓNDE SALEN LOS DATOS:
//  De la MISMA función que la lista y la vitrina — listarGarantias() de
//  src/data/garantias.ts. No hay consulta nueva ni tabla nueva: se usan
//  lat, lng, tipo_inmueble, foto_fachada, etapa, dirección, recámaras,
//  metros y el precio con su estado, tal como ya vienen.
//
//  CÓMO SE LEE EL MAPA:
//    · el COLOR del pin dice la ETAPA (los mismos colores de la vitrina)
//    · el DIBUJO de adentro dice el TIPO de inmueble (casa, terreno…)
//  Son dos cosas distintas en dos señales distintas: si el color cargara
//  las dos, habría que memorizar doce combinaciones.
//
//  LA LIBRERÍA DEL MAPA:
//  Se usa Leaflet con mapas de OpenStreetMap, que es gratis y no pide
//  llave ni tarjeta. NO se instala con npm: se baja sola del CDN la
//  primera vez que alguien abre esta pestaña (función cargarLeaflet de
//  abajo). Así Jhon no tiene que instalar nada ni tocar package.json, y
//  quien nunca entre al mapa no descarga ni un byte de más.
// =====================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import {
  listarGarantias, precioMostrado, money, ETAPAS, etapaNombre,
  type Garantia,
} from "../../data/garantias";
import { SUCURSALES } from "../../data/roles";
import { listarProyectos, money as moneyProy, type Proyecto } from "../../data/proyectos";

// ── Colores de los pines, por etapa ──────────────────────────────────
// Son los MISMOS de las etiquetas de la vitrina, para no aprender otra
// clave de colores. Van en hexadecimal y no en clases de Tailwind porque
// el pin se arma como texto HTML suelto para Leaflet, fuera de React, y
// ahí las clases del proyecto no aplican.
const COLOR_ETAPA: Record<string, string> = {
  en_cartera:     "#64748B", // humo
  en_predictamen: "#C9A227", // dorado
  aprobada:       "#0C2E66", // azul marino oscuro
  publicada:      "#1E50A0", // azul marino
  apartada:       "#009B94", // turquesa
  vendida:        "#1A2233", // tinta
};

// ── El dibujo de adentro del pin, por tipo de inmueble ───────────────
// Cada uno es un trazo simple en blanco. Se guardan como texto para
// poder pegarlos dentro del pin.
const DIBUJO_TIPO: Record<string, string> = {
  "Terreno":
    '<path d="M4 7h16v10H4z" stroke-dasharray="3 2"/>',
  "Casa de una planta":
    '<path d="M3 11l9-6 9 6v9H3z"/><path d="M9 20v-5h6v5"/>',
  "Casa de dos plantas":
    '<path d="M4 21V6l8-3 8 3v15"/><path d="M4 12h16"/><path d="M10 21v-4h4v4"/>',
  "Casa en condominio":
    '<path d="M3 21V9l5-3 5 3v12"/><path d="M13 21V12l4-2 4 2v9"/>',
  "Departamento":
    '<path d="M5 21V4h10v17"/><path d="M8 8h1M12 8h1M8 12h1M12 12h1"/><path d="M15 21V10h4v11"/>',
  "Local comercial":
    '<path d="M4 8h16l-1 4H5z"/><path d="M5 12v9h14v-9"/>',
  "Bodega":
    '<path d="M3 21V9l9-4 9 4v12"/><path d="M7 21v-7h10v7"/>',
};
const DIBUJO_GENERICO = '<circle cx="12" cy="12" r="5"/>';

function dibujoDe(tipo: string | null): string {
  if (!tipo) return DIBUJO_GENERICO;
  return DIBUJO_TIPO[tipo] || DIBUJO_GENERICO;
}

// ── Cargar Leaflet una sola vez ──────────────────────────────────────
// La primera vez baja el CSS y el JS del CDN; las veces siguientes ya
// están en memoria y regresa de inmediato. La promesa se guarda en esta
// variable para que dos pestañas abiertas a la vez no lo bajen dos veces.
let promesaLeaflet: Promise<unknown> | null = null;

function cargarLeaflet(): Promise<unknown> {
  const w = window as unknown as { L?: unknown };
  if (w.L) return Promise.resolve(w.L);
  if (promesaLeaflet) return promesaLeaflet;

  const base = "https://unpkg.com/leaflet@1.9.4/dist/";
  const cluster = "https://unpkg.com/leaflet.markercluster@1.5.3/dist/";

  const hoja = (href: string) =>
    new Promise<void>((listo) => {
      if (document.querySelector('link[href="' + href + '"]')) return listo();
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = href;
      l.onload = () => listo();
      l.onerror = () => listo();     // si falla el CSS el mapa igual sirve
      document.head.appendChild(l);
    });

  const script = (src: string) =>
    new Promise<void>((listo, falla) => {
      const ya = document.querySelector('script[src="' + src + '"]');
      if (ya) { ya.addEventListener("load", () => listo()); return listo(); }
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => listo();
      s.onerror = () => falla(new Error("No se pudo bajar " + src));
      document.head.appendChild(s);
    });

  // El orden importa: primero Leaflet, y hasta después el agrupador, que
  // necesita que Leaflet ya exista para engancharse.
  promesaLeaflet = Promise.all([
    hoja(base + "leaflet.css"),
    hoja(cluster + "MarkerCluster.css"),
    hoja(cluster + "MarkerCluster.Default.css"),
  ])
    .then(() => script(base + "leaflet.js"))
    .then(() => script(cluster + "leaflet.markercluster.js").catch(() => undefined))
    .then(() => (window as unknown as { L: unknown }).L);

  return promesaLeaflet;
}

// ── El pin ───────────────────────────────────────────────────────────
// Un círculo del color de la etapa con el dibujo del tipo adentro y un
// borde blanco para que se despegue del mapa.
function pinHTML(g: Garantia): string {
  const color = COLOR_ETAPA[g.etapa] || "#64748B";
  return (
    '<div style="width:32px;height:32px;border-radius:50%;background:' + color +
    ';border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.35);' +
    'display:flex;align-items:center;justify-content:center">' +
    '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#fff" ' +
    'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
    dibujoDe(g.tipoInmueble) + "</svg></div>"
  );
}

// ── El globito que sale al hacer clic ────────────────────────────────
// Lleva la foto, la etapa, la dirección, las características y el precio
// con la MISMA regla de la vitrina: si todavía no juntó las tres firmas,
// se anuncia como "Próximo precio" y no como precio autorizado.
function globoHTML(g: Garantia): string {
  const precio = precioMostrado(g);
  const color = COLOR_ETAPA[g.etapa] || "#64748B";

  const foto = g.fotoFachada
    ? '<img src="' + g.fotoFachada + '" alt="" style="width:100%;height:110px;object-fit:cover">'
    : '<div style="height:110px;background:#F4F6FA;display:flex;align-items:center;' +
      'justify-content:center;color:#94A3B8;font-size:11px">Sin foto</div>';

  const datos = [
    g.tipoInmueble,
    g.recamaras ? g.recamaras + " rec." : null,
    g.m2Terreno ? g.m2Terreno + " m² terreno" : null,
  ].filter(Boolean).join(" · ");

  let bloquePrecio: string;
  if (precio.monto == null) {
    bloquePrecio = '<p style="margin:8px 0 0;font-size:12px;font-style:italic;color:#64748B">Precio no publicado</p>';
  } else if (precio.estado === "propuesto") {
    bloquePrecio =
      '<p style="margin:8px 0 0;font-size:10px;font-weight:600;letter-spacing:.04em;color:#A6852E">PRÓXIMO PRECIO</p>' +
      '<p style="margin:1px 0 0;font-size:17px;font-weight:700;color:#A6852E">' + money(precio.monto) + "</p>" +
      '<p style="margin:0;font-size:11px;color:#A6852E">En validación</p>';
  } else {
    bloquePrecio =
      '<p style="margin:8px 0 0;font-size:17px;font-weight:700;color:#0C2E66">' + money(precio.monto) + "</p>";
  }

  return (
    '<div style="width:250px;margin:-13px -20px -13px -20px">' +
    foto +
    '<div style="padding:10px 12px 12px">' +
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">' +
        '<span style="font-size:10.5px;color:#fff;background:' + color +
        ';border-radius:20px;padding:2px 8px">' + etapaNombre(g.etapa) + "</span>" +
        '<span style="font-size:10.5px;color:#94A3B8">' + g.folio + "</span>" +
      "</div>" +
      '<p style="margin:0;font-size:13px;font-weight:600;line-height:1.35;color:#1A2233">' +
        g.direccion + "</p>" +
      (datos ? '<p style="margin:4px 0 0;font-size:11.5px;color:#64748B">' + datos + "</p>" : "") +
      bloquePrecio +
      '<button data-abrir="' + g.id + '" style="margin-top:10px;width:100%;border:1px solid #CBD5E1;' +
      'background:#fff;border-radius:8px;padding:6px 0;font-size:12px;color:#1A2233;cursor:pointer">' +
      "Abrir ficha</button>" +
    "</div></div>"
  );
}

// ── El pin de un PROYECTO ────────────────────────────────────────────
//  Un desarrollo no es una garantía más: sus ocho locales comparten el
//  mismo domicilio, así que pintarlos como ocho pines los deja uno
//  encima de otro y no se entiende nada. Va UN pin con el LOGOTIPO del
//  proyecto, para que se reconozca la marca sin abrir nada.
//
//  CAMBIO DEL 08-09-2026 · por qué dejó de ser un círculo:
//  El pin era un círculo de 42 px con el color de marca de fondo y el
//  logo encogido a 26×20 adentro. Dos problemas juntos:
//    · el logotipo de Plaza Leville es dos veces y media más ancho que
//      alto, así que a 26 px de ancho la letra quedaba en un borrón;
//    · la palabra "Plaza" está en el mismo verde petróleo que el color
//      de marca, y sobre ese fondo se BORRABA. Solo alcanzaba a verse
//      "Leville", y a medias.
//  Ahora es una placa horizontal blanca, del ancho que el logotipo
//  necesita, con el color de marca en el borde y una puntita abajo que
//  señala el domicilio. El logo se lee completo y la marca se distingue
//  a la primera de los pines redondos de las garantías.
const PIN_PROY_ANCHO = 124;
const PIN_PROY_ALTO = 46;

function pinProyecto(p: Proyecto): string {
  const dentro = p.logoUrl
    ? '<img src="' + p.logoUrl + '" alt="" ' +
      'style="height:20px;max-width:100px;object-fit:contain;display:block">'
    : '<span style="color:' + p.colorMarca +
      ';font-size:12px;font-weight:800;letter-spacing:.02em;white-space:nowrap">' +
      p.nombre + "</span>";

  // La placa: fondo BLANCO siempre. El color de marca va en el borde y
  // en la puntita, nunca detrás del logotipo — ahí se lo comería.
  const placa =
    '<div style="display:inline-flex;align-items:center;justify-content:center;' +
    'height:32px;padding:0 10px;background:#fff;border:2px solid ' + p.colorMarca +
    ';border-radius:999px;box-shadow:0 2px 6px rgba(0,0,0,.3)">' + dentro + "</div>";

  // La puntita que baja al punto exacto. Es un triángulo hecho con
  // bordes, del color de marca, para que la placa no quede flotando.
  const punta =
    '<div style="width:0;height:0;margin:-1px auto 0;' +
    'border-left:6px solid transparent;border-right:6px solid transparent;' +
    'border-top:8px solid ' + p.colorMarca + '"></div>';

  return (
    '<div style="width:' + PIN_PROY_ANCHO + "px;height:" + PIN_PROY_ALTO +
    'px;display:flex;flex-direction:column;align-items:center;justify-content:flex-start">' +
    placa + punta + "</div>"
  );
}

function globoProyecto(p: Proyecto): string {
  // Solo lo que de verdad se puede vender. Un apartado o un vendido no
  // es una opción para quien está viendo el mapa.
  const libres = p.unidades.filter((u) => u.etapa === "aprobada" || u.etapa === "publicada");
  const desde = libres.reduce<number | null>(
    (min, u) => (u.precio != null && (min == null || u.precio < min) ? u.precio : min), null);

  const foto = p.portada
    ? '<img src="' + p.portada + '" alt="" style="width:100%;height:110px;object-fit:cover">'
    : "";

  const renglones = libres.slice(0, 6).map((u) =>
    '<div style="display:flex;justify-content:space-between;gap:8px;padding:3px 0;' +
    'border-bottom:1px solid rgba(0,0,0,.06)">' +
    '<span style="font-size:11.5px;color:#1A2233">' + u.nombre +
      (u.m2 ? ' <span style="color:#94A3B8">· ' + u.m2.toFixed(2) + " m²</span>" : "") + "</span>" +
    '<span style="font-size:11.5px;font-weight:600;color:' + p.colorMarca + '">' +
      moneyProy(u.precio) + "</span></div>").join("");

  return (
    '<div style="width:270px;margin:-13px -20px -13px -20px">' + foto +
    '<div style="padding:10px 12px 12px">' +
      '<p style="margin:0;font-size:13.5px;font-weight:700;color:#1A2233">' + p.nombre + "</p>" +
      '<p style="margin:3px 0 0;font-size:11.5px;color:#64748B">' +
        [p.direccion, p.municipio].filter(Boolean).join(", ") + "</p>" +
      (desde != null
        ? '<p style="margin:8px 0 2px;font-size:11px;color:#64748B">Desde</p>' +
          '<p style="margin:0;font-size:18px;font-weight:700;color:' + p.colorMarca + '">' +
          moneyProy(desde) + "</p>"
        : '<p style="margin:8px 0 0;font-size:12px;font-style:italic;color:#64748B">Sin unidades disponibles</p>') +
      (renglones
        ? '<div style="margin-top:8px">' +
          '<p style="margin:0 0 2px;font-size:10.5px;color:#94A3B8">' + libres.length +
          " de " + p.unidades.length + " disponibles</p>" + renglones + "</div>"
        : "") +
    "</div></div>"
  );
}

// ── La pantalla ──────────────────────────────────────────────────────
export default function MapaGarantias({ onAbrir }: { onAbrir?: (id: string) => void }) {
  const caja = useRef<HTMLDivElement | null>(null);
  const mapa = useRef<any>(null);       // eslint-disable-line @typescript-eslint/no-explicit-any
  const capa = useRef<any>(null);       // eslint-disable-line @typescript-eslint/no-explicit-any

  const [lista, setLista] = useState<Garantia[]>([]);
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState("");
  const [etapa, setEtapa] = useState("");
  const [plaza, setPlaza] = useState("");

  useEffect(() => {
    let vivo = true;
    listarGarantias().then((r) => {
      if (!vivo) return;
      setLista(r);
      setCargando(false);
    });
    // Los desarrollos propios se traen aparte porque no salen de la
    // misma consulta: el catálogo de garantías los filtra a propósito.
    listarProyectos().then((r) => { if (vivo) setProyectos(r); });
    return () => { vivo = false; };
  }, []);

  // Las que se pueden pintar: solo las que traen coordenadas.
  const conCoordenadas = useMemo(
    () => lista.filter((g) => g.lat != null && g.lng != null),
    [lista],
  );
  const sinCoordenadas = lista.length - conCoordenadas.length;

  // Los filtros se aplican sobre lo que ya se trajo, igual que en la
  // vitrina: no se vuelve a consultar la base al escribir una letra.
  const filtrada = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return conCoordenadas.filter((g) => {
      if (q && !(g.folio.toLowerCase().includes(q) || g.direccion.toLowerCase().includes(q))) return false;
      if (etapa && g.etapa !== etapa) return false;
      if (plaza && g.sucursal !== plaza) return false;
      return true;
    });
  }, [conCoordenadas, busqueda, etapa, plaza]);

  // Los proyectos se filtran con la misma búsqueda y la misma plaza. La
  // etapa no les aplica: un desarrollo no tiene una sola, tiene ocho.
  const proyectosEnMapa = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return proyectos
      .map((p) => ({ p, u: p.unidades.find((x) => x.lat != null && x.lng != null) }))
      .filter((x): x is { p: Proyecto; u: NonNullable<typeof x.u> } => !!x.u)
      .filter(({ p, u }) => {
        if (q && !(p.nombre.toLowerCase().includes(q) ||
                   (p.direccion ?? "").toLowerCase().includes(q))) return false;
        if (plaza && u.sucursal !== plaza) return false;
        return true;
      });
  }, [proyectos, busqueda, plaza]);

  // Prender el mapa una sola vez, cuando ya bajó la librería.
  useEffect(() => {
    let vivo = true;
    cargarLeaflet()
      .then((L: any) => {                                  // eslint-disable-line @typescript-eslint/no-explicit-any
        if (!vivo || !caja.current || mapa.current) return;
        // Centro provisional: el país. En cuanto haya pines, el mapa se
        // reencuadra solo para que quepan todos.
        mapa.current = L.map(caja.current, { scrollWheelZoom: true }).setView([23.6, -102.5], 5);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "© OpenStreetMap",
        }).addTo(mapa.current);
      })
      .catch(() => { if (vivo) setError("No se pudo cargar el mapa. Revisa la conexión."); });

    return () => {
      vivo = false;
      if (mapa.current) { mapa.current.remove(); mapa.current = null; }
    };
  }, []);

  // Repintar los pines cada vez que cambian los filtros.
  useEffect(() => {
    const L = (window as unknown as { L?: any }).L;        // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!L || !mapa.current) return;

    if (capa.current) { mapa.current.removeLayer(capa.current); capa.current = null; }

    // Si el agrupador bajó bien se usa; si no, los pines van sueltos.
    // Agrupar sirve para que en un mismo fraccionamiento no se encimen.
    capa.current = L.markerClusterGroup ? L.markerClusterGroup({ maxClusterRadius: 45 }) : L.layerGroup();

    filtrada.forEach((g) => {
      const icono = L.divIcon({
        html: pinHTML(g),
        className: "",                 // sin la caja blanca que trae por defecto
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
      L.marker([g.lat, g.lng], { icon: icono })
        .bindPopup(globoHTML(g), { minWidth: 250, maxWidth: 250 })
        .addTo(capa.current);
    });

    // Los proyectos van FUERA del agrupador: si se agruparan, el pin
    // con el logo desaparecería dentro de un globo con un número.
    proyectosEnMapa.forEach(({ p, u }) => {
      const icono = L.divIcon({
        html: pinProyecto(p),
        className: "",
        iconSize: [PIN_PROY_ANCHO, PIN_PROY_ALTO],
        // El ancla va en la PUNTA de abajo, no en el centro: es la punta
        // la que señala el domicilio, la placa va encima de él.
        iconAnchor: [PIN_PROY_ANCHO / 2, PIN_PROY_ALTO],
      });
      L.marker([u.lat, u.lng], { icon: icono, zIndexOffset: 1000 })
        .bindPopup(globoProyecto(p), { minWidth: 270, maxWidth: 270 })
        .addTo(mapa.current);
    });

    mapa.current.addLayer(capa.current);

    // Reencuadrar para que quepan todos los pines que quedaron, los de
    // garantías y los de proyectos.
    const puntos = [
      ...filtrada.map((g) => [g.lat, g.lng] as [number, number]),
      ...proyectosEnMapa.map(({ u }) => [u.lat, u.lng] as [number, number]),
    ];
    if (puntos.length > 0) {
      mapa.current.fitBounds(puntos, { padding: [50, 50], maxZoom: 16 });
    }
  }, [filtrada, proyectosEnMapa]);

  // El botón "Abrir ficha" vive dentro del globito, que Leaflet arma por
  // su cuenta y fuera de React. Por eso no se le puede poner onClick: se
  // escucha el clic en la caja del mapa y se mira si trae el dato.
  useEffect(() => {
    const nodo = caja.current;
    if (!nodo || !onAbrir) return;
    const alClic = (e: Event) => {
      const t = (e.target as HTMLElement)?.closest("[data-abrir]");
      const id = t?.getAttribute("data-abrir");
      if (id) onAbrir(id);
    };
    nodo.addEventListener("click", alClic);
    return () => nodo.removeEventListener("click", alClic);
  }, [onAbrir]);

  const claseFiltro =
    "rounded-lg border border-black/10 bg-white px-3 py-2 text-xs text-tinta shadow-sm outline-none focus:border-teal";

  return (
    <div>
      <div className="relative overflow-hidden rounded-xl border border-black/10">
        {/* El mapa. Ocupa casi toda la altura de la pantalla: esta vista
            es para ver dónde están, así que se le da todo el espacio. */}
        <div ref={caja} className="h-[calc(100vh-260px)] min-h-[420px] w-full bg-nube" />

        {/* Los filtros van ENCIMA del mapa, no arriba, para no quitarle
            altura. z-[500] porque Leaflet usa hasta el 400 en sus capas. */}
        <div className="pointer-events-none absolute left-3 top-3 z-[500] flex flex-wrap gap-2">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Folio o dirección"
            className={claseFiltro + " pointer-events-auto w-56"}
          />
          <select value={etapa} onChange={(e) => setEtapa(e.target.value)} className={claseFiltro + " pointer-events-auto"}>
            <option value="">Etapa</option>
            {ETAPAS.map((e) => <option key={e.clave} value={e.clave}>{e.nombre}</option>)}
          </select>
          <select value={plaza} onChange={(e) => setPlaza(e.target.value)} className={claseFiltro + " pointer-events-auto"}>
            <option value="">Plaza</option>
            {SUCURSALES.map((s) => <option key={s.clave} value={s.clave}>{s.nombre}</option>)}
          </select>
        </div>

        {/* La clave de colores, abajo a la izquierda. */}
        <div className="absolute bottom-3 left-3 z-[500] rounded-lg border border-black/10 bg-white/95 px-3 py-2">
          <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[11.5px] text-humo">
            {ETAPAS.map((e) => (
              <span key={e.clave} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: COLOR_ETAPA[e.clave] }}
                />
                {e.nombre}
              </span>
            ))}
          </div>
        </div>

        {cargando && (
          <div className="absolute inset-0 z-[600] flex items-center justify-center bg-white/70 text-sm text-humo">
            Cargando garantías…
          </div>
        )}
        {error && (
          <div className="absolute inset-0 z-[600] flex items-center justify-center bg-white/90 px-6 text-center text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      {/* Sin este aviso el mapa mentiría por omisión: enseñaría unas
          cuantas y parecería que son todas. */}
      {!cargando && sinCoordenadas > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-lg bg-dorado/10 px-3 py-2 text-[12.5px] text-dorado-dark">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="h-4 w-4 shrink-0">
            <path d="M12 21s7-5.6 7-11a7 7 0 0 0-10.9-5.8" /><path d="M5.6 7A7 7 0 0 0 5 10c0 5.4 7 11 7 11" /><path d="M3 3l18 18" />
          </svg>
          {sinCoordenadas} garantía(s) sin coordenadas — no salen en el mapa. Se les pega el
          link de Google Maps en Editar garantía.
        </div>
      )}

      {/* La clave de los dibujos. Va abajo y no encima del mapa porque se
          consulta una vez y luego ya no se necesita. */}
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-[11.5px] text-humo">
        {["Casa de una planta", "Casa de dos plantas", "Casa en condominio", "Departamento", "Terreno", "Local comercial", "Bodega"].map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
              strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
              dangerouslySetInnerHTML={{ __html: dibujoDe(t) }} />
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
