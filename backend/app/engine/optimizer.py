"""Motor de optimización: MILP con PuLP (solver CBC incluido, sin instalación externa).

Modelo
------
Variables binarias:
  x[d,o,n] = 1 si la deuda d se refinancia en la oferta o a n meses
  y[o,n]   = 1 si se abre un crédito con la oferta o a n meses (paga UNA comisión por crédito;
             varias deudas pueden consolidarse en el mismo crédito)
  s[d]     = 1 si la deuda d se deja fuera (solo en el paso 2 de la cascada)

Como cuota y costo total de un crédito son lineales en el monto (cuota = monto * factor(o,n)),
el problema completo es lineal entero -> se resuelve de forma exacta, sin heurísticas.

Función objetivo: minimizar CTC total = Σ pagos futuros + comisiones
  (equivale a minimizar Σ cuota×plazo − monto refinanciado, pues el monto refinanciado es constante).

Restricciones: R1 (10× renta, con comisiones), R2 (cuota ≤ 25% renta), R3/plazo máx. de oferta
(por construcción de x), R4 (cuotas ≥ 0, implícito) y R5 (tarjetas ≤ 24 meses, relajable).

Cascada si no hay solución: 1) relajar R5, 2) dejar deudas fuera, 3) sugerir más renta,
4) alertar sobreendeudamiento crítico.
"""
from __future__ import annotations

import math
from typing import Dict, List, Optional, Sequence, Tuple

import pulp

from app.engine import finance
from app.config import (
    MESES_MAX_TARJETA, PLAZO_MAX_CONSUMO_MESES, SOLVER_TIME_LIMIT_S,
    TOPE_CUOTA_PCT_RENTA, TOPE_ENDEUDAMIENTO_VECES_RENTA,
)
from app.schemas import Deuda, DeudaFuera, Oferta, Prestamo, ResultadoOptimizacion

PASO_R5 = "relajar_r5"
PASO_FUERA = "dejar_deudas_fuera"


def plazos_candidatos(plazo_max: int) -> List[int]:
    """Grilla de plazos (6, 12, 18, 24, 36, 48, 60) hasta el máximo de la oferta (+ el máximo).

    Grilla chica = MILP rápido (hallazgo CRIT-003). Tope R7: 60 meses para crédito de consumo.
    """
    plazo_max = min(plazo_max, PLAZO_MAX_CONSUMO_MESES)
    plazos = {n for n in (6, 12, 18, 24, 36, 48, 60) if n <= plazo_max}
    plazos.add(plazo_max)
    return sorted(plazos)


def _cuota_fuera(d: Deuda) -> float:
    """Cuota que se sigue pagando si la deuda queda fuera. Tarjeta: al menos la cuota a 24 meses (supuesto de la herramienta, R3)."""
    if d.tipo == "tarjeta":
        return max(d.cuota_actual, finance.cuota_minima_tarjeta(d.monto_actual, d.tasa_mensual))
    return d.cuota_actual


def _plazo_fuera(d: Deuda) -> int:
    return min(d.plazo_restante_meses, MESES_MAX_TARJETA) if d.tipo == "tarjeta" else d.plazo_restante_meses


def _resolver(
    renta: float,
    deudas: Sequence[Deuda],
    ofertas: Sequence[Oferta],
    relajar_r5: bool,
    permitir_fuera: bool,
    objetivo: str = "costo",
    fijas: Sequence[Deuda] = (),
) -> Optional[Tuple[Dict, Dict, Dict, bool]]:
    """Devuelve (x, y, s, aproximada) con valores 0/1, o None si es infactible.

    Lanza TimeoutError si el solver agota el tiempo sin encontrar ninguna solución."""
    # Las deudas que el usuario deja fuera del refinanciamiento siguen pagándose y ocupan parte del tope de cuota.
    cap_cuota = TOPE_CUOTA_PCT_RENTA * renta - sum(_cuota_fuera(f) for f in fijas)

    # Opciones válidas por deuda (R3: plazo <= plazo_max de la oferta; R5: tarjetas <= 24 salvo relajo).
    opciones: Dict[int, List[Tuple[int, int]]] = {}
    for i, d in enumerate(deudas):
        ops = []
        for j, o in enumerate(ofertas):
            for n in plazos_candidatos(o.plazo_max_meses):
                if d.tipo == "tarjeta" and not relajar_r5 and n > MESES_MAX_TARJETA:
                    continue
                ops.append((j, n))
        if not ops and not permitir_fuera:
            return None
        opciones[i] = ops

    prob = pulp.LpProblem("refinancia_cl", pulp.LpMinimize)
    x = {(i, j, n): pulp.LpVariable(f"x_{i}_{j}_{n}", cat="Binary") for i, ops in opciones.items() for (j, n) in ops}
    ys = {(j, n) for (_, j, n) in x}
    y = {(j, n): pulp.LpVariable(f"y_{j}_{n}", cat="Binary") for (j, n) in ys}
    s = {i: pulp.LpVariable(f"s_{i}", cat="Binary") for i in range(len(deudas))} if permitir_fuera else {}

    def cf(j: int, n: int) -> float:
        o = ofertas[j]
        return finance.cuota_francesa(1.0, o.tasa_mensual, n, o.seguro_desgravamen)

    # Cada deuda: exactamente una asignación (o queda fuera).
    for i, d in enumerate(deudas):
        asignado = pulp.lpSum(x[(i, j, n)] for (j, n) in opciones[i])
        if permitir_fuera:
            prob += asignado + s[i] == 1
        else:
            prob += asignado == 1
    for (i, j, n), var in x.items():
        prob += var <= y[(j, n)]

    # Tope de monto por oferta.
    for j, o in enumerate(ofertas):
        if o.monto_max is not None:
            prob += pulp.lpSum(deudas[i].monto_actual * v for (i, jj, _), v in x.items() if jj == j) <= o.monto_max

    cuota_expr = pulp.lpSum(deudas[i].monto_actual * cf(j, n) * v for (i, j, n), v in x.items())
    cuota_expr += pulp.lpSum(_cuota_fuera(deudas[i]) * s[i] for i in s)
    prob += cuota_expr <= cap_cuota  # R2

    comisiones = pulp.lpSum(ofertas[j].comision * v for (j, _), v in y.items())
    # R1: deuda total + comisiones <= 10 x renta.
    prob += sum(d.monto_actual for d in deudas) + sum(f.monto_actual for f in fijas) + comisiones <= TOPE_ENDEUDAMIENTO_VECES_RENTA * renta

    costo = pulp.lpSum(deudas[i].monto_actual * cf(j, n) * n * v for (i, j, n), v in x.items())
    costo += comisiones
    costo += pulp.lpSum(_cuota_fuera(deudas[i]) * _plazo_fuera(deudas[i]) * s[i] for i in s)
    if objetivo == "cuota":
        # Menor cuota posible; el costo total entra con peso mínimo solo para desempatar
        # (a igual cuota, elegir la alternativa más barata en total).
        prob += cuota_expr + 1e-6 * costo
    else:
        prob += costo

    # gapRel: aceptamos una solución a <=0,5% del óptimo (indistinguible en pesos) a cambio de tiempo acotado.
    prob.solve(pulp.PULP_CBC_CMD(msg=False, timeLimit=SOLVER_TIME_LIMIT_S, gapRel=0.005))
    estado = pulp.LpStatus[prob.status]
    if estado == "Infeasible":
        return None
    if estado != "Optimal":  # "Not Solved"/"Undefined": se acabó el tiempo sin solución
        raise TimeoutError("El solver no encontró solución dentro del tiempo límite")
    aproximada = getattr(prob, "sol_status", 1) == pulp.LpSolutionIntegerFeasible
    val = lambda v: round(v.value() or 0)  # noqa: E731
    return ({k: val(v) for k, v in x.items()}, {k: val(v) for k, v in y.items()},
            {k: val(v) for k, v in s.items()}, aproximada)


def _armar(renta, deudas, ofertas, sol, pasos, fijas=()) -> ResultadoOptimizacion:
    x, y, s, aproximada = sol
    prestamos: List[Prestamo] = []
    for (j, n), usado in sorted(y.items()):
        if not usado:
            continue
        incluidas = [i for (i, jj, nn), v in x.items() if v and jj == j and nn == n]
        monto = sum(deudas[i].monto_actual for i in incluidas)
        if monto <= 0:
            continue
        o = ofertas[j]
        cuota = finance.cuota_francesa(monto, o.tasa_mensual, n, o.seguro_desgravamen)
        ctc = finance.ctc_prestamo(cuota, n, o.comision)
        prestamos.append(Prestamo(
            institucion=o.institucion, monto=monto, plazo_meses=n, tasa_mensual=o.tasa_mensual,
            cuota=cuota, cae=finance.calcular_cae(monto, cuota, n, o.comision), ctc=ctc,
            costo_financiero=ctc - monto, comision=o.comision,
            deudas_incluidas=[deudas[i].institucion for i in incluidas],
            incluye_tarjeta=any(deudas[i].tipo == "tarjeta" for i in incluidas),
        ))
    fuera_idx = [i for i, v in s.items() if v]
    fuera = [DeudaFuera(institucion=deudas[i].institucion, tipo=deudas[i].tipo, monto=deudas[i].monto_actual,
                        cuota=_cuota_fuera(deudas[i]), plazo_restante_meses=_plazo_fuera(deudas[i]))
             for i in fuera_idx]

    cuota_nueva = sum(p.cuota for p in prestamos) + sum(f.cuota for f in fuera) + sum(_cuota_fuera(f) for f in fijas)
    ctc_nuevo = sum(p.ctc for p in prestamos) + sum(f.cuota * f.plazo_restante_meses for f in fuera) + sum(_cuota_fuera(f) * _plazo_fuera(f) for f in fijas)
    ctc_actual = sum(d.cuota_actual * d.plazo_restante_meses for d in list(deudas) + list(fijas))
    cuota_actual = sum(d.cuota_actual for d in list(deudas) + list(fijas))

    monto_total = sum(p.monto for p in prestamos) + sum(f.monto for f in fuera) + sum(f.monto_actual for f in fijas)
    cae_nuevo = (
        sum(p.monto * p.cae for p in prestamos)
        + sum(deudas[i].monto_actual * finance.cae_deuda(deudas[i]) for i in fuera_idx)
        + sum(f.monto_actual * finance.cae_deuda(f) for f in fijas)
    ) / monto_total

    alertas = []
    if PASO_R5 in pasos:
        alertas.append("Se permitió superar los 24 meses en tarjetas (supuesto de esta herramienta) para lograr una cuota más baja o que cupiera en tu renta.")
    if PASO_FUERA in pasos:
        alertas.append("Algunas deudas quedaron fuera del refinanciamiento para cumplir el tope de cuota.")
    if aproximada:
        alertas.append("La solución puede no ser la óptima: el cálculo alcanzó su tiempo límite.")
    return ResultadoOptimizacion(
        estado="OK", prestamos=prestamos, deudas_fuera=fuera, pasos_cascada=list(pasos),
        cuota_total_nueva=cuota_nueva, ctc_nuevo=ctc_nuevo, ctc_actual=ctc_actual,
        ahorro_total=ctc_actual - ctc_nuevo, ahorro_mensual=cuota_actual - cuota_nueva,
        cae_actual=finance.cae_ponderada_actual(list(deudas) + list(fijas)), cae_nuevo=cae_nuevo, alertas=alertas, aproximada=aproximada,
    )


def _cuota_minima_posible(d: Deuda, ofertas: Sequence[Oferta]) -> float:
    """Cuota más baja que podría tener una deuda: la actual, o la de la oferta con plazo más largo."""
    minimos = [_cuota_fuera(d)]
    for o in ofertas:
        plazo = min(o.plazo_max_meses, PLAZO_MAX_CONSUMO_MESES)
        minimos.append(finance.cuota_francesa(d.monto_actual, o.tasa_mensual, plazo, o.seguro_desgravamen))
    return min(minimos)


def optimizar(
    renta: float,
    deudas: Sequence[Deuda],
    ofertas: Sequence[Oferta],
    objetivo: str = "costo",
    relajar_r5: bool = False,
    fijas: Sequence[Deuda] = (),
) -> ResultadoOptimizacion:
    """Ejecuta el MILP con la cascada de relajación descrita en el módulo. `deudas` ya en CLP.

    objetivo="costo": minimiza el CTC total (default). objetivo="cuota": minimiza la cuota mensual.
    relajar_r5=True: el usuario acepta tarjetas a más de 24 meses desde el inicio (piso de cuota).
    """
    hay_tarjetas = any(d.tipo == "tarjeta" for d in deudas)
    # (relajar_r5, permitir_fuera, pasos acumulados)
    escalones = [] if (relajar_r5 and hay_tarjetas) else [(False, False, [])]
    if hay_tarjetas:
        escalones.append((True, False, [PASO_R5]))
    escalones.append((hay_tarjetas, True, ([PASO_R5] if hay_tarjetas else []) + [PASO_FUERA]))

    tiempo_agotado = False
    for relajar, fuera, pasos in escalones:
        try:
            sol = _resolver(renta, deudas, ofertas, relajar, fuera, objetivo, fijas)
        except TimeoutError:
            tiempo_agotado = True
            break
        if sol is not None:
            res = _armar(renta, deudas, ofertas, sol, pasos, fijas)
            # Dejar TODO fuera no es un refinanciamiento: se trata como "sin solución".
            if res.prestamos:
                return res

    # Pasos 3 y 4: sin solución -> sugerir renta y alertar.
    cuota_min = sum(_cuota_minima_posible(d, ofertas) for d in deudas) + sum(_cuota_fuera(f) for f in fijas)
    cap = TOPE_CUOTA_PCT_RENTA * renta
    sugerencias: List[str] = []
    alertas: List[str] = []
    renta_min: Optional[int] = None
    if tiempo_agotado:
        alertas.append("El cálculo excedió el tiempo límite. Prueba con menos deudas u ofertas.")
    if not ofertas:
        sugerencias.append("No hay ofertas disponibles en este momento; vuelve a intentar más tarde o ingresa ofertas manualmente.")
    if cuota_min > cap + 1e-6:
        renta_min = math.ceil(cuota_min / TOPE_CUOTA_PCT_RENTA - 1e-9)
        sugerencias += [
            f"Aumentar la renta declarada con ingresos adicionales comprobables: necesitarías al menos ${renta_min:,.0f} mensuales".replace(",", "."),
            "Extender el plazo máximo permitido con otra institución.",
            "Reducir el monto a refinanciar, dejando parte de la deuda fuera o prepagándola.",
        ]
        alertas.append("Sobreendeudamiento crítico: ninguna combinación de ofertas cumple el tope de cuota del 25% de tu renta.")
    return ResultadoOptimizacion(
        estado="SIN_SOLUCION", ctc_actual=sum(d.cuota_actual * d.plazo_restante_meses for d in list(deudas) + list(fijas)),
        cae_actual=finance.cae_ponderada_actual(list(deudas) + list(fijas)), renta_minima_sugerida=renta_min,
        sugerencias=sugerencias, alertas=alertas,
    )
