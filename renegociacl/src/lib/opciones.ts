// Genera y ordena las opciones de renegociación. Funciones puras: mismo dato de entrada, mismo resultado.
import {
  cae, caeDesdePagos, costoMismoPlazo, costoPlazoFijo, cuotaFrancesa, simularPago, tablaAmortizacion, type Abono,
} from "./amortizacion";
import { formatCLP, formatPct } from "./format";
import type { Actual, Credito, FilaTasa, Modo, OpcionRenegociacion, Resultado, TipoOpcion } from "./tipos";

export const PLAZO_MAX_CONSUMO = 60; // meses; tope de crédito de consumo (TODO: verificar con abogado)
export const TARJETA_MESES = 24;     // NCG 537 CMF: lo financiado en tarjeta se amortiza en máx. 24 meses (TODO: verificar con abogado)
const FACTORES_META = [0.85, 0.75, 0.65]; // metas hipotéticas: -15%, -25%, -35% de tu tasa actual
const PLAZOS_EXTENDIDOS = [36, 48, 60];
const MAX_OPCIONES = 5;
const TASA_MAX = 0.2;

const pct = (i: number): string => formatPct(i);
const meses = (n: number): string => `${n} ${n === 1 ? "mes" : "meses"}`;

interface Meta { tasa: number; gastos: number; nombre: string; esPropia: boolean }
interface Base {
  id: string; tipo: TipoOpcion; titulo: string; tasaMensual: number; nuevaCuota: number; nuevosMeses: number;
  totalPagar: number; gastos: number; esPropia: boolean; esHipotetica: boolean; caeAnual: number;
  primerosMeses?: OpcionRenegociacion["primerosMeses"];
}

/** Completa una opción con lo que se deriva de compararla con la situación actual. */
function armar(b: Base, act: Actual, cuotaActual: number): OpcionRenegociacion {
  const ahorroTotal = act.totalPagar - b.totalPagar;
  const alivioMensual = cuotaActual - b.nuevaCuota;
  const mesesMenos = Math.max(act.meses - b.nuevosMeses, 0);
  const gastosTxt = b.gastos > 0 ? ` (ya descontamos ${formatCLP(b.gastos)} de gastos)` : "";
  let resumen: string;
  switch (b.tipo) {
    case "tasa":
      resumen = `Ahorras ${formatCLP(ahorroTotal)}${mesesMenos > 0 ? ` y terminas ${meses(mesesMenos)} antes` : ""}. Tu cuota sigue en ${formatCLP(b.nuevaCuota)}${gastosTxt}.`;
      break;
    case "cuota":
      resumen = `Tu cuota baja ${formatCLP(alivioMensual)} al mes (queda en ${formatCLP(b.nuevaCuota)}). Ahorras ${formatCLP(ahorroTotal)} en total${gastosTxt}.`;
      break;
    case "plazo":
      resumen = `Tu cuota baja ${formatCLP(alivioMensual)} al mes (queda en ${formatCLP(b.nuevaCuota)}). ` +
        (ahorroTotal >= 0 ? `Ahorras ${formatCLP(ahorroTotal)} en total${gastosTxt}.` : `Pero pagas ${formatCLP(-ahorroTotal)} más en total por el plazo más largo${gastosTxt}.`);
      break;
    case "abono":
      resumen = `Ahorras ${formatCLP(ahorroTotal)} y terminas ${meses(mesesMenos)} antes pagando ${formatCLP(-alivioMensual)} más al mes. No necesitas renegociar nada.`;
      break;
    case "abonoUnico":
      resumen = `Ahorras ${formatCLP(ahorroTotal)} y terminas ${meses(mesesMenos)} antes si abonas hoy de una vez. Tu cuota sigue en ${formatCLP(b.nuevaCuota)}. No necesitas renegociar nada.`;
      break;
    default:
      resumen = `Ahorras ${formatCLP(ahorroTotal)} en intereses frente a dejar la tarjeta pagada en ${TARJETA_MESES} meses${gastosTxt}.`;
  }
  return { ...b, ahorroTotal, alivioMensual, mesesMenos, resumen };
}

/** CAE de un calendario de pagos real (con gastos al inicio y pago final parcial). */
function caeDeSimulacion(saldo: number, gastos: number, tasa: number, cuota: number, abonos: Abono[] = []): number {
  const t = tablaAmortizacion(saldo, tasa, cuota, abonos);
  if (!t) return cae(tasa);
  return caeDesdePagos(saldo, gastos, t.map((f) => f.pago + f.abono)) ?? cae(tasa);
}

export function generarOpciones(e: Credito, modo: Modo): Resultado {
  if (!(e.saldo > 0) || !(e.cuota > 0)) return { ok: false, error: "Ingresa el saldo que debes y tu cuota mensual." };
  if (!Number.isFinite(e.tasaMensual) || e.tasaMensual < 0 || e.tasaMensual >= TASA_MAX) {
    return { ok: false, error: "Ingresa tu tasa de interés en %, por ejemplo 2,1 al mes (entre 0% y 20% mensual)." };
  }
  const tabla = tablaAmortizacion(e.saldo, e.tasaMensual, e.cuota);
  if (!tabla) {
    return { ok: false, error: `Tu cuota (${formatCLP(e.cuota)}) no alcanza ni para pagar los intereses de un mes (${formatCLP(e.saldo * e.tasaMensual)}): con esos datos la deuda nunca baja. Revisa el saldo, la cuota y la tasa.` };
  }
  const totalActual = tabla.reduce((a, f) => a + f.pago + f.abono, 0);
  const actual: Actual = {
    meses: tabla.length, totalPagar: totalActual, intereses: totalActual - e.saldo, caeAnual: cae(e.tasaMensual),
    primerosMeses: tabla.slice(0, 3),
  };
  const comparacion: FilaTasa[] = [{ nombre: "Tu crédito", tasaMensual: e.tasaMensual, caeAnual: cae(e.tasaMensual) }];
  if (e.tarjeta && e.tarjeta.tasaMensual > 0) comparacion.push({ nombre: "Tu tarjeta", tasaMensual: e.tarjeta.tasaMensual, caeAnual: cae(e.tarjeta.tasaMensual) });
  for (const o of e.ofertas ?? []) if (o.tasaMensual > 0) comparacion.push({ nombre: o.nombre || "Otra oferta", tasaMensual: o.tasaMensual, caeAnual: cae(o.tasaMensual) });

  if (e.tasaMensual === 0) {
    return { ok: true, actual, opciones: [], comparacion, avisos: [], nota: "Tu crédito no cobra intereses: no hay nada que renegociar. Lo mejor es seguir pagando tu cuota." };
  }

  // Metas: primero lo que la persona ya recibió (si mejora su tasa); si no, metas hipotéticas.
  const ofertas = (e.ofertas ?? []).filter((o) => o.tasaMensual > 0);
  const avisos = ofertas.filter((o) => o.tasaMensual >= e.tasaMensual).map((o) =>
    `La oferta de ${o.nombre || "otro banco"} (${pct(o.tasaMensual)} mensual) no mejora tu tasa actual (${pct(e.tasaMensual)}), por eso no aparece en las opciones.`);
  const propias = ofertas.filter((o) => o.tasaMensual < e.tasaMensual);
  const metas: Meta[] = propias.length > 0
    ? propias.map((o) => ({ tasa: o.tasaMensual, gastos: Math.max(o.gastos ?? 0, 0), nombre: o.nombre || "otro banco", esPropia: true }))
    : FACTORES_META.map((f) => ({ tasa: e.tasaMensual * f, gastos: 0, nombre: "", esPropia: false }));
  metas.sort((a, b) => a.tasa - b.tasa);
  const mejor = metas[0];
  const etiqueta = (m: Meta): string => (m.esPropia ? `Tasa ${pct(m.tasa)} de ${m.nombre}` : `Si logras bajar tu tasa a ${pct(m.tasa)} mensual`);

  const cand: OpcionRenegociacion[] = [];
  metas.forEach((m, k) => {
    const s = simularPago(e.saldo, m.tasa, e.cuota);
    if (s) {
      cand.push(armar({ id: `tasa-${k}`, tipo: "tasa", titulo: `${etiqueta(m)}, manteniendo tu cuota`, tasaMensual: m.tasa, nuevaCuota: e.cuota,
        nuevosMeses: s.meses, totalPagar: s.total + m.gastos, gastos: m.gastos, esPropia: m.esPropia, esHipotetica: !m.esPropia,
        caeAnual: caeDeSimulacion(e.saldo, m.gastos, m.tasa, e.cuota),
        primerosMeses: tablaAmortizacion(e.saldo, m.tasa, e.cuota)?.slice(0, 3) }, actual, e.cuota));
    }
    const c = costoMismoPlazo(e.saldo, e.cuota, e.tasaMensual, m.tasa);
    if (c) {
      cand.push(armar({ id: `cuota-${k}`, tipo: "cuota", titulo: `${etiqueta(m)}, con el mismo plazo`, tasaMensual: m.tasa, nuevaCuota: c.cuota,
        nuevosMeses: c.meses, totalPagar: c.total + m.gastos, gastos: m.gastos, esPropia: m.esPropia, esHipotetica: !m.esPropia,
        caeAnual: caeDeSimulacion(e.saldo, m.gastos, m.tasa, c.cuota),
        primerosMeses: tablaAmortizacion(e.saldo, m.tasa, c.cuota)?.slice(0, 3) }, actual, e.cuota));
    }
  });
  for (const n of PLAZOS_EXTENDIDOS.filter((n) => n > actual.meses && n <= PLAZO_MAX_CONSUMO)) {
    const c = costoPlazoFijo(e.saldo, mejor.tasa, n);
    if (!c) continue;
    const tag = mejor.esPropia ? `Tasa ${pct(mejor.tasa)} de ${mejor.nombre}` : `Con tasa ${pct(mejor.tasa)}`;
    cand.push(armar({ id: `plazo-${n}`, tipo: "plazo", titulo: `${tag}, alargando a ${n} meses`, tasaMensual: mejor.tasa, nuevaCuota: c.cuota,
      nuevosMeses: c.meses, totalPagar: c.total + mejor.gastos, gastos: mejor.gastos, esPropia: mejor.esPropia, esHipotetica: !mejor.esPropia,
      caeAnual: caeDeSimulacion(e.saldo, mejor.gastos, mejor.tasa, c.cuota),
      primerosMeses: tablaAmortizacion(e.saldo, mejor.tasa, c.cuota)?.slice(0, 3) }, actual, e.cuota));
  }
  const extra = Math.max(Math.round((e.cuota * 0.1) / 1000) * 1000, 1000);
  const ab = simularPago(e.saldo, e.tasaMensual, e.cuota + extra);
  if (ab) {
    cand.push(armar({ id: "abono", tipo: "abono", titulo: `Sube tu cuota en ${formatCLP(extra)} (sin renegociar)`, tasaMensual: e.tasaMensual,
      nuevaCuota: e.cuota + extra, nuevosMeses: ab.meses, totalPagar: ab.total, gastos: 0, esPropia: false, esHipotetica: false,
      caeAnual: cae(e.tasaMensual), primerosMeses: tablaAmortizacion(e.saldo, e.tasaMensual, e.cuota + extra)?.slice(0, 3) }, actual, e.cuota));
  }
  if (e.abonoUnico && e.abonoUnico > 0 && e.abonoUnico < e.saldo) {
    const abonos: Abono[] = [{ mes: 0, monto: e.abonoUnico }];
    const s = simularPago(e.saldo, e.tasaMensual, e.cuota, abonos);
    if (s) {
      cand.push(armar({ id: "abonoUnico", tipo: "abonoUnico", titulo: `Abona ${formatCLP(e.abonoUnico)} hoy y sigue con tu cuota`, tasaMensual: e.tasaMensual,
        nuevaCuota: e.cuota, nuevosMeses: s.meses, totalPagar: s.total, gastos: 0, esPropia: false, esHipotetica: false,
        caeAnual: cae(e.tasaMensual), primerosMeses: tablaAmortizacion(e.saldo, e.tasaMensual, e.cuota, abonos)?.slice(0, 3) }, actual, e.cuota));
    }
  }
  if (e.tarjeta?.saldo && e.tarjeta.saldo > 0 && e.tarjeta.tasaMensual > 0) {
    const { saldo: sT, tasaMensual: tT } = e.tarjeta;
    const cT = cuotaFrancesa(sT, tT, TARJETA_MESES), cN = cuotaFrancesa(sT, mejor.tasa, TARJETA_MESES);
    const op = armar({ id: "tarjeta", tipo: "tarjeta", titulo: `Pasa tu tarjeta (${formatCLP(sT)}) a un crédito con tasa ${pct(mejor.tasa)}`,
      tasaMensual: mejor.tasa, nuevaCuota: cN, nuevosMeses: TARJETA_MESES, totalPagar: cN * TARJETA_MESES + mejor.gastos, gastos: mejor.gastos,
      esPropia: mejor.esPropia, esHipotetica: !mejor.esPropia, caeAnual: caeConGastosTarjeta(sT, mejor.gastos, cN) }, actual, e.cuota);
    // La comparación de la tarjeta es contra dejarla pagada en 24 meses, no contra el crédito.
    const ahorro = cT * TARJETA_MESES - op.totalPagar;
    cand.push({ ...op, ahorroTotal: ahorro, alivioMensual: cT - cN, mesesMenos: 0,
      resumen: `Ahorras ${formatCLP(ahorro)} en intereses frente a dejar la tarjeta a ${pct(tT)} mensual pagada en ${TARJETA_MESES} meses` +
        `${mejor.gastos > 0 ? ` (ya descontamos ${formatCLP(mejor.gastos)} de gastos)` : ""}.` });
  }

  // Modo "intereses": solo lo que ahorra plata (de las variantes "mismo plazo" se muestra la mejor meta).
  // Modo "cuota": solo lo que baja la cuota mensual.
  const sirve = (o: OpcionRenegociacion): boolean => modo === "intereses"
    ? o.ahorroTotal > 0 && (o.tipo !== "cuota" || o.id === "cuota-0")
    : (o.tipo === "cuota" || o.tipo === "plazo" || o.tipo === "tarjeta") && o.alivioMensual > 0;
  const criterio = (o: OpcionRenegociacion): number => (modo === "intereses" ? o.ahorroTotal : o.alivioMensual);
  const opciones = cand.filter(sirve).sort((a, b) => criterio(b) - criterio(a) || a.id.localeCompare(b.id)).slice(0, MAX_OPCIONES);
  return { ok: true, actual, opciones, comparacion, avisos };
}

function caeConGastosTarjeta(saldo: number, gastos: number, cuota: number): number {
  return caeDesdePagos(saldo, gastos, Array<number>(TARJETA_MESES).fill(cuota)) ?? 0;
}
