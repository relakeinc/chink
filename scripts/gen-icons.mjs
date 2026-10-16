import { readdirSync, writeFileSync } from "node:fs";
const dir = "apps/web/src/assets/icons";
const files = readdirSync(dir).filter((f) => f.endsWith(".svg")).sort();
// Prefijo obligatorio: "package" y otros nombres chocan con palabras reservadas.
const ident = (f) => "i_" + f.replace(/\.svg$/, "").replace(/[^a-zA-Z0-9]/g, "_");
const imports = files.map((f) => `import ${ident(f)} from "@/assets/icons/${f}";`).join("\n");
const entries = files.map((f) => `  "${f.replace(/\.svg$/, "")}": ${ident(f)},`).join("\n");
writeFileSync("apps/web/src/components/ui/icons.ts", [
  "/* Generado automaticamente por scripts/gen-icons.mjs. No editar a mano. */",
  imports,
  "",
  "/** Mapa nombre -> URL del SVG, importado de forma explicita (sin glob). */",
  "export const ICONS: Record<string, string> = {",
  entries,
  "};",
  "",
  "export function iconUrl(name: string): string | undefined {",
  "  return ICONS[name];",
  "}",
  "",
].join("\n"), "utf8");
console.log("Generados", files.length, "iconos");
