"use client";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, Card, FieldError, Input, Label, Select } from "@/components/ui/primitives";
import { parseCLP, pctMensualAFraccion } from "@/lib/format";
import type { Deuda, Objetivo } from "@/lib/types";

export interface Opciones { objetivo: Objetivo; tarjetas_mas_de_24: boolean }

const num = (msg: string) => z.string().refine((v) => parseCLP(v) > 0, msg);
const deudaSchema = z.object({
  institucion: z.string().min(1, "Indica la institución"),
  tipo: z.enum(["consumo", "tarjeta", "linea"]),
  moneda: z.enum(["CLP", "UF"]),
  monto: z.string().refine((v) => parseFloat(v.replace(/\./g, "").replace(",", ".")) > 0, "Ingresa el monto"),
  tasa: z.string().refine((v) => pctMensualAFraccion(v) > 0 && pctMensualAFraccion(v) < 1, "Tasa mensual en % (ej. 2,5)"),
  cuota: z.string().refine((v) => parseFloat(v.replace(/\./g, "").replace(",", ".")) >= 0 && v !== "", "Ingresa la cuota"),
  plazo: num("Ingresa los meses restantes"),
  casa: z.boolean(),
});
const schema = z.object({ deudas: z.array(deudaSchema).max(50), objetivo: z.enum(["costo", "cuota"]), mas24: z.boolean() });
type F = z.infer<typeof schema>;
const vacia: F["deudas"][number] = { institucion: "", tipo: "consumo", moneda: "CLP", monto: "", tasa: "", cuota: "", plazo: "", casa: false };
const dec = (s: string) => parseFloat(s.replace(/\./g, "").replace(",", "."));

export default function StepDeudas({ inicial, opciones, onNext, onBack }: { inicial: Deuda[]; opciones: Opciones; onNext: (d: Deuda[], o: Opciones) => void; onBack: () => void }) {
  const { register, control, handleSubmit, formState: { errors } } = useForm<F>({
    resolver: zodResolver(schema),
    defaultValues: { objetivo: opciones.objetivo, mas24: opciones.tarjetas_mas_de_24, deudas: inicial.length ? inicial.map((d) => ({
      institucion: d.institucion, tipo: d.tipo, moneda: d.moneda, monto: String(d.monto_actual),
      tasa: String(d.tasa_mensual * 100).replace(".", ","), cuota: String(d.cuota_actual),
      plazo: String(d.plazo_restante_meses), casa: d.casa_comercial })) : [vacia] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "deudas" });

  const objetivo = useWatch({ control, name: "objetivo" });
  const enviar = (f: F) =>
    onNext(f.deudas.map((d) => ({
      institucion: d.institucion, tipo: d.tipo, moneda: d.moneda, monto_actual: dec(d.monto),
      tasa_mensual: pctMensualAFraccion(d.tasa), cuota_actual: dec(d.cuota),
      plazo_restante_meses: parseCLP(d.plazo), casa_comercial: d.casa,
    })), { objetivo: f.objetivo, tarjetas_mas_de_24: f.objetivo === "cuota" && f.mas24 });

  return (
    <form onSubmit={handleSubmit(enviar)} className="space-y-4" noValidate>
      {fields.map((f, i) => {
        const e = errors.deudas?.[i];
        return (
          <Card key={f.id} className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Deuda {i + 1}</h3>
              <Button type="button" variant="ghost" onClick={() => remove(i)}>Quitar</Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div><Label htmlFor={`d${i}-institucion`}>Institución</Label><Input id={`d${i}-institucion`} {...register(`deudas.${i}.institucion`)} placeholder="Banco / casa comercial" />
                <FieldError msg={e?.institucion?.message} /></div>
              <div><Label htmlFor={`d${i}-tipo`}>Tipo</Label><Select id={`d${i}-tipo`} {...register(`deudas.${i}.tipo`)}>
                <option value="consumo">Crédito de consumo</option><option value="tarjeta">Tarjeta de crédito</option>
                <option value="linea">Línea de crédito</option></Select></div>
              <div><Label htmlFor={`d${i}-moneda`}>Moneda</Label><Select id={`d${i}-moneda`} {...register(`deudas.${i}.moneda`)}><option>CLP</option><option>UF</option></Select></div>
              <div><Label htmlFor={`d${i}-monto`}>Monto adeudado</Label><Input id={`d${i}-monto`} inputMode="decimal" {...register(`deudas.${i}.monto`)} /><FieldError msg={e?.monto?.message} /></div>
              <div><Label htmlFor={`d${i}-tasa`}>Tasa mensual (%)</Label><Input id={`d${i}-tasa`} inputMode="decimal" placeholder="2,5" {...register(`deudas.${i}.tasa`)} /><FieldError msg={e?.tasa?.message} /></div>
              <div><Label htmlFor={`d${i}-cuota`}>Cuota actual</Label><Input id={`d${i}-cuota`} inputMode="decimal" {...register(`deudas.${i}.cuota`)} /><FieldError msg={e?.cuota?.message} /></div>
              <div><Label htmlFor={`d${i}-plazo`}>Meses restantes</Label><Input id={`d${i}-plazo`} inputMode="numeric" {...register(`deudas.${i}.plazo`)} /><FieldError msg={e?.plazo?.message} /></div>
              <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" {...register(`deudas.${i}.casa`)} /> Casa comercial (Falabella, Ripley…)</label>
            </div>
          </Card>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => append(vacia)}>+ Agregar deuda</Button>
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
            Permitir tarjetas a más de 24 meses (baja más la cuota, pero excede el plazo de la NCG 537)</label>)}
      </Card>
      <p className="text-xs text-slate-500">Sin deudas, avanza igual: te mostraremos consejos de uso responsable del crédito.</p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onBack}>Atrás</Button>
        <Button type="submit">Simular</Button>
      </div>
    </form>
  );
}
