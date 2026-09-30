// Genera y ordena las opciones de renegociación. Funciones puras: mismo dato de entrada, mismo resultado.
//
// Las opciones salen SOLO de datos reales:
//  · simulaciones oficiales del Comparador de créditos de consumo del SERNAC (informadas por cada institución), o
//  · ofertas que la persona ingresó.
// No se inventan tasas ni "metas de negociación". Sin datos de mercado ni ofertas, solo quedan opciones que no requieren renegociar.
//
// Reglas de entrada (acordadas):
//  · Crédito: saldo y cuota obligatorios + (tasa o meses restantes: al menos uno; se calcula el que falte). Puede faltar entero si hay tarjetas.
//  · Tarjetas (hasta 3): saldo obligatorio + (pago mensual o tasa: al menos uno). Cada una se puede incluir o no en el refinanciamiento.
//  · Una tarjeta a medio llenar NO se ignora en silencio: se devuelve un error que dice qué falta.
//  · Total a refinanciar = crédito + tarjetas incluidas. Lo que queda fuera sigue pagándose igual y cuenta en "hoy" y en la nueva cuota.
import {
  cae, caeDesdePagos, costoMismoPlazo, costoPlazoFijo, cuotaFrancesa, simularPago, sumarTablas, tablaAmortizacion, tasaDesdeMeses,
  type Abono, type FilaAmortizacion,
} from "./amortizacion";
import { formatCLP, formatPct } from "./format";
import { nombreInstitucion, ofertasDeMercado, resumirMercado, type Mercado } from "./mercado";
import type { Actual, Credito, FilaTasa, Modo, OpcionRenegociacion, Resultado, TarjetaEntrada, TipoOpcion } from "./tipos";

export const PLAZO_MAX_CONSUMO = 60; // meses; máximo publicado en el comparador del SERNAC (12 a 60 cuotas)
export const TARJETA_MESES = 24;     // SUPUESTO de esta calculadora para tarjetas (no es una norma; ver docs/CIFRAS.md)
export const MAX_TARJETAS = 3;
const PLAZOS_EXTENDIDOS = [36, 48, 60];
const MAX_OPCIONES = 5;
const TASA_MAX = 0.2;
const UMBRAL_MESES_DISTINTOS = 0.15;

const pct = (i: number): string => formatPct(i);
const meses = (n: number): string => `${n} ${n === 1 ? "mes" : "meses"}`;
const tasaValida = (t: number | undefined): t is number => typeof t === "number" && Number.isFinite(t) && t >= 0 && t < TASA_MAX;
const positivo = (v: number | undefined): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/** Una deuda ya resuelta: todos sus datos completos y su calendario de pagos. */
interface Deuda {
  nombre: string; esTarjeta: boolean; incluir: boolean;
  saldo: number; pago: number; tasa: number; meses: number; total: number; tabla: FilaAmortizacion[];
}
const deDatos = (nombre: string, esTarjeta: boolean, incluir: boolean, saldo: number, pago: number, tasa: number): Deuda | null => {
  const tabla = tablaAmortizacion(saldo, tasa, pago);
  if (!tabla) return null;
  return { nombre, esTarjeta, incluir, saldo, pago, tasa, meses: tabla.length, total: tabla.reduce((a, f) => a + f.pago + f.abono, 0), tabla };
};

type ResCredito = { ok: true; d: Deuda | null; supuestos: string[]; avisos: string[] } | { ok: false; error: string };

const vacio = (v: number | undefined): boolean => v === undefined || Number.isNaN(v) || v === 0;

/** Sin ningún dato del crédito de consumo (la persona solo trae tarjetas). */
const sinCredito = (c: Credito): boolean => vacio(c.saldo) && vacio(c.cuota) && c.tasaMensual === undefined && vacio(c.mesesRestantes);

function resolverCredito(c: Credito): ResCredito {
  if (sinCredito(c)) return { ok: true, d: null, supuestos: [], avisos: [] };
  const saldo = c.saldo, cuota = c.cuota;
  if (!positivo(saldo) || !positivo(cuota)) return { ok: false, error: "Crédito de consumo: escribe cuánto debes y tu cuota mensual (si no tienes un crédito de consumo, deja esos campos vacíos y agrega una tarjeta)." };
  const hayTasa = typeof c.tasaMensual === "number" && !Number.isNaN(c.tasaMensual);
  const hayMeses = positivo(c.mesesRestantes);
  if (!hayTasa && !hayMeses) {
    return { ok: false, error: "Crédito de consumo: necesito la tasa de interés o los meses que te faltan (con una de las dos basta)." };
  }
  const supuestos: string[] = [], avisos: string[] = [];
  let tasa: number;
  if (hayTasa) {
    if (!tasaValida(c.tasaMensual)) return { ok: false, error: "Revisa la tasa de interés: escríbela en %, por ejemplo 2,1 al mes (entre 0% y 20% mensual)." };
    tasa = c.tasaMensual;
  } else {
    const t = tasaDesdeMeses(saldo, cuota, c.mesesRestantes as number);
    if (t === null) {
      return { ok: false, error: "Con esa cuota y esos meses no alcanzas a pagar el saldo (o la tasa saldría absurda). Revisa el saldo, la cuota y los meses que te faltan." };
    }
    tasa = t;
    supuestos.push(`Calculamos tu tasa a partir de los meses que te faltan: ${pct(t)} al mes.`);
  }
  const d = deDatos("Tu crédito", false, true, saldo, cuota, tasa);
  if (!d) {
    return { ok: false, error: `Tu cuota (${formatCLP(cuota)}) no alcanza ni para pagar los intereses de un mes (${formatCLP(saldo * tasa)}): con esos datos la deuda nunca baja. Revisa el saldo, la cuota y la tasa.` };
  }
  if (hayTasa && hayMeses) {
    const m = c.mesesRestantes as number;
    if (Math.abs(d.meses - m) / m > UMBRAL_MESES_DISTINTOS && Math.abs(d.meses - m) >= 2) {
      avisos.push(`Los meses que pusiste (${m}) no calzan con tu tasa: con esa tasa y tu cuota te faltarían unos ${d.meses}. Usamos la tasa.`);
    }
  }
  return { ok: true, d, supuestos, avisos };
}

type ResTarjeta = { ok: true; d: Deuda; supuesto?: string } | { ok: false; error: string };

/** Resuelve una tarjeta con datos. Si falta algo o no calza, dice exactamente qué corregir (nunca se descarta en silencio). */
function resolverTarjeta(t: TarjetaEntrada, nombre: string): ResTarjeta {
  const saldo = t.saldo;
  if (!positivo(saldo)) return { ok: false, error: `${nombre}: escribe cuánto debes en ella (es obligatorio).` };
  const hayTasa = typeof t.tasaMensual === "number" && !Number.isNaN(t.tasaMensual);
  if (hayTasa && !tasaValida(t.tasaMensual)) return { ok: false, error: `${nombre}: revisa la tasa, escríbela en % mensual (entre 0% y 20%), por ejemplo 3,5.` };
  const pago = positivo(t.pagoMensual) ? t.pagoMensual : undefined;
  const tasa = hayTasa ? t.tasaMensual : undefined;
  const incluir = t.incluir !== false;
  if (pago !== undefined && tasa !== undefined) {
    const d = deDatos(nombre, true, incluir, saldo, pago, tasa);
    return d ? { ok: true, d } : { ok: false, error: `${nombre}: el pago de ${formatCLP(pago)} no alcanza ni para pagar los intereses de un mes (${formatCLP(saldo * tasa)}). Revisa el pago y la tasa.` };
  }
  if (pago !== undefined) {
    const imp = tasaDesdeMeses(saldo, pago, TARJETA_MESES);
    if (imp === null) return { ok: false, error: `${nombre}: con un pago de ${formatCLP(pago)} no se termina de pagar ${formatCLP(saldo)} en ${TARJETA_MESES} meses, así que no puedo calcular su tasa. Escribe la tasa de la tarjeta o sube el pago.` };
    const d = deDatos(nombre, true, incluir, saldo, pago, imp);
    return d ? { ok: true, d, supuesto: `Para ${nombre} supusimos que se paga en ${TARJETA_MESES} meses y calculamos su tasa: ${pct(imp)} al mes.` } : { ok: false, error: `${nombre}: revisa su saldo y su pago.` };
  }
  if (tasa !== undefined) {
    const p = Math.ceil(cuotaFrancesa(saldo, tasa, TARJETA_MESES) - 1e-6);
    const d = deDatos(nombre, true, incluir, saldo, p, tasa);
    return d ? { ok: true, d, supuesto: `Para ${nombre} supusimos que se paga en ${TARJETA_MESES} meses: un pago de ${formatCLP(p)} al mes.` } : { ok: false, error: `${nombre}: revisa su saldo y su tasa.` };
  }
  return { ok: false, error: `${nombre}: escribe su pago mensual o su tasa (con una de las dos basta).` };
}

interface Meta { tasa: number; gastos: number; nombre: string }
interface Base {
  id: string; tipo: TipoOpcion; titulo: string; tasaMensual: number; nuevaCuota: number; nuevosMeses: number;
  totalPagar: number; gastos: number; esPropia: boolean; caeAnual: number; primerosMeses?: FilaAmortizacion[]; calendario?: FilaAmortizacion[]; desglose?: OpcionRenegociacion["desglose"];
  fuente?: OpcionRenegociacion["fuente"];
}

/** Completa una opción con lo que se deriva de compararla con tu situación de hoy. */
function armar(b: Base, act: Actual): OpcionRenegociacion {
  const ahorroTotal = act.totalPagar - b.totalPagar;
  const alivioMensual = act.cuotaTotal - b.nuevaCuota;
  const mesesMenos = Math.max(act.meses - b.nuevosMeses, 0);
  const gastosTxt = b.gastos > 0 ? ` (ya descontamos ${formatCLP(b.gastos)} de gastos)` : "";
  const antes = mesesMenos > 0 ? ` y terminas ${meses(mesesMenos)} antes` : "";
  const masTotal = `Pero pagas ${formatCLP(-ahorroTotal)} más en total por el plazo más largo`;
  let resumen: string;
  switch (b.tipo) {
    case "tasa":
      resumen = `Ahorras ${formatCLP(ahorroTotal)}${antes}. Tu cuota sigue en ${formatCLP(b.nuevaCuota)}${gastosTxt}.`;
      break;
    case "cuota":
      resumen = `Tu cuota baja ${formatCLP(alivioMensual)} al mes (queda en ${formatCLP(b.nuevaCuota)}). Ahorras ${formatCLP(ahorroTotal)} en total${gastosTxt}.`;
      break;
    case "plazo":
      resumen = `Tu cuota baja ${formatCLP(alivioMensual)} al mes (queda en ${formatCLP(b.nuevaCuota)}). ` +
        (ahorroTotal >= 0 ? `Ahorras ${formatCLP(ahorroTotal)} en total${gastosTxt}.` : `${masTotal}${gastosTxt}.`);
      break;
    case "mercado":
      resumen = alivioMensual > 0
        ? `Tu cuota pasa a ${formatCLP(b.nuevaCuota)} (${formatCLP(alivioMensual)} menos al mes). ` + (ahorroTotal >= 0 ? `Ahorras ${formatCLP(ahorroTotal)} en total${antes}.` : `${masTotal}.`)
        : `Tu cuota pasa a ${formatCLP(b.nuevaCuota)}. ` + (ahorroTotal >= 0 ? `Ahorras ${formatCLP(ahorroTotal)} en total${antes}.` : `Pagarías ${formatCLP(-ahorroTotal)} más en total.`);
      break;
    case "abono":
      resumen = `Ahorras ${formatCLP(ahorroTotal)}${antes} pagando ${formatCLP(-alivioMensual)} más al mes. No necesitas renegociar nada.`;
      break;
    default:
      resumen = `Ahorras ${formatCLP(ahorroTotal)}${antes} si abonas hoy de una vez. Tu cuota sigue en ${formatCLP(b.nuevaCuota)}. No necesitas renegociar nada.`;
  }
  return { ...b, ahorroTotal, alivioMensual, mesesMenos, resumen };
}

/** CAE de un calendario de pagos real (con gastos al inicio y pago final parcial). */
function caeDeSimulacion(saldo: number, gastos: number, tasa: number, cuota: number, abonos: Abono[] = []): number {
  const t = tablaAmortizacion(saldo, tasa, cuota, abonos);
  if (!t) return cae(tasa);
  return caeDesdePagos(saldo, gastos, t.map((f) => f.pago + f.abono)) ?? cae(tasa);
}

const suma = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

export function generarOpciones(e: Credito, modo: Modo, mercado: Mercado | null = null, opts: { seguro?: boolean } = {}): Resultado {
  const rc = resolverCredito(e);
  if (!rc.ok) return rc;
  const supuestos = [...rc.supuestos];
  const avisos = [...rc.avisos];

  // Tarjetas: las filas totalmente vacías se ignoran; toda tarjeta con algún dato debe estar completa (si no, error que dice qué falta).
  const conDatos = (e.tarjetas ?? []).filter((t) => positivo(t.saldo) || positivo(t.pagoMensual) || (typeof t.tasaMensual === "number" && !Number.isNaN(t.tasaMensual)));
  if (conDatos.length > MAX_TARJETAS) avisos.push(`Consideramos hasta ${MAX_TARJETAS} tarjetas: las demás quedaron fuera.`);
  const tarjetas = conDatos.slice(0, MAX_TARJETAS);
  const deudas: Deuda[] = rc.d ? [rc.d] : [];
  const errores: string[] = [];
  tarjetas.forEach((t, i) => {
    const r = resolverTarjeta(t, t.nombre?.trim() || (tarjetas.length === 1 ? "Tu tarjeta" : `Tarjeta ${i + 1}`));
    if (!r.ok) { errores.push(r.error); return; }
    if (r.supuesto) supuestos.push(r.supuesto);
    deudas.push(r.d);
  });
  if (errores.length > 0) return { ok: false, error: errores.join("\n") };
  if (deudas.length === 0) return { ok: false, error: "Escribe tu crédito de consumo (deuda, cuota y tasa o meses) o, al menos, una tarjeta de crédito (deuda y pago mensual o tasa)." };
  if (!rc.d && positivo(e.abonoUnico)) avisos.push("El abono de una sola vez se aplica a un crédito de consumo; sin crédito no lo usamos.");

  // Situación de hoy: TODAS las deudas consideradas, se refinancien o no.
  const saldoTodas = suma(deudas.map((d) => d.saldo));
  const totalHoy = suma(deudas.map((d) => d.total));
  const actual: Actual = {
    meses: Math.max(...deudas.map((d) => d.meses)), totalPagar: totalHoy, intereses: totalHoy - saldoTodas,
    caeAnual: suma(deudas.map((d) => d.saldo * cae(d.tasa))) / saldoTodas, cuotaTotal: suma(deudas.map((d) => d.pago)),
    primerosMeses: [], calendario: sumarTablas(deudas.map((d) => d.tabla)),
  };
  actual.primerosMeses = actual.calendario.slice(0, 3);

  const inc = deudas.filter((d) => d.incluir);
  const exc = deudas.filter((d) => !d.incluir);
  const refinanciar = { total: suma(inc.map((d) => d.saldo)), partes: inc.map((d) => ({ nombre: d.nombre, saldo: d.saldo })),
    excluidas: exc.map((d) => ({ nombre: d.nombre, saldo: d.saldo })) };

  const comparacion: FilaTasa[] = deudas.map((d) => ({ nombre: d.nombre, tasaMensual: d.tasa, caeAnual: cae(d.tasa) }));
  for (const o of e.ofertas ?? []) if (o.tasaMensual > 0) comparacion.push({ nombre: o.nombre || "Otra oferta", tasaMensual: o.tasaMensual, caeAnual: cae(o.tasaMensual) });

  const P = refinanciar.total;
  if (P === 0) {
    return { ok: true, actual, opciones: [], comparacion, avisos, supuestos, refinanciar, mercado: null,
      nota: "Desmarcaste todas tus deudas, así que no hay nada que refinanciar. Marca \"Incluir en el refinanciamiento\" en al menos una para ver opciones." };
  }
  const seguro = opts.seguro ?? true;
  const resumenMercado = resumirMercado(mercado, { monto: P, seguro });
  const tasaProm = suma(inc.map((d) => d.saldo * d.tasa)) / P;
  if (tasaProm === 0) {
    return { ok: true, actual, opciones: [], comparacion, avisos, supuestos, refinanciar, mercado: resumenMercado,
      nota: "Tu crédito no cobra intereses: no hay nada que renegociar. Lo mejor es seguir pagando tu cuota." };
  }

  // Lo que queda fuera se sigue pagando igual.
  const fijaPago = suma(exc.map((d) => d.pago)), fijaTotal = suma(exc.map((d) => d.total));
  const fijaMeses = Math.max(0, ...exc.map((d) => d.meses));
  const tablaFija = exc.map((d) => d.tabla);
  const cuotaInc = suma(inc.map((d) => d.pago));
  const nInc = Math.max(...inc.map((d) => d.meses));

  // Ofertas reales que ingresó la persona (solo cuentan si mejoran su tasa).
  const ofertas = (e.ofertas ?? []).filter((o) => o.tasaMensual > 0);
  avisos.push(...ofertas.filter((o) => o.tasaMensual >= tasaProm).map((o) =>
    `La oferta de ${o.nombre || "otro banco"} (${pct(o.tasaMensual)} mensual) no mejora tu tasa actual (${pct(tasaProm)}), por eso no aparece en las opciones.`));
  const metas: Meta[] = ofertas.filter((o) => o.tasaMensual < tasaProm)
    .map((o) => ({ tasa: o.tasaMensual, gastos: Math.max(o.gastos ?? 0, 0), nombre: o.nombre || "otro banco" }))
    .sort((a, b) => a.tasa - b.tasa);
  const mejor = metas[0];
  const etiqueta = (m: Meta): string => `Tasa ${pct(m.tasa)} de ${m.nombre}`;

  /** Arma una opción de crédito nuevo por `P` (lo incluido) más lo que queda fuera. */
  const conCreditoNuevo = (id: string, tipo: TipoOpcion, titulo: string, m: Meta, cuotaNueva: number, mesesNuevo: number, totalNuevo: number): OpcionRenegociacion => {
    const tabla = tablaAmortizacion(P, m.tasa, cuotaNueva);
    const calendario = tabla ? sumarTablas([tabla, ...tablaFija]) : undefined;
    return armar({ id, tipo, titulo, tasaMensual: m.tasa, nuevaCuota: cuotaNueva + fijaPago, nuevosMeses: Math.max(mesesNuevo, fijaMeses),
      totalPagar: totalNuevo + m.gastos + fijaTotal, gastos: m.gastos, esPropia: true,
      caeAnual: caeDeSimulacion(P, m.gastos, m.tasa, cuotaNueva), primerosMeses: calendario?.slice(0, 3), calendario }, actual);
  };

  const cand: OpcionRenegociacion[] = [];
  metas.forEach((m, k) => {
    const s = simularPago(P, m.tasa, cuotaInc);
    if (s) cand.push(conCreditoNuevo(`tasa-${k}`, "tasa", `${etiqueta(m)}, manteniendo tu cuota`, m, cuotaInc, s.meses, s.total));
    // "Mismo plazo": con un solo crédito se usa su plazo exacto; con varios, el de la deuda que más tarda (si cabe en 60 meses).
    const c = inc.length === 1 ? costoMismoPlazo(P, cuotaInc, inc[0].tasa, m.tasa) : nInc <= PLAZO_MAX_CONSUMO ? costoPlazoFijo(P, m.tasa, nInc) : null;
    if (c) cand.push(conCreditoNuevo(`cuota-${k}`, "cuota", `${etiqueta(m)}, con el mismo plazo`, m, c.cuota, c.meses, c.total));
  });
  if (mejor) {
    for (const n of PLAZOS_EXTENDIDOS.filter((n) => n > nInc && n <= PLAZO_MAX_CONSUMO)) {
      const c = costoPlazoFijo(P, mejor.tasa, n);
      if (c) cand.push(conCreditoNuevo(`plazo-${n}`, "plazo", `${etiqueta(mejor)}, alargando a ${n} meses`, mejor, c.cuota, c.meses, c.total));
    }
  }

  // Simulaciones oficiales del SERNAC: la institución con menor CTC en cada plazo, llevada a tu monto. Se usan las cifras informadas.
  const deMercado = ofertasDeMercado(mercado, { monto: P, seguro });
  for (const o of deMercado) {
    cand.push(armar({
      id: `mercado-${o.cuotas}`, tipo: "mercado", tasaMensual: o.tasaMensual, nuevaCuota: o.cuota + fijaPago, nuevosMeses: Math.max(o.cuotas, fijaMeses),
      titulo: `${nombreInstitucion(o.institucion)}: ${o.cuotas} cuotas, tasa ${pct(o.tasaMensual)} mensual`,
      totalPagar: o.ctc + fijaTotal, gastos: 0, esPropia: false, caeAnual: o.cae,
      desglose: { capital: o.capital, intereses: o.intereses, comisiones: o.comisiones, seguros: o.seguros, total: o.ctc, cuotas: o.cuotas, cuota: o.cuota },
      fuente: { institucion: o.institucion, texto: mercado?.fuente ?? "", url: mercado?.urlFuente ?? "", fecha: mercado?.actualizado ?? null,
        montoBase: o.montoBase, escalado: o.escalado, aviso: mercado?.aviso ?? "" },
    }, actual));
  }
  if (mercado && deMercado.length === 0) {
    const montos = mercado.simulaciones.map((s) => s.monto);
    avisos.push(`No hay simulaciones publicadas para ${formatCLP(P)} (el SERNAC publica desde ${formatCLP(Math.min(...montos))} hasta ${formatCLP(Math.max(...montos))}), así que no comparamos con el mercado.`);
  }
  if (!mercado && ofertas.length === 0) {
    avisos.push("No hay tasas de mercado cargadas ni ofertas tuyas para comparar: solo te mostramos opciones que no requieren renegociar.");
  }

  // Abonos: se aplican solo al crédito de consumo; el resto de tus deudas sigue igual. Sin crédito (solo tarjetas) no hay abonos.
  const cred = rc.d;
  if (cred) {
    const otras = deudas.filter((d) => d !== cred);
    const otrasMeses = Math.max(0, ...otras.map((d) => d.meses));
    const conAbono = (id: string, tipo: "abono" | "abonoUnico", titulo: string, cuotaNueva: number, abonos: Abono[]): void => {
      const s = simularPago(cred.saldo, cred.tasa, cuotaNueva, abonos);
      const t = tablaAmortizacion(cred.saldo, cred.tasa, cuotaNueva, abonos);
      if (!s || !t) return;
      const calendario = sumarTablas([t, ...otras.map((d) => d.tabla)]);
      cand.push(armar({ id, tipo, titulo, tasaMensual: cred.tasa, nuevaCuota: actual.cuotaTotal + (cuotaNueva - cred.pago), nuevosMeses: Math.max(s.meses, otrasMeses),
        totalPagar: totalHoy - (cred.total - s.total), gastos: 0, esPropia: false, caeAnual: cae(cred.tasa), primerosMeses: calendario.slice(0, 3), calendario }, actual));
    };
    const extra = Math.max(Math.round((cred.pago * 0.1) / 1000) * 1000, 1000);
    conAbono("abono", "abono", `Sube tu cuota en ${formatCLP(extra)} (sin renegociar)`, cred.pago + extra, []);
    if (positivo(e.abonoUnico) && e.abonoUnico < cred.saldo) {
      conAbono("abonoUnico", "abonoUnico", `Abona ${formatCLP(e.abonoUnico)} hoy y sigue con tu cuota`, cred.pago, [{ mes: 0, monto: e.abonoUnico }]);
    }
  }

  // ¿Tu tasa ya es mejor que la del mercado?
  if (resumenMercado && deMercado.length > 0 && !cand.some((o) => o.tipo === "mercado" && o.ahorroTotal > 0) && tasaProm <= resumenMercado.menorTasa + 1e-9) {
    avisos.push(`Tu tasa actual (${pct(tasaProm)}) ya es mejor que la más competitiva del mercado (${pct(resumenMercado.menorTasa)}, ${nombreInstitucion(resumenMercado.mejor.institucion)}): cambiarte no te conviene.`);
  }

  // ¿Conviene dejar alguna tarjeta fuera? Se prueba con la tasa objetivo más baja disponible (oferta propia o mercado), sin gastos del mercado.
  const tasaObjetivo = Math.min(mejor?.tasa ?? Infinity, resumenMercado?.menorTasa ?? Infinity);
  const gastosObjetivo = mejor && mejor.tasa <= (resumenMercado?.menorTasa ?? Infinity) ? mejor.gastos : 0;
  if (Number.isFinite(tasaObjetivo)) {
    const ahorroConIncluidas = (incluidas: Deuda[]): number | null => {
      const Pi = suma(incluidas.map((d) => d.saldo)), cuotaI = suma(incluidas.map((d) => d.pago));
      const s = simularPago(Pi, tasaObjetivo, cuotaI);
      const resto = deudas.filter((d) => !incluidas.includes(d));
      return s ? totalHoy - (s.total + gastosObjetivo + suma(resto.map((d) => d.total))) : null;
    };
    const conTodas = ahorroConIncluidas(inc);
    for (const t of inc.filter((d) => d.esTarjeta)) {
      const sin = ahorroConIncluidas(inc.filter((d) => d !== t));
      if (conTodas !== null && sin !== null && sin > conTodas + 1000) {
        avisos.push(`Dejar ${t.nombre} fuera del refinanciamiento te ahorra ${formatCLP(sin - conTodas)} más: su tasa (${pct(t.tasa)}) es menor que la del crédito nuevo. Desmarca "Incluir en el refinanciamiento" para verlo.`);
      }
    }
  }

  // Modo "intereses": solo lo que ahorra plata (de las variantes "mismo plazo" se muestra la mejor oferta propia).
  // Modo "cuota": solo lo que baja la cuota mensual.
  const sirve = (o: OpcionRenegociacion): boolean => modo === "intereses"
    ? o.ahorroTotal > 0 && (o.tipo !== "cuota" || o.id === "cuota-0")
    : (o.tipo === "cuota" || o.tipo === "plazo" || o.tipo === "mercado") && o.alivioMensual > 0;
  const criterio = (o: OpcionRenegociacion): number => (modo === "intereses" ? o.ahorroTotal : o.alivioMensual);
  const opciones = cand.filter(sirve).sort((a, b) => criterio(b) - criterio(a) || a.id.localeCompare(b.id)).slice(0, MAX_OPCIONES);
  return { ok: true, actual, opciones, comparacion, avisos, supuestos, refinanciar, mercado: resumenMercado };
}
