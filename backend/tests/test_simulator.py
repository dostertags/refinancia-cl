"""Tests del flujo completo: reglas de negocio + casos borde + textos legales."""
from app.engine.simulator import simular
from app.schemas import Perfil, SimulacionRequest

RETRACTO = "derecho a retracto"
DISCLAIMER = "Esta simulación no constituye una oferta de crédito"


def req(perfil, deudas, ofertas, **kw):
    return SimulacionRequest(perfil=perfil, deudas=deudas, ofertas=ofertas, **kw)


def test_sin_deudas_mensaje_educativo(perfil, oferta_factory):
    r = simular(req(perfil, [], [oferta_factory()]))
    assert r.estado == "SIN_DEUDAS"
    assert any("responsable" in m.lower() for m in r.mensajes)


def test_sobreendeudado_no_ofrece_refinanciamiento(deuda_factory, oferta_factory):
    p = Perfil(renta_liquida=300_000, region="Metropolitana", situacion_laboral="dependiente")
    r = simular(req(p, [deuda_factory(monto_actual=3_500_000)], [oferta_factory()]))
    assert r.estado == "SOBREENDEUDADO"
    assert r.propuesta is None
    assert any("criterio de esta herramienta" in a and "no es una norma de la CMF" in a for a in r.alertas)
    assert not any("criterios de la CMF" in a for a in r.alertas)
    texto = " ".join(r.sugerencias).lower()
    assert "aval" in texto and "cmf" in texto and "fogaes" in texto


def test_exactamente_10x_no_es_sobreendeudo(deuda_factory, oferta_factory):
    p = Perfil(renta_liquida=500_000, region="Metropolitana", situacion_laboral="dependiente")
    r = simular(req(p, [deuda_factory(monto_actual=5_000_000, cuota_actual=100_000, plazo_restante_meses=60)], [oferta_factory()]))
    assert r.estado != "SOBREENDEUDADO"


def test_deuda_en_uf_se_convierte_a_clp(perfil, deuda_factory, oferta_factory):
    d = deuda_factory(moneda="UF", monto_actual=100, cuota_actual=4, plazo_restante_meses=30)
    r = simular(req(perfil, [d], [oferta_factory()], valor_uf=40_000))
    assert r.situacion_actual.deuda_total == 4_000_000
    assert r.situacion_actual.cuota_total == 160_000


def test_deuda_en_uf_sin_valor_uf_es_error(perfil, deuda_factory, oferta_factory):
    import pytest
    d = deuda_factory(moneda="UF", monto_actual=100, cuota_actual=4)
    with pytest.raises(ValueError):
        simular(req(perfil, [d], [oferta_factory()]))


def test_toda_respuesta_incluye_disclaimer_y_retracto(perfil, deuda_factory, oferta_factory):
    for deudas in ([], [deuda_factory()]):
        r = simular(req(perfil, deudas, [oferta_factory()]))
        assert DISCLAIMER in r.disclaimer
        assert RETRACTO in r.aviso_retracto


def test_tarjetas_informan_amortizacion_forzosa(perfil, deuda_factory, oferta_factory):
    d = deuda_factory(tipo="tarjeta", institucion="Falabella", monto_actual=2_400_000, tasa_mensual=0.03, casa_comercial=True)
    r = simular(req(perfil, [d], [oferta_factory()]))
    assert r.tarjetas_amortizacion[0].plazo_meses == 24
    assert r.tarjetas_amortizacion[0].cuota > 0


def test_una_sola_deuda_incluye_analisis_prepago(perfil, deuda_factory, oferta_factory):
    r = simular(req(perfil, [deuda_factory()], [oferta_factory()]))
    assert r.analisis_una_deuda is not None
    assert r.analisis_una_deuda.intereses_evitables_si_prepaga > 0


def test_verificacion_de_reglas_reportada(perfil, deuda_factory, oferta_factory):
    r = simular(req(perfil, [deuda_factory()], [oferta_factory()]))
    ids = {x.regla for x in r.reglas}
    assert {"R1", "R2", "R3", "R4", "R5", "R6"} <= ids
    assert all(x.cumple for x in r.reglas if x.regla in {"R1", "R2"})


def test_sin_oferta_que_calce_explica_por_que(perfil, deuda_factory):
    r = simular(req(perfil, [deuda_factory()], []))
    assert r.estado == "SIN_SOLUCION"
    assert any("oferta" in m.lower() for m in r.mensajes)


def test_no_conviene_si_refinanciar_cuesta_mas(perfil, deuda_factory, oferta_factory):
    barata = deuda_factory(tasa_mensual=0.01, cuota_actual=47_073, plazo_restante_meses=24)
    r = simular(req(perfil, [barata], [oferta_factory(tasa_mensual=0.03, comision=100_000)]))
    assert r.estado == "NO_CONVIENE"


def test_modo_cuota_marca_ok_aunque_el_costo_total_suba(deuda_factory, oferta_factory):
    from app.schemas import Perfil
    p = Perfil(renta_liquida=3_000_000)
    deudas = [deuda_factory(monto_actual=5_000_000, tasa_mensual=0.018, cuota_actual=200_000, plazo_restante_meses=32)]
    r = simular(req(p, deudas, [oferta_factory(tasa_mensual=0.0139, plazo_max_meses=60)], objetivo="cuota"))
    assert r.estado == "OK"
    assert r.propuesta.cuota_total < r.situacion_actual.cuota_total
    assert r.propuesta.ahorro_total < 0
    assert any("más en total" in m for m in r.mensajes)


def test_modo_cuota_sin_baja_de_cuota_es_no_conviene(perfil, deuda_factory, oferta_factory):
    barata = deuda_factory(tasa_mensual=0.01, cuota_actual=20_000, plazo_restante_meses=60, monto_actual=900_000)
    r = simular(req(perfil, [barata], [oferta_factory(tasa_mensual=0.03, plazo_max_meses=12)], objetivo="cuota"))
    assert r.estado == "NO_CONVIENE"
