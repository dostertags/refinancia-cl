"use client";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Glosario from "@/components/Glosario";
import { Button, FieldError, Input, Label, Select } from "@/components/ui/primitives";
import { formatCLP, parseCLP } from "@/lib/format";
import type { Perfil } from "@/lib/types";

const REGIONES = ["Arica y Parinacota", "Tarapacá", "Antofagasta", "Atacama", "Coquimbo", "Valparaíso", "Metropolitana",
  "O'Higgins", "Maule", "Ñuble", "Biobío", "La Araucanía", "Los Ríos", "Los Lagos", "Aysén", "Magallanes"];

// Los montos se escriben como texto (con o sin puntos) y se convierten con parseCLP.
const schema = z.object({
  renta: z.string().refine((v) => parseCLP(v) > 0, "Ingresa tu renta líquida mensual"),
  region: z.string().min(1),
  situacion: z.enum(["dependiente", "independiente", "jubilado"]),
  adicionales: z.string().optional(),
  meses: z.string().optional(), // 6 montos separados por coma (independientes)
  acepta: z.boolean().refine((v) => v === true, "Debes aceptar para continuar"),
});
type F = z.infer<typeof schema>;

export default function StepPerfil({ inicial, onNext }: { inicial: Perfil | null; onNext: (p: Perfil) => void }) {
  const { register, handleSubmit, control, formState: { errors } } = useForm<F>({
    resolver: zodResolver(schema),
    defaultValues: {
      renta: inicial ? String(inicial.renta_liquida) : "", region: inicial?.region ?? "Metropolitana",
      situacion: inicial?.situacion_laboral ?? "dependiente", adicionales: "", meses: "", acepta: false,
    },
  });
  const situacion = useWatch({ control, name: "situacion" });
  const renta = parseCLP(useWatch({ control, name: "renta" }) ?? "");

  const enviar = (f: F) => {
    const ultimos = (f.meses ?? "").split(/[,;\n]/).map(parseCLP).filter((n) => n > 0);
    onNext({
      renta_liquida: parseCLP(f.renta), region: f.region, situacion_laboral: f.situacion,
      ingresos_adicionales: parseCLP(f.adicionales ?? ""),
      renta_ultimos_6_meses: f.situacion === "independiente" && ultimos.length ? ultimos : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit(enviar)} className="space-y-4" noValidate>
      <div>
        <Label htmlFor="renta">Renta líquida mensual (CLP)</Label>
        <Input id="renta" inputMode="numeric" placeholder="1.200.000" aria-invalid={!!errors.renta} {...register("renta")} />
        {renta > 0 && <p className="mt-1 text-xs text-slate-500">{formatCLP(renta)}</p>}
        <FieldError msg={errors.renta?.message} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label htmlFor="region">Región</Label>
          <Select id="region" {...register("region")}>{REGIONES.map((r) => <option key={r}>{r}</option>)}</Select></div>
        <div><Label htmlFor="sit">Situación laboral</Label>
          <Select id="sit" {...register("situacion")}>
            <option value="dependiente">Dependiente</option><option value="independiente">Independiente</option>
            <option value="jubilado">Jubilado</option></Select></div>
      </div>
      {situacion === "independiente" && (
        <div>
          <Label htmlFor="meses">Ingresos de los últimos 6 meses (separados por coma)</Label>
          <Input id="meses" placeholder="900000, 1100000, 1000000, ..." {...register("meses")} />
          <p className="mt-1 text-xs text-slate-500">Usamos el promedio. Si lo dejas vacío usamos la renta de arriba.</p>
        </div>
      )}
      <div>
        <Label htmlFor="adic">Ingresos adicionales que puedas comprobar (opcional)</Label>
        <Input id="adic" inputMode="numeric" placeholder="0" {...register("adicionales")} />
        <p className="mt-1 text-xs text-slate-500">No los verificamos: si no puedes acreditarlos ante el banco, déjalos en 0.</p>
      </div>
      <Glosario />
      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
        <label className="flex items-start gap-2">
          <input type="checkbox" aria-describedby="acepta-ayuda" {...register("acepta")} />
          <span>
            Entiendo que esto es una <b>simulación educativa</b>, <b>no una oferta de crédito ni asesoría financiera</b>, que los
            datos que ingreso son de mi responsabilidad y que las condiciones finales las define cada institución.
          </span>
        </label>
        <p id="acepta-ayuda" className="sr-only">Debes marcar esta casilla para continuar.</p>
        <FieldError msg={errors.acepta?.message} />
      </div>
      <Button type="submit">Continuar</Button>
    </form>
  );
}
