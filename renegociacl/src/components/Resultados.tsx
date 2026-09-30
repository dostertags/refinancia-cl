import { memo } from "react";
import Barras, { type FilaBarra } from "@/components/Grafico";
import OpcionCard from "@/components/OpcionCard";
import { formatCLP, formatFecha, formatPct } from "@/lib/format";
import { nombreInstitucion, type EstadoMercado, type Mercado } from "@/lib/mercado";
import type { Modo, OpcionRenegociacion, Resultado } from "@/lib/tipos";

type Ok = Extract<Resultado, { ok: true }>;

const corta = (o: OpcionRenegociacion, k: number): string => {
  const base = { tasa: `Tasa ${formatPct(o.tasaMensual)}`, cuota: `Tasa ${formatPct(o.tasaMensual)}, mismo plazo`, plazo: `Tasa ${formatPct(o.tasaMensual)}, ${o.nuevosMeses} m`,
    abono: "Subir la cuota", abonoUnico: "Abono único", mercado: `${nombreInstitucion(o.fuente?.institucion ?? "Mercado")}, ${o.nuevosMeses} cuotas` }[o.tipo];
  return `${k + 1}. ${base}`;
};

function Fuentes({ estado, mercado, onReintentar }: { estado: EstadoMercado | "cargando"; mercado: Mercado | null; onReintentar: () => void }) {
  return (
    <section aria-labelledby="fuentes" className="rounded-xl border border-borde bg-superficie p-4 text-sm">
      <h2 id="fuentes" className="mb-2 font-semibold">De dónde salen los números</h2>
      <ul className="space-y-2 text-suave">
        <li><b className="text-texto">Tus datos:</b> lo que escribiste. No se envían a ningún lado.</li>
        <li><b className="text-texto">Cálculo:</b> cuota fija con interés mensual compuesto, la misma lógica que usan los bancos para créditos de consumo. Los gastos que ingreses se restan del ahorro.</li>
        <li><b className="text-texto">Tasas de mercado:</b>{" "}
          {estado === "ok" && mercado && (
            <>
              simulaciones oficiales del{" "}
              <a href={mercado.urlFuente} target="_blank" rel="noopener noreferrer" className="font-medium text-brand underline">Comparador de créditos de consumo del SERNAC</a>,
              cargadas el {formatFecha(mercado.actualizado)}. {mercado.aviso} {mercado.notaCae}
            </>
          )}
          {estado === "cargando" && <>Cargando…</>}
          {estado === "vacio" && <>Aún no hay tasas de mercado cargadas. Para comparar con precios reales, agrega las ofertas que te dieron.</>}
          {estado === "error" && <>No pudimos cargar las tasas de mercado (la calculadora funciona igual con tus datos). <button type="button" onClick={onReintentar} className="min-h-11 font-medium text-brand underline">Reintentar</button></>}
        </li>
      </ul>
    </section>
  );
}

export interface PropsResultados {
  r: Ok; modo: Modo; estadoMercado: EstadoMercado | "cargando"; mercado: Mercado | null; onReintentar: () => void; acciones: React.ReactNode;
}

function ResultadosBase({ r, modo, estadoMercado, mercado, onReintentar, acciones }: PropsResultados) {
  const mejor = r.opciones[0];
  const m = r.mercado;
  const filasTotal: FilaBarra[] = [{ etiqueta: "Hoy", valor: r.actual.totalPagar, texto: formatCLP(r.actual.totalPagar), base: true },
    ...r.opciones.map((o, k) => ({ etiqueta: corta(o, k), valor: o.totalPagar, texto: formatCLP(o.totalPagar), destacada: k === 0 }))];
  const filasTiempo: FilaBarra[] = [{ etiqueta: "Hoy", valor: r.actual.meses, texto: `${r.actual.meses} meses`, base: true },
    ...r.opciones.map((o, k) => ({ etiqueta: corta(o, k), valor: o.nuevosMeses, texto: `${o.nuevosMeses} ${o.nuevosMeses === 1 ? "mes" : "meses"}`, destacada: k === 0 }))];
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-borde bg-superficie p-4">
        <h2 className="font-semibold">Si sigues como estás</h2>
        <p className="mt-1">
          Te faltan <b>{r.actual.meses} meses</b> y vas a pagar <b>{formatCLP(r.actual.totalPagar)}</b> en total,
          de los cuales <b>{formatCLP(r.actual.intereses)}</b> son solo intereses. Tu tasa equivale a un <b>{formatPct(r.actual.caeAnual, 1)}</b> al año.
        </p>
        <p className="mt-1">Hoy pagas <b>{formatCLP(r.actual.cuotaTotal)}</b> al mes entre todas tus deudas.</p>
      </div>

      <section aria-labelledby="refi" className="rounded-xl border border-borde bg-superficie p-4">
        <h2 id="refi" className="font-semibold">Deuda a refinanciar</h2>
        <p className="mt-1 text-3xl font-extrabold">{formatCLP(r.refinanciar.total)}</p>
        <dl className="mt-2 space-y-1 text-sm">
          {r.refinanciar.partes.map((p) => (
            <div key={p.nombre} className="flex justify-between gap-3"><dt>{p.nombre}</dt><dd className="font-medium">{formatCLP(p.saldo)}</dd></div>
          ))}
        </dl>
        {r.refinanciar.excluidas.length > 0 && (
          <p className="mt-2 text-sm text-suave">
            Se queda como está (no entra al refinanciamiento): {r.refinanciar.excluidas.map((x) => `${x.nombre} (${formatCLP(x.saldo)})`).join(", ")}. Igual se cuenta en lo que pagas cada mes.
          </p>
        )}
      </section>

      {r.supuestos.length > 0 && (
        <section aria-labelledby="supuestos" className="rounded-xl border border-borde bg-superficie p-4 text-sm">
          <h2 id="supuestos" className="mb-1 font-semibold">Lo que supusimos</h2>
          {r.supuestos.map((t) => <p key={t} className="text-suave">{t}</p>)}
        </section>
      )}

      {m && (
        <section aria-labelledby="mercado-mejor" className="rounded-xl border border-borde bg-superficie p-4">
          <h2 id="mercado-mejor" className="font-semibold">Tasa más competitiva del mercado</h2>
          <p className="mt-1 text-3xl font-extrabold">{formatPct(m.menorTasa)} <span className="text-base font-medium text-suave">mensual · {nombreInstitucion(m.mejor.institucion)}</span></p>
          <p className="mt-1 text-sm text-suave">
            Para un crédito de consumo de {formatCLP(m.montoBase)} (el monto publicado más cercano a tus {formatCLP(r.refinanciar.total)}), {m.cantidadInstituciones} instituciones
            informan tasas desde {formatPct(m.menorTasa)} hasta {formatPct(m.peorTasa)} mensual. Fuente:{" "}
            <a href={m.urlFuente} target="_blank" rel="noopener noreferrer" className="font-medium text-brand underline">SERNAC, Comparador de créditos de consumo</a>,
            cargada el {formatFecha(m.actualizado)}. Es referencial: tu tasa real depende de tu evaluación.
          </p>
        </section>
      )}

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
        !r.nota && <p className="rounded-xl border border-borde bg-superficie p-4">No encontramos opciones que mejoren tu situación con los datos disponibles. Si tienes una oferta de otra institución, agrégala arriba para compararla.</p>
      ) : (
        <div>
          <h2 className="mb-2 font-semibold">Tus opciones, de mejor a peor</h2>
          <ol aria-label="Opciones de renegociación" className="space-y-3">
            {r.opciones.map((o, k) => <OpcionCard key={o.id} o={o} rango={k} actual={r.actual} />)}
          </ol>
        </div>
      )}

      {r.opciones.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Barras id="g-total" titulo="Cuánto pagarías en total" ayuda="Suma de todas las cuotas y gastos. Más corta = mejor." filas={filasTotal} />
          <Barras id="g-tiempo" titulo="Cuándo terminas de pagar" ayuda="Meses que faltan hasta la última cuota." filas={filasTiempo} />
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-borde bg-superficie p-4">
        <h2 className="mb-2 font-semibold">Comparación de tasas</h2>
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Comparación de tasas: mensual y costo anual equivalente de cada producto</caption>
          <thead><tr className="border-b border-borde"><th scope="col" className="py-1">Producto</th><th scope="col">Tasa mensual</th><th scope="col">Al año (aprox.)</th></tr></thead>
          <tbody>{r.comparacion.map((f) => (
            <tr key={f.nombre} className="border-b border-borde last:border-0"><td className="py-1">{f.nombre}</td><td>{formatPct(f.tasaMensual)}</td><td>{formatPct(f.caeAnual, 1)}</td></tr>))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-suave">El costo real incluye comisiones y seguros; aquí se muestra solo el efecto de la tasa.</p>
      </div>

      <Fuentes estado={estadoMercado} mercado={mercado} onReintentar={onReintentar} />
      {acciones}

      <div className="rounded-xl border border-borde bg-aviso-fondo p-4 text-sm text-aviso-texto">
        <b>Antes de firmar:</b> las tasas de mercado son simulaciones referenciales que cada institución informó al SERNAC; tu condición real depende de tu evaluación.
        Cotiza en al menos tres instituciones y pide por escrito el CAE y el Costo Total del Crédito (CTC) para compararlos con estos números.
        Esto es una simulación educativa: no es una oferta de crédito ni asesoría financiera.
      </div>
    </div>
  );
}

// memo: el resultado solo se vuelve a dibujar cuando cambian sus datos, no con cada tecla en el formulario.
export default memo(ResultadosBase);
