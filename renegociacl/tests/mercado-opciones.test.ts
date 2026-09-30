// Las opciones de refinanciamiento salen de tasas REALES (SERNAC) o de ofertas que ingresa la persona. Nada se inventa.
import { describe, expect, it } from "vitest";
import { generarOpciones, simularPago, type Credito, type Modo, type Resultado } from "@/lib/calc";
import { parseMercado } from "@/lib/mercado";
import subset from "./fixtures/rates-sernac-subset.json";

const mercado = parseMercado(subset)!;
const base: Credito = { saldo: 3_000_000, cuota: 153_000, tasaMensual: 0.03 };
const ok = (r: Resultado) => { if (!r.ok) throw new Error(r.error); return r; };
const gen = (e: Credito, modo: Modo = "intereses", seguro = true) => ok(generarOpciones(e, modo, mercado, { seguro }));

describe("sin tasas de mercado ni ofertas propias no se inventa nada", () => {
  const r = ok(generarOpciones(base, "intereses"));
  it("solo quedan opciones que no requieren renegociar (subir cuota / abono)", () => {
    expect(r.opciones.length).toBeGreaterThan(0);
    expect(r.opciones.every((o) => o.tipo === "abono" || o.tipo === "abonoUnico")).toBe(true);
    expect(r.opciones.some((o) => /si logras/i.test(o.titulo))).toBe(false);
  });
  it("avisa que faltan tasas para comparar", () => expect(r.avisos.join(" ")).toMatch(/no hay tasas de mercado/i));
  it("no hay resumen de mercado", () => expect(r.mercado).toBeNull());
});

describe("con tasas oficiales del SERNAC", () => {
  it("ofrece opciones de mercado nombradas, con institución, plazo, tasa y fuente", () => {
    const r = gen({ saldo: 5_000_000, cuota: 190_000, mesesRestantes: 45 });
    const m = r.opciones.filter((o) => o.tipo === "mercado");
    expect(m.length).toBeGreaterThanOrEqual(2);
    for (const o of m) {
      expect(o.titulo).toMatch(/Banco BICE/);
      expect(o.titulo).toMatch(/\d+ cuotas/);
      expect(o.esPropia).toBe(false);
      expect(o.fuente?.texto).toMatch(/SERNAC/);
      expect(o.fuente?.url).toMatch(/^https:\/\/www\.sernac\.cl/);
      expect(o.fuente?.fecha).toBe("2026-09-29");
      expect(o.fuente?.institucion).toBe("BANCO BICE");
    }
  });
  it("las cifras son las informadas por la institución (cuota, CTC, CAE) y el ahorro se mide contra tu situación de hoy", () => {
    const r = gen({ saldo: 5_000_000, cuota: 200_000, tasaMensual: 0.03 });
    const o48 = r.opciones.find((o) => o.id === "mercado-48")!;
    expect(o48.nuevaCuota).toBe(143_611);
    expect(o48.nuevosMeses).toBe(48);
    expect(o48.totalPagar).toBe(6_893_328);
    expect(o48.caeAnual).toBeCloseTo(0.1674, 6);
    expect(o48.tasaMensual).toBeCloseTo(0.0117, 6);
    expect(o48.ahorroTotal).toBeCloseTo(r.actual.totalPagar - 6_893_328, 0);
    expect(o48.alivioMensual).toBe(200_000 - 143_611);
  });
  it("escala al monto a refinanciar (crédito + tarjetas incluidas) y lo declara", () => {
    const r = gen({ saldo: 4_000_000, cuota: 160_000, tasaMensual: 0.03, tarjetas: [{ nombre: "Falabella", saldo: 2_000_000, pagoMensual: 100_000, tasaMensual: 0.035 }] });
    expect(r.refinanciar.total).toBe(6_000_000);
    const o48 = r.opciones.find((o) => o.id === "mercado-48")!;
    expect(o48.fuente?.escalado).toBe(true);
    expect(o48.fuente?.montoBase).toBe(5_000_000);
    expect(o48.nuevaCuota).toBe(Math.round(143_611 * 1.2));
  });
  it("lo que se deja fuera del refinanciamiento se suma a la cuota y al total", () => {
    const tj = { nombre: "Ripley", saldo: 800_000, pagoMensual: 52_000, tasaMensual: 0.04, incluir: false };
    const solo = gen({ saldo: 5_000_000, cuota: 200_000, tasaMensual: 0.03 }).opciones.find((o) => o.id === "mercado-48")!;
    const con = gen({ saldo: 5_000_000, cuota: 200_000, tasaMensual: 0.03, tarjetas: [tj] }).opciones.find((o) => o.id === "mercado-48")!;
    expect(con.nuevaCuota).toBeGreaterThan(solo.nuevaCuota);
    expect(con.nuevaCuota - solo.nuevaCuota).toBeGreaterThanOrEqual(52_000);
  });
  it("cita fuente, fecha y la tasa más baja y más alta del mercado para tu monto", () => {
    const r = gen({ saldo: 5_000_000, cuota: 200_000, tasaMensual: 0.03 });
    expect(r.mercado?.mejor.institucion).toBe("BANCO BICE");
    expect(r.mercado?.menorTasa).toBeCloseTo(0.0116, 6);
    expect(r.mercado?.actualizado).toBe("2026-09-29");
  });
  it("modo cuota ordena por alivio mensual: el plazo más largo baja más la cuota", () => {
    const r = gen({ saldo: 5_000_000, cuota: 200_000, tasaMensual: 0.03 }, "cuota");
    expect(r.opciones[0].id).toBe("mercado-60");
    const alivios = r.opciones.map((o) => o.alivioMensual);
    expect(alivios).toEqual([...alivios].sort((a, b) => b - a));
  });
  it("el seguro de desgravamen cambia las cifras", () => {
    const con = gen({ saldo: 5_000_000, cuota: 200_000, tasaMensual: 0.03 }, "intereses", true).opciones.find((o) => o.id === "mercado-48")!;
    const sin = gen({ saldo: 5_000_000, cuota: 200_000, tasaMensual: 0.03 }, "intereses", false).opciones.find((o) => o.id === "mercado-48")!;
    expect(sin.totalPagar).not.toBe(con.totalPagar);
  });
  it("si tu tasa actual ya es mejor que la del mercado, lo dice y no recomienda cambiar", () => {
    const cuota = Math.ceil(5_000_000 * 0.008 / (1 - 1.008 ** -36));
    const r = gen({ saldo: 5_000_000, cuota, tasaMensual: 0.008 });
    expect(r.opciones.some((o) => o.tipo === "mercado")).toBe(false);
    expect(r.avisos.join(" ")).toMatch(/ya es (igual o )?mejor que la más competitiva del mercado/i);
  });
  it("si el monto no está en lo publicado, no extrapola y avisa el rango", () => {
    const r = gen({ saldo: 30_000_000, cuota: 1_200_000, tasaMensual: 0.03 });
    expect(r.opciones.some((o) => o.tipo === "mercado")).toBe(false);
    expect(r.avisos.join(" ")).toMatch(/no hay simulaciones publicadas para \$30\.000\.000/i);
  });
  it("una oferta real del usuario compite con el mercado", () => {
    const r = gen({ saldo: 5_000_000, cuota: 200_000, tasaMensual: 0.03, ofertas: [{ nombre: "Banco Amigo", tasaMensual: 0.009, gastos: 50_000 }] });
    expect(r.opciones.some((o) => o.esPropia && o.titulo.includes("Banco Amigo"))).toBe(true);
    expect(r.opciones.some((o) => o.tipo === "mercado")).toBe(true);
    const ahorros = r.opciones.map((o) => o.ahorroTotal);
    expect(ahorros).toEqual([...ahorros].sort((a, b) => b - a));
  });
  it("ninguna opción es una 'meta' inventada", () => {
    const r = gen({ saldo: 5_000_000, cuota: 200_000, tasaMensual: 0.03 });
    expect(r.opciones.every((o) => !/si logras|meta/i.test(o.titulo + o.resumen))).toBe(true);
    expect(r.opciones.every((o) => !("esHipotetica" in o))).toBe(true);
  });
  it("es determinista y máximo 5 opciones", () => {
    const e = { saldo: 5_000_000, cuota: 200_000, tasaMensual: 0.03 };
    expect(gen(e)).toEqual(gen(e));
    expect(gen(e).opciones.length).toBeLessThanOrEqual(5);
  });
  it("ahorro coherente: pagar más rápido a la misma tasa ahorra (control de cordura del modelo)", () => {
    const a = simularPago(5_000_000, 0.03, 200_000)!;
    expect(a.total).toBeGreaterThan(5_000_000);
  });
});
