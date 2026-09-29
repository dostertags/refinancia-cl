"""Matemática financiera determinista. NUNCA se delega a un LLM (requisito del producto)."""
from __future__ import annotations

from typing import Iterable, Optional

from app.config import (
    CAE_MAXIMO_REPORTABLE, MESES_MAX_TARJETA, SEMAFORO_AMARILLO_HASTA, SEMAFORO_VERDE_HASTA,
)

__all__ = ["MESES_MAX_TARJETA", "cuota_francesa", "ctc_prestamo", "tasa_mensual_a_cae", "calcular_cae",
           "amortizacion_forzosa_tarjeta", "cuota_minima_tarjeta", "cae_deuda", "cae_ponderada_actual", "semaforo", "uf_a_clp"]


def cuota_francesa(monto: float, tasa_mensual: float, n: int, seguro_mensual: float = 0.0) -> float:
    """Cuota fija (sistema francés). El seguro se modela como tasa mensual plana sobre el monto inicial.

    TODO: verificar con abogado/CMF si el seguro de desgravamen debe calcularse sobre saldo insoluto.
    """
    if n <= 0:
        raise ValueError("El plazo debe ser mayor a 0 meses")
    if tasa_mensual == 0:
        base = monto / n
    else:
        base = monto * tasa_mensual / (1 - (1 + tasa_mensual) ** -n)
    return base + monto * seguro_mensual


def ctc_prestamo(cuota: float, n: int, comision: float = 0.0) -> float:
    """Costo Total del Crédito = todo lo que se paga: cuotas + gastos upfront."""
    return cuota * n + comision


def tasa_mensual_a_cae(tasa_mensual: float) -> float:
    return (1 + tasa_mensual) ** 12 - 1


def calcular_cae(monto: float, cuota: float, n: int, comision: float = 0.0) -> float:
    """CAE = TIR mensual anualizada de los flujos reales (comisión descontada al desembolso).

    Se resuelve por bisección: robusta y sin dependencias. Si no existe una TIR razonable
    (comisión >= monto, o la tasa mensual supera 100%) se devuelve CAE_MAXIMO_REPORTABLE.
    """
    neto = monto - comision
    if neto <= 0:
        return CAE_MAXIMO_REPORTABLE
    if cuota * n <= neto:
        return 0.0

    def valor_presente(i: float) -> float:
        return cuota * n if i == 0 else cuota * (1 - (1 + i) ** -n) / i

    lo, hi = 0.0, 1.0  # tasa mensual entre 0% y 100%
    if valor_presente(hi) > neto:
        return CAE_MAXIMO_REPORTABLE
    for _ in range(200):
        mid = (lo + hi) / 2
        if valor_presente(mid) > neto:
            lo = mid
        else:
            hi = mid
    return tasa_mensual_a_cae((lo + hi) / 2)


def amortizacion_forzosa_tarjeta(saldo: float, tasa_mensual: float, meses: int = MESES_MAX_TARJETA) -> float:
    """Regla 3: cuota para amortizar un saldo financiado de tarjeta en <= 24 meses."""
    return cuota_francesa(saldo, tasa_mensual, meses)


def cuota_minima_tarjeta(saldo: float, tasa_mensual: float, comisiones: float = 0.0) -> float:
    """Regla 3 completa: la mayor entre la amortización forzosa a 24 meses e intereses + comisiones del período.

    TODO: verificar con abogado la fórmula exacta de la NCG 537 (base de intereses y comisiones incluidas).
    """
    return max(amortizacion_forzosa_tarjeta(saldo, tasa_mensual), saldo * tasa_mensual + comisiones)


def cae_deuda(d) -> float:
    """CAE de una deuda existente con la misma vara que la CAE nueva (TIR de flujos reales).

    Créditos y líneas: TIR de (monto, cuota_actual, plazo restante). Tarjetas (saldo revolvente, sin cuota
    contractual): tasa efectiva anual de la tasa declarada.
    """
    if d.tipo == "tarjeta" or d.cuota_actual <= 0:
        return tasa_mensual_a_cae(d.tasa_mensual)
    return calcular_cae(d.monto_actual, d.cuota_actual, d.plazo_restante_meses)


def cae_ponderada_actual(deudas: Iterable) -> float:
    """CAE actual ponderada por monto."""
    deudas = list(deudas)
    total = sum(d.monto_actual for d in deudas)
    return sum(d.monto_actual * cae_deuda(d) for d in deudas) / total if total else 0.0


def semaforo(pct_renta: float) -> str:
    """Verde < 15%, amarillo 15%-25%, rojo > 25% (umbrales configurables en app.config)."""
    if pct_renta < SEMAFORO_VERDE_HASTA - 1e-9:
        return "verde"
    if pct_renta <= SEMAFORO_AMARILLO_HASTA + 1e-9:
        return "amarillo"
    return "rojo"


def uf_a_clp(monto_uf: float, valor_uf: Optional[float]) -> float:
    if valor_uf is None or valor_uf <= 0:
        raise ValueError("Se requiere el valor de la UF para convertir deudas en UF")
    return monto_uf * valor_uf
