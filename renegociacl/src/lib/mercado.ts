// Tasas de mercado: simulaciones OFICIALES del Comparador de créditos de consumo del SERNAC (cada institución las informa al SERNAC).
// El navegador NO puede leer el SERNAC directamente (CORS), así que la app lee /rates.json, un archivo estático generado por el scraper
// del repositorio (backend/app/scrapers/sernac_powerbi.py). Si no carga o es inválido, NO se inventan tasas: se avisa.

export interface SimulacionMercado {
  institucion: string; monto: number; cuotas: number; seguro: boolean;
  cuota: number; tasaMensual: number; totalInteres: number; gastos: number; cae: number; ctc: number;
}
export interface Mercado {
  fuente: string; urlFuente: string; aviso: string; notaCae: string;
  actualizado: string | null; obtenido: string | null; simulaciones: SimulacionMercado[];
}
/** Mejor simulación de un plazo, llevada a tu monto (los valores se escalan linealmente si el monto publicado es otro). */
export interface OfertaMercado {
  institucion: string; cuotas: number; seguro: boolean;
  tasaMensual: number; cae: number; cuota: number; ctc: number;
  montoBase: number; escalado: boolean;
}
export interface ResumenMercado {
  mejor: OfertaMercado; menorTasa: number; peorTasa: number; cantidadInstituciones: number; montoBase: number;
  fuente: string; urlFuente: string; actualizado: string | null; aviso: string; notaCae: string;
}
/** ok = hay datos · vacio = archivo válido sin simulaciones · error = no se pudo cargar o el formato no es el esperado. */
export type EstadoMercado = "ok" | "vacio" | "error";

export const TASA_MENSUAL_MAX = 0.06;         // sobre 6% mensual se considera dato corrupto
const TOLERANCIA_CTC = 0.02;                  // CTC debe calzar con cuota × cuotas (±2%)
const TIEMPO_MAX_MS = 4000;
const SALTO_MONTO_MIN = 1_000_000;            // cuánto se acepta alejarse del monto publicado (o 25% del monto, lo que sea mayor)
const SALTO_MONTO_REL = 0.25;

const esNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const esTxt = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

function fila(f: unknown): SimulacionMercado | null {
  if (!Array.isArray(f) || f.length < 10) return null;
  const [inst, monto, cuotas, seguro, cuota, tasa, interes, gastos, cae, ctc] = f;
  if (!esTxt(inst) || !esNum(monto) || monto <= 0 || !esNum(cuotas) || cuotas <= 0 || !Number.isInteger(cuotas)) return null;
  if ((seguro !== 0 && seguro !== 1) || !esNum(cuota) || cuota <= 0 || !esNum(ctc) || ctc <= 0) return null;
  if (!esNum(tasa) || tasa <= 0 || tasa / 100 > TASA_MENSUAL_MAX || !esNum(cae) || cae <= 0) return null;
  if (!esNum(interes) || !esNum(gastos)) return null;
  if (Math.abs(ctc - cuota * cuotas) / ctc > TOLERANCIA_CTC) return null;
  return { institucion: inst.trim(), monto, cuotas, seguro: seguro === 1, cuota, tasaMensual: tasa / 100, totalInteres: interes, gastos, cae: cae / 100, ctc };
}

/** Valida el documento v2. null = no se puede usar (versión distinta, sin fuente o sin fecha). Las filas malas se descartan una a una. */
export function parseMercado(d: unknown): Mercado | null {
  if (typeof d !== "object" || d === null) return null;
  const x = d as Record<string, unknown>;
  if (x.version !== 2 || !esTxt(x.fuente) || !esTxt(x.url_fuente) || !x.url_fuente.startsWith("https://") || !esTxt(x.actualizado)) return null;
  if (!Array.isArray(x.simulaciones)) return null;
  return {
    fuente: x.fuente, urlFuente: x.url_fuente, aviso: esTxt(x.aviso) ? x.aviso : "", notaCae: esTxt(x.nota_cae) ? x.nota_cae : "",
    actualizado: x.actualizado, obtenido: esTxt(x.obtenido) ? x.obtenido : null,
    simulaciones: x.simulaciones.map(fila).filter((s): s is SimulacionMercado => s !== null),
  };
}

export async function cargarMercado(url = "/rates.json", tiempoMaxMs = TIEMPO_MAX_MS): Promise<{ estado: EstadoMercado; mercado: Mercado | null }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), tiempoMaxMs);
  try {
    const r = await fetch(url, { cache: "no-store", signal: ctl.signal });
    if (!r.ok) return { estado: "error", mercado: null };
    const m = parseMercado(await r.json());
    if (!m) return { estado: "error", mercado: null };
    return { estado: m.simulaciones.length > 0 ? "ok" : "vacio", mercado: m };
  } catch {
    return { estado: "error", mercado: null };
  } finally {
    clearTimeout(timer);
  }
}

/** Monto publicado más cercano, siempre que no esté demasiado lejos (no se extrapola). */
function montoBaseCercano(montos: number[], monto: number): number | null {
  let mejor: number | null = null;
  for (const m of montos) if (mejor === null || Math.abs(m - monto) < Math.abs(mejor - monto)) mejor = m;
  if (mejor === null) return null;
  return Math.abs(mejor - monto) <= Math.max(SALTO_MONTO_MIN, SALTO_MONTO_REL * monto) ? mejor : null;
}

/** Para cada plazo publicado, la simulación con menor CTC (lo que recomienda el SERNAC), llevada a `monto`. */
export function ofertasDeMercado(m: Mercado | null, q: { monto: number; seguro: boolean }): OfertaMercado[] {
  if (!m || !(q.monto > 0)) return [];
  const sims = m.simulaciones.filter((s) => s.seguro === q.seguro);
  const plazos = [...new Set(sims.map((s) => s.cuotas))].sort((a, b) => a - b);
  const out: OfertaMercado[] = [];
  for (const n of plazos) {
    const delPlazo = sims.filter((s) => s.cuotas === n);
    const base = montoBaseCercano([...new Set(delPlazo.map((s) => s.monto))], q.monto);
    if (base === null) continue;
    const mejor = delPlazo.filter((s) => s.monto === base).reduce((a, b) => (b.ctc < a.ctc ? b : a));
    const f = q.monto / base;
    out.push({ institucion: mejor.institucion, cuotas: n, seguro: q.seguro, tasaMensual: mejor.tasaMensual, cae: mejor.cae,
      cuota: Math.round(mejor.cuota * f), ctc: Math.round(mejor.ctc * f), montoBase: base, escalado: base !== q.monto });
  }
  return out;
}

/** La tasa más competitiva del mercado para tu monto, con su fuente y fecha. null si no hay datos comparables. */
export function resumirMercado(m: Mercado | null, q: { monto: number; seguro: boolean }): ResumenMercado | null {
  const ofertas = ofertasDeMercado(m, q);
  if (!m || ofertas.length === 0) return null;
  const mejor = ofertas.reduce((a, b) => (b.tasaMensual < a.tasaMensual || (b.tasaMensual === a.tasaMensual && b.ctc < a.ctc) ? b : a));
  const delMonto = m.simulaciones.filter((s) => s.seguro === q.seguro && s.monto === mejor.montoBase);
  const tasas = delMonto.map((s) => s.tasaMensual);
  return {
    mejor, menorTasa: Math.min(...tasas), peorTasa: Math.max(...tasas), cantidadInstituciones: new Set(delMonto.map((s) => s.institucion)).size,
    montoBase: mejor.montoBase, fuente: m.fuente, urlFuente: m.urlFuente, actualizado: m.actualizado, aviso: m.aviso, notaCae: m.notaCae,
  };
}

const MINUSCULAS = new Set(["DE", "DEL", "LA", "LOS", "LAS"]);
const ESPECIALES: Record<string, string> = { BANCOESTADO: "BancoEstado" };
/** "BANCO BICE" -> "Banco BICE", "CCAF LOS HEROES" -> "CCAF Los Heroes". Solo cambia cómo se ve; el nombre oficial sigue en los datos. */
export function nombreInstitucion(oficial: string): string {
  return oficial.trim().split(/\s+/).map((w) => {
    if (ESPECIALES[w]) return ESPECIALES[w];
    if (MINUSCULAS.has(w) || w.length > 4) return w.charAt(0) + w.slice(1).toLowerCase();
    return w; // siglas cortas: BICE, BCI, CCAF
  }).join(" ");
}
