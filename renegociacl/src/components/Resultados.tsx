import { memo } from "react";
import Barras, { type FilaBarra } from "@/components/Grafico";
import OpcionCard from "@/components/OpcionCard";
import { formatCLP, formatPct } from "@/lib/format";
import { resumirMercado, type EstadoMercado, type Mercado } from "@/lib/mercado";
import type { Modo, OpcionRenegociacion, Resultado } from "@/lib/tipos";

type Ok = Extract<Resultado, { ok: true }>;

const corta = (o: OpcionRenegociacion, k: number): string => {
  const base = { tasa: `Tasa ${formatPct(o.tasaMensual)}`, cuota: `Tasa ${formatPct(o.tasaMensual)}, mismo plazo`, plazo: `Tasa ${formatPct(o.tasaMensual)}, ${o.nuevosMeses} m`,
    abono: "Subir la cuota", abonoUnico: "Abono único", tarjeta: "Tarjeta al crédito" }[o.tipo];
  return `${k + 1}. ${base}`;
};

function Fuentes({ estado, mercado, onReintentar }: { estado: EstadoMercado | "cargando"; mercado: Mercado; onReintentar: () => void }) {
  const r = resumirMercado(mercado);
  return (
    <section aria-labelledby="fuentes" className="rounded-xl border border-borde bg-superficie p-4 text-sm">
      <h2 id="fuentes" className="mb-2 font-semibold">De dónde salen los números</h2>
      <ul className="space-y-1 text-suave">
        <li><b className="text-texto">Tus datos:</b> lo que escribiste. No se envían a ningún lado.</li>
        <li><b className="text-texto">Cálculo:</b> cuota fija con interés mensual compuesto, la misma lógica que usan los bancos para créditos de consumo. Los gastos que ingreses se restan del ahorro.</li>
        <li><b className="text-texto">Tasas de mercado:</b>{" "}
          {estado === "ok" && r && <>fuente {r.fuente || "no informada"}{r.actualizado ? `, actualizado al ${r.actualizado}` : ""}. La tasa más baja es {formatPct(r.min)} mensual ({r.mejor}) y la mediana {formatPct(r.mediana)} ({r.cantidad} ofertas).</>}
          {estado === "cargando" && <>Cargando…</>}
          {estado === "vacio" && <>Aún no hay tasas de mercado cargadas. Para comparar con precios reales, agrega las ofertas que te dieron.</>}
          {estado === "error" && <>No pudimos cargar las tasas de mercado (la calculadora funciona igual con tus datos). <button type="button" onClick={onReintentar} className="min-h-11 font-medium text-brand underline">Reintentar</button></>}
        </li>
      </ul>
    </section>
  );
}

export interface PropsResultados {
  r: Ok; modo: Modo; estadoMercado: EstadoMercado | "cargando"; mercado: Mercado; onReintentar: () => void; acciones: React.ReactNode;
}

function ResultadosBase({ r, modo, estadoMercado, mercado, onReintentar, acciones }: PropsResultados) {
  const mejor = r.opciones[0];
  // La tarjeta es OTRA deuda (se compara contra dejarla a 24 meses): no se mezcla con los totales y plazos del crédito.
  const delCredito = r.opciones.filter((o) => o.tipo !== "tarjeta");
  const filasTotal: FilaBarra[] = [{ etiqueta: "Hoy", valor: r.actual.totalPagar, texto: formatCLP(r.actual.totalPagar), base: true },
    ...delCredito.map((o) => ({ etiqueta: corta(o, r.opciones.indexOf(o)), valor: o.totalPagar, texto: formatCLP(o.totalPagar), destacada: o.id === mejor?.id }))];
  const filasTiempo: FilaBarra[] = [{ etiqueta: "Hoy", valor: r.actual.meses, texto: `${r.actual.meses} meses`, base: true },
    ...delCredito.map((o) => ({ etiqueta: corta(o, r.opciones.indexOf(o)), valor: o.nuevosMeses, texto: `${o.nuevosMeses} ${o.nuevosMeses === 1 ? "mes" : "meses"}`, destacada: o.id === mejor?.id }))];
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-borde bg-superficie p-4">
        <h2 className="font-semibold">Si sigues como estás</h2>
        <p className="mt-1">
          Te faltan <b>{r.actual.meses} meses</b> y vas a pagar <b>{formatCLP(r.actual.totalPagar)}</b> en total,
          de los cuales <b>{formatCLP(r.actual.intereses)}</b> son solo intereses. Tu tasa equivale a un <b>{formatPct(r.actual.caeAnual, 1)}</b> al año.
        </p>
      </div>

      {r.nota && <p className="rounded-xl border border-borde bg-superficie p-4">{r.nota}</p>}
      {r.avisos.map((a) => <p key={a} className="rounded-xl border border-borde bg-aviso-fondo p-3 text-sm text-aviso-texto">{a}</p>)}

      {mejor && (
        <section aria-labelledby="mejor" className="rounded-2xl border-2 border-brand bg-brand-fondo p-4 sm:p-5">
          <h2 id="mejor" className="text-sm font-semibold uppercase tracking-wide text-brand">Tu mejor opción</h2>
          <p className="mt-1 text-3xl font-extrabold sm:text-4xl">
            {modo === "cuota" ? `Tu cuota baja ${formatCLP(mejor.alivioMensual)}` : `Ahorras ${formatCLP(mejor.ahorroTotal)}`}
          </p>
          <p className="mt-1 text-sm">{mejor.titulo}.</p>
        </section>
      )}

      {r.opciones.length === 0 ? (
        !r.nota && <p className="rounded-xl border border-borde bg-superficie p-4">No encontramos opciones que mejoren tu situación con estos datos. Prueba agregando una oferta que hayas recibido.</p>
      ) : (
        <div>
          <h2 className="mb-2 font-semibold">Tus opciones, de mejor a peor</h2>
          <ol aria-label="Opciones de renegociación" className="space-y-3">
            {r.opciones.map((o, k) => <OpcionCard key={o.id} o={o} rango={k} actual={r.actual} />)}
          </ol>
        </div>
      )}

      {delCredito.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Barras id="g-total" titulo="Cuánto pagarías en total" ayuda="Suma de todas las cuotas y gastos. Más corta = mejor." filas={filasTotal} />
          <Barras id="g-tiempo" titulo="Cuándo terminas de pagar" ayuda="Meses que faltan hasta la última cuota." filas={filasTiempo} />
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-borde bg-superficie p-4">
        <h2 className="mb-2 font-semibold">Comparación de tasas</h2>
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Comparación de tasas: mensual y costo anual equivalente de cada producto</caption>
          <thead><tr className="border-b border-borde"><th scope="col" className="py-1">Producto</th><th scope="col">Tasa mensual</th><th scope="col">Al año (CAE aprox.)</th></tr></thead>
          <tbody>{r.comparacion.map((f) => (
            <tr key={f.nombre} className="border-b border-borde last:border-0"><td className="py-1">{f.nombre}</td><td>{formatPct(f.tasaMensual)}</td><td>{formatPct(f.caeAnual, 1)}</td></tr>))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-suave">El CAE real incluye comisiones y seguros; aquí se muestra solo el efecto de la tasa.</p>
      </div>

      <Fuentes estado={estadoMercado} mercado={mercado} onReintentar={onReintentar} />
      {acciones}

      <div className="rounded-xl border border-borde bg-aviso-fondo p-4 text-sm text-aviso-texto">
        <b>Antes de firmar:</b> pide por escrito el CAE y el Costo Total del Crédito (CTC) de cualquier propuesta y compáralo con estos números.
        Las &quot;metas de negociación&quot; son ejemplos para que sepas cuánto podrías ahorrar, no ofertas de ningún banco.
        Esto es una simulación educativa: no es una oferta de crédito ni asesoría financiera.
      </div>
    </div>
  );
}

// memo: el resultado solo se vuelve a dibujar cuando cambian sus datos, no con cada tecla en el formulario.
export default memo(ResultadosBase);
