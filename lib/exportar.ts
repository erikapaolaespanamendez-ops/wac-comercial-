// Utilidades de exportación SIN dependencias nuevas.
// - descargarCSV: archivo .csv que abre directo en Excel (con BOM para acentos).
// - imprimirHTML: abre una ventana con el contenido y lanza la impresión del navegador,
//   donde el usuario elige "Guardar como PDF".

export function escHtml(v: string | number | null | undefined): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function descargarCSV(nombreArchivo: string, filas: (string | number)[][]): void {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const csv = "\uFEFF" + filas.map((f) => f.map(esc).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo.endsWith(".csv") ? nombreArchivo : nombreArchivo + ".csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function imprimirHTML(titulo: string, contenidoHTML: string): void {
  const win = window.open("", "_blank", "width=920,height=720");
  if (!win) { alert("Permite las ventanas emergentes para poder exportar el PDF."); return; }
  win.document.write(
    '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>' + escHtml(titulo) + '</title>' +
    '<style>' +
    '*{box-sizing:border-box}' +
    'body{font-family:Arial,Helvetica,sans-serif;color:#1f2937;margin:24px;font-size:12px}' +
    'h1{font-size:18px;margin:0 0 2px}h2{font-size:13px;margin:16px 0 6px;color:#0f766e;border-bottom:2px solid #99f6e4;padding-bottom:3px}' +
    '.sub{color:#6b7280;font-size:11px;margin-bottom:10px}' +
    'table{border-collapse:collapse;width:100%;margin:6px 0 12px}' +
    'th,td{border:1px solid #d1d5db;padding:5px 7px;text-align:left;vertical-align:top}' +
    'th{background:#f1f5f9;font-size:10.5px;text-transform:uppercase;letter-spacing:.02em}' +
    'td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}' +
    '.k{background:#f8fafc;font-weight:bold;width:34%}' +
    '.pill{display:inline-block;padding:1px 7px;border-radius:9px;font-size:10px;font-weight:bold}' +
    '.rojo{background:#fee2e2;color:#b91c1c}.oro{background:#fef3c7;color:#92400e}.verde{background:#d1fae5;color:#065f46}' +
    '.muted{color:#9ca3af}' +
    '@media print{body{margin:10mm}.noprint{display:none}}' +
    '</style></head><body>' + contenidoHTML +
    '<script>window.onload=function(){setTimeout(function(){window.print();},150);};<\/script>' +
    '</body></html>'
  );
  win.document.close();
}
