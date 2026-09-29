import { escalar } from "@/lib/graficos";

export interface FilaBarra { etiqueta: string; valor: number; texto: string; destacada?: boolean; base?: boolean }

/** Barras horizontales. El valor siempre está escrito al lado: la barra es un complemento visual, no la única fuente. */
export default function Barras({ id, titulo, ayuda, filas }: { id: string; titulo: string; ayuda: string; filas: FilaBarra[] }) {
  const anchos = escalar(filas.map((f) => f.valor));
  return (
    <section aria-labelledby={id} className="rounded-xl border border-borde bg-superficie p-4">
      <h2 id={id} className="font-semibold">{titulo}</h2>
      <p className="mb-3 text-xs text-suave">{ayuda}</p>
      <ul className="space-y-3">
        {filas.map((f, k) => (
          <li key={f.etiqueta}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className={f.destacada ? "font-semibold" : ""}>{f.etiqueta}</span>
              <span className="whitespace-nowrap font-semibold">{f.texto}</span>
            </div>
            <div aria-hidden="true" className="mt-1 h-3 overflow-hidden rounded-full bg-superficie-2">
              <div className={`h-full rounded-full ${f.base ? "bg-suave" : "bg-brand"}`} style={{ width: `${anchos[k]}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
