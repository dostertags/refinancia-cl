// Matemática de créditos: funciones PURAS (sin estado, sin DOM). Tasas como fracción mensual (0.02 = 2% mensual).
// Convención bancaria: interés del mes = saldo × tasa mensual (compuesto), cuota fija en pesos enteros, el último
// pago ajusta el saldo. Verificado contra una implementación de referencia con redondeo al peso (tests/matematica.test.ts).

export const MAX_MESES_SIM = 1200; // 100 años: tope de seguridad del bucle

/** Tasa efectiva anual equivalente a una tasa mensual compuesta (sin comisiones ni seguros). */
export const cae = (i: number): number => (1 + i) ** 12 - 1;

/** Tasa mensual compuesta equivalente a una tasa efectiva anual. */
export const tasaMensualDesdeAnual = (anual: number): number => (1 + anual) ** (1 / 12) - 1;

/** Cuota fija (sistema francés). `n` puede ser fraccionario (meses exactos de una deuda en curso). */
export function cuotaFrancesa(saldo: number, i: number, n: number): number {
  if (!(n > 0)) throw new Error("El plazo debe ser mayor a 0");
  return i === 0 ? saldo / n : (saldo * i) / (1 - (1 + i) ** -n);
}

/** Meses (fraccionarios) que toma pagar `saldo` con `cuota`. null si la cuota no cubre ni los intereses. */
export function mesesExactos(saldo: number, i: number, cuota: number): number | null {
  if (!(saldo > 0) || !(cuota > 0)) return null;
  if (i === 0) return saldo / cuota;
  if (cuota <= saldo * i + 1e-9) return null;
  return -Math.log(1 - (saldo * i) / cuota) / Math.log(1 + i);
}

/** Abono extra. mes 0 = antes de la primera cuota; mes k = justo después de pagar la cuota k. */
export interface Abono { mes: number; monto: number }
export interface FilaAmortizacion { mes: number; pago: number; interes: number; capital: number; abono: number; saldo: number }

/** Al pagar cuotas enteras en pesos, la deuda puede quedar con unos pesos de diferencia: es lo que el banco cobra en la última cuota. */
const toleranciaRedondeo = (i: number, m: number): number => (i === 0 ? 0.5 * m : (0.5 * ((1 + i) ** m - 1)) / i) + 1e-6;

/** Tabla de amortización mes a mes. null si la cuota no alcanza para pagar los intereses o pasa de MAX_MESES_SIM. */
export function tablaAmortizacion(saldo: number, i: number, cuota: number, abonos: Abono[] = []): FilaAmortizacion[] | null {
  if (!(saldo > 0) || !(cuota > 0)) return null;
  if (i > 0 && cuota <= saldo * i + 1e-9) return null;
  let bal = saldo;
  const filas: FilaAmortizacion[] = [];
  const aplicarAbonos = (mes: number): number => {
    let pagado = 0;
    for (const a of abonos) {
      if (a.mes === mes && a.monto > 0 && bal > 0) { const p = Math.min(a.monto, bal); bal -= p; pagado += p; }
    }
    return pagado;
  };
  const abono0 = aplicarAbonos(0);
  if (abono0 > 0 && bal <= 0) return [{ mes: 0, pago: 0, interes: 0, capital: 0, abono: abono0, saldo: 0 }];
  let pendienteAbono0 = abono0;
  for (let mes = 1; mes <= MAX_MESES_SIM; mes++) {
    const interes = bal * i;
    const conInteres = bal + interes;
    const ultimo = conInteres - cuota <= toleranciaRedondeo(i, mes);
    const pago = ultimo ? conInteres : cuota;
    bal = conInteres - pago;
    let abono = pendienteAbono0;
    pendienteAbono0 = 0;
    if (ultimo) bal = 0;
    else abono += aplicarAbonos(mes);
    if (!ultimo && bal <= 1e-9) bal = 0;
    filas.push({ mes, pago, interes, capital: pago - interes, abono, saldo: bal });
    if (bal <= 0) return filas;
  }
  return null;
}

/** Cuántos meses toma y cuánto se paga en total (incluye los abonos). null si nunca se salda. */
export function simularPago(saldo: number, i: number, cuota: number, abonos: Abono[] = []): { meses: number; total: number } | null {
  const t = tablaAmortizacion(saldo, i, cuota, abonos);
  if (!t) return null;
  let total = 0;
  for (const f of t) total += f.pago + f.abono;
  return { meses: t[t.length - 1].mes, total };
}

/** Cuota en pesos enteros (hacia arriba) de un crédito a `n` meses. */
const cuotaEntera = (saldo: number, i: number, n: number): number => Math.ceil(cuotaFrancesa(saldo, i, n) - 1e-6);

/** Costo de un crédito a plazo fijo `n`: cuota entera y último pago parcial, con el mismo criterio que la deuda actual. */
export function costoPlazoFijo(saldo: number, i: number, n: number): { cuota: number; meses: number; total: number } | null {
  const cuota = cuotaEntera(saldo, i, n);
  const s = simularPago(saldo, i, cuota);
  return s ? { cuota, meses: s.meses, total: s.total } : null;
}

/** "Mismo plazo": la nueva tasa con la fecha de término que ya tienes (meses exactos de tu deuda actual). */
export function costoMismoPlazo(saldo: number, cuotaActual: number, iActual: number, iNuevo: number): { cuota: number; meses: number; total: number } | null {
  const n = mesesExactos(saldo, iActual, cuotaActual);
  if (n === null) return null;
  const cuota = cuotaEntera(saldo, iNuevo, n);
  const s = simularPago(saldo, iNuevo, cuota);
  return s ? { cuota, meses: s.meses, total: s.total } : null;
}

/**
 * CAE = TIR anualizada de los flujos reales. `gastos` se pagan de tu bolsillo al inicio (bajan lo que efectivamente recibes).
 * `pagos` = lo que pagas cada mes. Bisección: robusta y sin dependencias. Devuelve null si no hay TIR razonable (<100% mensual).
 */
export function caeDesdePagos(saldo: number, gastos: number, pagos: number[]): number | null {
  const neto = saldo - gastos;
  if (!(neto > 0) || pagos.length === 0) return null;
  const vp = (i: number): number => pagos.reduce((a, p, k) => a + p / (1 + i) ** (k + 1), 0);
  if (vp(0) <= neto) return 0;
  let lo = 0, hi = 1;
  if (vp(hi) > neto) return null;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (vp(mid) > neto) lo = mid; else hi = mid;
  }
  return cae((lo + hi) / 2);
}

export function caeConGastos(saldo: number, gastos: number, cuota: number, n: number): number {
  return caeDesdePagos(saldo, gastos, Array<number>(n).fill(cuota)) ?? cae(0);
}
