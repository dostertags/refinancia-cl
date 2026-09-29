"use client";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Glosario from "@/components/Glosario";
import { Button, Card } from "@/components/ui/primitives";
import { formatCLP, formatPct } from "@/lib/format";
import type { Resultado } from "@/lib/types";

const COLOR = { verde: "bg-green-100 text-green-800", amarillo: "bg-yellow-100 text-yellow-800", rojo: "bg-red-100 text-red-800" };

function Big({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Card className={tone}>
      <div className="text-xs uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </Card>
  );
}

function Comparativo({ titulo, actual, nuevo }: { titulo: string; actual: number; nuevo: number }) {
  return (
    <div className="h-56" role="img" aria-label={`${titulo}: actual ${formatCLP(actual)}, refinanciada ${formatCLP(nuevo)}`}>
      <p className="mb-1 text-sm font-medium">{titulo}</p>
      <ResponsiveContainer width="100%" height="90%">
        <BarChart data={[{ nombre: titulo, actual, refinanciada: nuevo }]}>
          <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="nombre" hide />
          <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} width={48} />
          <Tooltip formatter={(v) => formatCLP(Number(v))} /><Legend />
          <Bar dataKey="actual" name="Actual" fill="#64748b" /><Bar dataKey="refinanciada" name="Refinanciada" fill="#1e3a8a" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const TITULO_ESTADO: Partial<Record<Resultado["estado"], string>> = {
  SOBREENDEUDADO: "No podemos simular un refinanciamiento",
  DATOS_INCONSISTENTES: "Revisa los datos que ingresaste",
  SIN_SOLUCION: "No encontramos una oferta que calce",
  NO_CONVIENE: "Refinanciar hoy no te conviene",
  SIN_DEUDAS: "No declaraste deudas",
};

export default function StepResultado({ res, onNext, onBack }: { res: Resultado; onNext: () => void; onBack: () => void }) {
  const a = res.situacion_actual, p = res.propuesta;
  const advertirFuente = res.fuente_ofertas === "ilustrativas" || res.fuente_ofertas === "usuario";
  return (
    <div className="space-y-4">
      {advertirFuente && (
        <div role="alert" className="rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
          <b>Importante:</b> {res.aviso_ofertas}
        </div>
      )}
      {!advertirFuente && res.aviso_ofertas && <p className="text-xs text-slate-500">{res.aviso_ofertas}</p>}
      {TITULO_ESTADO[res.estado] && <h2 className="text-lg font-semibold">{TITULO_ESTADO[res.estado]}</h2>}
      {res.alertas.map((t) => <div key={t} role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{t}</div>)}
      {res.mensajes.map((t) => <p key={t} className="text-slate-700">{t}</p>)}
      {res.sugerencias.length > 0 && <ul className="list-disc space-y-1 pl-6 text-sm">{res.sugerencias.map((t) => <li key={t}>{t}</li>)}</ul>}
      {res.analisis_una_deuda && <p className="rounded-md bg-blue-50 p-3 text-sm">{res.analisis_una_deuda.mensaje} Intereses evitables al prepagar: <b>{formatCLP(res.analisis_una_deuda.intereses_evitables_si_prepaga)}</b>.</p>}

      {a && p && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Big label="Ahorro total" value={formatCLP(p.ahorro_total)} tone={p.ahorro_total > 0 ? "bg-green-50" : "bg-red-50"} />
            <Big label="Ahorro mensual" value={formatCLP(p.ahorro_mensual)} />
            <Big label="Reducción de CAE" value={`${(p.reduccion_cae * 100).toFixed(1).replace(".", ",")} pp`} />
            <Big label={`Carga financiera (${p.semaforo})`} value={formatPct(p.pct_renta_comprometida, 1)} tone={COLOR[p.semaforo]} />
          </div>
          <Card>
            <h3 className="mb-2 font-semibold">Situación actual vs. refinanciada</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Comparativo titulo="Cuota mensual" actual={a.cuota_total} nuevo={p.cuota_total} />
              <Comparativo titulo="Costo total restante (CTC)" actual={a.ctc_restante} nuevo={p.ctc_nuevo} />
            </div>
          </Card>
          <Card className="overflow-x-auto">
            <h3 className="mb-2 font-semibold">Desglose por crédito</h3>
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Créditos propuestos con cuota, CAE y CTC</caption>
              <thead><tr className="border-b"><th scope="col">Institución</th><th scope="col">Monto</th><th scope="col">Plazo</th><th scope="col">Cuota</th><th scope="col">CAE</th><th scope="col">CTC</th><th scope="col">Intereses+seguros+gastos</th></tr></thead>
              <tbody>{p.prestamos.map((x, i) => (
                <tr key={i} className="border-b last:border-0"><td>{x.institucion}</td><td>{formatCLP(x.monto)}</td><td>{x.plazo_meses} m</td>
                  <td>{formatCLP(x.cuota)}</td><td>{formatPct(x.cae)}</td><td>{formatCLP(x.ctc)}</td><td>{formatCLP(x.costo_financiero)}</td></tr>))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-500">Cuota actual {formatCLP(a.cuota_total)} → nueva {formatCLP(p.cuota_total)}.</p>
          </Card>
          <Card>
            <h3 className="mb-1 font-semibold">¿Y ahora qué hago?</h3>
            <ol className="list-decimal space-y-1 pl-6 text-sm">
              <li>Cotiza cada crédito con la institución y pide por escrito el CAE y el CTC.</li>
              <li>Compara con esta simulación: si el CAE o el CTC reales son peores, no te conviene.</li>
              <li>Antes de firmar, confirma que el nuevo crédito paga tus deudas actuales y pide los certificados de deuda pagada.</li>
              <li>{res.aviso_retracto}</li>
            </ol>
          </Card>
        </>
      )}
      {a && !p && <Big label="Carga financiera actual" value={formatPct(a.pct_renta_comprometida, 1)} tone={COLOR[a.semaforo]} />}
      <Glosario />
      <div className="rounded-md border border-slate-300 bg-slate-100 p-3 text-sm text-slate-800">{res.disclaimer} {res.aviso_retracto}</div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack}>Editar datos</Button>
        <Button onClick={onNext}>Ver informe</Button>
      </div>
    </div>
  );
}
