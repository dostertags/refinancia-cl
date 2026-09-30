// Reglas acordadas: crédito = saldo + cuota + (tasa o meses restantes); tarjetas = saldo + (pago mensual o tasa),
// hasta 3, con casilla "incluir" (por defecto sí). Lo incluido se suma al total a refinanciar.
import { describe, expect, it } from "vitest";
import { parseMercado } from "@/lib/mercado";
import subset from "./fixtures/rates-sernac-subset.json";
import { cuotaFrancesa, generarOpciones, sumarTablas, tablaAmortizacion, tasaDesdeMeses, type Credito, type Resultado } from "@/lib/calc";

const M = parseMercado(subset)!;
const base: Credito = { saldo: 3_000_000, cuota: 153_000, tasaMensual: 0.03 };
// Una oferta real que ingresó la persona (las opciones "tasa/cuota/plazo" solo nacen de ofertas reales, nunca inventadas).
const oferta = { nombre: "Banco Amigo", tasaMensual: 0.012 };
const ok = (r: Resultado) => { if (!r.ok) throw new Error(r.error); return r; };
const tasaCredito = (r: Resultado) => ok(r).comparacion.find((f) => f.nombre === "Tu crédito")!.tasaMensual;

describe("tasaDesdeMeses (tasa implícita)", () => {
  it("ida y vuelta con la cuota francesa", () => {
    expect(tasaDesdeMeses(1_000_000, cuotaFrancesa(1_000_000, 0.02, 24), 24)).toBeCloseTo(0.02, 6);
    expect(tasaDesdeMeses(5_000_000, cuotaFrancesa(5_000_000, 0.0125, 48), 48)).toBeCloseTo(0.0125, 6);
  });
  it("sin intereses da 0", () => expect(tasaDesdeMeses(1_200_000, 100_000, 12)).toBe(0));
  it("si la cuota no alcanza para pagar el saldo en esos meses, null", () => expect(tasaDesdeMeses(3_000_000, 50_000, 12)).toBeNull());
  it("si implicaría más de 20% mensual, null", () => expect(tasaDesdeMeses(1_000_000, 1_000_000 * 0.5, 3)).toBeNull());
});

describe("sumarTablas", () => {
  it("suma mes a mes y termina cuando termina la última", () => {
    const a = tablaAmortizacion(1_000_000, 0.02, 100_000)!, b = tablaAmortizacion(500_000, 0.02, 100_000)!;
    const s = sumarTablas([a, b]);
    expect(s).toHaveLength(Math.max(a.length, b.length));
    expect(s[0].pago).toBeCloseTo(a[0].pago + b[0].pago, 6);
    expect(s[s.length - 1].saldo).toBeCloseTo(0, 6);
  });
});

describe("crédito: tasa o meses restantes, al menos uno", () => {
  it("sin ninguno de los dos explica qué falta", () => {
    const r = generarOpciones({ saldo: 3_000_000, cuota: 153_000 }, "intereses");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/tasa.*meses|meses.*tasa/i);
  });
  it("solo meses restantes: calcula la tasa y lo dice", () => {
    const r = ok(generarOpciones({ saldo: 3_000_000, cuota: 153_000, mesesRestantes: 31 }, "intereses", M));
    expect(r.supuestos.join(" ")).toMatch(/a partir de los meses que te faltan/i);
    expect(Math.abs(tasaCredito(r) - 0.03)).toBeLessThan(0.004);
    expect(Math.abs(r.actual.meses - 31)).toBeLessThanOrEqual(1);
    expect(r.opciones.length).toBeGreaterThanOrEqual(3);
  });
  it("solo tasa sigue funcionando y no agrega supuestos", () => expect(ok(generarOpciones(base, "intereses")).supuestos).toEqual([]));
  it("meses imposibles con esa cuota: error claro", () => {
    const r = generarOpciones({ saldo: 3_000_000, cuota: 50_000, mesesRestantes: 12 }, "intereses");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no alcanzas a pagar/i);
  });
  it("tasa y meses que no calzan: usa la tasa y avisa", () => {
    const r = ok(generarOpciones({ ...base, mesesRestantes: 60 }, "intereses"));
    expect(r.avisos.join(" ")).toMatch(/no calzan/i);
    expect(tasaCredito(r)).toBeCloseTo(0.03, 9);
  });
  it("tasa 0 explícita sigue siendo válida", () => expect(ok(generarOpciones({ saldo: 1_000_000, cuota: 100_000, tasaMensual: 0 }, "intereses")).nota).toMatch(/no cobra intereses/i));
});

describe("tarjetas: total a refinanciar", () => {
  const tarj = { nombre: "Falabella", saldo: 2_000_000, pagoMensual: 100_000, tasaMensual: 0.035 };
  const conTarjeta = ok(generarOpciones({ ...base, tarjetas: [tarj] }, "intereses"));

  it("suma el saldo de la tarjeta al total a refinanciar y muestra el desglose", () => {
    expect(conTarjeta.refinanciar.total).toBe(5_000_000);
    expect(conTarjeta.refinanciar.partes.map((p) => p.nombre)).toEqual(["Tu crédito", "Falabella"]);
    expect(conTarjeta.refinanciar.partes.reduce((a, p) => a + p.saldo, 0)).toBe(5_000_000);
  });
  it("lo que pagas hoy incluye la tarjeta", () => {
    expect(conTarjeta.actual.cuotaTotal).toBe(253_000);
    const sola = ok(generarOpciones(base, "intereses"));
    expect(conTarjeta.actual.totalPagar).toBeGreaterThan(sola.actual.totalPagar + 2_000_000);
  });
  it("las opciones de refinanciar mantienen la cuota total (crédito + tarjeta) o la bajan, nunca la ignoran", () => {
    const conOf = ok(generarOpciones({ ...base, tarjetas: [tarj], ofertas: [oferta] }, "intereses"));
    const tasa = conOf.opciones.find((o) => o.tipo === "tasa")!;
    expect(tasa.nuevaCuota).toBe(253_000);
    const cuotaOpt = ok(generarOpciones({ ...base, tarjetas: [tarj], ofertas: [oferta] }, "cuota")).opciones[0];
    expect(cuotaOpt.nuevaCuota).toBeLessThan(253_000);
  });
  it("incluir la tarjeta cara ahorra más que dejarla fuera", () => {
    const dentro = ok(generarOpciones({ ...base, tarjetas: [tarj], ofertas: [oferta] }, "intereses"));
    const fuera = ok(generarOpciones({ ...base, tarjetas: [{ ...tarj, incluir: false }], ofertas: [oferta] }, "intereses"));
    expect(dentro.opciones[0].ahorroTotal).toBeGreaterThan(fuera.opciones[0].ahorroTotal);
  });
  it("incluir=false: no suma al total a refinanciar pero sigue en tu situación de hoy y en la nueva cuota", () => {
    const r = ok(generarOpciones({ ...base, tarjetas: [{ ...tarj, incluir: false }], ofertas: [oferta] }, "intereses"));
    expect(r.refinanciar.total).toBe(3_000_000);
    expect(r.refinanciar.excluidas.map((e) => e.nombre)).toEqual(["Falabella"]);
    expect(r.actual.cuotaTotal).toBe(253_000);
    expect(r.opciones.find((o) => o.tipo === "tasa")!.nuevaCuota).toBe(253_000);
  });
  it("incluir se asume verdadero cuando no se indica", () => expect(conTarjeta.refinanciar.partes).toHaveLength(2));
  it("los gráficos usan el total de TODAS las deudas (hoy vs. cada opción)", () => {
    for (const o of conTarjeta.opciones) expect(o.totalPagar).toBeCloseTo(conTarjeta.actual.totalPagar - o.ahorroTotal, 4);
  });
  it("si la tarjeta es barata, avisa que dejarla fuera ahorra más", () => {
    const r = ok(generarOpciones({ ...base, ofertas: [oferta], tarjetas: [{ nombre: "Barata", saldo: 2_000_000, pagoMensual: 90_000, tasaMensual: 0.008 }] }, "intereses"));
    expect(r.avisos.join(" ")).toMatch(/Barata.*fuera|fuera.*Barata/i);
  });
});

describe("tarjetas: tasa o pago mensual, al menos uno", () => {
  it("saldo + pago mensual, sin tasa: calcula la tasa suponiendo 24 meses y lo dice", () => {
    const r = ok(generarOpciones({ ...base, tarjetas: [{ saldo: 2_000_000, pagoMensual: 100_000 }] }, "intereses"));
    expect(r.supuestos.join(" ")).toMatch(/24 meses/);
    expect(r.refinanciar.total).toBe(5_000_000);
    expect(r.comparacion.find((f) => f.nombre === "Tu tarjeta")!.tasaMensual).toBeGreaterThan(0);
  });
  it("saldo + tasa, sin pago: calcula el pago a 24 meses y lo dice", () => {
    const r = ok(generarOpciones({ ...base, tarjetas: [{ saldo: 2_000_000, tasaMensual: 0.035 }] }, "intereses"));
    expect(r.supuestos.join(" ")).toMatch(/24 meses/);
    expect(r.actual.cuotaTotal).toBe(153_000 + Math.ceil(cuotaFrancesa(2_000_000, 0.035, 24)));
  });
  it("solo saldo: no inventa nada, explica qué falta y sigue con el crédito", () => {
    const r = ok(generarOpciones({ ...base, tarjetas: [{ nombre: "Ripley", saldo: 2_000_000 }] }, "intereses"));
    expect(r.avisos.join(" ")).toMatch(/Ripley.*necesito su pago mensual o su tasa/i);
    expect(r.refinanciar.total).toBe(3_000_000);
    expect(r.actual.cuotaTotal).toBe(153_000);
  });
  it("pago que no alcanza a pagarla en 24 meses y sin tasa: pide la tasa", () => {
    const r = ok(generarOpciones({ ...base, tarjetas: [{ nombre: "Ripley", saldo: 2_000_000, pagoMensual: 30_000 }] }, "intereses"));
    expect(r.avisos.join(" ")).toMatch(/Ripley.*necesito su tasa/i);
    expect(r.refinanciar.total).toBe(3_000_000);
  });
  it("pago que no cubre ni los intereses (con tasa dada): la deja fuera y avisa", () => {
    const r = ok(generarOpciones({ ...base, tarjetas: [{ nombre: "Ripley", saldo: 2_000_000, pagoMensual: 20_000, tasaMensual: 0.035 }] }, "intereses"));
    expect(r.avisos.join(" ")).toMatch(/Ripley.*no alcanza/i);
    expect(r.refinanciar.total).toBe(3_000_000);
  });
  it("datos de tarjeta sin saldo: avisa que falta el total que debe", () => {
    const r = ok(generarOpciones({ ...base, tarjetas: [{ nombre: "Ripley", pagoMensual: 50_000 }] }, "intereses"));
    expect(r.avisos.join(" ")).toMatch(/Ripley.*necesito el total que debes/i);
    expect(r.refinanciar.total).toBe(3_000_000);
  });
  it("saldo 0 o vacío se ignora sin ruido", () => {
    const r = ok(generarOpciones({ ...base, tarjetas: [{ saldo: 0 }, { saldo: NaN }] }, "intereses", M));
    expect(r.avisos).toEqual([]);
    expect(r.refinanciar.total).toBe(3_000_000);
  });
});

describe("hasta 3 tarjetas", () => {
  const t = (n: number) => ({ nombre: `T${n}`, saldo: 500_000, pagoMensual: 30_000, tasaMensual: 0.035 });
  it("con 3 suma las tres", () => expect(ok(generarOpciones({ ...base, tarjetas: [t(1), t(2), t(3)] }, "intereses")).refinanciar.total).toBe(4_500_000));
  it("una cuarta se ignora y se avisa el máximo", () => {
    const r = ok(generarOpciones({ ...base, tarjetas: [t(1), t(2), t(3), t(4)] }, "intereses"));
    expect(r.refinanciar.total).toBe(4_500_000);
    expect(r.avisos.join(" ")).toMatch(/máximo de 3/i);
  });
  it("con varias, los nombres por defecto son Tarjeta 1, 2, 3", () => {
    const r = ok(generarOpciones({ ...base, tarjetas: [{ saldo: 500_000, pagoMensual: 30_000 }, { saldo: 600_000, pagoMensual: 40_000 }] }, "intereses"));
    expect(r.refinanciar.partes.map((p) => p.nombre)).toEqual(["Tu crédito", "Tarjeta 1", "Tarjeta 2"]);
  });
});

describe("meses restantes + tarjeta + oferta real (caso completo)", () => {
  it("consolida crédito y tarjetas con una oferta real, descontando gastos", () => {
    const r = ok(generarOpciones({
      saldo: 5_000_000, cuota: 200_000, mesesRestantes: 32,
      tarjetas: [{ nombre: "Falabella", saldo: 1_200_000, pagoMensual: 60_000 }, { nombre: "Ripley", saldo: 800_000, tasaMensual: 0.04 }],
      ofertas: [{ nombre: "Banco Amigo", tasaMensual: 0.013, gastos: 80_000 }],
    }, "intereses"));
    expect(r.refinanciar.total).toBe(7_000_000);
    expect(r.opciones[0].titulo).toContain("Banco Amigo");
    expect(r.opciones[0].gastos).toBe(80_000);
    expect(r.opciones[0].ahorroTotal).toBeGreaterThan(0);
    expect(r.supuestos.length).toBeGreaterThanOrEqual(2);
  });
});
