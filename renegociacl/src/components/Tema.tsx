"use client";
import { useSyncExternalStore } from "react";

const leer = (): boolean => document.documentElement.classList.contains("dark");
function suscribir(cb: () => void): () => void {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
}

// Alterna modo claro/oscuro. La preferencia se guarda solo en este dispositivo (localStorage), sin enviarla a ningún lado.
export default function Tema() {
  // La fuente de verdad es la clase "dark" de <html> (la pone el script del layout antes de pintar).
  const oscuro = useSyncExternalStore(suscribir, leer, () => false);

  const alternar = () => {
    const nuevo = !oscuro;
    document.documentElement.classList.toggle("dark", nuevo);
    try { localStorage.setItem("tema", nuevo ? "oscuro" : "claro"); } catch { /* navegación privada: se ignora */ }
  };

  return (
    <button type="button" onClick={alternar} aria-pressed={oscuro} aria-label="Modo oscuro"
      className="no-print inline-flex min-h-11 items-center gap-2 rounded-lg border border-borde-input px-3 text-sm text-texto hover:bg-superficie-2">
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {oscuro ? <circle cx="12" cy="12" r="4" /> : <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />}
        {oscuro && <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />}
      </svg>
      {oscuro ? "Claro" : "Oscuro"}
    </button>
  );
}
