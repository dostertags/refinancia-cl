/** Convierte valores en porcentajes (0–100) relativos al mayor, para dibujar barras. Los negativos cuentan como 0. */
export function escalar(valores: number[]): number[] {
  const max = Math.max(0, ...valores);
  if (max <= 0) return valores.map(() => 0);
  return valores.map((v) => Math.min(100, Math.max(0, (v / max) * 100)));
}
