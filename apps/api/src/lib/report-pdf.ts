/**
 * PDF de reportes con el detalle fila por fila (qué, cuándo, dónde): el correo
 * resume y el PDF demuestra. Tablas sobrias con la paleta Chink.
 */
import PDFDocument from "pdfkit";

const INK = "#242722";
const MUTED = "#74796f";
const SUBTLE = "#e8e8e0";
const CANVAS = "#f5f5ef";

export interface ReportPdfInput {
  title: string;
  spaceName: string;
  scope: string;
  cutoff: string;
  /** Líneas de resumen bajo el titular ("8 productos · 2.486 u."). */
  summary: string[];
  headers: string[];
  /** Anchos en puntos; se escalan si superan el ancho útil. */
  widths: number[];
  rows: string[][];
}

const PAGE_WIDTH = 595.28;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

export function buildReportPdf(input: ReportPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    const scale = Math.min(1, CONTENT_WIDTH / input.widths.reduce((a, b) => a + b, 0));
    const widths = input.widths.map((w) => w * scale);

    // Cabecera del documento.
    doc.fillColor(MUTED).fontSize(9).font("Helvetica");
    doc.text(`Chink · ${input.spaceName}`);
    doc.fillColor(INK).fontSize(20).font("Helvetica-Bold");
    doc.text(input.title, { paragraphGap: 4 });
    doc.fillColor(MUTED).fontSize(10).font("Helvetica");
    doc.text(`${input.scope} · Corte: ${input.cutoff}`, { paragraphGap: 8 });
    for (const line of input.summary) {
      doc.fillColor(INK).fontSize(11).font("Helvetica-Bold");
      doc.text(line, { paragraphGap: 2 });
    }
    doc.moveDown(0.5);
    doc.strokeColor(SUBTLE).lineWidth(1);
    doc.lineCap("butt").moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_WIDTH, doc.y).stroke();
    doc.moveDown(0.5);

    const rowHeight = (cells: string[], bold: boolean, size: number): number => {
      let height = 20;
      cells.forEach((cell, i) => {
        height = Math.max(height, doc.heightOfString(cell, { width: widths[i]! - 12 }) + 12);
      });
      return height;
    };

    const drawRow = (cells: string[], opts: { header?: boolean; zebra?: boolean } = {}) => {
      const height = rowHeight(cells, Boolean(opts.header), opts.header ? 9 : 9);
      if (doc.y + height > doc.page.height - MARGIN - 30) {
        doc.addPage();
        drawRow(input.headers, { header: true });
      }
      if (opts.header) {
        doc.rect(MARGIN, doc.y, CONTENT_WIDTH, height).fill(SUBTLE);
      } else if (opts.zebra) {
        doc.rect(MARGIN, doc.y, CONTENT_WIDTH, height).fill(CANVAS);
      }
      doc.fillColor(INK).font(opts.header ? "Helvetica-Bold" : "Helvetica").fontSize(9);
      const top = doc.y;
      let x = MARGIN;
      cells.forEach((cell, i) => {
        doc.text(cell, x + 6, top + 6, { width: widths[i]! - 12, lineBreak: true });
        x += widths[i]!;
      });
      doc.y = top + height;
      doc.strokeColor(SUBTLE).lineWidth(0.5);
      doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_WIDTH, doc.y).stroke();
    };

    drawRow(input.headers, { header: true });
    input.rows.forEach((row, index) => drawRow(row, { zebra: index % 2 === 1 }));

    if (input.rows.length === 0) {
      doc.moveDown();
      doc.fillColor(MUTED).fontSize(10).font("Helvetica");
      doc.text("Sin filas para este reporte.");
    }

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.fillColor(MUTED).fontSize(8).font("Helvetica");
      doc.text(`Página ${i + 1} · ${input.title} · ${input.spaceName}`, MARGIN, doc.page.height - 32, {
        width: CONTENT_WIDTH,
        align: "center",
      });
    }

    doc.end();
  });
}
