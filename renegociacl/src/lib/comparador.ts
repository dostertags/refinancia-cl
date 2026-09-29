// Modo comparación: varios créditos lado a lado y cuál conviene renegociar primero.
import { generarOpciones } from "./opciones";
import type { Credito } from "./tipos";

export interface CreditoGuardado { id: string; nombre: string; credito: Credito }
export interface ResumenCredito {
  id: string; nombre: string; saldo: number; cuota: number; tasaMensual: number;
  meses?: number; totalPagar?: number; intereses?: number; mejorAhorro?: number; mejorTitulo?: string;
  prioridad: boolean; error?: string;
}

export function resumenComparacion(lista: CreditoGuardado[]): ResumenCredito[] {
  const filas: ResumenCredito[] = lista.map(({ id, nombre, credito }) => {
    const base = { id, nombre, saldo: credito.saldo, cuota: credito.cuota, tasaMensual: credito.tasaMensual, prioridad: false };
    const r = generarOpciones(credito, "intereses");
    if (!r.ok) return { ...base, error: r.error };
    const mejor = r.opciones[0];
    return { ...base, meses: r.actual.meses, totalPagar: r.actual.totalPagar, intereses: r.actual.intereses,
      mejorAhorro: mejor?.ahorroTotal ?? 0, mejorTitulo: mejor?.titulo };
  });
  let idx = -1, max = 0;
  filas.forEach((f, k) => { if ((f.mejorAhorro ?? 0) > max) { max = f.mejorAhorro ?? 0; idx = k; } });
  if (idx >= 0) filas[idx].prioridad = true;
  return filas;
}
