/** Genera y descarga un CSV en el navegador con BOM para Excel. */
export function downloadCsv(filename: string, header: string[], lines: string[][]) {
  const escape = (value: string) => `"${String(value).replace(/"/g, '""')}"`;
  const csv = [header.map(escape).join(","), ...lines.map((line) => line.map(escape).join(","))].join("\n");
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}