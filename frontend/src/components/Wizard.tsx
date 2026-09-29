"use client";
import { useState } from "react";
import StepDeudas, { type Opciones } from "./StepDeudas";
import StepInforme from "./StepInforme";
import StepPerfil from "./StepPerfil";
import StepResultado from "./StepResultado";
import { simular } from "@/lib/api";
import type { Deuda, Perfil, Resultado } from "@/lib/types";

const TITULOS = ["Tus datos", "Tus deudas", "Resultado", "Informe"];

// El estado vive solo en memoria del navegador (sin localStorage ni cookies): al cerrar la pestaña se pierde.
export default function Wizard() {
  const [paso, setPaso] = useState(0);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [deudas, setDeudas] = useState<Deuda[]>([]);
  const [opciones, setOpciones] = useState<Opciones>({ objetivo: "costo", tarjetas_mas_de_24: false });
  const [res, setRes] = useState<Resultado | null>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  const correr = async (d: Deuda[], o: Opciones) => {
    if (!perfil) return;
    setDeudas(d); setOpciones(o); setError(""); setCargando(true);
    try {
      setRes(await simular({ perfil, deudas: d, ...o, acepta_terminos: true }));
      setPaso(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos simular. Intenta nuevamente.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div>
      <ol className="mb-6 flex gap-2 text-sm" aria-label="Progreso">
        {TITULOS.map((t, i) => (
          <li key={t} aria-current={i === paso ? "step" : undefined}
            className={`flex-1 rounded-full px-3 py-1 text-center ${i === paso ? "bg-brand text-white" : i < paso ? "bg-brand-light text-brand" : "bg-slate-200 text-slate-500"}`}>
            {i + 1}. {t}
          </li>
        ))}
      </ol>
      {error && <div role="alert" className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {cargando && <p className="mb-4 text-sm text-slate-500">Optimizando…</p>}
      {paso === 0 && <StepPerfil inicial={perfil} onNext={(p) => { setPerfil(p); setPaso(1); }} />}
      {paso === 1 && <StepDeudas inicial={deudas} opciones={opciones} onNext={correr} onBack={() => setPaso(0)} />}
      {paso === 2 && res && <StepResultado res={res} onNext={() => setPaso(3)} onBack={() => setPaso(1)} />}
      {paso === 3 && res && perfil && <StepInforme req={{ perfil, deudas, ...opciones, acepta_terminos: true }} res={res} onBack={() => setPaso(2)} />}
    </div>
  );
}
