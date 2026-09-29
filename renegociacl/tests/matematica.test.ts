// Auditoría matemática: se contrasta el motor contra una implementación de referencia INDEPENDIENTE
// (tabla de amortización estilo banco: interés redondeado al peso cada mes, última cuota ajustada).
import { describe, expect, it } from "vitest";
import {
  cae, caeConGastos, costoMismoPlazo, costoPlazoFijo, cuotaFrancesa, generarOpciones, mesesExactos,
  simularPago, tablaAmortizacion, tasaMensualDesdeAnual,
} from "@/lib/calc";

/** Referencia: como lo hace un banco. Plazo contratado `n`, cuota entera, interés = round(saldo*i) cada mes y la ÚLTIMA cuota
 *  se ajusta para cerrar el saldo (un banco no cobra un mes extra por unos pesos de redondeo). */
function referenciaBanco(saldo: number, i: number, cuota: number, n: number) {
  let s = saldo, total = 0;
  for (let mes = 1; mes <= n; mes++) {
    const interes = Math.round(s * i);
    const pago = mes === n ? s + interes : Math.min(cuota, s + interes);
    s = s + interes - pago; total += pago;
  }
  return { meses: n, total };
}

const CASOS: [number, number, number][] = [
  [1_000_000, 0.015, 24], [5_000_000, 0.025, 60], [300_000, 0.04, 12], [12_000_000, 0.0199, 48], [100_000_000, 0.004, 360],
];

describe("contraste con la referencia de banco (redondeo al peso)", () => {
  it.each(CASOS)("saldo %i, tasa %f, %i meses: meses iguales y total dentro de ±(n·0,5+2) pesos", (saldo, i, n) => {
    const cuota = Math.ceil(cuotaFrancesa(saldo, i, n));
    const ref = referenciaBanco(saldo, i, cuota, n);
    const sim = simularPago(saldo, i, cuota)!;
    expect(sim.meses).toBe(ref.meses);
    expect(Math.abs(sim.total - ref.total)).toBeLessThanOrEqual(n * 0.5 + 2);
  });

  it("el error por no redondear cada mes nunca supera $250 aunque sean 30 años", () => {
    const [saldo, i, n] = CASOS[4];
    const cuota = Math.ceil(cuotaFrancesa(saldo, i, n));
    expect(Math.abs(simularPago(saldo, i, cuota)!.total - referenciaBanco(saldo, i, cuota, n).total)).toBeLessThan(250);
  });
});

describe("caso conocido y plazos largos", () => {
  it("$1.000.000 al 1,5% a 24 meses: cuota $49.924 y CTC $1.198.176 (±$60 por redondeo)", () => {
    expect(Math.round(cuotaFrancesa(1_000_000, 0.015, 24))).toBe(49_924);
    expect(Math.abs(simularPago(1_000_000, 0.015, 49_924)!.total - 1_198_176)).toBeLessThan(60);
  });
  it("30 años: 360 meses exactos con la cuota francesa", () => {
    const c = Math.ceil(cuotaFrancesa(100_000_000, 0.004, 360));
    expect(simularPago(100_000_000, 0.004, c)!.meses).toBe(360);
  });
  it("tasa 0%: total = capital y meses = techo(saldo/cuota)", () => {
    const r = simularPago(1_000_000, 0, 300_000)!;
    expect(r.meses).toBe(4);
    expect(r.total).toBeCloseTo(1_000_000);
  });
  it("mesesExactos concuerda con la fórmula cerrada", () => {
    expect(mesesExactos(1_000_000, 0.015, cuotaFrancesa(1_000_000, 0.015, 24))).toBeCloseTo(24, 6);
    expect(mesesExactos(1_000_000, 0, 100_000)).toBeCloseTo(10, 9);
    expect(mesesExactos(1_000_000, 0.02, 20_000)).toBeNull();
  });
});

describe("invariantes de la tabla de amortización", () => {
  const cuota = Math.ceil(cuotaFrancesa(2_000_000, 0.02, 24));
  const t = tablaAmortizacion(2_000_000, 0.02, cuota)!;
  it("interés = saldo anterior × tasa y capital = cuota − interés", () => {
    let prev = 2_000_000;
    for (const f of t.slice(0, -1)) {
      expect(f.interes).toBeCloseTo(prev * 0.02, 6);
      expect(f.capital).toBeCloseTo(f.pago - f.interes, 6);
      prev = f.saldo;
    }
  });
  it("el capital pagado suma exactamente el saldo y termina en 0", () => {
    expect(t.reduce((a, f) => a + f.capital, 0)).toBeCloseTo(2_000_000, 4);
    expect(t[t.length - 1].saldo).toBeCloseTo(0, 6);
  });
  it("pagos totales = capital + intereses", () => {
    expect(t.reduce((a, f) => a + f.pago, 0)).toBeCloseTo(2_000_000 + t.reduce((a, f) => a + f.interes, 0), 4);
  });
  it("coincide con simularPago", () => {
    const s = simularPago(2_000_000, 0.02, cuota)!;
    expect(t.length).toBe(s.meses);
    expect(t.reduce((a, f) => a + f.pago, 0)).toBeCloseTo(s.total, 4);
  });
});

describe("propiedades (monotonía)", () => {
  it("más cuota -> menos meses y menos total", () => {
    const a = simularPago(3_000_000, 0.03, 160_000)!, b = simularPago(3_000_000, 0.03, 200_000)!;
    expect(b.meses).toBeLessThan(a.meses);
    expect(b.total).toBeLessThan(a.total);
  });
  it("menos tasa -> menos total con la misma cuota", () => {
    expect(simularPago(3_000_000, 0.02, 160_000)!.total).toBeLessThan(simularPago(3_000_000, 0.03, 160_000)!.total);
  });
});

describe("abonos parciales (prepago)", () => {
  it("un abono a mitad de camino baja meses y total, y conserva el capital", () => {
    const base = simularPago(3_000_000, 0.03, 153_000)!;
    const conAbono = simularPago(3_000_000, 0.03, 153_000, [{ mes: 6, monto: 500_000 }])!;
    expect(conAbono.meses).toBeLessThan(base.meses);
    expect(conAbono.total).toBeLessThan(base.total);
  });
  it("un abono mayor al saldo cierra la deuda sin pagar de más", () => {
    const r = simularPago(1_000_000, 0.02, 100_000, [{ mes: 1, monto: 5_000_000 }])!;
    expect(r.meses).toBe(1);
    expect(r.total).toBeLessThan(1_000_000 * 1.02 + 1);
  });
  it("el abono en el mes 0 equivale a partir con menos deuda (el abono cuenta como pagado)", () => {
    const r = simularPago(3_000_000, 0.03, 153_000, [{ mes: 0, monto: 500_000 }])!;
    const directo = simularPago(2_500_000, 0.03, 153_000)!;
    expect(r.meses).toBe(directo.meses);
    expect(r.total).toBeCloseTo(directo.total + 500_000, 4);
  });
});

describe("comparación consistente de plazos (mismo criterio que la deuda actual)", () => {
  it.each([[3_000_000, 153_000, 0.03], [1_000_000, 49_924, 0.015], [8_000_000, 210_000, 0.022]])(
    "a la MISMA tasa, 'mismo plazo' no inventa ahorro (saldo %i, cuota %i, tasa %f)", (saldo, cuota, i) => {
      const actual = simularPago(saldo, i, cuota)!;
      const mismo = costoMismoPlazo(saldo, cuota, i, i)!;
      expect(mismo.cuota).toBeCloseTo(cuota, -1);
      expect(Math.abs(mismo.total - actual.total)).toBeLessThan(cuota * 0.02 + 60);
    });
  it("a menor tasa, 'mismo plazo' baja la cuota y el total", () => {
    const r = costoMismoPlazo(3_000_000, 153_000, 0.03, 0.02)!;
    expect(r.cuota).toBeLessThan(153_000);
    expect(r.total).toBeLessThan(simularPago(3_000_000, 0.03, 153_000)!.total);
  });
  it("costoPlazoFijo: cuota redondeada hacia arriba y pago final parcial", () => {
    const r = costoPlazoFijo(3_000_000, 0.02, 36)!;
    expect(r.cuota).toBe(Math.ceil(cuotaFrancesa(3_000_000, 0.02, 36)));
    expect(r.meses).toBeLessThanOrEqual(36);
  });
});

describe("CAE con gastos (TIR de los flujos)", () => {
  it("sin gastos coincide con la tasa efectiva anual", () => {
    const n = 24, c = cuotaFrancesa(1_000_000, 0.015, n);
    expect(caeConGastos(1_000_000, 0, c, n)).toBeCloseTo(cae(0.015), 6);
  });
  it("los gastos suben el CAE, y más si el plazo es corto", () => {
    const c12 = cuotaFrancesa(1_000_000, 0.015, 12), c36 = cuotaFrancesa(1_000_000, 0.015, 36);
    const corto = caeConGastos(1_000_000, 50_000, c12, 12), largo = caeConGastos(1_000_000, 50_000, c36, 36);
    expect(corto).toBeGreaterThan(cae(0.015));
    expect(corto).toBeGreaterThan(largo);
  });
  it("cada opción con gastos informa un CAE mayor que el de su tasa", () => {
    const r = generarOpciones({ saldo: 3_000_000, cuota: 153_000, tasaMensual: 0.03, ofertas: [{ nombre: "Banco", tasaMensual: 0.015, gastos: 90_000 }] }, "intereses");
    if (!r.ok) throw new Error("ok");
    for (const o of r.opciones.filter((x) => x.gastos > 0)) expect(o.caeAnual).toBeGreaterThan(cae(o.tasaMensual));
  });
});

describe("tasa anual vs mensual (compuesta)", () => {
  it("un CAE de 26,8242% equivale a 2% mensual", () => expect(tasaMensualDesdeAnual(0.268242)).toBeCloseTo(0.02, 6));
  it("ida y vuelta", () => expect(cae(tasaMensualDesdeAnual(0.31))).toBeCloseTo(0.31, 9));
});

describe("tasa 0% (cuotas sin interés)", () => {
  it("es válida: no hay nada que renegociar y lo explica", () => {
    const r = generarOpciones({ saldo: 1_000_000, cuota: 100_000, tasaMensual: 0 }, "intereses");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.opciones).toEqual([]);
      expect(r.actual.intereses).toBeCloseTo(0, 6);
      expect(r.nota).toMatch(/no cobra intereses/i);
    }
  });
});

describe("ofertas y avisos honestos", () => {
  it("una oferta peor que tu tasa se informa en vez de desaparecer", () => {
    const r = generarOpciones({ saldo: 3_000_000, cuota: 153_000, tasaMensual: 0.03, ofertas: [{ nombre: "Caro", tasaMensual: 0.035 }] }, "intereses");
    if (!r.ok) throw new Error("ok");
    expect(r.avisos.join(" ")).toMatch(/Caro/);
    expect(r.avisos.join(" ")).toMatch(/no mejora tu tasa/i);
  });
  it("la opción de tarjeta hipotética queda marcada como no real", () => {
    const r = generarOpciones({ saldo: 3_000_000, cuota: 153_000, tasaMensual: 0.03, tarjeta: { saldo: 2_000_000, tasaMensual: 0.035 } }, "intereses");
    if (!r.ok) throw new Error("ok");
    const t = r.opciones.find((o) => o.tipo === "tarjeta")!;
    expect(t.esPropia).toBe(false);
    expect(t.esHipotetica).toBe(true);
  });
  it("con una oferta real, ninguna opción es hipotética (salvo abono)", () => {
    const r = generarOpciones({ saldo: 3_000_000, cuota: 153_000, tasaMensual: 0.03, ofertas: [{ nombre: "Banco", tasaMensual: 0.015 }] }, "intereses");
    if (!r.ok) throw new Error("ok");
    expect(r.opciones.filter((o) => o.tipo !== "abono").every((o) => !o.esHipotetica)).toBe(true);
  });
});

describe("abono único opcional", () => {
  it("aparece como opción, descuenta el abono del ahorro y baja los meses", () => {
    const r = generarOpciones({ saldo: 3_000_000, cuota: 153_000, tasaMensual: 0.03, abonoUnico: 500_000 }, "intereses");
    if (!r.ok) throw new Error("ok");
    const o = r.opciones.find((x) => x.tipo === "abonoUnico")!;
    expect(o).toBeDefined();
    expect(o.mesesMenos).toBeGreaterThan(0);
    const directo = simularPago(2_500_000, 0.03, 153_000)!;
    expect(o.ahorroTotal).toBeCloseTo(r.actual.totalPagar - (directo.total + 500_000), 0);
  });
});
