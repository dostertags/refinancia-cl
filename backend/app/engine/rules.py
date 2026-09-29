"""Reglas de negocio regulatorias chilenas y textos legales.

Los topes viven en app.config (configurables). # TODO: verificar con abogado — los topes de 10x renta y
25% son criterios de esta herramienta de simulación, no citas textuales de norma vigente.
"""
from __future__ import annotations

from typing import List, Tuple

from app.config import (
    MESES_MAX_TARJETA, PLAZO_MAX_CONSUMO_MESES, TOLERANCIA_COHERENCIA_CUOTA,
    TOPE_CUOTA_PCT_RENTA, TOPE_ENDEUDAMIENTO_VECES_RENTA,
)
from app.engine import finance
from app.schemas import Deuda, Perfil

__all__ = ["TOPE_ENDEUDAMIENTO_VECES_RENTA", "TOPE_CUOTA_PCT_RENTA", "PLAZO_MAX_CONSUMO_MESES", "MESES_MAX_TARJETA"]

DISCLAIMER = (
    "Esta simulación no constituye una oferta de crédito. "
    "Las condiciones finales dependen de la evaluación de cada institución. "
    "Esta herramienta es educativa y no es asesoría financiera. "
    f"Los topes usados ({TOPE_ENDEUDAMIENTO_VECES_RENTA:g} veces la renta y {TOPE_CUOTA_PCT_RENTA:.0%} de la renta) "
    "son criterios de esta herramienta y no reemplazan la normativa vigente ni las políticas de cada institución. "
    "Los datos que ingresas son de tu responsabilidad y no son verificados."
)
AVISO_RETRACTO = (
    "Tienes 20 días corridos para retractarte de una repactación sin costo, "
    "según la Ley del Consumidor."
)  # TODO: verificar con abogado (Ley 20.555) el alcance del retracto en repactaciones
ENLACES_OFICIALES = {
    "SERNAC": "https://www.sernac.cl",
    "Comparador de créditos SERNAC": "https://www.sernac.cl/portal/619/w3-article-84607.html",
    "CMF": "https://www.cmfchile.cl",
    "CMF Educa": "https://www.cmfeduca.cl",
    "FOGAES": "https://www.fogaes.cl",
}
GLOSARIO = {
    "CAE": "Carga Anual Equivalente: lo que de verdad te cuesta el crédito al año, sumando tasa, comisiones y seguros. "
           "Sirve para comparar créditos distintos entre sí.",
    "CTC": "Costo Total del Crédito: todo lo que terminarás pagando (cuotas más gastos) hasta el último mes.",
    "Retracto": "Derecho a arrepentirse de una repactación dentro del plazo legal, sin costo para ti.",
    "Carga financiera": "Qué parte de tu renta líquida se va cada mes en pagar cuotas de deudas.",
}


def renta_efectiva(perfil: Perfil) -> float:
    """Independientes: promedio de los últimos 6 meses si se entregó; si no, la renta manual."""
    base = perfil.renta_liquida
    if perfil.situacion_laboral == "independiente" and perfil.renta_ultimos_6_meses:
        meses = perfil.renta_ultimos_6_meses[-6:]
        base = sum(meses) / len(meses)
    return base + perfil.ingresos_adicionales


def _chequear_renta(renta: float) -> None:
    if renta <= 0:
        raise ValueError("La renta líquida debe ser mayor a 0")


def cumple_tope_endeudamiento(deuda_total: float, renta: float) -> bool:
    _chequear_renta(renta)
    return deuda_total <= TOPE_ENDEUDAMIENTO_VECES_RENTA * renta + 1e-6


def cumple_tope_cuota(cuota_total: float, renta: float) -> bool:
    _chequear_renta(renta)
    return cuota_total <= TOPE_CUOTA_PCT_RENTA * renta + 1e-6


def _pesos(v: float) -> str:
    return "$" + f"{round(v):,}".replace(",", ".")


def chequear_coherencia(deudas: List[Deuda]) -> List[str]:
    """Detecta deudas cuya cuota no calza con monto, tasa y plazo (datos mal ingresados).

    Las tarjetas se excluyen: su cuota es libre (pago mínimo o abonos), no contractual.
    """
    problemas = []
    for d in deudas:
        if d.tipo == "tarjeta":
            continue
        esperada = finance.cuota_francesa(d.monto_actual, d.tasa_mensual, d.plazo_restante_meses)
        desviada = abs(d.cuota_actual - esperada) / esperada > TOLERANCIA_COHERENCIA_CUOTA
        no_paga_capital = d.cuota_actual * d.plazo_restante_meses < d.monto_actual * (1 - 1e-6)
        if desviada or no_paga_capital:
            problemas.append(
                f"La cuota de {d.institucion} ({_pesos(d.cuota_actual)}) no calza con el monto, la tasa y el plazo que "
                f"ingresaste: con esos datos la cuota sería cerca de {_pesos(esperada)}. Revisa el monto adeudado, la tasa "
                "mensual, la cuota y los meses restantes.")
    return problemas


def descripcion_fuente(ofertas) -> Tuple[str, str]:
    """(fuente, aviso) según el origen de las ofertas usadas. Nunca se ocultan ofertas ilustrativas."""
    if not ofertas:
        return "ninguna", "No hay ofertas cargadas para comparar."
    fuentes = {o.fuente for o in ofertas}
    if "seed" in fuentes:
        fuente = "ilustrativas"
        aviso = ("Las ofertas usadas son ilustrativas (datos de ejemplo) y no son ofertas reales de ninguna institución. "
                 "Cotiza con las instituciones antes de decidir.")
    elif fuentes == {"sernac"}:
        fuente, aviso = "sernac", "Ofertas obtenidas del Comparador de Créditos SERNAC; son referenciales."
    else:
        fuente, aviso = "usuario", "Ofertas ingresadas por el usuario; RefinanciaCL no las ha verificado."
    if any(not o.comision_conocida for o in ofertas):
        aviso += (" El origen de estos datos no informa comisiones ni seguros: el CAE y el CTC reales pueden ser mayores.")
    return fuente, aviso
