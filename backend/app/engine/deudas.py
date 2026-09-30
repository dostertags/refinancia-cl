"""Resuelve los datos que faltan de cada deuda (tasa, cuota o meses) y deja todo explícito.

Reglas:
 - Crédito/línea: la cuota es obligatoria; de tasa y meses restantes basta uno y se calcula el otro.
 - Tarjeta: de pago mensual y tasa basta uno; lo que falta se calcula suponiendo que se paga en 24 meses (supuesto de esta herramienta, no una norma).
Nunca se inventan datos: si lo que falta no se puede calcular, se devuelve un problema en vez de un número.
# La CMF regula la fórmula del PAGO MÍNIMO de tarjetas (NCG 537, 2025: monto no financiable + 5% del financiable); los 24 meses son un
# supuesto propio para poder calcular. Ver docs/CIFRAS.md.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import List

from app.config import MESES_MAX_TARJETA
from app.engine import finance
from app.schemas import Deuda


@dataclass
class Resolucion:
    deudas: List[Deuda] = field(default_factory=list)
    supuestos: List[str] = field(default_factory=list)
    problemas: List[str] = field(default_factory=list)


def _pct(x: float) -> str:
    return f"{x * 100:.2f}".replace(".", ",") + "%"


def _pesos(v: float) -> str:
    return "$" + f"{round(v):,}".replace(",", ".")


def _credito(d: Deuda, r: Resolucion) -> None:
    tasa, plazo = d.tasa_mensual, d.plazo_restante_meses
    if tasa is None:
        tasa = finance.tasa_desde_meses(d.monto_actual, d.cuota_actual, plazo)
        if tasa is None:
            r.problemas.append(f"Con la cuota de {d.institucion} y {plazo} meses no alcanzas a pagar el saldo (o la tasa saldría absurda). "
                               "Revisa el monto, la cuota y los meses que te faltan.")
            return
        r.supuestos.append(f"Calculamos la tasa de {d.institucion} a partir de los meses que le faltan: {_pct(tasa)} al mes.")
    elif plazo is None:
        plazo = finance.meses_desde_cuota(d.monto_actual, tasa, d.cuota_actual)
        if plazo is None:
            r.problemas.append(f"La cuota de {d.institucion} no alcanza ni para pagar los intereses de un mes: con esos datos la deuda nunca baja.")
            return
        r.supuestos.append(f"Calculamos los meses que le faltan a {d.institucion}: {plazo}.")
    r.deudas.append(d.model_copy(update={"tasa_mensual": tasa, "plazo_restante_meses": plazo}))


def _tarjeta(d: Deuda, r: Resolucion) -> None:
    pago = d.cuota_actual if d.cuota_actual and d.cuota_actual > 0 else None
    tasa = d.tasa_mensual
    if pago is not None and tasa is not None:
        plazo = d.plazo_restante_meses or finance.meses_desde_cuota(d.monto_actual, tasa, pago)
        if plazo is None:
            r.problemas.append(f"El pago de {d.institucion} no alcanza ni para pagar sus intereses. Revisa el pago y la tasa.")
            return
    elif pago is not None:
        tasa = finance.tasa_desde_meses(d.monto_actual, pago, MESES_MAX_TARJETA)
        if tasa is None:
            r.problemas.append(f"Con ese pago {d.institucion} no se termina de pagar en {MESES_MAX_TARJETA} meses: necesito su tasa para calcularla.")
            return
        plazo = d.plazo_restante_meses or finance.meses_desde_cuota(d.monto_actual, tasa, pago) or MESES_MAX_TARJETA
        r.supuestos.append(f"Para {d.institucion} supusimos que se paga en {MESES_MAX_TARJETA} meses y calculamos su tasa: {_pct(tasa)} al mes.")
    else:
        assert tasa is not None  # el esquema exige pago o tasa
        pago = math.ceil(finance.cuota_francesa(d.monto_actual, tasa, MESES_MAX_TARJETA) - 1e-6)
        plazo = MESES_MAX_TARJETA
        r.supuestos.append(f"Para {d.institucion} supusimos que se paga en {MESES_MAX_TARJETA} meses: un pago de {_pesos(pago)} al mes.")
    r.deudas.append(d.model_copy(update={"tasa_mensual": tasa, "cuota_actual": pago, "plazo_restante_meses": plazo}))


def resolver_deudas(deudas: List[Deuda]) -> Resolucion:
    """Devuelve las deudas con todos sus datos completos, los supuestos hechos y los problemas encontrados."""
    r = Resolucion()
    for d in deudas:
        (_tarjeta if d.tipo == "tarjeta" else _credito)(d, r)
    return r
