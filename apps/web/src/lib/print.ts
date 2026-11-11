/**
 * Exporta a PDF usando el diálogo de impresión del navegador ("Guardar como PDF").
 * Evita añadir una dependencia de generación de PDF solo para cuatro reportes.
 */
export function printReport(title: string, header: string[], rows: string[][]) {
  const escape = (value: string) =>
    String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>${escape(title)}</title>
<style>
  body{font:12px/1.5 "DM Sans",system-ui,sans-serif;color:#242722;padding:24px}
  h1{font-size:18px;margin:0 0 4px}
  p.meta{color:#74796f;margin:0 0 20px}
  table{width:100%;border-collapse:collapse}
  th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#74796f;
     border-bottom:1px solid rgba(51,56,48,.2);padding:8px 6px}
  td{border-bottom:1px solid rgba(51,56,48,.2);padding:8px 6px}
  footer{margin-top:20px;font-size:10px;color:#41483a}
  @media print{body{padding:0}}
</style></head>
<body>
  <h1>${escape(title)}</h1>
  <p class="meta">Chink · ${new Date().toLocaleString("es-CO")}</p>
  <table>
    <thead><tr>${header.map((h) => `<th>${escape(h)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escape(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
  </table>
  <footer>Generado desde chink-saas</footer>
</body></html>`;

  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  if (!doc) {
    document.body.removeChild(frame);
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  // Chrome y Edge necesitan un tick para maquetar antes de imprimir.
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => document.body.removeChild(frame), 1000);
  };
}
