// Tipos del dominio. Montos en pesos chilenos; tasas como fracción mensual (0.02 = 2% mensual).
import type { FilaAmortizacion } from "./amortizacion";

export type Modo = "intereses" | "cuota";

/** Oferta que la persona recibió de un banco. */
export interface OfertaUsuario { nombre: string; tasaMensual: number; gastos?: number }

/**
 * Tarjeta de crédito. OBLIGATORIO: saldo. Además, al menos uno entre pagoMensual y tasaMensual.
 * incluir = si se suma al total a refinanciar (por defecto sí).
 */
export interface TarjetaEntrada { nombre?: string; saldo?: number; pagoMensual?: number; tasaMensual?: number; incluir?: boolean }

/**
 * Crédito vigente que se quiere renegociar. OBLIGATORIO: saldo y cuota, más al menos uno entre
 * tasaMensual y mesesRestantes (si falta uno, se calcula a partir del otro).
 */
export interface Credito {
  saldo: number; cuota: number;
  tasaMensual?: number;
  mesesRestantes?: number;
  tarjetas?: TarjetaEntrada[]; // hasta 3
  ofertas?: OfertaUsuario[];
  abonoUnico?: number; // pesos que podría abonar hoy de una vez
}
/** Alias histórico. */
export type Entrada = Credito;

/** Tasa publicada por una institución (viene de /rates.json). */
export interface TasaMercado { institucion: string; tasaMensual: number }

export type TipoOpcion = "tasa" | "cuota" | "plazo" | "abono" | "abonoUnico";

export interface OpcionRenegociacion {
  id: string; tipo: TipoOpcion; titulo: string; tasaMensual: number;
  nuevaCuota: number;      // lo que pagarías al mes en total (incluye lo que quede fuera del refinanciamiento)
  nuevosMeses: number;
  totalPagar: number;      // todo lo que pagarías con esta opción entre todas tus deudas (incluye gastos)
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
/** Situación de hoy sumando todas tus deudas consideradas (crédito + tarjetas). */
export interface Actual {
  meses: number; totalPagar: number; intereses: number; caeAnual: number; cuotaTotal: number;
  primerosMeses: FilaAmortizacion[];
}
export interface ParteDeuda { nombre: string; saldo: number }
/** Qué se junta en el crédito nuevo y qué se deja como está. */
export interface Refinanciar { total: number; partes: ParteDeuda[]; excluidas: ParteDeuda[] }

export type Resultado =
  | { ok: true; actual: Actual; opciones: OpcionRenegociacion[]; comparacion: FilaTasa[]; avisos: string[]; supuestos: string[]; refinanciar: Refinanciar; nota?: string }
  | { ok: false; error: string };
