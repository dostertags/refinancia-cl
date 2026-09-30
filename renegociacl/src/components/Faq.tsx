const PREGUNTAS: { p: string; r: React.ReactNode }[] = [
  { p: "¿Por qué me da distinto que en mi banco?", r: (
    <>
      <p>Es normal que haya pequeñas diferencias. Estas son las causas más comunes:</p>
      <ul className="ml-5 mt-1 list-disc space-y-1">
        <li>El banco suma <b>seguros</b> (desgravamen, cesantía) y <b>comisiones</b> que aquí no conocemos, salvo que las escribas como &quot;gastos&quot;.</li>
        <li>Pueden cobrarte el <b>impuesto de timbres y estampillas</b>, que sube el costo total.</li>
        <li>Cada banco redondea los pesos y cuenta los días a su manera; eso mueve la cuota unos pesos.</li>
        <li>La tasa que escribiste puede ser distinta a la que realmente te cobran (por ejemplo, anual en vez de mensual).</li>
      </ul>
      <p className="mt-1">Si la diferencia es grande, revisa tu contrato o pide la &quot;tabla de amortización&quot; a tu banco.</p>
    </>) },
  { p: "¿Y si no sé mi tasa?", r: <p>No hay problema: con el saldo, tu cuota y los <b>meses que te faltan</b> calculamos la tasa por ti. Los meses los ves en tu app del banco como &quot;cuotas restantes&quot;. Necesitamos al menos uno de los dos datos (tasa o meses).</p> },
  { p: "¿Cómo cuentan mis tarjetas?", r: <p>Agrega hasta 3 tarjetas con lo que debes en cada una y su pago mensual o su tasa (con uno basta). Las que dejes marcadas se suman a la deuda a refinanciar; si desmarcas alguna, sigue igual que hoy y se cuenta en lo que pagas cada mes. Si no pones ni pago ni tasa, no podemos calcular su costo y la dejamos fuera.</p> },
  { p: "¿Qué pasa si mi tasa es anual?", r: <p>Elige &quot;por año (CAE)&quot; junto a la tasa. Convertimos la tasa anual a mensual de forma compuesta (por ejemplo, 26,82% al año equivale a 2% al mes). No sirve dividir por 12: daría un valor distinto.</p> },
  { p: "¿Qué es el CAE y el CTC?", r: <p>El <b>CAE</b> es lo que te cuesta el crédito en un año contando todo (tasa, comisiones, seguros): sirve para comparar. El <b>CTC</b> es el total en pesos que terminas pagando. Antes de firmar, pide ambos por escrito.</p> },
  { p: "¿Puedo pagar antes de tiempo?", r: <p>Sí, en general puedes abonar o prepagar y así pagas menos intereses. La opción &quot;abona de una vez&quot; te muestra cuánto ahorrarías. Revisa en tu contrato si hay costo por prepagar.</p> },
  { p: "¿Mi crédito está en UF?", r: <p>Ingresa el saldo y la cuota en pesos de hoy. Como la UF sube con la inflación, la cuota real futura será un poco mayor a la calculada.</p> },
  { p: "¿Guardan mis datos?", r: <p>No. Todo se calcula en tu celular o computador; lo que escribes no se envía a ningún servidor y no usamos cookies de seguimiento. Si compartes el enlace, viaja con tus datos dentro: quien lo reciba los verá.</p> },
  { p: "¿De dónde salen las tasas del mercado?", r: <p>Del <b>Comparador de créditos de consumo del SERNAC</b>, donde cada institución informa sus simulaciones (tasa, CAE, cuota y costo total) para distintos montos y plazos. Las mostramos tal cual, con su fecha de carga y un enlace a la fuente. Son referenciales y no vinculantes.</p> },
  { p: "¿Estas opciones son ofertas de un banco?", r: <p>No. Son simulaciones que cada institución informó al SERNAC: no son una oferta ni una aprobación de crédito. Tu tasa real depende de tu evaluación (ingresos, historial, monto). Cotiza en al menos tres instituciones y compara por el menor costo total (CTC).</p> },
];

export default function Faq() {
  return (
    <section aria-labelledby="faq" className="no-print rounded-xl border border-borde bg-superficie p-4">
      <h2 id="faq" className="mb-2 font-semibold">Preguntas frecuentes</h2>
      <div className="divide-y divide-borde">
        {PREGUNTAS.map(({ p, r }) => (
          <details key={p} className="py-2">
            <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">{p}</summary>
            <div className="pb-2 text-sm text-suave">{r}</div>
          </details>
        ))}
      </div>
    </section>
  );
}
