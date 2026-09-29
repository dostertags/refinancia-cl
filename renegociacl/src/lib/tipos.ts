// Tipos del dominio. Montos en pesos chilenos; tasas como fracción mensual (0.02 = 2% mensual).
import type { FilaAmortizacion } from "./amortizacion";

export type Modo = "intereses" | "cuota";

/** Oferta que la persona recibió de un banco. */
export interface OfertaUsuario { nombre: string; tasaMensual: number; gastos?: number }

/** Crédito vigente que se quiere renegociar (los datos que ingresa la persona). */
export interface Credito {
  saldo: number; cuota: number; tasaMensual: number;
  tarjeta?: { saldo?: number; tasaMensual: number };
  ofertas?: OfertaUsuario[];
  abonoUnico?: number; // pesos que podría abonar hoy de una vez
}
/** Alias histórico. */
export type Entrada = Credito;

/** Tasa publicada por una institución (viene de /rates.json). */
export interface TasaMercado { institucion: string; tasaMensual: number }

export type TipoOpcion = "tasa" | "cuota" | "plazo" | "abono" | "abonoUnico" | "tarjeta";

export interface OpcionRenegociacion {
  id: string; tipo: TipoOpcion; titulo: string; tasaMensual: number;
  nuevaCuota: number; nuevosMeses: number;
  totalPagar: number;      // todo lo que pagarías con esta opción (incluye gastos)
  ahorroTotal: number;     // pesos ahorrados en total (negativo = pagas más)
  alivioMensual: number;   // pesos menos por mes (negativo = pagas más por mes)
  mesesMenos: number;      // meses que te ahorras
  gastos: number;
  caeAnual: number;        // costo anual con gastos incluidos (TIR de los flujos)
  esPropia: boolean;       // parte de una oferta real que ingresó la persona
  esHipotetica: boolean;   // parte de una meta de negociación inventada por la calculadora, no de un banco
  resumen: string;         // explicación en lenguaje simple
  primerosMeses?: FilaAmortizacion[]; // para mostrar cómo se calcula
}
/** Alias histórico. */
export type Opcion = OpcionRenegociacion;

export interface FilaTasa { nombre: string; tasaMensual: number; caeAnual: number }
export interface Actual { meses: number; totalPagar: number; intereses: number; caeAnual: number; primerosMeses: FilaAmortizacion[] }

export type Resultado =
  | { ok: true; actual: Actual; opciones: OpcionRenegociacion[]; comparacion: FilaTasa[]; avisos: string[]; nota?: string }
  | { ok: false; error: string };
