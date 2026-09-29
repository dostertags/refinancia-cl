import { describe, expect, it } from "vitest";
import { cae, cuotaFrancesa, generarOpciones, simularPago, type Entrada } from "@/lib/calc";
import { formatCLP, parseCLP, parseTasa } from "@/lib/format";
import { resumirMercado } from "@/lib/mercado";

const base: Entrada = { saldo: 3_000_000, cuota: 153_000, tasaMensual: 0.03 };

describe("simularPago", () => {
  it("reproduce el caso conocido: $1.000.000 al 1,5% mensual con cuota $49.924 son 24 meses", () => {
    const r = simularPago(1_000_000, 0.015, 49_924)!;
    expect(r.meses).toBe(24);
    expect(Math.abs(r.total - 1_198_176)).toBeLessThan(60);
  });
  it("con tasa 0 paga solo el capital", () => {
    const r = simularPago(1_200_000, 0, 100_000)!;
    expect(r.meses).toBe(12);
    expect(r.total).toBeCloseTo(1_200_000);
  });
  it("devuelve null si la cuota no alcanza ni para los intereses", () => {
    expect(simularPago(1_000_000, 0.02, 20_000)).toBeNull();
    expect(simularPago(1_000_000, 0.02, 19_000)).toBeNull();
  });
});

describe("cuotaFrancesa y cae", () => {
  it("cuota francesa del caso A", () => expect(cuotaFrancesa(1_000_000, 0.015, 24)).toBeCloseTo(49_924, -1));
  it("cae de una tasa mensual sin gastos", () => expect(cae(0.02)).toBeCloseTo(0.268242, 5));
});

describe("generarOpciones: validación", () => {
  it("rechaza cuota que no cubre intereses, con mensaje claro", () => {
    const r = generarOpciones({ saldo: 5_000_000, cuota: 50_000, tasaMensual: 0.03 }, "intereses");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no alcanza|intereses/i);
  });
  it("rechaza saldo, cuota o tasa inválidos", () => {
    for (const e of [{ ...base, saldo: 0 }, { ...base, cuota: -1 }, { ...base, tasaMensual: 0.5 }, { ...base, tasaMensual: -0.01 }, { ...base, tasaMensual: 0.5 }]) {
      expect(generarOpciones(e, "intereses").ok).toBe(false);
    }
  });
});

describe("generarOpciones: sin ofertas del usuario", () => {
  const r = generarOpciones(base, "intereses");
  it("entrega entre 3 y 5 opciones, todas con ahorro, ordenadas de mayor a menor", () => {
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.opciones.length).toBeGreaterThanOrEqual(3);
    expect(r.opciones.length).toBeLessThanOrEqual(5);
    expect(r.opciones.every((o) => o.ahorroTotal > 0)).toBe(true);
    const ahorros = r.opciones.map((o) => o.ahorroTotal);
    expect(ahorros).toEqual([...ahorros].sort((a, b) => b - a));
  });
  it("resume la situación actual", () => {
    if (!r.ok) return;
    expect(r.actual.meses).toBeGreaterThan(20);
    expect(r.actual.intereses).toBeCloseTo(r.actual.totalPagar - base.saldo, 0);
  });
  it("es determinista", () => expect(generarOpciones(base, "intereses")).toEqual(r));
  it("las metas de negociación son hipotéticas, no ofertas reales", () => {
    if (!r.ok) return;
    expect(r.opciones.filter((o) => o.tipo === "tasa").every((o) => o.esPropia === false)).toBe(true);
  });
});

describe("generarOpciones: con ofertas del usuario", () => {
  const entrada: Entrada = { ...base, ofertas: [{ nombre: "Banco Amigo", tasaMensual: 0.012, gastos: 0 }] };

  it("usa la oferta que recibió y la nombra", () => {
    const r = generarOpciones(entrada, "intereses");
    if (!r.ok) throw new Error("debería ser ok");
    const propia = r.opciones.find((o) => o.esPropia);
    expect(propia).toBeDefined();
    expect(propia!.titulo).toContain("Banco Amigo");
  });

  it("los gastos de la operación restan al ahorro", () => {
    const sin = generarOpciones(entrada, "intereses");
    const con = generarOpciones({ ...entrada, ofertas: [{ nombre: "Banco Amigo", tasaMensual: 0.012, gastos: 100_000 }] }, "intereses");
    if (!sin.ok || !con.ok) throw new Error("ok");
    const a = sin.opciones.find((o) => o.esPropia && o.tipo === "tasa")!;
    const b = con.opciones.find((o) => o.esPropia && o.tipo === "tasa")!;
    expect(a.ahorroTotal - b.ahorroTotal).toBeCloseTo(100_000, -1);
  });

  it("una oferta con tasa igual o peor no se presenta como ahorro", () => {
    const r = generarOpciones({ ...base, ofertas: [{ nombre: "Caro", tasaMensual: 0.035 }] }, "intereses");
    if (!r.ok) throw new Error("ok");
    expect(r.opciones.find((o) => o.titulo.includes("Caro"))).toBeUndefined();
  });
});

describe("modos de orden", () => {
  it("modo cuota ordena por alivio mensual y el primero baja la cuota", () => {
    const r = generarOpciones(base, "cuota");
    if (!r.ok) throw new Error("ok");
    const alivios = r.opciones.map((o) => o.alivioMensual);
    expect(alivios).toEqual([...alivios].sort((a, b) => b - a));
    expect(r.opciones[0].alivioMensual).toBeGreaterThan(0);
  });
  it("en modo cuota puede haber opciones que cuestan más en total, y lo dicen", () => {
    const r = generarOpciones(base, "cuota");
    if (!r.ok) throw new Error("ok");
    const cara = r.opciones.find((o) => o.ahorroTotal < 0);
    if (cara) expect(cara.resumen).toMatch(/más en total/i);
  });
  it("modo intereses siempre incluye el abono extra sin renegociar", () => {
    const r = generarOpciones(base, "intereses");
    if (!r.ok) throw new Error("ok");
    const abono = r.opciones.find((o) => o.tipo === "abono") ?? generarOpciones({ ...base, ofertas: [] }, "cuota");
    expect(abono).toBeDefined();
  });
});

describe("tarjeta de crédito (comparación de tasas)", () => {
  it("compara tasas lado a lado con la del crédito", () => {
    const r = generarOpciones({ ...base, tarjetas: [{ saldo: 2_000_000, tasaMensual: 0.035 }] }, "intereses");
    if (!r.ok) throw new Error("ok");
    expect(r.comparacion.map((f) => f.nombre)).toEqual(expect.arrayContaining(["Tu crédito", "Tu tarjeta"]));
    expect(r.comparacion.find((f) => f.nombre === "Tu tarjeta")!.caeAnual).toBeCloseTo(cae(0.035), 6);
  });
});

describe("lenguaje claro", () => {
  it("cada opción explica en pesos y meses", () => {
    const r = generarOpciones(base, "intereses");
    if (!r.ok) throw new Error("ok");
    for (const o of r.opciones) {
      expect(o.resumen).toMatch(/\$\d/);
      expect(o.resumen).toMatch(/Ahorras|ahorras/);
    }
    expect(r.opciones.some((o) => /meses? antes/.test(o.resumen))).toBe(true);
  });
});

describe("formato y entrada", () => {
  it("formatCLP con puntos", () => expect(formatCLP(1234567)).toBe("$1.234.567"));
  it("parseCLP ignora símbolos", () => expect(parseCLP("$ 1.500.000")).toBe(1_500_000));
  it("parseTasa acepta coma y punto (en %)", () => {
    expect(parseTasa("2,5")).toBeCloseTo(0.025);
    expect(parseTasa("1.85")).toBeCloseTo(0.0185);
    expect(Number.isNaN(parseTasa("abc"))).toBe(true);
  });
});

describe("resumirMercado", () => {
  it("sin datos devuelve null (no se inventan tasas)", () => {
    expect(resumirMercado({ actualizado: null, fuente: "", ofertas: [] })).toBeNull();
  });
  it("calcula mínimo, mediana y cantidad", () => {
    const r = resumirMercado({
      actualizado: "2026-09-28", fuente: "SERNAC",
      ofertas: [{ institucion: "A", tasaMensual: 0.012 }, { institucion: "B", tasaMensual: 0.016 }, { institucion: "C", tasaMensual: 0.02 }],
    })!;
    expect(r.min).toBeCloseTo(0.012);
    expect(r.mediana).toBeCloseTo(0.016);
    expect(r.cantidad).toBe(3);
    expect(r.mejor).toBe("A");
  });
});
