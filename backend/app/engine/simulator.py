"""Orquestador: aplica las reglas de negocio y los casos borde alrededor del optimizador.

Es una función pura (sin I/O, sin BD, sin logs de datos del usuario): recibe la solicitud,
devuelve el resultado. Nada de lo que entra se persiste (regla de privacidad del producto).
"""
from __future__ import annotations

from datetime import date
from typing import List

from app.config import (
    MESES_MAX_TARJETA, PLAZO_MAX_CONSUMO_MESES, TOPE_CUOTA_PCT_RENTA, TOPE_ENDEUDAMIENTO_VECES_RENTA,
)
from app.engine import finance, rules
from app.engine.deudas import resolver_deudas
from app.engine.optimizer import optimizar
from app.schemas import (
    AnalisisUnaDeuda, Deuda, ParteRefinanciar, Prestamo, Propuesta, ReglaVerificada, ResultadoSimulacion,
    SimulacionRequest, SituacionActual, TarjetaAmortizacion,
)


def _a_clp(deudas: List[Deuda], valor_uf) -> List[Deuda]:
    """Caso borde: deudas en UF se convierten a CLP con el valor del día."""
    out = []
    for d in deudas:
        if d.moneda == "UF":
            d = d.model_copy(update={
                "monto_actual": finance.uf_a_clp(d.monto_actual, valor_uf),
                "cuota_actual": finance.uf_a_clp(d.cuota_actual, valor_uf) if d.cuota_actual is not None else None,
                "moneda": "CLP",
            })
        out.append(d)
    return out


def _situacion(deudas: List[Deuda], renta: float) -> SituacionActual:
    deuda_total = sum(d.monto_actual for d in deudas)
    cuota_total = sum(d.cuota_actual for d in deudas)
    pct = cuota_total / renta
    return SituacionActual(
        deuda_total=deuda_total, cuota_total=cuota_total,
        ctc_restante=sum(d.cuota_actual * d.plazo_restante_meses for d in deudas),
        cae_ponderada=finance.cae_ponderada_actual(deudas), pct_renta_comprometida=pct, semaforo=finance.semaforo(pct),
    )


def _pesos(v: float) -> str:
    return "$" + f"{round(v):,}".replace(",", ".")


def _avisos(req: SimulacionRequest, deudas: List[Deuda], renta: float, actual: SituacionActual, ofertas) -> List[str]:
    """Advertencias que aplican a cualquier resultado (auditoría MAJ-002/004/007, R3, R7)."""
    avisos: List[str] = []
    if req.perfil.ingresos_adicionales > 0:
        avisos.append(f"Tu renta considerada incluye {_pesos(req.perfil.ingresos_adicionales)} de ingresos adicionales "
                      "no verificados. Las instituciones evalúan solo ingresos que puedas acreditar.")
    if any(d.moneda == "UF" for d in req.deudas):
        avisos.append("Tienes deudas en UF: el costo restante se calcula con la UF de hoy, sin reajuste por inflación; "
                      "el costo real será mayor.")
    if any(o.plazo_max_meses > PLAZO_MAX_CONSUMO_MESES for o in ofertas):
        avisos.append(f"Los plazos se limitaron a {PLAZO_MAX_CONSUMO_MESES} meses, el máximo para créditos de consumo.")
    if any(d.tipo != "tarjeta" and d.plazo_restante_meses > PLAZO_MAX_CONSUMO_MESES for d in deudas):
        avisos.append(f"Alguna deuda declara más de {PLAZO_MAX_CONSUMO_MESES} meses restantes: revisa el dato (créditos de consumo "
                      f"tienen un máximo de {PLAZO_MAX_CONSUMO_MESES} meses).")
    for d in deudas:
        if d.tipo == "tarjeta":
            minima = finance.cuota_minima_tarjeta(d.monto_actual, d.tasa_mensual)
            if d.cuota_actual < minima - 1:
                avisos.append(f"Tu cuota actual de la tarjeta {d.institucion} ({_pesos(d.cuota_actual)}) es menor que la amortización "
                              f"mínima de {MESES_MAX_TARJETA} meses ({_pesos(minima)}, NCG 537).")
    if actual.pct_renta_comprometida > TOPE_CUOTA_PCT_RENTA + 1e-9:
        avisos.append(f"Hoy tu cuota mensual total supera el {TOPE_CUOTA_PCT_RENTA:.0%} de tu renta "
                      f"({actual.pct_renta_comprometida:.1%}).")
    return avisos


def simular(req: SimulacionRequest) -> ResultadoSimulacion:
    renta = rules.renta_efectiva(req.perfil)
    ofertas = req.ofertas or []
    fuente, aviso_fuente = rules.descripcion_fuente(ofertas)
    base = dict(
        fecha_calculo=date.today().isoformat(), renta_considerada=renta, valor_uf=req.valor_uf,
        disclaimer=rules.DISCLAIMER, aviso_retracto=rules.AVISO_RETRACTO,
        enlaces_oficiales=rules.ENLACES_OFICIALES, fuente_ofertas=fuente, aviso_ofertas=aviso_fuente,
    )

    req = req.model_copy(update={"deudas": [d for d in req.deudas if d.monto_actual > 0]})  # deudas en $0: ya pagadas
    if not req.deudas:
        return ResultadoSimulacion(estado="SIN_DEUDAS", mensajes=[
            "No declaraste deudas. ¡Excelente! Usa el crédito de forma responsable: "
            "mantén tus cuotas bajo el 25% de tu renta, compara siempre el CAE y el CTC, "
            "y evita financiar el pago mínimo de tus tarjetas.",
        ], **base)

    deudas = _a_clp(req.deudas, req.valor_uf)
    # Coherencia solo cuando la persona dio los tres datos (cuota, tasa y meses); si falta alguno, se calcula.
    completas = [d for d in deudas if d.tipo != "tarjeta" and d.tasa_mensual is not None and d.plazo_restante_meses is not None]
    res = resolver_deudas(deudas)
    if res.problemas:
        return ResultadoSimulacion(
            estado="DATOS_INCONSISTENTES", alertas=[], mensajes=res.problemas, supuestos=res.supuestos,
            sugerencias=["Corrige los datos y vuelve a simular; con esos datos no es posible calcular un resultado confiable."], **base)
    deudas = res.deudas
    incluidas = [d for d in deudas if d.incluir]
    excluidas = [d for d in deudas if not d.incluir]
    parte = lambda d: ParteRefinanciar(institucion=d.institucion, tipo=d.tipo, monto=d.monto_actual)  # noqa: E731
    base = {**base, "supuestos": res.supuestos, "total_a_refinanciar": sum(d.monto_actual for d in incluidas),
            "partes_refinanciar": [parte(d) for d in incluidas], "excluidas": [parte(d) for d in excluidas]}
    actual = _situacion(deudas, renta)
    avisos = _avisos(req, deudas, renta, actual, ofertas)
    tarjetas = [
        TarjetaAmortizacion(institucion=d.institucion, saldo=d.monto_actual, plazo_meses=MESES_MAX_TARJETA,
                            cuota=finance.cuota_minima_tarjeta(d.monto_actual, d.tasa_mensual))
        for d in deudas if d.tipo == "tarjeta"
    ]
    una = None
    if len(deudas) == 1:
        d = deudas[0]
        evitables = max(d.cuota_actual * d.plazo_restante_meses - d.monto_actual, 0.0)
        una = AnalisisUnaDeuda(
            intereses_evitables_si_prepaga=evitables,
            mensaje=("Con una sola deuda, prepagarla (total o parcialmente) suele ser mejor que refinanciar: "
                     "evitarías los intereses restantes sin pagar comisiones nuevas."),
        )

    # R1 — tope de endeudamiento
    if not rules.cumple_tope_endeudamiento(actual.deuda_total, renta):
        return ResultadoSimulacion(
            estado="SOBREENDEUDADO", situacion_actual=actual, tarjetas_amortizacion=tarjetas,
            analisis_una_deuda=una,
            reglas=[ReglaVerificada(regla="R1", titulo=f"Tope de endeudamiento ({TOPE_ENDEUDAMIENTO_VECES_RENTA:g}x renta)", cumple=False,
                                    detalle="Tu deuda total supera 10 veces tu renta líquida mensual.")],
            alertas=["Estás sobreendeudado según los criterios de la CMF"] + avisos,
            sugerencias=[
                "La única alternativa es una reprogramación con aval o codeudor directamente con tu institución.",
                "Pide asesoría en la CMF (www.cmfchile.cl) y revisa el Programa de Educación Financiera (CMF Educa).",
                "Consulta por el FOGAES y por el procedimiento de renegociación de la Superir (Ley de Insolvencia).",
            ],
            mensajes=["No se ofrece refinanciamiento porque supera el tope de endeudamiento."], **base,
        )  # TODO: verificar con abogado alcance real del tope y de la renegociación (Ley 20.720)

    # Coherencia de datos: sin esto el "ahorro" sería basura (hallazgo CRIT-005).
    problemas = rules.chequear_coherencia(completas)
    if problemas:
        return ResultadoSimulacion(
            estado="DATOS_INCONSISTENTES", situacion_actual=actual, tarjetas_amortizacion=tarjetas,
            alertas=avisos, mensajes=problemas, sugerencias=[
                "Corrige los datos y vuelve a simular; con datos inconsistentes no es posible calcular un ahorro confiable.",
                "Los valores exactos aparecen en tu cartola o en el contrato de cada crédito."], **base)

    if not incluidas:
        return ResultadoSimulacion(
            estado="SIN_SOLUCION", situacion_actual=actual, tarjetas_amortizacion=tarjetas, alertas=avisos,
            mensajes=["No hay deudas para refinanciar: marcaste todas fuera. Marca \"Incluir en el refinanciamiento\" en al menos una."], **base)

    opt = optimizar(renta, incluidas, ofertas, objetivo=req.objetivo, relajar_r5=req.tarjetas_mas_de_24, fijas=excluidas)
    avisos = avisos + opt.alertas

    if opt.estado == "SIN_SOLUCION":
        mensajes = ["No encontramos una oferta que calce con tu situación."]
        if not ofertas:
            mensajes.append("No hay ofertas vigentes cargadas para comparar.")
        else:
            mensajes.append("Ninguna combinación de las ofertas disponibles cumple el tope de cuota (25% de tu renta) "
                            "o sus montos y plazos máximos.")
        return ResultadoSimulacion(
            estado="SIN_SOLUCION", situacion_actual=actual, tarjetas_amortizacion=tarjetas, analisis_una_deuda=una,
            reglas=_reglas(actual.deuda_total, renta, actual.cuota_total, [], 0.0),
            alertas=avisos, sugerencias=opt.sugerencias, mensajes=mensajes,
            renta_minima_sugerida=opt.renta_minima_sugerida, **base,
        )

    if req.objetivo == "cuota":
        # Modo "menor cuota": conviene si baja la cuota, aunque el costo total suba.
        conviene = opt.ahorro_mensual > 0
        if conviene:
            mensajes = [f"Tu cuota mensual baja en {_pesos(opt.ahorro_mensual)}."]
            if opt.ahorro_total < 0:
                mensajes.append(f"Ojo: pagarás {_pesos(-opt.ahorro_total)} más en total por los intereses de un plazo mayor.")
        else:
            mensajes = ["Con las ofertas disponibles no se logra bajar tu cuota mensual actual."]
    else:
        conviene = opt.ahorro_total > 0
        mensajes = (["Refinanciar te permite ahorrar dinero según esta simulación."] if conviene else
                    [f"Refinanciar te costaría {_pesos(-opt.ahorro_total)} más que mantener tus deudas actuales."])
    reduccion_cae = opt.cae_actual - opt.cae_nuevo
    if conviene and req.objetivo == "costo" and reduccion_cae <= 0 and opt.cuota_total_nueva > actual.cuota_total:
        mensajes.append("El ahorro viene de pagar más rápido (cuota más alta), no de una tasa menor: el CAE nuevo no es mejor que el actual.")

    if conviene and req.objetivo == "costo" and opt.cuota_total_nueva > actual.cuota_total:
        mensajes.append(f"Tu cuota mensual sube en {_pesos(opt.cuota_total_nueva - actual.cuota_total)}: la simulación elige pagar más rápido para "
                        "ahorrar en intereses. Si necesitas aliviar tu mes, usa el modo «Menor cuota posible».")

    reglas = _reglas(actual.deuda_total, renta, opt.cuota_total_nueva, opt.prestamos, sum(p.comision for p in opt.prestamos))
    if not conviene:
        # Prohibido presentar como recomendación una alternativa peor que la situación actual.
        return ResultadoSimulacion(
            estado="NO_CONVIENE", situacion_actual=actual, tarjetas_amortizacion=tarjetas, analisis_una_deuda=una,
            reglas=reglas, alertas=avisos, sugerencias=opt.sugerencias, mensajes=mensajes, **base)

    pct = opt.cuota_total_nueva / renta
    propuesta = Propuesta(
        prestamos=opt.prestamos, deudas_fuera=opt.deudas_fuera, cuota_total=opt.cuota_total_nueva,
        pct_renta_comprometida=pct, semaforo=finance.semaforo(pct), ctc_nuevo=opt.ctc_nuevo,
        ahorro_total=opt.ahorro_total, ahorro_mensual=opt.ahorro_mensual, cae_nuevo=opt.cae_nuevo,
        reduccion_cae=reduccion_cae, pasos_cascada=opt.pasos_cascada,
    )
    return ResultadoSimulacion(
        estado="OK", situacion_actual=actual, propuesta=propuesta, tarjetas_amortizacion=tarjetas,
        analisis_una_deuda=una, reglas=reglas, alertas=avisos, sugerencias=opt.sugerencias, mensajes=mensajes, **base)


def _reglas(deuda_total: float, renta: float, cuota_total: float, prestamos: List[Prestamo], comisiones: float) -> List[ReglaVerificada]:
    tarjeta_larga = any(p.incluye_tarjeta and p.plazo_meses > MESES_MAX_TARJETA for p in prestamos)
    plazo_ok = all(p.plazo_meses <= PLAZO_MAX_CONSUMO_MESES for p in prestamos)
    return [
        ReglaVerificada(regla="R1", titulo=f"Tope de endeudamiento ({TOPE_ENDEUDAMIENTO_VECES_RENTA:g}x renta)",
                        cumple=rules.cumple_tope_endeudamiento(deuda_total + comisiones, renta),
                        detalle=f"Deuda + comisiones = {(deuda_total + comisiones) / renta:.1f} veces tu renta."),
        ReglaVerificada(regla="R2", titulo=f"Cuota mensual <= {TOPE_CUOTA_PCT_RENTA:.0%} de la renta",
                        cumple=rules.cumple_tope_cuota(cuota_total, renta),
                        detalle=f"La cuota total equivale al {cuota_total / renta:.1%} de tu renta."),
        ReglaVerificada(regla="R3", titulo=f"Amortización de tarjetas en {MESES_MAX_TARJETA} meses (NCG 537)",
                        cumple=not tarjeta_larga,
                        detalle=(f"Ninguna tarjeta supera los {MESES_MAX_TARJETA} meses." if not tarjeta_larga
                                 else f"Una tarjeta quedó a más de {MESES_MAX_TARJETA} meses para cumplir tu tope de cuota o por tu elección.")),
        ReglaVerificada(regla="R4", titulo="CAE y CTC informados", cumple=True,
                        detalle="Cada crédito muestra CAE, CTC, cuota y costo financiero."),
        ReglaVerificada(regla="R5", titulo="Derecho a retracto informado", cumple=True, detalle=rules.AVISO_RETRACTO),
        ReglaVerificada(regla="R6", titulo="Simulación, no oferta de crédito", cumple=True, detalle=rules.DISCLAIMER),
        ReglaVerificada(regla="R7", titulo=f"Plazo máximo de {PLAZO_MAX_CONSUMO_MESES} meses (consumo)", cumple=plazo_ok,
                        detalle=f"Plazo máximo para créditos de consumo: {PLAZO_MAX_CONSUMO_MESES} meses."),
    ]
