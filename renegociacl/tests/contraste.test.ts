// Accesibilidad WCAG AA: lee los tokens REALES de globals.css (claro y oscuro) y verifica los pares de color.
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { contraste } from "@/lib/contraste";

const css = readFileSync(path.resolve(__dirname, "../src/app/globals.css"), "utf-8");

function tokens(bloque: string): Record<string, string> {
  const m = css.match(new RegExp(`${bloque}\\s*\\{([^}]*)\\}`));
  if (!m) throw new Error(`No se encontró ${bloque} en globals.css`);
  const out: Record<string, string> = {};
  for (const [, k, v] of m[1].matchAll(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)) out[k] = v;
  return out;
}

// [texto, fondo, mínimo, descripción]. 4.5 = texto normal; 3 = bordes de controles y elementos gráficos.
const PARES: [string, string, number, string][] = [
  ["texto", "fondo", 4.5, "texto sobre fondo"], ["texto", "superficie", 4.5, "texto sobre tarjeta"],
  ["suave", "superficie", 4.5, "texto secundario sobre tarjeta"], ["suave", "fondo", 4.5, "texto secundario sobre fondo"],
  ["sobre-brand", "brand", 4.5, "botón principal"], ["brand", "superficie", 4.5, "enlaces y acentos"],
  ["ok", "superficie", 4.5, "ahorro (verde)"], ["mal", "superficie", 4.5, "cuesta más (rojo)"],
  ["texto", "brand-fondo", 4.5, "mejor opción resaltada"], ["aviso-texto", "aviso-fondo", 4.5, "aviso"],
  ["error-texto", "error-fondo", 4.5, "error"], ["borde-input", "superficie", 3, "borde de campos"],
  ["brand", "fondo", 3, "acento sobre fondo (gráficos)"],
  ["brand", "brand-fondo", 4.5, "insignia Obligatorio"], ["suave", "superficie-2", 4.5, "insignia Opcional"],
];

describe.each([["light", ":root"], ["dark", "\\.dark"]])("tema %s", (_, bloque) => {
  const t = tokens(bloque);
  it.each(PARES)("%s sobre %s ≥ %f (%s)", (fg, bg, min) => {
    expect(t[fg], `falta --${fg}`).toBeDefined();
    expect(t[bg], `falta --${bg}`).toBeDefined();
    expect(contraste(t[fg], t[bg])).toBeGreaterThanOrEqual(min);
  });
});

describe("contraste()", () => {
  it("blanco sobre negro = 21", () => expect(contraste("#ffffff", "#000000")).toBeCloseTo(21, 5));
  it("mismo color = 1", () => expect(contraste("#123456", "#123456")).toBeCloseTo(1, 5));
});
