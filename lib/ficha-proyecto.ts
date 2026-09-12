// =====================================================================
//  MÓDULO COMERCIAL · Ficha de una unidad de proyecto, para el cliente
//  →  src/lib/ficha-proyecto.ts
//
//  La hermana de ficha-tecnica.ts, pero para los desarrollos propios.
//  Mismo camino —se arma el HTML y el navegador ofrece "Guardar como
//  PDF"—, mismo folio de entrega y mismo pie legal. Lo que cambia es el
//  contenido, porque un local de plaza no es una garantía de cesión:
//
//    · La marca es la DEL PROYECTO, no la de Inmuebles Accesibles. Al
//      cliente de Leville se le entrega un papel de Leville.
//    · No hay ganancia del cliente, ni avalúo, ni contingencia: aquí se
//      compra un inmueble a precio de lista, no un derecho de crédito.
//    · Sí van los planos —planta y corte—, que en un local vacío dicen
//      más que cualquier fotografía.
//    · Va la forma de pago que el asesor escogió, ya repartida en pesos,
//      y las condiciones de entrega.
//
//  DOS CANDADOS, POR LA MISMA RAZÓN QUE EN LA OTRA FICHA:
//  no se genera con un precio que no esté autorizado, y no se genera con
//  una cotización que pase del descuento que el asesor puede dar. Ese
//  papel sale con logo y precio, y ya no se recoge.
// =====================================================================
import QRCode from "qrcode";
import { supabase } from "./supabase";
import { money, type Proyecto, type Unidad, type EsquemaPago } from "../data/proyectos";

export type ResultadoFicha = { ok: true; folio: string } | { ok: false; error: string };

/** Lo que el asesor armó en la calculadora de la ficha. */
export type Cotizacion = {
  /** Precio de lista de la unidad, sin tocar. */
  lista: number;
  /** Lo que se le va a cotizar al cliente, ya con descuentos. */
  precio: number;
  comercialPct: number;
  acabadoNombre: string;
  acabadoPct: number;
  esquema: EsquemaPago | null;
};

export function puedeGenerarFicha(
  u: Unidad, p: Proyecto, c: Cotizacion,
): { puede: boolean; motivo: string | null } {
  if (u.precioEstado !== "aprobado" || u.precio == null) {
    return { puede: false, motivo: "El precio de esta unidad todavía no está autorizado." };
  }
  if (!c.esquema) {
    return { puede: false, motivo: "Escoge una forma de pago antes de generar la ficha." };
  }
  const tope = p.reglas?.comercialMaxPct ?? 0;
  if (c.comercialPct > p.descuentoTopePct) {
    return {
      puede: false,
      motivo: "El descuento pasa del " + p.descuentoTopePct + "%, que es el máximo del proyecto.",
    };
  }
  if (c.comercialPct > tope) {
    return {
      puede: false,
      motivo:
        "El descuento comercial pasa del " + tope + "%. Esta cotización necesita autorización de " +
        (p.reglas?.comercialAutoriza ?? "Gerencia Comercial") + " antes de entregarse por escrito.",
    };
  }
  return { puede: true, motivo: null };
}

/** Escapa lo que viene de la base antes de meterlo al HTML. */
function t(x: unknown): string {
  return String(x ?? "").replace(/[&<>"]/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch] as string));
}

const fechaLarga = (d: Date) =>
  d.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" }) +
  ", " + d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) + " h";

/** Reparte el precio cotizado entre los pagos del esquema escogido. */
function repartir(precio: number, e: EsquemaPago) {
  return e.pagos.map((pg) => {
    const monto = (precio * pg.pct) / 100;
    return {
      concepto: pg.etiqueta + " · " + pg.pct + "%",
      monto,
      mensual: pg.meses && pg.meses > 0 ? monto / pg.meses : null,
      meses: pg.meses ?? null,
      momento: pg.momento ?? null,
    };
  });
}

// ── El documento ─────────────────────────────────────────────────────
export async function generarFichaProyecto(
  u: Unidad,
  p: Proyecto,
  c: Cotizacion,
  opciones: { clienteNombre?: string; quien: string; borrador?: boolean },
): Promise<ResultadoFicha> {
  const borrador = !!opciones.borrador;

  if (!borrador) {
    const permiso = puedeGenerarFicha(u, p, c);
    if (!permiso.puede) return { ok: false, error: permiso.motivo || "No se puede generar." };
  }
  if (!c.esquema) return { ok: false, error: "Falta la forma de pago." };

  // El folio lo da la base, igual que la otra ficha: dos asesores
  // descargando al mismo tiempo no pueden sacar el mismo número.
  let folio = "BORRADOR";
  if (!borrador) {
    const { data, error } = await supabase.rpc("fn_ficha_entrega", {
      p_garantia: u.id,
      p_cliente: opciones.clienteNombre ?? null,
      p_por: opciones.quien,
      p_precio: c.precio,
    });
    if (error || !data) {
      return { ok: false, error: "No se pudo registrar la entrega: " + (error?.message ?? "sin folio") };
    }
    folio = String(data);
  }

  const pagos = repartir(c.precio, c.esquema);
  const imagenes = Array.from(
    new Set([u.fotoFachada, ...u.galeria.map((g) => g.url)].filter(Boolean) as string[]),
  );
  const planta = imagenes.find((x) => x.toLowerCase().includes("planta")) ?? null;
  const corte = imagenes.find((x) => x.toLowerCase().includes("corte")) ?? null;
  const fachada = imagenes.find((x) => x.toLowerCase().includes("fachada")) ?? imagenes[0] ?? null;

  const hayCoords = u.lat != null && u.lng != null;
  const qrMapa = hayCoords
    ? await QRCode.toDataURL("https://www.google.com/maps?q=" + u.lat + "," + u.lng, { margin: 0, width: 240 })
    : null;
  const qrFolio = await QRCode.toDataURL(
    "DIIPA · " + p.nombre + " · Ficha " + folio + " · " + u.folio + " · " +
      new Date().toLocaleDateString("es-MX"),
    { margin: 0, width: 240 },
  );

  const emitida = fechaLarga(new Date());
  const marcaColor = p.colorMarca;
  const acento = p.colorAcento;

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
          con el folio de arriba. Precios en pesos mexicanos, sujetos a disponibilidad al momento de
          la firma del Contrato de Promesa de Compraventa.</p>
      </div>
    </div>`;

  const marca = '<div class="marca">' + Array(8).fill("<span>CONFIDENCIAL</span>").join("") + "</div>" +
    (borrador ? '<div class="borrador">BORRADOR · NO ENTREGAR</div>' : "");

  const encabezado = (titulo: string, sub: string) => `
    <div class="cab">
      <div>
        ${p.logoUrl ? '<img class="logo" src="' + t(p.logoUrl) + '" alt="' + t(p.nombre) + '" />'
                    : '<p class="marcaTexto">' + t(p.nombre) + "</p>"}
        <p class="asoc">Un desarrollo de DIIPA S.A. de C.V.</p>
      </div>
      <div class="der">
        <p class="rotulo">${titulo}</p>
        <p class="sub">${sub}</p>
      </div>
    </div>`;

  const acabado = p.reglas?.acabados.find((a) => a.nombre === c.acabadoNombre) ?? null;

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${t(p.nombre)} · ${t(u.nombre)} · ${t(folio)}</title>
<style>
  @page { size: letter; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: Inter, Arial, sans-serif; color:#1A2233; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .hoja { position:relative; page-break-after:always; }
  .hoja:last-child { page-break-after:auto; }
  .marca { position:absolute; inset:0; display:flex; flex-wrap:wrap; align-content:center; justify-content:center;
           gap:70px; transform:rotate(-30deg); opacity:.06; pointer-events:none; z-index:0; }
  .marca span { font-size:34px; font-weight:700; letter-spacing:.12em; color:${marcaColor}; }
  .borrador { position:absolute; top:0; left:0; right:0; z-index:2; background:#A32D2D; color:#fff;
              text-align:center; font-size:9pt; font-weight:700; letter-spacing:.08em; padding:4px 0; }
  .hoja > *:not(.marca) { position:relative; z-index:1; }
  .cab { display:flex; justify-content:space-between; align-items:flex-start; gap:16px;
         background:${marcaColor}; padding:12px 16px; border-radius:6px; }
  .logo { height:36px; display:block; }
  .marcaTexto { margin:0; font-size:16pt; font-weight:700; color:#fff; }
  .asoc { margin:5px 0 0; font-size:8pt; color:rgba(255,255,255,.7); }
  .der { text-align:right; }
  .rotulo { margin:0; font-size:11pt; letter-spacing:.03em; color:${acento}; }
  .sub { margin:2px 0 0; font-size:8.5pt; color:rgba(255,255,255,.7); }
  .franja { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; margin-top:14px; }
  .unidad { margin:0; font-size:15pt; font-weight:600; }
  .lugar { margin:3px 0 0; font-size:9pt; color:#64748B; }
  .precio { margin:0; font-size:26pt; font-weight:700; color:${marcaColor}; }
  .tachado { margin:0; font-size:10pt; color:#94A3B8; text-decoration:line-through; }
  .porm2 { margin:2px 0 0; font-size:8.5pt; color:#64748B; text-align:right; }
  .principal { width:100%; height:220px; object-fit:cover; margin-top:12px; background:#EEE; }
  .planos { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px; }
  .planos img { width:100%; height:150px; object-fit:contain; background:#F4F6FA; }
  .cols { display:grid; grid-template-columns:1fr 1fr; gap:22px; margin-top:14px; }
  h2 { margin:0 0 5px; font-size:11pt; font-weight:600; border-bottom:1.5px solid ${marcaColor}; padding-bottom:3px; }
  p, td, li { font-size:9.5pt; line-height:1.5; }
  .cuadros { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-top:4px; }
  .cuadro { background:#F4F6FA; border-radius:5px; padding:8px 10px; }
  .cuadro .et { margin:0; font-size:7.5pt; color:#64748B; }
  .cuadro .va { margin:2px 0 0; font-size:12pt; font-weight:600; }
  table { width:100%; border-collapse:collapse; }
  td { padding:3px 0; vertical-align:top; }
  .monto { text-align:right; font-weight:600; white-space:nowrap; }
  .nota { font-size:8.5pt; color:#64748B; margin:6px 0 0; }
  .mapa { width:100%; height:270px; object-fit:cover; border:1px solid #E2E5EA; border-radius:4px; margin-top:10px; background:#EEE; }
  .pie { border-top:2px solid ${marcaColor}; margin-top:16px; padding-top:9px; display:flex; gap:12px; align-items:flex-start; }
  .pie.chico { margin-top:12px; }
  .qr { width:52px; height:52px; }
  .legal { margin:0; font-size:7.5pt; line-height:1.45; }
  .legal.tenue { color:#64748B; margin-top:3px; }
  ul { margin:4px 0 0; padding-left:16px; }
</style></head><body>

<div class="hoja">
  ${marca}
  ${encabezado("FICHA DE UNIDAD", t(u.folio) + " · Hoja 1 de 2")}

  <div class="franja">
    <div>
      <p class="unidad">${t(u.nombre)}${u.planta ? " · " + t(u.planta.replace(/^planta /, "Planta ")) : ""}</p>
      <p class="lugar">${t([p.direccion, p.municipio, p.estado].filter(Boolean).join(", "))}</p>
    </div>
    <div style="text-align:right">
      ${c.precio < c.lista ? '<p class="tachado">' + money(c.lista) + "</p>" : ""}
      <p class="precio">${money(c.precio)}</p>
      <p class="porm2">MXN${u.m2 ? " · " + money(c.precio / u.m2) + " por m²" : ""}</p>
    </div>
  </div>

  ${fachada ? '<img class="principal" src="' + t(fachada) + '" alt="Fachada" />' : ""}
  ${planta || corte ? '<div class="planos">' +
      (planta ? '<img src="' + t(planta) + '" alt="Planta" />' : "") +
      (corte ? '<img src="' + t(corte) + '" alt="Corte" />' : "") + "</div>" : ""}

  <div class="cuadros">
    <div class="cuadro"><p class="et">Superficie</p><p class="va">${u.m2 ? u.m2.toFixed(2) + " m²" : "—"}</p></div>
    <div class="cuadro"><p class="et">Nivel</p><p class="va">${u.planta ? t(u.planta.replace(/^planta /, "")) : "—"}</p></div>
    <div class="cuadro"><p class="et">Baños</p><p class="va">${u.banos != null ? u.banos : "—"}</p></div>
    <div class="cuadro"><p class="et">Unidades del proyecto</p><p class="va">${p.unidades.length}</p></div>
  </div>

  <div class="cols">
    <div>
      <h2>${t(c.esquema.nombre)}</h2>
      <table>
        ${pagos.map((f) => `<tr>
          <td>${t(f.concepto)}${f.momento ? '<br><span style="font-size:8pt;color:#64748B">' + t(f.momento) + "</span>" : ""}</td>
          <td class="monto">${f.mensual
            ? money(f.mensual) + ' al mes<br><span style="font-size:8pt;color:#64748B;font-weight:400">' +
              f.meses + " pagos · " + money(f.monto) + "</span>"
            : money(f.monto)}</td></tr>`).join("")}
        ${p.apartado != null
          ? '<tr><td style="padding-top:8px">Apartado para iniciar</td><td class="monto" style="padding-top:8px">' +
            money(p.apartado) + "</td></tr>"
          : ""}
      </table>
      ${c.esquema.nota ? '<p class="nota">' + t(c.esquema.nota) + "</p>" : ""}
      ${c.comercialPct > 0 || c.acabadoPct > 0
        ? '<p class="nota">Precio cotizado con ' +
          [c.comercialPct > 0 ? c.comercialPct + "% de descuento comercial" : null,
           c.acabadoPct > 0 ? c.acabadoPct + "% por " + t(c.acabadoNombre.toLowerCase()) : null]
            .filter(Boolean).join(" y ") + ".</p>"
        : ""}
    </div>
    <div>
      <h2>Se entrega en ${t(c.acabadoNombre.toLowerCase())}</h2>
      ${acabado && acabado.incluye.length
        ? "<ul>" + acabado.incluye.map((x) => "<li>" + t(x) + "</li>").join("") + "</ul>"
        : ""}
      ${acabado?.condicion ? '<p class="nota">' + t(acabado.condicion) + "</p>" : ""}
      ${p.cuotaMantenimiento != null
        ? '<p class="nota">Cuota de mantenimiento y administración de la plaza: ' +
          money(p.cuotaMantenimiento) + " al mes, aparte del precio.</p>"
        : ""}
    </div>
  </div>

  ${pie()}
</div>

<div class="hoja">
  ${marca}
  ${encabezado("UBICACIÓN", t(u.folio) + " · Hoja 2 de 2")}

  ${hayCoords
    ? '<img class="mapa" src="https://staticmap.openstreetmap.de/staticmap.php?center=' + u.lat + "," + u.lng +
      "&zoom=16&size=900x420&markers=" + u.lat + "," + u.lng + ',red-pushpin" alt="Mapa de ubicación" />'
    : '<p class="nota">Este proyecto todavía no tiene ubicación en el mapa.</p>'}

  <div class="cols">
    <div>
      <h2>Domicilio</h2>
      <table>
        <tr><td style="color:#64748B;width:96px">Dirección</td><td>${t(u.direccion)}</td></tr>
        ${p.municipio ? '<tr><td style="color:#64748B">Municipio</td><td>' + t(p.municipio) + "</td></tr>" : ""}
        ${p.estado ? '<tr><td style="color:#64748B">Estado</td><td>' + t(p.estado) + "</td></tr>" : ""}
        ${hayCoords ? '<tr><td style="color:#64748B">Coordenadas</td><td>' + u.lat + ", " + u.lng + "</td></tr>" : ""}
      </table>
    </div>
    <div>
      <h2>Cómo llegar</h2>
      ${qrMapa
        ? '<div style="display:flex;gap:10px;align-items:flex-start">' +
          '<img src="' + qrMapa + '" style="width:66px;height:66px" alt="" />' +
          '<p style="margin:0">Escanee con la cámara del celular para abrir el punto exacto en su aplicación de mapas.</p></div>'
        : "<p>Sin coordenadas capturadas.</p>"}
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
