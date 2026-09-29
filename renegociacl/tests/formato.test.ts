import { describe, expect, it } from "vitest";
import { formatCLP, formatearMientrasEscribe, parseCLP, parseTasa } from "@/lib/format";

describe("parseCLP: pesos chilenos sin sorpresas", () => {
  it.each([
    ["3000000", 3_000_000], ["3.000.000", 3_000_000], ["$ 3.000.000", 3_000_000],
    ["$3.000.000,00", 3_000_000],          // cartola con decimales: antes daba 300.000.000
    ["1.234.567,89", 1_234_567], ["3,000,000", 3_000_000], ["3,000,000.50", 3_000_000], ["", 0], ["abc", 0],
  ])("%s -> %i", (txt, esperado) => expect(parseCLP(txt)).toBe(esperado));
});

describe("formatearMientrasEscribe: puntos automáticos", () => {
  it.each([["3", "3"], ["3000", "3.000"], ["3000000", "3.000.000"], ["3.000.0000", "30.000.000"], ["$ 1500000", "1.500.000"], ["", ""], ["abc", ""]])(
    "%s -> %s", (txt, esperado) => expect(formatearMientrasEscribe(txt)).toBe(esperado));
});

describe("parseTasa", () => {
  it("acepta coma y punto", () => { expect(parseTasa("2,5")).toBeCloseTo(0.025); expect(parseTasa("1.85")).toBeCloseTo(0.0185); });
  it("acepta 0 como válido (cuotas sin interés) y rechaza texto", () => {
    expect(parseTasa("0")).toBe(0);
    expect(Number.isNaN(parseTasa("abc"))).toBe(true);
    expect(Number.isNaN(parseTasa(""))).toBe(true);
  });
});

describe("formatCLP", () => {
  it("puntos y negativos", () => { expect(formatCLP(1234567)).toBe("$1.234.567"); expect(formatCLP(-5000)).toBe("-$5.000"); });
});
