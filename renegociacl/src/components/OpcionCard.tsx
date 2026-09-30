import type { FilaAmortizacion } from "@/lib/amortizacion";
import { formatCLP, formatFecha, formatPct } from "@/lib/format";
import { nombreInstitucion } from "@/lib/mercado";
import type { Actual, OpcionRenegociacion } from "@/lib/tipos";

function TablaMeses({ titulo, filas }: { titulo: string; filas: FilaAmortizacion[] }) {
  const hayAbono = filas.some((f) => f.abono > 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[26rem] text-right text-xs">
        <caption className="pb-1 text-left text-sm font-medium">{titulo}</caption>
        <thead><tr className="border-b border-borde text-suave">
          <th scope="col" className="py-1 text-left">Mes</th><th scope="col">Pagas</th><th scope="col">Interés</th>
          <th scope="col">Baja tu deuda</th>{hayAbono && <th scope="col">Abono</th>}<th scope="col">Te queda debiendo</th>
        </tr></thead>
        <tbody>{filas.map((f) => (
          <tr key={f.mes} className="border-b border-borde last:border-0">
            <th scope="row" className="py-1 text-left font-normal">{f.mes === 0 ? "Hoy" : f.mes}</th><td>{formatCLP(f.pago)}</td><td>{formatCLP(f.interes)}</td>
            <td>{formatCLP(f.capital)}</td>{hayAbono && <td>{f.abono > 0 ? formatCLP(f.abono) : "-"}</td>}<td>{formatCLP(f.saldo)}</td>
          </tr>))}
        </tbody>
      </table>
    </div>
  );
}

export default function OpcionCard({ o, rango, actual }: { o: OpcionRenegociacion; rango: number; actual: Actual }) {
  const mejor = rango === 0;
  const f = o.fuente;
  return (
    <li className={`rounded-xl border p-4 ${mejor ? "border-brand bg-brand-fondo" : "border-borde bg-superficie"}`}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${mejor ? "bg-brand text-sobre-brand" : "bg-superficie-2 text-texto"}`}>{rango + 1}</span>
        <div className="min-w-0">
          <p className="font-semibold">
            <span className="sr-only">Opción {rango + 1}: </span>{o.titulo}
            {mejor && <span className="ml-2 whitespace-nowrap rounded bg-brand px-2 py-0.5 text-xs font-medium text-sobre-brand">Mejor opción</span>}
          </p>
          <p className="mt-1 text-sm">{o.resumen}</p>
          {f && (
            <p className="mt-1 text-xs text-suave">
              Simulación informada por {nombreInstitucion(f.institucion)} al SERNAC (cargada el {formatFecha(f.fecha)}); {f.escalado ? `valores llevados a tu monto desde la simulación de ${formatCLP(f.montoBase)}` : "valores exactos del comparador"}.{" "}
              <a href={f.url} target="_blank" rel="noopener noreferrer" className="font-medium text-brand underline">Ver fuente</a>
            </p>
          )}
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-center text-sm sm:grid-cols-4">
        <div className="rounded-lg bg-superficie p-2"><dt className="text-xs text-suave">Cuota</dt><dd className="font-semibold">{formatCLP(o.nuevaCuota)}</dd></div>
        <div className="rounded-lg bg-superficie p-2"><dt className="text-xs text-suave">Plazo</dt><dd className="font-semibold">{o.nuevosMeses} meses</dd></div>
        <div className="rounded-lg bg-superficie p-2"><dt className="text-xs text-suave">{o.ahorroTotal >= 0 ? "Ahorras" : "Pagas de más"}</dt>
          <dd className={`font-semibold ${o.ahorroTotal >= 0 ? "text-ok" : "text-mal"}`}>{o.ahorroTotal >= 0 ? "" : "− "}{formatCLP(Math.abs(o.ahorroTotal))}</dd></div>
        <div className="rounded-lg bg-superficie p-2"><dt className="text-xs text-suave">Costo al año (CAE)</dt><dd className="font-semibold">{formatPct(o.caeAnual, 1)}</dd></div>
      </dl>
      <details className="no-print mt-3">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-brand">Ver cómo se calcula</summary>
        <div className="space-y-3 pt-2 text-sm">
          <p>Cada mes el banco cobra interés sobre lo que aún debes: <b>interés = lo que debes × la tasa</b>. Del resto de tu cuota, una parte baja tu deuda.
            Con una tasa menor pagas menos interés y tu deuda baja más rápido.</p>
          {o.tipo === "mercado" ? (
            <p>La cuota, la tasa, el CAE y el costo total los informó la institución al SERNAC para un crédito de consumo. No son una oferta ni una aprobación: tu condición real depende de la evaluación de la institución. Cotiza en al menos tres.</p>
          ) : o.primerosMeses ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <TablaMeses titulo="Primeros meses: hoy" filas={actual.primerosMeses} />
              <TablaMeses titulo="Primeros meses: con esta opción" filas={o.primerosMeses} />
            </div>
          ) : (
            <p>Esta opción no tiene desglose mes a mes.</p>
          )}
          <p className="text-xs text-suave">Costo total con esta opción: {formatCLP(o.totalPagar)}. Hoy pagarías {formatCLP(actual.totalPagar)}. Diferencia: {formatCLP(o.ahorroTotal)}.</p>
        </div>
      </details>
    </li>
  );
}
