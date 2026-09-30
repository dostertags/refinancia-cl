// Barrido de casos aleatorios (con semilla fija): el motor debe cumplir SIEMPRE estas reglas de consistencia.
import { describe, expect, it } from "vitest";
import { cuotaFrancesa, tablaAmortizacion } from "../src/lib/amortizacion";
import { parseMercado } from "../src/lib/mercado";
import { generarOpciones } from "../src/lib/opciones";
import type { Credito, Modo, TarjetaEntrada } from "../src/lib/tipos";
import subset from "./fixtures/rates-sernac-subset.json";

const M = parseMercado(subset);

function prng(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const entre = (r: () => number, a: number, b: number): number => a + r() * (b - a);
const redondea = (n: number, paso: number): number => Math.round(n / paso) * paso;

function caso(r: () => number): { e: Credito; modo: Modo; seguro: boolean } {
  const saldo = redondea(entre(r, 1_000_000, 18_000_000), 10_000);
  const tasa = +entre(r, 0.006, 0.035).toFixed(4);
  const n = Math.floor(entre(r, 6, 60));
  const cuota = Math.ceil(cuotaFrancesa(saldo, tasa, n));
  const e: Credito = { saldo, cuota };
  const que = r();
  if (que < 0.4) e.tasaMensual = tasa; else if (que < 0.8) e.mesesRestantes = n; else { e.tasaMensual = tasa; e.mesesRestantes = n; }
  const nt = Math.floor(r() * 4);
  const tarjetas: TarjetaEntrada[] = [];
  for (let k = 0; k < nt; k++) {
    const s = redondea(entre(r, 100_000, 4_000_000), 10_000);
    const t: TarjetaEntrada = { saldo: s, incluir: r() < 0.7 };
    const f = r();
    if (f < 0.4) t.pagoMensual = Math.ceil(cuotaFrancesa(s, entre(r, 0.01, 0.04), 24));
    else if (f < 0.8) t.tasaMensual = +entre(r, 0.01, 0.04).toFixed(4);
    else { t.tasaMensual = +entre(r, 0.01, 0.04).toFixed(4); t.pagoMensual = Math.ceil(cuotaFrancesa(s, t.tasaMensual, Math.floor(entre(r, 6, 36)))); }
    tarjetas.push(t);
  }
  if (tarjetas.length) e.tarjetas = tarjetas;
  if (r() < 0.3) e.ofertas = [{ nombre: "Banco X", tasaMensual: +entre(r, 0.005, 0.02).toFixed(4), gastos: redondea(entre(r, 0, 150_000), 1000) }];
  if (r() < 0.3) e.abonoUnico = redondea(entre(r, 100_000, saldo * 0.5), 10_000);
  return { e, modo: r() < 0.5 ? "intereses" : "cuota", seguro: r() < 0.5 };
}

const sinNaN = (v: unknown): boolean => JSON.stringify(v, (_k, x) => (typeof x === "number" && !Number.isFinite(x) ? "__NAN__" : x)).indexOf("__NAN__") === -1;

describe("barrido de consistencia (1500 casos)", () => {
  const r = prng(20260930);
  const casos = Array.from({ length: 1500 }, () => caso(r));

  it("no hay NaN/Infinity y los totales cuadran", () => {
    const fallas: string[] = [];
    casos.forEach(({ e, modo, seguro }, k) => {
      const res = generarOpciones(e, modo, M, { seguro });
      if (!res.ok) { fallas.push(`#${k} error inesperado: ${res.error}`); return; }
      if (!sinNaN(res)) fallas.push(`#${k} NaN/Infinity`);
      // Total a refinanciar = crédito + tarjetas marcadas (las que trajeron datos suficientes)
      const esperado = (e.saldo ?? 0) + (e.tarjetas ?? []).filter((t) => t.incluir !== false).reduce((a, t) => a + (t.saldo ?? 0), 0);
      if (res.refinanciar.total !== esperado) fallas.push(`#${k} total a refinanciar ${res.refinanciar.total} != ${esperado}`);
      const suma = res.refinanciar.partes.reduce((a, p) => a + p.saldo, 0);
      if (suma !== res.refinanciar.total) fallas.push(`#${k} partes ${suma} != total ${res.refinanciar.total}`);
      for (const o of res.opciones) {
        if (Math.abs(o.ahorroTotal - (res.actual.totalPagar - o.totalPagar)) > 1) fallas.push(`#${k} ${o.id} ahorro inconsistente`);
        if (Math.abs(o.alivioMensual - (res.actual.cuotaTotal - o.nuevaCuota)) > 1) fallas.push(`#${k} ${o.id} alivio inconsistente`);
        if (o.tipo !== "mercado" && o.tipo !== "abono" && o.tipo !== "abonoUnico" && o.calendario) {
          const pagado = o.calendario.reduce((a, f) => a + f.pago + f.abono, 0);
          if (Math.abs(pagado + o.gastos - o.totalPagar) > 1) fallas.push(`#${k} ${o.id} calendario ${pagado} + gastos != total ${o.totalPagar}`);
        }
      }
      // Orden: de mejor a peor según lo que importa
      const crit = (o: (typeof res.opciones)[number]): number => (modo === "intereses" ? o.ahorroTotal : o.alivioMensual);
      for (let i = 1; i < res.opciones.length; i++) if (crit(res.opciones[i - 1]) < crit(res.opciones[i]) - 1e-6) fallas.push(`#${k} orden roto`);
    });
    expect(fallas.slice(0, 15)).toEqual([]);
  });

  it("ida y vuelta: los meses que escribes son los que muestra 'Hoy' y la tasa calculada reproduce tu cuota", () => {
    const fallas: string[] = [];
    casos.forEach(({ e }, k) => {
      if (e.tasaMensual !== undefined || !e.mesesRestantes) return;
      const res = generarOpciones({ saldo: e.saldo, cuota: e.cuota, mesesRestantes: e.mesesRestantes }, "intereses", null);
      if (!res.ok) { fallas.push(`#${k} ${res.error}`); return; }
      if (Math.abs(res.actual.meses - e.mesesRestantes) > 1) fallas.push(`#${k} meses ${res.actual.meses} != ${e.mesesRestantes}`);
    });
    expect(fallas.slice(0, 15)).toEqual([]);
  });

  it("toda tabla de amortización termina en 0 y su capital suma el saldo", () => {
    let revisadas = 0;
    for (const { e } of casos.slice(0, 400)) {
      if (e.tasaMensual === undefined) continue;
      const t = tablaAmortizacion(e.saldo!, e.tasaMensual, e.cuota!);
      if (!t) continue;
      revisadas++;
      expect(t[t.length - 1].saldo).toBe(0);
      expect(Math.abs(t.reduce((a, f) => a + f.capital, 0) - e.saldo!)).toBeLessThan(0.01);
    }
    expect(revisadas).toBeGreaterThan(50);
  });
});
