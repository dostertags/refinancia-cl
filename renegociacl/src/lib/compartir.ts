// Enlace para compartir: el estado viaja en el FRAGMENTO de la URL (#d=...), que el navegador nunca envía a ningún servidor.
// Aun así, quien reciba el enlace verá los datos: la interfaz lo advierte antes de copiarlo.
import type { Credito, Modo, TarjetaEntrada } from "./tipos";

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
  const credito: Credito = {};
  if (c.saldo !== undefined) { if (!num(c.saldo, 0, 1e12)) return null; if (c.saldo > 0) credito.saldo = c.saldo; }
  if (c.cuota !== undefined) { if (!num(c.cuota, 0, 1e12)) return null; if (c.cuota > 0) credito.cuota = c.cuota; }
  if (c.tasaMensual !== undefined) { if (!num(c.tasaMensual, 0, 0.2)) return null; credito.tasaMensual = c.tasaMensual; }
  if (c.mesesRestantes !== undefined) { if (!num(c.mesesRestantes, 0, 1200, false)) return null; credito.mesesRestantes = c.mesesRestantes; }
  if (c.abonoUnico !== undefined) { if (!num(c.abonoUnico, 0, 1e12)) return null; credito.abonoUnico = c.abonoUnico; }
  if (c.tarjetas !== undefined) {
    if (!Array.isArray(c.tarjetas) || c.tarjetas.length > 3) return null;
    const tarjetas: TarjetaEntrada[] = [];
    for (const t of c.tarjetas as Record<string, unknown>[]) {
      if (!t || typeof t !== "object") return null;
      const out: TarjetaEntrada = {};
      if (t.nombre !== undefined) { if (typeof t.nombre !== "string" || t.nombre.length > 40) return null; out.nombre = t.nombre; }
      if (t.saldo !== undefined) { if (!num(t.saldo, 0, 1e12)) return null; out.saldo = t.saldo; }
      if (t.pagoMensual !== undefined) { if (!num(t.pagoMensual, 0, 1e12, false)) return null; out.pagoMensual = t.pagoMensual; }
      if (t.tasaMensual !== undefined) { if (!num(t.tasaMensual, 0, 0.2)) return null; out.tasaMensual = t.tasaMensual; }
      if (t.incluir !== undefined) { if (typeof t.incluir !== "boolean") return null; out.incluir = t.incluir; }
      tarjetas.push(out);
    }
    credito.tarjetas = tarjetas;
  }
  // Regla: un crédito completo (saldo, cuota y tasa o meses) o, sin crédito, al menos una tarjeta.
  const hayCredito = credito.saldo !== undefined || credito.cuota !== undefined;
  if (hayCredito && (credito.saldo === undefined || credito.cuota === undefined || (credito.tasaMensual === undefined && credito.mesesRestantes === undefined))) return null;
  if (!hayCredito && !(credito.tarjetas && credito.tarjetas.length > 0)) return null;
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
