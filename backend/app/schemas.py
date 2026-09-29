"""Schemas Pydantic (entrada/salida). Todas las tasas son fracciones mensuales (0.02 = 2% mensual).

Decisión técnica: los montos son float (CLP) dentro del motor y se redondean recién al
presentar; así evitamos acumular errores de redondeo en el MILP.
Privacidad: ningún schema de usuario se persiste (ver README y PRIVACY.md).
"""
from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field, model_validator

from app import config

TipoDeuda = Literal["consumo", "tarjeta", "linea"]
Situacion = Literal["dependiente", "independiente", "jubilado"]


class Perfil(BaseModel):
    renta_liquida: float = Field(gt=0, description="Renta líquida mensual en CLP")
    region: str = "Metropolitana"
    situacion_laboral: Situacion = "dependiente"
    ingresos_adicionales: float = Field(default=0, ge=0)
    # Independientes: promedio de los últimos 6 meses (si no se entrega, se usa renta_liquida).
    renta_ultimos_6_meses: Optional[List[float]] = None


class Deuda(BaseModel):
    institucion: str
    tipo: TipoDeuda = "consumo"
    monto_actual: float = Field(ge=0)  # 0 = deuda ya pagada: se ignora (caso borde)
    # Reglas: crédito/línea = cuota + (tasa o meses restantes, al menos uno). Tarjeta = (pago mensual o tasa, al menos uno).
    tasa_mensual: Optional[float] = Field(default=None, ge=0, lt=1)
    cuota_actual: Optional[float] = Field(default=None, ge=0)
    plazo_restante_meses: Optional[int] = Field(default=None, gt=0, le=600)
    moneda: Literal["CLP", "UF"] = "CLP"
    # Tarjetas de casa comercial (Falabella, Ripley, etc.) también caen bajo NCG 537.
    casa_comercial: bool = False
    # Casilla "Incluir en el refinanciamiento": lo excluido cuenta en la situación de hoy y en la cuota nueva.
    incluir: bool = True

    @model_validator(mode="after")
    def _datos_minimos(self):
        if self.monto_actual == 0:  # deuda ya pagada: se ignora más adelante
            return self
        con_cuota = self.cuota_actual is not None and self.cuota_actual > 0
        if self.tipo == "tarjeta":
            if not con_cuota and self.tasa_mensual is None:
                raise ValueError(f"La tarjeta {self.institucion} necesita su pago mensual o su tasa (con una de las dos basta).")
        else:
            if not con_cuota:
                raise ValueError(f"Falta la cuota mensual de {self.institucion}.")
            if self.tasa_mensual is None and self.plazo_restante_meses is None:
                raise ValueError(f"Para {self.institucion} necesito la tasa de interés o los meses que te faltan (con una de las dos basta).")
        return self


class Oferta(BaseModel):
    institucion: str
    tasa_mensual: float = Field(ge=0, lt=1)
    plazo_max_meses: int = Field(gt=0, le=120)
    comision: float = Field(default=0, ge=0, description="Gasto operacional fijo por crédito, CLP")
    seguro_desgravamen: float = Field(default=0, ge=0, description="Tasa mensual sobre el monto inicial")
    monto_max: Optional[float] = Field(default=None, gt=0)
    cae_referencial: Optional[float] = None
    fuente: str = "manual"  # seed | sernac | manual | usuario
    # False cuando el origen (p. ej. el comparador SERNAC) no informa comisiones ni seguros.
    comision_conocida: bool = True


class SimulacionRequest(BaseModel):
    perfil: Perfil
    deudas: List[Deuda] = Field(default_factory=list, max_length=config.MAX_DEUDAS)
    # Si es None la API completa con las ofertas vigentes en caché.
    ofertas: Optional[List[Oferta]] = Field(default=None, max_length=config.MAX_OFERTAS)
    valor_uf: Optional[float] = Field(default=None, gt=0)
    # "costo": minimiza el costo total (default). "cuota": minimiza la cuota mensual.
    objetivo: Literal["costo", "cuota"] = "costo"
    # Acepta tarjetas a más de 24 meses desde el inicio (solo tiene efecto si hay tarjetas).
    tarjetas_mas_de_24: bool = False
    # Consentimiento expreso (R6): la API lo exige; el motor puro no.
    acepta_terminos: bool = False


class Prestamo(BaseModel):
    institucion: str
    monto: float
    plazo_meses: int
    tasa_mensual: float
    cuota: float
    cae: float
    ctc: float  # total a pagar (cuotas + comisión)
    costo_financiero: float  # intereses + seguros + gastos = ctc - monto
    comision: float
    deudas_incluidas: List[str]
    incluye_tarjeta: bool = False


class DeudaFuera(BaseModel):
    institucion: str
    tipo: TipoDeuda
    monto: float
    cuota: float
    plazo_restante_meses: int


class ResultadoOptimizacion(BaseModel):
    estado: Literal["OK", "SIN_SOLUCION"]
    prestamos: List[Prestamo] = []
    deudas_fuera: List[DeudaFuera] = []
    pasos_cascada: List[str] = []
    cuota_total_nueva: float = 0
    ctc_nuevo: float = 0  # CTC restante nuevo (préstamos + deudas fuera)
    ctc_actual: float = 0  # lo que falta pagar hoy (cuota_actual * plazo restante)
    ahorro_total: float = 0
    ahorro_mensual: float = 0
    cae_actual: float = 0
    cae_nuevo: float = 0
    renta_minima_sugerida: Optional[int] = None
    sugerencias: List[str] = []
    alertas: List[str] = []
    aproximada: bool = False  # el solver cortó por tiempo: puede no ser el óptimo


class SituacionActual(BaseModel):
    deuda_total: float
    cuota_total: float
    ctc_restante: float
    cae_ponderada: float
    pct_renta_comprometida: float
    semaforo: str


class TarjetaAmortizacion(BaseModel):
    institucion: str
    saldo: float
    plazo_meses: int
    cuota: float


class AnalisisUnaDeuda(BaseModel):
    intereses_evitables_si_prepaga: float
    mensaje: str


class ReglaVerificada(BaseModel):
    regla: str
    titulo: str
    cumple: bool
    detalle: str


class Propuesta(BaseModel):
    prestamos: List[Prestamo]
    deudas_fuera: List[DeudaFuera]
    cuota_total: float
    pct_renta_comprometida: float
    semaforo: str
    ctc_nuevo: float
    ahorro_total: float
    ahorro_mensual: float
    cae_nuevo: float
    reduccion_cae: float  # puntos porcentuales expresados como fracción (0.05 = 5 pp)
    pasos_cascada: List[str]


class ParteRefinanciar(BaseModel):
    institucion: str
    tipo: TipoDeuda
    monto: float


class ResultadoSimulacion(BaseModel):
    estado: Literal["OK", "SOBREENDEUDADO", "SIN_DEUDAS", "SIN_SOLUCION", "NO_CONVIENE", "DATOS_INCONSISTENTES"]
    fecha_calculo: str
    renta_considerada: float
    valor_uf: Optional[float] = None
    situacion_actual: Optional[SituacionActual] = None
    propuesta: Optional[Propuesta] = None
    tarjetas_amortizacion: List[TarjetaAmortizacion] = []
    analisis_una_deuda: Optional[AnalisisUnaDeuda] = None
    reglas: List[ReglaVerificada] = []
    alertas: List[str] = []
    sugerencias: List[str] = []
    mensajes: List[str] = []
    renta_minima_sugerida: Optional[int] = None
    supuestos: List[str] = []  # datos que se calcularon o supusieron por falta de información
    total_a_refinanciar: float = 0
    partes_refinanciar: List[ParteRefinanciar] = []
    excluidas: List[ParteRefinanciar] = []
    fuente_ofertas: Literal["sernac", "ilustrativas", "usuario", "ninguna"] = "ninguna"
    aviso_ofertas: str = ""
    disclaimer: str
    aviso_retracto: str
    enlaces_oficiales: dict
