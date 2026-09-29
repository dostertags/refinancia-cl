"use client";
import { useId } from "react";

export const estiloCampo = "w-full min-h-12 rounded-lg border border-borde-input bg-superficie px-3 py-3 text-base text-texto placeholder:text-suave";
export const estiloEtiqueta = "mb-1 flex items-center text-sm font-medium text-texto";

interface CampoProps {
  etiqueta: string; valor: string; onCambio: (v: string) => void; placeholder: string;
  modo?: "numeric" | "decimal"; pista?: string; ayuda?: React.ReactNode;
}

/** Campo de texto con etiqueta visible, placeholder con un ejemplo real y pista/ayuda opcional. */
export function Campo({ etiqueta, valor, onCambio, placeholder, modo = "numeric", pista, ayuda }: CampoProps) {
  const id = useId();
  return (
    <div>
      <div className={estiloEtiqueta}>
        <label htmlFor={id}>{etiqueta}</label>
        {ayuda}
      </div>
      <input id={id} inputMode={modo} enterKeyHint="next" autoComplete="off" placeholder={placeholder} value={valor}
        onChange={(e) => onCambio(e.target.value)} className={estiloCampo} aria-describedby={pista ? `${id}-pista` : undefined} />
      {pista && <p id={`${id}-pista`} className="mt-1 text-xs text-suave">{pista}</p>}
    </div>
  );
}
