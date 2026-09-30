"""Tests de los hallazgos de auditoría sobre reglas, matemática y motor."""
import time

import pytest

from app import config
from app.engine import finance
from app.engine.optimizer import optimizar
from app.engine.simulator import simular
from app.schemas import Perfil, SimulacionRequest


def req(perfil, deudas, ofertas, **kw):
    return SimulacionRequest(perfil=perfil, deudas=deudas, ofertas=ofertas, **kw)


# ---- CRIT-004: R3 completa ---------------------------------------------------------------

def test_tarjeta_dejada_fuera_usa_amortizacion_forzosa_y_24_meses(deuda_factory, oferta_factory):
    tarjeta = deuda_factory(institucion="Tarj", tipo="tarjeta", monto_actual=1_000_000, tasa_mensual=0.03,
                            cuota_actual=10_000, plazo_restante_meses=90)
    chica = deuda_factory(institucion="Chica", monto_actual=400_000, cuota_actual=20_000, plazo_restante_meses=24)
    # La oferta solo admite 500k: la tarjeta no cabe y queda fuera.
    r = optimizar(1_500_000, [tarjeta, chica], [oferta_factory(monto_max=500_000, tasa_mensual=0.01)])
    fuera = {f.institucion: f for f in r.deudas_fuera}
    assert "Tarj" in fuera
    assert fuera["Tarj"].cuota == pytest.approx(finance.cuota_minima_tarjeta(1_000_000, 0.03), abs=1)
    assert fuera["Tarj"].plazo_restante_meses == 24


def test_r3_no_cumple_si_tarjeta_va_a_mas_de_24_meses(deuda_factory, oferta_factory):
    d = deuda_factory(tipo="tarjeta", monto_actual=4_000_000, tasa_mensual=0.03, cuota_actual=100_000, plazo_restante_meses=60)
    r = simular(req(Perfil(renta_liquida=600_000), [d], [oferta_factory(plazo_max_meses=60)]))
    assert next(x for x in r.reglas if x.regla == "R3").cumple is False


def test_r3_cumple_en_caso_normal(perfil, deuda_factory, oferta_factory):
    d = deuda_factory(tipo="tarjeta", monto_actual=1_000_000, cuota_actual=60_000, plazo_restante_meses=24)
    r = simular(req(perfil, [d], [oferta_factory()]))
    assert next(x for x in r.reglas if x.regla == "R3").cumple is True


def test_no_atribuye_a_la_cmf_un_plazo_de_24_meses_que_no_es_norma(perfil, deuda_factory, oferta_factory):
    d = deuda_factory(tipo="tarjeta", monto_actual=2_000_000, tasa_mensual=0.03, cuota_actual=20_000, plazo_restante_meses=60)
    r = simular(req(perfil, [d], [oferta_factory()]))
    textos = " ".join(r.alertas + r.mensajes + [x.titulo + x.detalle for x in r.reglas])
    assert "NCG 537" not in textos and "norma de la CMF" not in textos
    assert any("supuesto" in x.titulo.lower() for x in r.reglas if x.regla == "R3")


def test_alerta_si_cuota_actual_de_tarjeta_es_menor_que_el_minimo(perfil, deuda_factory, oferta_factory):
    d = deuda_factory(tipo="tarjeta", monto_actual=2_000_000, tasa_mensual=0.03, cuota_actual=20_000, plazo_restante_meses=60)
    r = simular(req(perfil, [d], [oferta_factory()]))
    assert any("amortización" in a.lower() and "tarjeta" in a.lower() for a in r.alertas)


# ---- MAJ-001: R7 visible -------------------------------------------------------------------

def test_r7_aparece_en_reglas_y_se_cumple(perfil, deuda_factory, oferta_factory):
    r = simular(req(perfil, [deuda_factory()], [oferta_factory(plazo_max_meses=84)]))
    r7 = next(x for x in r.reglas if x.regla == "R7")
    assert r7.cumple is True and "60" in r7.detalle
    assert all(p.plazo_meses <= 60 for p in r.propuesta.prestamos)


def test_alerta_cuando_se_recorta_plazo_de_oferta(perfil, deuda_factory, oferta_factory):
    r = simular(req(perfil, [deuda_factory()], [oferta_factory(plazo_max_meses=84)]))
    assert any("60 meses" in a for a in r.alertas)


# ---- CRIT-005: coherencia de datos -------------------------------------------------------------

def test_datos_inconsistentes_se_rechazan_sin_calcular_ahorro(perfil, deuda_factory, oferta_factory):
    d = deuda_factory(monto_actual=1_000_000, tasa_mensual=0.02, cuota_actual=200_000, plazo_restante_meses=24)
    r = simular(req(perfil, [d], [oferta_factory()]))
    assert r.estado == "DATOS_INCONSISTENTES"
    assert r.propuesta is None
    assert any("cuota" in m.lower() and "52.8" in m for m in r.mensajes)  # cuota teórica ≈ $52.871


def test_tarjeta_esta_exenta_de_la_coherencia_de_cuota(perfil, deuda_factory, oferta_factory):
    d = deuda_factory(tipo="tarjeta", monto_actual=1_000_000, tasa_mensual=0.02, cuota_actual=200_000, plazo_restante_meses=24)
    assert simular(req(perfil, [d], [oferta_factory()])).estado != "DATOS_INCONSISTENTES"


def test_cuota_dentro_de_tolerancia_es_aceptada(perfil, deuda_factory, oferta_factory):
    esperada = finance.cuota_francesa(1_000_000, 0.02, 24)
    d = deuda_factory(tasa_mensual=0.02, cuota_actual=esperada * 1.2)
    assert simular(req(perfil, [d], [oferta_factory()])).estado != "DATOS_INCONSISTENTES"


def test_pagar_menos_que_el_capital_es_inconsistente(perfil, deuda_factory, oferta_factory):
    d = deuda_factory(monto_actual=1_000_000, tasa_mensual=0.0, cuota_actual=20_000, plazo_restante_meses=24)
    assert simular(req(perfil, [d], [oferta_factory()])).estado == "DATOS_INCONSISTENTES"


# ---- CRIT-006: CAE comparable y motivo del ahorro ---------------------------------------------------

def test_cae_actual_se_calcula_con_los_flujos_reales(perfil, deuda_factory, oferta_factory):
    d = deuda_factory(monto_actual=1_000_000, tasa_mensual=0.02, cuota_actual=50_000, plazo_restante_meses=24)
    r = simular(req(perfil, [d], [oferta_factory()]))
    assert r.situacion_actual.cae_ponderada == pytest.approx(finance.calcular_cae(1_000_000, 50_000, 24), abs=1e-6)


def test_explica_que_el_ahorro_viene_de_pagar_mas_rapido(perfil, deuda_factory, oferta_factory):
    cuota = finance.cuota_francesa(1_000_000, 0.015, 24)
    d = deuda_factory(tasa_mensual=0.015, cuota_actual=cuota)
    r = simular(req(perfil, [d], [oferta_factory(tasa_mensual=0.015, comision=50_000)]))
    assert r.estado == "OK"
    assert any("más rápido" in m for m in r.mensajes)


def test_no_conviene_no_entrega_propuesta_y_dice_cuanto_cuesta_de_mas(perfil, deuda_factory, oferta_factory):
    barata = deuda_factory(tasa_mensual=0.01, cuota_actual=47_073, plazo_restante_meses=24)
    r = simular(req(perfil, [barata], [oferta_factory(tasa_mensual=0.03, comision=100_000)]))
    assert r.estado == "NO_CONVIENE"
    assert r.propuesta is None
    assert any("más" in m and "$" in m for m in r.mensajes)


# ---- MAJ-002 / MAJ-004 / MAJ-007 alertas -----------------------------------------------------------------

def test_alerta_si_la_carga_actual_ya_supera_25(deuda_factory, oferta_factory):
    p = Perfil(renta_liquida=800_000)
    d = [deuda_factory(institucion="A", monto_actual=2_000_000, tasa_mensual=0.02, cuota_actual=105_800, plazo_restante_meses=24),
         deuda_factory(institucion="B", monto_actual=1_500_000, tasa_mensual=0.02, cuota_actual=79_300, plazo_restante_meses=24),
         deuda_factory(institucion="T", tipo="tarjeta", monto_actual=1_000_000, cuota_actual=70_900, plazo_restante_meses=24)]
    r = simular(req(p, d, [oferta_factory()]))
    assert r.situacion_actual.pct_renta_comprometida > 0.25
    assert any("supera el 25%" in a for a in r.alertas)


def test_alerta_por_deudas_en_uf_sin_reajuste(perfil, deuda_factory, oferta_factory):
    d = deuda_factory(moneda="UF", monto_actual=100, tasa_mensual=0.003, cuota_actual=4.4, plazo_restante_meses=24)
    r = simular(req(perfil, [d], [oferta_factory()], valor_uf=40_000))
    assert any("reajuste" in a.lower() for a in r.alertas)


def test_alerta_por_ingresos_adicionales_no_verificados(deuda_factory, oferta_factory):
    p = Perfil(renta_liquida=1_000_000, ingresos_adicionales=300_000)
    r = simular(req(p, [deuda_factory()], [oferta_factory()]))
    assert any("no verificados" in a.lower() for a in r.alertas)


# ---- CRIT-002: fuente de las ofertas --------------------------------------------------------------------------

@pytest.mark.parametrize("fuente,esperado", [("seed", "ilustrativas"), ("sernac", "sernac"), ("manual", "usuario"), ("usuario", "usuario")])
def test_resultado_declara_la_fuente_de_las_ofertas(perfil, deuda_factory, oferta_factory, fuente, esperado):
    r = simular(req(perfil, [deuda_factory()], [oferta_factory(fuente=fuente)]))
    assert r.fuente_ofertas == esperado
    assert r.aviso_ofertas


def test_aviso_de_ofertas_ilustrativas_es_explicito(perfil, deuda_factory, oferta_factory):
    r = simular(req(perfil, [deuda_factory()], [oferta_factory(fuente="seed")]))
    assert "ilustrativas" in r.aviso_ofertas.lower() and "no son ofertas reales" in r.aviso_ofertas.lower()


def test_aviso_si_comision_y_seguro_no_se_conocen(perfil, deuda_factory, oferta_factory):
    r = simular(req(perfil, [deuda_factory()], [oferta_factory(fuente="sernac", comision_conocida=False)]))
    assert "comisiones" in r.aviso_ofertas.lower()


# ---- CRIT-008: textos legales --------------------------------------------------------------------------------------

def test_disclaimer_aclara_que_los_topes_son_criterios_de_la_herramienta(perfil, deuda_factory, oferta_factory):
    r = simular(req(perfil, [], [oferta_factory()]))
    assert "no es asesoría financiera" in r.disclaimer.lower()
    assert "criterios de esta herramienta" in r.disclaimer.lower()
    assert "responsabilidad" in r.disclaimer.lower()


# ---- Rendimiento / determinismo (CRIT-003) ------------------------------------------------------------------------------

def _caso_grande(deuda_factory, oferta_factory):
    ds = [deuda_factory(institucion=f"D{i}", tipo="tarjeta" if i % 3 == 0 else "consumo", monto_actual=300_000 + i * 20_000,
                        cuota_actual=15_000, plazo_restante_meses=30) for i in range(20)]
    os_ = [oferta_factory(institucion=f"O{i}", tasa_mensual=0.012 + i * 0.001, comision=10_000 * i,
                          monto_max=3_000_000 if i % 2 else None) for i in range(8)]
    return ds, os_


def test_20_deudas_y_8_ofertas_resuelve_en_menos_de_10_segundos(deuda_factory, oferta_factory):
    ds, os_ = _caso_grande(deuda_factory, oferta_factory)
    t0 = time.time()
    r = optimizar(3_000_000, ds, os_)
    assert time.time() - t0 < 10
    assert r.estado == "OK"
    assert r.cuota_total_nueva <= config.TOPE_CUOTA_PCT_RENTA * 3_000_000 + 1


def test_es_determinista(deuda_factory, oferta_factory):
    ds, os_ = _caso_grande(deuda_factory, oferta_factory)
    firma = lambda r: [(p.institucion, p.plazo_meses, round(p.monto)) for p in r.prestamos]  # noqa: E731
    assert firma(optimizar(3_000_000, ds[:8], os_)) == firma(optimizar(3_000_000, ds[:8], os_))


def test_oferta_con_tasa_cero_funciona(deuda_factory, oferta_factory):
    assert optimizar(3_000_000, [deuda_factory()], [oferta_factory(tasa_mensual=0)]).estado == "OK"


def test_deuda_con_monto_cero_se_trata_como_sin_deudas(perfil, deuda_factory, oferta_factory):
    r = simular(req(perfil, [deuda_factory(monto_actual=0, cuota_actual=0)], [oferta_factory()]))
    assert r.estado == "SIN_DEUDAS"
    assert any("responsable" in m.lower() for m in r.mensajes)


def test_explica_cuando_la_cuota_mensual_sube_en_modo_costo(perfil, deuda_factory, oferta_factory):
    d = deuda_factory(monto_actual=3_000_000, tasa_mensual=0.03, cuota_actual=153_059, plazo_restante_meses=30)
    r = simular(req(perfil, [d], [oferta_factory(tasa_mensual=0.0139, plazo_max_meses=60)]))
    assert r.estado == "OK"
    assert r.propuesta.cuota_total > r.situacion_actual.cuota_total
    assert any("cuota mensual sube" in m and "Menor cuota posible" in m for m in r.mensajes)
