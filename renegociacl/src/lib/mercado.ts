// Tasas de referencia del mercado. El navegador NO puede leer CMF ni SERNAC directamente (CORS y Power BI),
// así que se sirven desde /rates.json, un archivo estático que se actualiza por fuera (ver README).
// Si el archivo está vacío o no carga, la app funciona igual y NO inventa tasas.
import type { TasaMercado } from "./tipos";

export interface Mercado { actualizado: string | null; fuente: string; ofertas: TasaMercado[] }
export interface ResumenMercado { min: number; mediana: number; cantidad: number; mejor: string; actualizado: string | null; fuente: string }
/** ok = hay tasas · vacio = el archivo no trae tasas todavía · error = no se pudo cargar (red, formato o tiempo). */
export type EstadoMercado = "ok" | "vacio" | "error";

export const MERCADO_VACIO: Mercado = { actualizado: null, fuente: "", ofertas: [] };
const TIEMPO_MAX_MS = 4000;

const tasaValida = (o: unknown): o is TasaMercado =>
  typeof o === "object" && o !== null && typeof (o as TasaMercado).institucion === "string" && (o as TasaMercado).institucion.length > 0 &&
  typeof (o as TasaMercado).tasaMensual === "number" && (o as TasaMercado).tasaMensual > 0 && (o as TasaMercado).tasaMensual < 0.2;

export function resumirMercado(m: Mercado): ResumenMercado | null {
  const validas = m.ofertas.filter(tasaValida);
  if (validas.length === 0) return null;
  const ord = [...validas].sort((a, b) => a.tasaMensual - b.tasaMensual);
  const mitad = Math.floor(ord.length / 2);
  const mediana = ord.length % 2 ? ord[mitad].tasaMensual : (ord[mitad - 1].tasaMensual + ord[mitad].tasaMensual) / 2;
  return { min: ord[0].tasaMensual, mediana, cantidad: ord.length, mejor: ord[0].institucion, actualizado: m.actualizado, fuente: m.fuente };
}

export async function cargarMercado(url = "/rates.json", tiempoMaxMs = TIEMPO_MAX_MS): Promise<{ estado: EstadoMercado; mercado: Mercado }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), tiempoMaxMs);
  try {
    const r = await fetch(url, { cache: "no-store", signal: ctl.signal });
    if (!r.ok) return { estado: "error", mercado: MERCADO_VACIO };
    const d = (await r.json()) as Partial<Mercado>;
    const ofertas = Array.isArray(d.ofertas) ? d.ofertas.filter(tasaValida) : [];
    const mercado: Mercado = { actualizado: d.actualizado ?? null, fuente: d.fuente ?? "", ofertas };
    return { estado: ofertas.length > 0 ? "ok" : "vacio", mercado };
  } catch {
    return { estado: "error", mercado: MERCADO_VACIO };
  } finally {
    clearTimeout(timer);
  }
}
