// Explicaciones en lenguaje simple de la jerga financiera (hallazgo MAJ-009). Solo texto, sin lógica.
export const TERMINOS: { termino: string; definicion: string }[] = [
  { termino: "CAE", definicion: "Carga Anual Equivalente: lo que de verdad te cuesta el crédito al año, sumando tasa, comisiones y seguros. Sirve para comparar créditos distintos entre sí." },
  { termino: "CTC", definicion: "Costo Total del Crédito: todo lo que terminarás pagando (cuotas más gastos) hasta el último mes." },
  { termino: "Carga financiera", definicion: "Qué parte de tu renta líquida se va cada mes en pagar cuotas de deudas. Verde: menos de 15%. Amarillo: entre 15% y 25%. Rojo: más de 25%." },
  { termino: "Retracto", definicion: "Derecho a arrepentirte de una repactación dentro del plazo que indica la ley, sin costo para ti." },
  { termino: "NCG 537", definicion: "Norma de la CMF (2025) que fija la fórmula del pago mínimo de las tarjetas de crédito. Los 24 meses que usamos para tarjetas son un supuesto de esta herramienta, no parte de esa norma." },
];

export default function Glosario() {
  return (
    <details className="rounded-md border border-slate-200 bg-white p-3 text-sm">
      <summary className="cursor-pointer font-medium">¿Qué significan CAE, CTC y los otros términos?</summary>
      <dl className="mt-2 space-y-2">
        {TERMINOS.map((t) => (
          <div key={t.termino}>
            <dt className="font-semibold">{t.termino}</dt>
            <dd className="text-slate-600">{t.definicion}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
