// Espejo de app/schemas.py del backend. Aquí NO hay lógica financiera: solo tipos.
export type TipoDeuda = "consumo" | "tarjeta" | "linea";
export type Situacion = "dependiente" | "independiente" | "jubilado";
export type Objetivo = "costo" | "cuota";

export interface Perfil {
  renta_liquida: number;
  region: string;
  situacion_laboral: Situacion;
  ingresos_adicionales?: number;
  renta_ultimos_6_meses?: number[];
}

export interface Deuda {
  institucion: string;
  tipo: TipoDeuda;
  monto_actual: number;
  tasa_mensual: number;
  cuota_actual: number;
  plazo_restante_meses: number;
  moneda: "CLP" | "UF";
  casa_comercial: boolean;
}

export interface Prestamo {
  institucion: string; monto: number; plazo_meses: number; tasa_mensual: number;
  cuota: number; cae: number; ctc: number; costo_financiero: number; comision: number;
  deudas_incluidas: string[]; incluye_tarjeta: boolean;
}

export interface Propuesta {
  prestamos: Prestamo[];
  deudas_fuera: { institucion: string; cuota: number; monto: number }[];
  cuota_total: number; pct_renta_comprometida: number; semaforo: "verde" | "amarillo" | "rojo";
  ctc_nuevo: number; ahorro_total: number; ahorro_mensual: number; cae_nuevo: number; reduccion_cae: number;
  pasos_cascada: string[];
}

export type Estado = "OK" | "SOBREENDEUDADO" | "SIN_DEUDAS" | "SIN_SOLUCION" | "NO_CONVIENE" | "DATOS_INCONSISTENTES";

export interface Resultado {
  estado: Estado;
  fecha_calculo: string;
  renta_considerada: number;
  situacion_actual: null | {
    deuda_total: number; cuota_total: number; ctc_restante: number; cae_ponderada: number;
    pct_renta_comprometida: number; semaforo: "verde" | "amarillo" | "rojo";
  };
  propuesta: Propuesta | null;
  tarjetas_amortizacion: { institucion: string; saldo: number; plazo_meses: number; cuota: number }[];
  analisis_una_deuda: null | { intereses_evitables_si_prepaga: number; mensaje: string };
  reglas: { regla: string; titulo: string; cumple: boolean; detalle: string }[];
  alertas: string[]; sugerencias: string[]; mensajes: string[];
  renta_minima_sugerida: number | null;
  fuente_ofertas: "sernac" | "ilustrativas" | "usuario" | "ninguna";
  aviso_ofertas: string;
  disclaimer: string; aviso_retracto: string; enlaces_oficiales: Record<string, string>;
}

export interface SimulacionRequest {
  perfil: Perfil; deudas: Deuda[];
  objetivo?: Objetivo;            // "costo" (default) minimiza el costo total; "cuota" minimiza la cuota mensual
  tarjetas_mas_de_24?: boolean;   // solo en modo cuota: acepta tarjetas a más de 24 meses
  acepta_terminos: boolean;       // consentimiento expreso (R6); la API lo exige
}
