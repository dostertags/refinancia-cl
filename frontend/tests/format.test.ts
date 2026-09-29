import { describe, expect, it } from "vitest";
import { formatCLP, formatPct, parseCLP, pctMensualAFraccion } from "@/lib/format";

describe("formatCLP", () => {
  it("usa punto como separador de miles", () => {
    expect(formatCLP(1234567)).toBe("$1.234.567");
  });
  it("redondea", () => {
    expect(formatCLP(99.6)).toBe("$100");
  });
  it("maneja negativos", () => {
    expect(formatCLP(-5000)).toBe("-$5.000");
  });
});

describe("parseCLP", () => {
  it("ignora puntos, signo $ y espacios", () => {
    expect(parseCLP("$ 1.500.000")).toBe(1500000);
  });
  it("devuelve 0 si no hay dígitos", () => {
    expect(parseCLP("abc")).toBe(0);
  });
});

describe("formatPct", () => {
  it("usa coma decimal", () => {
    expect(formatPct(0.2682)).toBe("26,82%");
  });
});

describe("pctMensualAFraccion", () => {
  it("convierte 2,5 (%) a 0.025", () => {
    expect(pctMensualAFraccion("2,5")).toBeCloseTo(0.025);
  });
  it("acepta punto decimal", () => {
    expect(pctMensualAFraccion("1.85")).toBeCloseTo(0.0185);
  });
});
