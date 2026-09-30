/** Formateo es-CL hecho a mano (no Intl) para que sea idéntico en servidor y navegador. */
export function formatCLP(v: number): string {
  const r = Math.round(Math.abs(v));
  const s = String(r).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${v < 0 && r !== 0 ? "-" : ""}$${s}`;
}

/**
 * Pesos escritos por una persona -> número entero. Entiende el formato chileno ("1.234.567"), el de las cartolas
 * con decimales ("$3.000.000,00": los centavos se descartan, no se multiplican por 100) y el estilo inglés ("3,000,000.50").
 */
export function parseCLP(txt: string): number {
  let t = txt.trim().replace(/[^\d.,]/g, "");
  if (/,\d{1,2}$/.test(t)) t = t.replace(/,\d{1,2}$/, "");
  else if (t.includes(",") && /\.\d{1,2}$/.test(t)) t = t.replace(/\.\d{1,2}$/, "");
  const d = t.replace(/\D/g, "");
  return d ? parseInt(d, 10) : 0;
}

/** Para campos de dinero: agrega los puntos mientras se escribe ("3000000" -> "3.000.000"). */
export function formatearMientrasEscribe(txt: string): string {
  const n = parseCLP(txt);
  return n > 0 ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "";
}

/** 0.0215 -> "2,15%" */
export function formatPct(fraccion: number, decimales = 2): string {
  return `${(fraccion * 100).toFixed(decimales).replace(".", ",")}%`;
}

/** El usuario escribe la tasa en % ("2,5"); el motor trabaja con fracción (0.025). 0 es válido (cuotas sin interés); inválido = NaN. */
export function parseTasa(txt: string): number {
  const n = parseFloat(txt.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n / 100 : NaN;
}

/** "2026-09-29" -> "29-09-2026" (formato usado en Chile). Si no es una fecha ISO, la devuelve tal cual. */
export function formatFecha(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso ?? "";
}
