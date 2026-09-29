import { formatCLP, formatPct } from "@/lib/format";
import type { ResumenCredito } from "@/lib/comparador";

/** Créditos guardados lado a lado. Sin arrastrar y soltar: solo botones, que funcionan con teclado y lector de pantalla. */
export default function Comparador({ filas, onQuitar, onNombre }: { filas: ResumenCredito[]; onQuitar: (id: string) => void; onNombre: (id: string, n: string) => void }) {
  if (filas.length === 0) return null;
  return (
    <section aria-labelledby="cmp" className="no-print overflow-x-auto rounded-xl border border-borde bg-superficie p-4">
      <h2 id="cmp" className="mb-2 font-semibold">Comparar tus créditos</h2>
      <table className="w-full min-w-[34rem] text-left text-sm">
        <caption className="sr-only">Comparación de créditos guardados</caption>
        <thead><tr className="border-b border-borde">
          <th scope="col" className="py-1">Crédito</th><th scope="col">Debes</th><th scope="col">Tasa mensual</th>
          <th scope="col">Te faltan</th><th scope="col">Intereses</th><th scope="col">Podrías ahorrar</th><th scope="col"><span className="sr-only">Acciones</span></th>
        </tr></thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.id} className={`border-b border-borde last:border-0 ${f.prioridad ? "bg-brand-fondo" : ""}`}>
              <th scope="row" className="py-2 pr-2 font-medium">
                <input aria-label={`Nombre de ${f.nombre}`} value={f.nombre} onChange={(e) => onNombre(f.id, e.target.value)} maxLength={30}
                  className="w-28 rounded border border-borde-input bg-superficie px-2 py-1" />
                {f.prioridad && <span className="mt-1 block text-xs font-semibold text-brand">Renegocia este primero</span>}
              </th>
              {f.error ? <td colSpan={5} className="text-error-texto">{f.error}</td> : (
                <>
                  <td>{formatCLP(f.saldo)}</td><td>{formatPct(f.tasaMensual)}</td><td>{f.meses} meses</td>
                  <td>{formatCLP(f.intereses ?? 0)}</td><td className="font-semibold text-ok">{formatCLP(f.mejorAhorro ?? 0)}</td>
                </>
              )}
              <td><button type="button" onClick={() => onQuitar(f.id)} className="min-h-11 px-2 text-suave underline">Quitar</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
