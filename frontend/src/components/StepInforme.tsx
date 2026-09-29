"use client";
import { useState } from "react";
import { Button, Card } from "@/components/ui/primitives";
import { descargarInforme } from "@/lib/api";
import type { Resultado, SimulacionRequest } from "@/lib/types";

export default function StepInforme({ req, res, onBack }: { req: SimulacionRequest; res: Resultado; onBack: () => void }) {
  const [estado, setEstado] = useState<"idle" | "cargando" | "error">("idle");
  const [msg, setMsg] = useState("");

  const descargar = async () => {
    setEstado("cargando");
    try {
      const blob = await descargarInforme(req);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "informe-refinanciacl.pdf"; a.click();
      URL.revokeObjectURL(url);
      setEstado("idle");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error inesperado"); setEstado("error");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="font-semibold">Informe descargable (PDF)</h3>
        <p className="mt-1 text-sm text-slate-600">Incluye la recomendación, el paso a paso, el aviso de retracto, el disclaimer legal y enlaces oficiales.
          Se genera al instante y no queda guardado en nuestros servidores.</p>
        <p className="mt-2 rounded bg-blue-50 p-2 text-sm">{res.aviso_retracto}</p>
        <div className="mt-3"><Button onClick={descargar} disabled={estado === "cargando"}>{estado === "cargando" ? "Generando…" : "Descargar PDF"}</Button></div>
        {estado === "error" && <p role="alert" className="mt-2 text-sm text-red-600">{msg}</p>}
      </Card>
      <Card>
        <h3 className="font-semibold">Enlaces oficiales</h3>
        <ul className="mt-1 list-disc pl-6 text-sm">
          {Object.entries(res.enlaces_oficiales).map(([k, v]) => <li key={k}><a className="text-brand underline" href={v} target="_blank" rel="noopener noreferrer">{k}</a></li>)}
        </ul>
      </Card>
      <p className="text-xs text-slate-500">{res.disclaimer}</p>
      <Button variant="outline" onClick={onBack}>Volver al resultado</Button>
    </div>
  );
}
