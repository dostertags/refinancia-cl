// Enlace para compartir: el estado viaja en el FRAGMENTO de la URL (#d=...), que el navegador nunca envía a ningún servidor.
// Aun así, quien reciba el enlace verá los datos: la interfaz lo advierte antes de copiarlo.
import type { Credito, Modo } from "./tipos";

export interface EstadoCompartido { credito: Credito; modo: Modo }
const MAX_LARGO = 2000;

function aBase64Url(texto: string): string {
  const bytes = new TextEncoder().encode(texto);
  let bin = "";
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function desdeBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export const codificarEstado = (e: EstadoCompartido): string => aBase64Url(JSON.stringify(e));

const num = (v: unknown, min: number, max: number, inclMin = true): v is number =>
  typeof v === "number" && Number.isFinite(v) && (inclMin ? v >= min : v > min) && v <= max;

/** Decodifica y VALIDA un fragmento de URL (viene de fuera: nunca se confía en él). null si algo no cuadra. */
export function decodificarEstado(fragmento: string): EstadoCompartido | null {
  if (!fragmento || fragmento.length > MAX_LARGO || !/^[A-Za-z0-9_+/=-]+$/.test(fragmento)) return null;
  let d: unknown;
  try { d = JSON.parse(desdeBase64Url(fragmento)); } catch { return null; }
  if (typeof d !== "object" || d === null) return null;
  const { credito: c, modo } = d as { credito?: Record<string, unknown>; modo?: unknown };
  if (modo !== "intereses" && modo !== "cuota") return null;
  if (!c || typeof c !== "object") return null;
  if (!num(c.saldo, 0, 1e12, false) || !num(c.cuota, 0, 1e12, false) || !num(c.tasaMensual, 0, 0.2)) return null;
  const credito: Credito = { saldo: c.saldo, cuota: c.cuota, tasaMensual: c.tasaMensual };
  if (c.abonoUnico !== undefined) { if (!num(c.abonoUnico, 0, 1e12)) return null; credito.abonoUnico = c.abonoUnico; }
  if (c.tarjeta !== undefined) {
    const t = c.tarjeta as Record<string, unknown> | null;
    if (!t || typeof t !== "object" || !num(t.tasaMensual, 0, 0.2, false)) return null;
    if (t.saldo !== undefined && !num(t.saldo, 0, 1e12)) return null;
    credito.tarjeta = { tasaMensual: t.tasaMensual, ...(t.saldo !== undefined ? { saldo: t.saldo as number } : {}) };
  }
  if (c.ofertas !== undefined) {
    if (!Array.isArray(c.ofertas) || c.ofertas.length > 3) return null;
    const ofertas = [];
    for (const o of c.ofertas as Record<string, unknown>[]) {
      if (!o || typeof o.nombre !== "string" || o.nombre.length > 40 || !num(o.tasaMensual, 0, 0.2, false)) return null;
      if (o.gastos !== undefined && !num(o.gastos, 0, 1e12)) return null;
      ofertas.push({ nombre: o.nombre, tasaMensual: o.tasaMensual, ...(o.gastos !== undefined ? { gastos: o.gastos as number } : {}) });
    }
    credito.ofertas = ofertas;
  }
  return { credito, modo };
}
