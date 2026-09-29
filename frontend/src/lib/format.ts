/** Formateo es-CL. Implementado a mano (no Intl) para que sea idéntico en servidor y navegador. */
export function formatCLP(v: number): string {
  const r = Math.round(Math.abs(v));
  const s = String(r).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${v < 0 && r !== 0 ? "-" : ""}$${s}`;
}

export function parseCLP(txt: string): number {
  const d = txt.replace(/[^\d]/g, "");
  return d ? parseInt(d, 10) : 0;
}

export function formatPct(fraccion: number, decimales = 2): string {
  return `${(fraccion * 100).toFixed(decimales).replace(".", ",")}%`;
}

/** El usuario escribe la tasa mensual en % ("2,5"); el backend espera fracción (0.025). */
export function pctMensualAFraccion(txt: string): number {
  const n = parseFloat(txt.replace(",", "."));
  return Number.isFinite(n) ? n / 100 : 0;
}
