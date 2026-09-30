"use client";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, Card, FieldError, Input, Insignia, Label, Select } from "@/components/ui/primitives";
import { parseCLP } from "@/lib/format";
import type { Deuda, Objetivo } from "@/lib/types";

export interface Opciones { objetivo: Objetivo; tarjetas_mas_de_24: boolean }

const dec = (s: string) => parseFloat(s.replace(/\./g, "").replace(",", "."));
/** Tasa escrita en % ("2,5"). "" = no la puso; 0 es válido (cuotas sin interés). */
const hayTasa = (t: string): boolean => t.trim() !== "";
const tasaOk = (t: string): boolean => { const n = parseFloat(t.replace(",", ".")); return Number.isFinite(n) && n >= 0 && n < 100; };
const aFraccion = (t: string): number => parseFloat(t.replace(",", ".")) / 100;

// Reglas: crédito/línea = cuota + (tasa o meses restantes, al menos uno). Tarjeta = (pago mensual o tasa, al menos uno).
const deudaSchema = z.object({
  institucion: z.string().min(1, "Indica la institución"),
  tipo: z.enum(["consumo", "tarjeta", "linea"]),
  moneda: z.enum(["CLP", "UF"]),
  monto: z.string().refine((v) => dec(v) > 0, "Ingresa el monto"),
  tasa: z.string(),
  cuota: z.string(),
  plazo: z.string(),
  casa: z.boolean(),
  incluir: z.boolean(),
}).superRefine((d, ctx) => {
  const cuota = d.cuota.trim() !== "" && dec(d.cuota) > 0;
  const plazo = parseCLP(d.plazo) > 0;
  if (hayTasa(d.tasa) && !tasaOk(d.tasa)) ctx.addIssue({ code: "custom", path: ["tasa"], message: "Tasa mensual en % (ej. 2,5)" });
  if (d.tipo === "tarjeta") {
    if (!cuota && !hayTasa(d.tasa)) ctx.addIssue({ code: "custom", path: ["cuota"], message: "Escribe el pago mensual o la tasa (con una basta)" });
  } else {
    if (!cuota) ctx.addIssue({ code: "custom", path: ["cuota"], message: "Ingresa la cuota" });
    if (!hayTasa(d.tasa) && !plazo) ctx.addIssue({ code: "custom", path: ["tasa"], message: "Escribe la tasa o los meses que te faltan (con una basta)" });
  }
});
const schema = z.object({ deudas: z.array(deudaSchema).max(30), objetivo: z.enum(["costo", "cuota"]), mas24: z.boolean() });
type F = z.infer<typeof schema>;
const vacia: F["deudas"][number] = { institucion: "", tipo: "consumo", moneda: "CLP", monto: "", tasa: "", cuota: "", plazo: "", casa: false, incluir: true };

export default function StepDeudas({ inicial, opciones, onNext, onBack }: { inicial: Deuda[]; opciones: Opciones; onNext: (d: Deuda[], o: Opciones) => void; onBack: () => void }) {
  const { register, control, handleSubmit, formState: { errors } } = useForm<F>({
    resolver: zodResolver(schema),
    defaultValues: { objetivo: opciones.objetivo, mas24: opciones.tarjetas_mas_de_24, deudas: inicial.length ? inicial.map((d) => ({
      institucion: d.institucion, tipo: d.tipo, moneda: d.moneda, monto: String(d.monto_actual),
      tasa: d.tasa_mensual !== undefined ? String(d.tasa_mensual * 100).replace(".", ",") : "",
      cuota: d.cuota_actual !== undefined ? String(d.cuota_actual) : "", plazo: d.plazo_restante_meses !== undefined ? String(d.plazo_restante_meses) : "",
      casa: d.casa_comercial, incluir: d.incluir })) : [vacia] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "deudas" });
  const objetivo = useWatch({ control, name: "objetivo" });
  const lista = useWatch({ control, name: "deudas" });

  const enviar = (f: F) =>
    onNext(f.deudas.map((d) => ({
      institucion: d.institucion, tipo: d.tipo, moneda: d.moneda, monto_actual: dec(d.monto),
      tasa_mensual: hayTasa(d.tasa) ? aFraccion(d.tasa) : undefined,
      cuota_actual: d.cuota.trim() !== "" && dec(d.cuota) > 0 ? dec(d.cuota) : undefined,
      plazo_restante_meses: d.tipo !== "tarjeta" && parseCLP(d.plazo) > 0 ? parseCLP(d.plazo) : undefined,
      casa_comercial: d.casa, incluir: d.incluir,
    })), { objetivo: f.objetivo, tarjetas_mas_de_24: f.objetivo === "cuota" && f.mas24 });

  return (
    <form onSubmit={handleSubmit(enviar)} className="space-y-4" noValidate>
      <section aria-labelledby="necesitas" className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <h3 id="necesitas" className="mb-2 font-semibold">Qué necesitas</h3>
        <p><Insignia id="n1" texto="Obligatorio" /> En cada crédito o línea: la institución, cuánto debes y la cuota mensual.</p>
        <p className="mt-2"><Insignia id="n2" texto="Una de las dos" /> En cada crédito: la tasa de interés o los meses que te faltan. Si escribes una, calculamos la otra.</p>
        <p className="mt-2"><Insignia id="n3" texto="Una de las dos" /> En cada tarjeta: su pago mensual o su tasa (con cuánto debes basta lo demás). Lo que falte lo calculamos suponiendo que se paga en 24 meses.</p>
        <p className="mt-2"><Insignia id="n4" texto="Opcional" /> Todo lo demás. Cada deuda trae la casilla &quot;Incluir en el refinanciamiento&quot;, marcada: las que dejes marcadas se suman al total a refinanciar; las que desmarques siguen igual y cuentan en lo que pagas cada mes.</p>
      </section>

      {fields.map((f, i) => {
        const e = errors.deudas?.[i];
        const esTarjeta = lista?.[i]?.tipo === "tarjeta";
        return (
          <Card key={f.id} className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Deuda {i + 1}</h3>
              <Button type="button" variant="ghost" onClick={() => remove(i)}>Quitar</Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div><div className="mb-1 flex items-center gap-2"><Label className="mb-0" htmlFor={`d${i}-institucion`}>Institución</Label><Insignia id={`d${i}-institucion-req`} texto="Obligatorio" /></div>
                <Input id={`d${i}-institucion`} aria-describedby={`d${i}-institucion-req`} {...register(`deudas.${i}.institucion`)} placeholder="Banco / casa comercial" />
                <FieldError msg={e?.institucion?.message} /></div>
              <div><Label htmlFor={`d${i}-tipo`}>Tipo</Label><Select id={`d${i}-tipo`} {...register(`deudas.${i}.tipo`)}>
                <option value="consumo">Crédito de consumo</option><option value="tarjeta">Tarjeta de crédito</option>
                <option value="linea">Línea de crédito</option></Select></div>
              <div><Label htmlFor={`d${i}-moneda`}>Moneda</Label><Select id={`d${i}-moneda`} {...register(`deudas.${i}.moneda`)}><option>CLP</option><option>UF</option></Select></div>
              <div><div className="mb-1 flex items-center gap-2"><Label className="mb-0" htmlFor={`d${i}-monto`}>Monto adeudado</Label><Insignia id={`d${i}-monto-req`} texto="Obligatorio" /></div>
                <Input id={`d${i}-monto`} inputMode="decimal" aria-describedby={`d${i}-monto-req`} {...register(`deudas.${i}.monto`)} placeholder="3.000.000" /><FieldError msg={e?.monto?.message} /></div>
              <div><div className="mb-1 flex items-center gap-2"><Label className="mb-0" htmlFor={`d${i}-cuota`}>{esTarjeta ? "Pago mensual de la tarjeta" : "Cuota actual"}</Label>
                <Insignia id={`d${i}-cuota-req`} texto={esTarjeta ? "Una de las dos" : "Obligatorio"} /></div>
                <Input id={`d${i}-cuota`} inputMode="decimal" aria-describedby={`d${i}-cuota-req`} {...register(`deudas.${i}.cuota`)} placeholder={esTarjeta ? "100.000" : "153.000"} /><FieldError msg={e?.cuota?.message} /></div>
              <div><div className="mb-1 flex items-center gap-2"><Label className="mb-0" htmlFor={`d${i}-tasa`}>Tasa mensual (%)</Label><Insignia id={`d${i}-tasa-req`} texto="Una de las dos" /></div>
                <Input id={`d${i}-tasa`} inputMode="decimal" placeholder="2,5" aria-describedby={`d${i}-tasa-req`} {...register(`deudas.${i}.tasa`)} /><FieldError msg={e?.tasa?.message} /></div>
              {!esTarjeta && (
                <div><div className="mb-1 flex items-center gap-2"><Label className="mb-0" htmlFor={`d${i}-plazo`}>Meses restantes</Label><Insignia id={`d${i}-plazo-req`} texto="Una de las dos" /></div>
                  <Input id={`d${i}-plazo`} inputMode="numeric" placeholder="31" aria-describedby={`d${i}-plazo-req`} {...register(`deudas.${i}.plazo`)} />
                  <p className="mt-1 text-xs text-slate-600">Cuotas que te quedan. Si no sabes tu tasa, con esto la calculamos.</p><FieldError msg={e?.plazo?.message} /></div>
              )}
              <label className="flex min-h-11 items-center gap-2 self-end text-sm"><input type="checkbox" {...register(`deudas.${i}.casa`)} /> Casa comercial (Falabella, Ripley…)</label>
              <label className="flex min-h-11 items-center gap-2 self-end text-sm font-medium"><input type="checkbox" className="h-5 w-5" {...register(`deudas.${i}.incluir`)} /> Incluir en el refinanciamiento</label>
            </div>
          </Card>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => append({ ...vacia })}>+ Agregar deuda</Button>
        <Button type="button" variant="outline" disabled title="Próximamente (v2)">Subir cartola PDF (próximamente)</Button>
      </div>
      <Card className="space-y-2">
        <h3 className="font-semibold">¿Qué quieres optimizar?</h3>
        <label className="flex items-start gap-2 text-sm"><input type="radio" value="costo" {...register("objetivo")} />
          <span><b>Menor costo total</b> — pagas menos en intereses (puede subir la cuota mensual).</span></label>
        <label className="flex items-start gap-2 text-sm"><input type="radio" value="cuota" {...register("objetivo")} />
          <span><b>Menor cuota posible</b> — alivia tu mes; usa plazos más largos y puede costar más en total.</span></label>
        {objetivo === "cuota" && (
          <label className="ml-6 flex items-center gap-2 text-sm"><input type="checkbox" {...register("mas24")} />
            Permitir tarjetas a más de 24 meses (baja más la cuota, pero supera los 24 meses que supone esta herramienta)</label>)}
      </Card>
      <p className="text-xs text-slate-600">Sin deudas, avanza igual: te mostraremos consejos de uso responsable del crédito.</p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onBack}>Atrás</Button>
        <Button type="submit">Simular</Button>
      </div>
    </form>
  );
}
