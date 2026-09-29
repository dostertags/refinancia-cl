"use client";
import { useId, useState } from "react";

/** Botón "?" que explica un término con palabras simples. Funciona con toque y teclado (no depende de pasar el mouse). */
export default function Ayuda({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const id = useId();
  return (
    <span className="inline">
      <button type="button" aria-expanded={abierto} aria-controls={id} aria-label={etiqueta} onClick={() => setAbierto(!abierto)}
        onKeyDown={(e) => { if (e.key === "Escape") setAbierto(false); }}
        className="-my-3 ml-1 inline-flex h-11 w-11 items-center justify-center align-middle text-suave">
        <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full border border-borde-input text-xs font-bold">?</span>
      </button>
      {abierto && <span id={id} role="note" className="mb-2 mt-1 block rounded-lg bg-superficie-2 p-3 text-sm font-normal text-texto">{children}</span>}
    </span>
  );
}
