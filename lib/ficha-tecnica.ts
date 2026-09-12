// =====================================================================
//  MÓDULO COMERCIAL · Ficha técnica para el cliente
//  →  src/lib/ficha-tecnica.ts
//
//  Arma la ficha de DOS HOJAS y la manda a imprimir. El navegador ofrece
//  "Guardar como PDF": ese es el archivo que se le entrega al cliente.
//  Es el mismo camino que ya usan el convenio RDC y las exportaciones,
//  así que no hace falta ninguna librería nueva.
//
//    · Hoja 1 → logo, precio, fotos, ubicación, características y el
//               bloque de precios con la ganancia DEL CLIENTE.
//    · Hoja 2 → la ubicación en el mapa, el domicilio y el QR para
//               abrirlo en el celular.
//
//  QUÉ NUNCA SALE EN EL PAPEL:
//  el precio piso, los costos operativos, el margen de DIIPA, el número
//  de crédito y el nombre de la administradora. Son justo los datos con
//  candado por rol dentro del sistema; imprimirlos sería tirar ese
//  candado a la basura.
//
//  EL RASTRO:
//  antes de imprimir se pide un folio a la base (tabla ficha_entrega).
//  Ese folio va impreso en las DOS hojas, junto con quién la descargó,
//  la fecha y —si se capturó— a nombre de quién. Si una ficha aparece
//  donde no debe, el folio dice de dónde salió. La marca de agua sola no
//  hace eso: "CONFIDENCIAL" lo trae cualquier papel.
// =====================================================================
import QRCode from "qrcode";
import { supabase } from "./supabase";
import { resumenSobrePrecio, pagosOPorOmision, repartirPagos, money,
  type Contingencia } from "./precio-garantia";
import { fotosParaFicha } from "../data/fotos-garantia";
import type { GarantiaFicha } from "../data/garantias";

/** El logo va en public/, no incrustado en el código: así se cambia el
 *  archivo sin recompilar el sistema cuando la marca se actualice.
 *
 *  OJO con la dirección: la ficha se imprime en una ventana que se abre
 *  EN BLANCO, y una ventana en blanco no tiene dirección propia. Si aquí
 *  se pusiera solo "/logo-inmuebles-accesibles.png", el navegador no
 *  sabría contra qué sitio resolver esa diagonal y el logo saldría hueco
 *  aunque el archivo estuviera bien subido. Por eso va la dirección
 *  completa del sitio. */
const RUTA_LOGO = "/logo-inmuebles-accesibles.png";
const LOGO = typeof window !== "undefined" ? window.location.origin + RUTA_LOGO : RUTA_LOGO;

export type ResultadoFicha = { ok: true; folio: string } | { ok: false; error: string };

/** ¿Se puede entregar la ficha de esta garantía?
 *
 *  Regla: NO se genera con un precio que todavía anda en validación. Si
 *  se entrega antes, sale del sistema un papel con logo y precio que las
 *  tres firmas todavía pueden mover, y ese papel ya no se recoge. */
export function puedeGenerarFicha(g: GarantiaFicha): { puede: boolean; motivo: string | null } {
  if (g.precioEstado !== "aprobado" || g.precioAutorizado == null) {
    return { puede: false, motivo: "El precio todavía está en validación. La ficha se entrega cuando esté autorizado." };
  }
  if (!g.fotoFachada) {
    return { puede: false, motivo: "Falta la foto de fachada: es la que va arriba de la ficha." };
  }
  return { puede: true, motivo: null };
}

/** Escapa el texto que viene de la base antes de meterlo al HTML. Sin
 *  esto, una dirección con < o & rompería el documento. */
function t(x: unknown): string {
  return String(x ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

const fechaLarga = (d: Date) =>
  d.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" }) +
  ", " + d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) + " h";

// ── El documento ─────────────────────────────────────────────────────
export async function generarFichaTecnica(
  g: GarantiaFicha,
  opciones: { clienteNombre?: string; quien: string; borrador?: boolean },
): Promise<ResultadoFicha> {
  const borrador = !!opciones.borrador;

  // El BORRADOR es solo para revisar por dentro: sale con una banda roja
  // encima que dice que el precio no está autorizado y NO consume folio
  // de entrega, porque no se le entrega a nadie. La ficha buena sigue
  // pidiendo las tres firmas.
  if (!borrador) {
    const permiso = puedeGenerarFicha(g);
    if (!permiso.puede) return { ok: false, error: permiso.motivo || "No se puede generar." };
  }

  const precio = (g.precioAutorizado
    ?? (g.rutaPrecio === "avaluo" ? g.precioPorAvaluo : g.precioPorPiso)
    ?? 0) as number;
  if (!precio) return { ok: false, error: "Esta garantía todavía no tiene precio calculado." };

  // 1) El folio lo da la base, no esta pantalla: dos asesores
  //    descargando al mismo tiempo no pueden sacar el mismo número.
  //    El borrador no gasta folio: no es una entrega.
  let folio = "BORRADOR";
  if (!borrador) {
    const { data, error } = await supabase.rpc("fn_ficha_entrega", {
      p_garantia: g.id,
      p_cliente: opciones.clienteNombre ?? null,
      p_por: opciones.quien,
      p_precio: precio,
    });
    if (error || !data) {
      return { ok: false, error: "No se pudo registrar la entrega: " + (error?.message ?? "sin folio") };
    }
    folio = String(data);
  }

  // 2) Los números que van en el papel salen de las MISMAS funciones que
  //    la pantalla de Precios, para que el papel y el sistema nunca
  //    digan cosas distintas.
  const valorReferencia = g.avaluoComercial ?? g.valorGarantia;
  const r = resumenSobrePrecio(precio, g.m2Construccion, valorReferencia);
  const pagos = repartirPagos(
    precio,
    pagosOPorOmision(g.esquemaPagos, g.contingencia as Contingencia | null),
    Number(g.apartado) || 0,
  );
  const fotos = fotosParaFicha(g.fotoFachada, g.galeriaFotos);

  // 3) Los dos códigos QR. Son distintos a propósito: el de la hoja 2 le
  //    sirve al cliente para llegar; el del pie es el del folio y sirve
  //    para saber de dónde salió el papel.
  const hayCoords = g.lat != null && g.lng != null;
  const qrMapa = hayCoords
    ? await QRCode.toDataURL("https://www.google.com/maps?q=" + g.lat + "," + g.lng, { margin: 0, width: 240 })
    : null;
  const qrFolio = await QRCode.toDataURL(
    "DIIPA · Ficha " + folio + " · " + g.folio + " · " + new Date().toLocaleDateString("es-MX"),
    { margin: 0, width: 240 },
  );

  const emitida = fechaLarga(new Date());
  const pie = (chico = false) => `
    <div class="pie${chico ? " chico" : ""}">
      <img class="qr" src="${qrFolio}" alt="" />
      <div>
        <p class="legal"><strong>${borrador ? "Borrador interno · no se entrega." : "Documento confidencial."}</strong>
          ${opciones.clienteNombre ? "Emitido para <strong>" + t(opciones.clienteNombre) + "</strong> · " : ""}
          Entrega ${t(folio)} · ${t(emitida)} · Descargó: ${t(opciones.quien)}.</p>
        <p class="legal tenue">Información propiedad de DIIPA S.A. de C.V., entregada para uso exclusivo
          del destinatario. Su reenvío, copia o difusión por cualquier medio sin autorización escrita
          da lugar a las acciones civiles y penales que correspondan. Este ejemplar está identificado
          con el folio de arriba.</p>
      </div>
    </div>`;

  const marca = '<div class="marca">' + Array(8).fill("<span>CONFIDENCIAL</span>").join("") + "</div>" +
    (borrador ? '<div class="borrador">BORRADOR · PRECIO NO AUTORIZADO · NO ENTREGAR</div>' : "");

  const encabezado = (titulo: string, sub: string) => `
    <div class="cab">
      <div>
        <img class="logo" src="${LOGO}" alt="Inmuebles Accesibles"
             onerror="this.style.display='none';this.nextElementSibling.style.display='block'" />
        <span class="logo-texto">Inmuebles<strong>Accesibles</strong></span>
        <p class="asoc">Asociados con DIIPA S.A. de C.V.</p>
      </div>
      <div class="der">
        <p class="rotulo">${titulo}</p>
        <p class="sub">${sub}</p>
      </div>
    </div>`;

  const caracteristicas = [
    g.recamaras ? g.recamaras + " recámaras" : null,
    g.banos ? g.banos + " baños" : null,
    g.tipoInmueble,
    g.estacionamientos ? g.estacionamientos + " estacionamiento(s)" : null,
    g.m2Terreno ? g.m2Terreno + " m² terreno" : null,
    g.m2Construccion ? g.m2Construccion + " m² construcción" : null,
  ].filter(Boolean) as string[];

  const ubicacion = [g.colonia, g.municipio, g.estadoMx].filter(Boolean).join(", ");

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<base href="${typeof window !== "undefined" ? window.location.origin : ""}/">
<title>Ficha ${t(g.folio)} · ${t(folio)}</title>
<style>
  @page { size: letter; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: Inter, Arial, sans-serif; color:#1A2233; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .hoja { position:relative; page-break-after:always; }
  .hoja:last-child { page-break-after:auto; }
  .marca { position:absolute; inset:0; display:flex; flex-wrap:wrap; align-content:center; justify-content:center;
           gap:70px; transform:rotate(-30deg); opacity:.07; pointer-events:none; z-index:0; }
  .marca span { font-size:34px; font-weight:700; letter-spacing:.12em; color:#1E50A0; }
  /* Oro del manual de marca (#C9A227), no rojo: es el mismo color con el
     que el sistema marca lo que está en validación, y así el documento no
     se sale de la identidad de la empresa. */
  .borrador { position:absolute; top:0; left:0; right:0; z-index:2; background:#C9A227; color:#1A2233;
              text-align:center; font-size:9pt; font-weight:700; letter-spacing:.08em; padding:4px 0; }
  .hoja > *:not(.marca) { position:relative; z-index:1; }
  .cab { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; }
  .logo { height:34px; display:block; }
  /* Respaldo: si el archivo del logo no está en public/, en vez de un
     hueco sale el nombre escrito con los colores de la marca. */
  .logo-texto { display:none; font-size:15pt; color:#1E50A0; letter-spacing:-.01em; }
  .logo-texto strong { color:#1A2233; }
  .asoc { margin:4px 0 0; font-size:8.5pt; color:#64748B; }
  .der { text-align:right; }
  .rotulo { margin:0; font-size:11pt; letter-spacing:.03em; color:#1E50A0; }
  .precio { margin:0; font-size:24pt; font-weight:700; }
  .sub { margin:2px 0 0; font-size:8.5pt; color:#64748B; }
  .principal { width:100%; height:250px; object-fit:cover; margin-top:10px; background:#EEE; }
  .secundarias { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px; }
  .secundarias img { width:100%; height:120px; object-fit:cover; background:#EEE; }
  .cols { display:grid; grid-template-columns:1fr 1fr; gap:22px; margin-top:14px; }
  h2 { margin:0 0 5px; font-size:11pt; font-weight:600; border-bottom:1.5px solid #1E50A0; padding-bottom:3px; }
  p, td, li { font-size:9.5pt; line-height:1.5; }
  .cuadros { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; }
  .cuadro { background:#F4F6FA; border-radius:5px; padding:8px 10px; }
  .cuadro .et { margin:0; font-size:7.5pt; color:#64748B; }
  .cuadro .va { margin:2px 0 0; font-size:12pt; font-weight:600; }
  .gana { background:#E6F6F5; } .gana .et, .gana .va, .gana .pc { color:#02635E; }
  .pc { margin:0; font-size:7.5pt; }
  .lista { columns:2; margin:0; padding-left:16px; }
  .mapa { width:100%; height:270px; object-fit:cover; border:1px solid #E2E5EA; border-radius:4px; margin-top:10px; background:#EEE; }
  .pie { border-top:2px solid #1E50A0; margin-top:16px; padding-top:9px; display:flex; gap:12px; align-items:flex-start; }
  .pie .qr { width:52px; height:52px; }
  .pie.chico .qr { width:44px; height:44px; }
  .legal { margin:0; font-size:7.5pt; line-height:1.45; }
  .legal.tenue { margin-top:3px; color:#3F4757; }
  .nota { margin-top:7px; font-size:8.5pt; color:#3F4757; }
</style></head><body>

<div class="hoja">
  ${marca}
  ${encabezado("PRECIO", "")}
  <div class="der" style="margin-top:-42px">
    <p class="precio">${money(precio)}</p>
    <p class="sub">${t(g.folio)}${g.tipoInmueble ? " · " + t(g.tipoInmueble) : ""}</p>
  </div>

  ${fotos.principal ? '<img class="principal" src="' + t(fotos.principal) + '" alt="" />' : ""}
  ${fotos.secundarias.length
      ? '<div class="secundarias">' + fotos.secundarias.map((u) => '<img src="' + t(u) + '" alt="" />').join("") + "</div>"
      : ""}

  <div class="cols">
    <div>
      <h2>Ubicación</h2>
      <p>${t(g.direccion)}</p>
      ${ubicacion ? "<p>" + t(ubicacion) + (g.codigoPostal ? " · CP " + t(g.codigoPostal) : "") + "</p>" : ""}
      ${g.etapaProcesal ? '<p style="color:#1E50A0">Etapa: ' + t(g.etapaProcesal) + "</p>" : ""}
      <p class="nota"><strong>Recuperación bancaria.</strong> Se entrega con rehabilitación básica y libre de gravamen.</p>
    </div>
    <div>
      <h2>Características</h2>
      <ul class="lista">${caracteristicas.map((c) => "<li>" + t(c) + "</li>").join("")}</ul>
    </div>
  </div>

  <div style="margin-top:14px">
    <h2>Precios y su ganancia</h2>
    <div class="cuadros">
      ${valorReferencia ? '<div class="cuadro"><p class="et">Avalúo comercial</p><p class="va">' + money(valorReferencia) + "</p></div>" : ""}
      <div class="cuadro"><p class="et">Precio de venta</p><p class="va" style="color:#1E50A0">${money(precio)}</p></div>
      ${r.precioConHabilitacion != null
        ? '<div class="cuadro"><p class="et">Con habilitación</p><p class="va">' + money(r.precioConHabilitacion) + "</p></div>"
        : ""}
      ${r.ganaSinHabilitacion
        ? '<div class="cuadro gana"><p class="et">Usted gana</p><p class="va">' + money(r.ganaSinHabilitacion.gana) +
          '</p><p class="pc">' + r.ganaSinHabilitacion.pct + "% sobre lo que paga</p></div>"
        : ""}
    </div>
    ${pagos.filas.length
      ? '<p class="nota"><strong>Esquema de pagos:</strong> ' +
        pagos.filas.map((f) => t(f.concepto) + " " + money(f.monto)).join(" · ") + "</p>"
      : ""}
  </div>

  ${pie()}
</div>

<div class="hoja">
  ${marca}
  ${encabezado("UBICACIÓN", t(g.folio) + " · Hoja 2 de 2")}

  ${hayCoords
    ? '<img class="mapa" src="https://staticmap.openstreetmap.de/staticmap.php?center=' + g.lat + "," + g.lng +
      "&zoom=16&size=900x420&markers=" + g.lat + "," + g.lng + ',red-pushpin" alt="Mapa de ubicación" />'
    : '<p class="nota">Esta garantía todavía no tiene ubicación en el mapa.</p>'}

  <div class="cols">
    <div>
      <h2>Domicilio</h2>
      <table>
        <tr><td style="color:#64748B;width:92px">Calle</td><td>${t(g.direccion)}</td></tr>
        ${g.colonia ? '<tr><td style="color:#64748B">Fraccionamiento</td><td>' + t(g.colonia) + "</td></tr>" : ""}
        ${g.municipio ? '<tr><td style="color:#64748B">Municipio</td><td>' + t(g.municipio) + "</td></tr>" : ""}
        ${g.estadoMx ? '<tr><td style="color:#64748B">Estado</td><td>' + t(g.estadoMx) + "</td></tr>" : ""}
        ${g.codigoPostal ? '<tr><td style="color:#64748B">Código postal</td><td>' + t(g.codigoPostal) + "</td></tr>" : ""}
        ${hayCoords ? '<tr><td style="color:#64748B">Coordenadas</td><td>' + g.lat + ", " + g.lng + "</td></tr>" : ""}
      </table>
    </div>
    <div>
      <h2>Cómo llegar</h2>
      ${qrMapa
        ? '<div style="display:flex;gap:10px;align-items:flex-start">' +
          '<img src="' + qrMapa + '" style="width:66px;height:66px" alt="" />' +
          '<p style="margin:0">Escanee con la cámara del celular para abrir el punto exacto en su aplicación de mapas.</p></div>'
        : "<p>Sin coordenadas capturadas.</p>"}
      ${fotos.deUbicacion
        ? '<img src="' + t(fotos.deUbicacion) + '" style="width:100%;height:110px;object-fit:cover;margin-top:10px" alt="" />'
        : ""}
    </div>
  </div>

  ${pie(true)}
</div>

<script>
  // Se imprime hasta que TODAS las imágenes cargaron. Si se dispara
  // antes, el PDF sale con los huecos de las fotos y del mapa.
  window.onload = function () { setTimeout(function () { window.print(); }, 600); };
<\/script>
</body></html>`;

  const win = window.open("", "_blank");
  if (!win) return { ok: false, error: "El navegador bloqueó la ventana. Permite las ventanas emergentes de este sitio." };
  win.document.write(html);
  win.document.close();

  return { ok: true, folio: String(folio) };
}
