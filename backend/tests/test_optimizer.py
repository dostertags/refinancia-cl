"""Tests del motor de optimización (MILP con PuLP) y la cascada de relajación."""
import pytest

from app.engine.finance import cuota_francesa
from app.engine.optimizer import optimizar


def test_caso_feliz_ahorra_y_cumple_reglas(deuda_factory, oferta_factory):
    deudas = [
        deuda_factory(institucion="Banco A", monto_actual=3_000_000, tasa_mensual=0.03, cuota_actual=153_000, plazo_restante_meses=30),
        deuda_factory(institucion="Casa B", tipo="tarjeta", monto_actual=1_000_000, tasa_mensual=0.035, cuota_actual=60_000, plazo_restante_meses=24),
    ]
    r = optimizar(1_500_000, deudas, [oferta_factory(comision=50_000)])
    assert r.estado == "OK"
    assert r.pasos_cascada == []
    assert r.ahorro_total > 0
    assert r.cuota_total_nueva <= 0.25 * 1_500_000
    assert r.deudas_fuera == []
    assert sum(p.monto for p in r.prestamos) == 4_000_000


def test_tarjeta_respeta_24_meses_en_modo_estricto(deuda_factory, oferta_factory):
    deudas = [deuda_factory(tipo="tarjeta", monto_actual=2_000_000, cuota_actual=100_000, plazo_restante_meses=30)]
    r = optimizar(3_000_000, deudas, [oferta_factory(plazo_max_meses=60)])
    assert all(p.plazo_meses <= 24 for p in r.prestamos)


def test_r2_fuerza_el_plazo_minimo_factible(deuda_factory, oferta_factory):
    deudas = [deuda_factory(monto_actual=5_000_000, tasa_mensual=0.025, cuota_actual=180_000, plazo_restante_meses=36)]
    r = optimizar(800_000, deudas, [oferta_factory(tasa_mensual=0.018, plazo_max_meses=60)])
    assert r.estado == "OK"
    assert r.prestamos[0].plazo_meses == 36
    assert r.cuota_total_nueva <= 200_000


def test_cascada_paso1_relaja_r5_si_la_tarjeta_no_cabe_en_24_meses(deuda_factory, oferta_factory):
    deudas = [deuda_factory(tipo="tarjeta", monto_actual=4_000_000, tasa_mensual=0.03, cuota_actual=100_000, plazo_restante_meses=60)]
    r = optimizar(600_000, deudas, [oferta_factory(tasa_mensual=0.015, plazo_max_meses=60)])
    assert r.estado == "OK"
    assert r.pasos_cascada == ["relajar_r5"]
    assert r.prestamos[0].plazo_meses > 24
    assert r.cuota_total_nueva <= 150_000


def test_cascada_paso2_deja_deuda_fuera(deuda_factory, oferta_factory):
    a = deuda_factory(institucion="A", monto_actual=2_000_000, tasa_mensual=0.02, cuota_actual=50_000, plazo_restante_meses=60)
    b = deuda_factory(institucion="B", monto_actual=1_000_000, tasa_mensual=0.025, cuota_actual=45_000, plazo_restante_meses=30)
    r = optimizar(400_000, [a, b], [oferta_factory(tasa_mensual=0.012, plazo_max_meses=24)])
    assert r.estado == "OK"
    assert "dejar_deudas_fuera" in r.pasos_cascada
    assert [d.institucion for d in r.deudas_fuera] == ["A"]
    assert r.cuota_total_nueva <= 100_000


def test_cascada_paso3_y_4_sugiere_aumentar_renta(deuda_factory, oferta_factory):
    deudas = [deuda_factory(monto_actual=2_900_000, tasa_mensual=0.03, cuota_actual=100_000, plazo_restante_meses=36)]
    r = optimizar(300_000, deudas, [oferta_factory(tasa_mensual=0.03, plazo_max_meses=36)])
    assert r.estado == "SIN_SOLUCION"
    assert r.renta_minima_sugerida == 400_000
    assert any("renta" in s.lower() for s in r.sugerencias)
    assert any("crítico" in a.lower() for a in r.alertas)


def test_monto_max_de_oferta_impide_usarla_si_la_deuda_no_calza(deuda_factory, oferta_factory):
    deudas = [deuda_factory(monto_actual=3_000_000, tasa_mensual=0.035, cuota_actual=140_000, plazo_restante_meses=30)]
    ofertas = [
        oferta_factory(institucion="Barata", tasa_mensual=0.01, monto_max=1_000_000),
        oferta_factory(institucion="Cara", tasa_mensual=0.02),
    ]
    r = optimizar(2_000_000, deudas, ofertas)
    # Una deuda no se parte entre ofertas: la barata (tope 1M) no calza, gana la cara.
    assert {p.institucion for p in r.prestamos} == {"Cara"}


def test_monto_max_permite_la_barata_cuando_calza(deuda_factory, oferta_factory):
    deudas = [deuda_factory(monto_actual=900_000), deuda_factory(institucion="Otro", monto_actual=900_000)]
    ofertas = [
        oferta_factory(institucion="Barata", tasa_mensual=0.01, monto_max=1_000_000),
        oferta_factory(institucion="Cara", tasa_mensual=0.02),
    ]
    r = optimizar(2_000_000, deudas, ofertas)
    por_inst = {}
    for p in r.prestamos:
        por_inst[p.institucion] = por_inst.get(p.institucion, 0) + p.monto
    assert por_inst["Barata"] <= 1_000_000
    assert "Cara" in por_inst


def test_metricas_por_prestamo_presentes(deuda_factory, oferta_factory):
    r = optimizar(1_500_000, [deuda_factory()], [oferta_factory(comision=20_000, seguro_desgravamen=0.0005)])
    p = r.prestamos[0]
    assert p.cae > 0 and p.ctc > p.monto and p.cuota > 0
    assert p.costo_financiero == pytest.approx(p.ctc - p.monto)
    assert p.cuota == pytest.approx(cuota_francesa(p.monto, 0.015, p.plazo_meses, 0.0005), abs=1)


def test_reduccion_de_cae_positiva_si_la_oferta_es_mas_barata(deuda_factory, oferta_factory):
    r = optimizar(1_500_000, [deuda_factory(tasa_mensual=0.04)], [oferta_factory(tasa_mensual=0.012)])
    assert r.cae_nuevo < r.cae_actual


def test_sin_ofertas_no_hay_solucion_pero_no_explota(deuda_factory):
    r = optimizar(1_500_000, [deuda_factory()], [])
    assert r.estado == "SIN_SOLUCION"


def test_plazo_nunca_supera_60_meses_aunque_la_oferta_diga_mas(deuda_factory, oferta_factory):
    # Créditos de consumo: máx. 60 meses. La oferta declara 84 pero el motor debe topar en 60.
    deudas = [deuda_factory(monto_actual=5_000_000, tasa_mensual=0.025, cuota_actual=180_000, plazo_restante_meses=36)]
    r = optimizar(700_000, deudas, [oferta_factory(tasa_mensual=0.018, plazo_max_meses=84)])
    assert all(p.plazo_meses <= 60 for p in r.prestamos)


def test_r2_infactible_solo_con_plazos_sobre_60(deuda_factory, oferta_factory):
    # A 60 meses la cuota no cabe en 25% de la renta; con 84 sí cabría -> debe ser SIN_SOLUCION.
    deudas = [deuda_factory(monto_actual=4_500_000, tasa_mensual=0.02, cuota_actual=300_000, plazo_restante_meses=24)]
    r = optimizar(460_000, deudas, [oferta_factory(tasa_mensual=0.018, plazo_max_meses=84)])
    assert r.estado == "SIN_SOLUCION"


# ---- Modo "menor cuota posible" -------------------------------------------------------------

def _caso_7_millones(deuda_factory, oferta_factory):
    deudas = [
        deuda_factory(institucion="Consumo", monto_actual=5_000_000, tasa_mensual=0.018, cuota_actual=200_000, plazo_restante_meses=32),
        deuda_factory(institucion="Tarjeta", tipo="tarjeta", monto_actual=2_000_000, tasa_mensual=0.03, cuota_actual=100_000, plazo_restante_meses=30),
    ]
    ofertas = [oferta_factory(institucion="A", tasa_mensual=0.0139, plazo_max_meses=60, comision=30_000, seguro_desgravamen=0.0004)]
    return deudas, ofertas


def test_modo_cuota_baja_mas_la_cuota_que_modo_costo(deuda_factory, oferta_factory):
    deudas, ofertas = _caso_7_millones(deuda_factory, oferta_factory)
    costo = optimizar(3_000_000, deudas, ofertas, objetivo="costo")
    cuota = optimizar(3_000_000, deudas, ofertas, objetivo="cuota")
    assert cuota.cuota_total_nueva < costo.cuota_total_nueva
    assert cuota.ahorro_mensual > 0


def test_modo_cuota_respeta_24_meses_de_tarjetas_por_defecto(deuda_factory, oferta_factory):
    deudas, ofertas = _caso_7_millones(deuda_factory, oferta_factory)
    r = optimizar(3_000_000, deudas, ofertas, objetivo="cuota")
    esperado = cuota_francesa(5_000_000, 0.0139, 60, 0.0004) + cuota_francesa(2_000_000, 0.0139, 24, 0.0004)
    assert r.cuota_total_nueva == pytest.approx(esperado, abs=1)
    assert r.pasos_cascada == []


def test_modo_cuota_con_tarjetas_sobre_24_llega_al_piso(deuda_factory, oferta_factory):
    deudas, ofertas = _caso_7_millones(deuda_factory, oferta_factory)
    r = optimizar(3_000_000, deudas, ofertas, objetivo="cuota", relajar_r5=True)
    assert r.cuota_total_nueva == pytest.approx(cuota_francesa(7_000_000, 0.0139, 60, 0.0004), abs=1)
    assert r.pasos_cascada == ["relajar_r5"]


def test_modo_costo_sigue_siendo_el_default(deuda_factory, oferta_factory):
    deudas, ofertas = _caso_7_millones(deuda_factory, oferta_factory)
    assert optimizar(3_000_000, deudas, ofertas).cuota_total_nueva == optimizar(3_000_000, deudas, ofertas, objetivo="costo").cuota_total_nueva


def test_modo_cuota_desempata_por_menor_costo(deuda_factory, oferta_factory):
    # Dos ofertas con mismo plazo máximo: a igual cuota mínima no debe elegir la más cara.
    d = [deuda_factory(monto_actual=2_000_000)]
    r = optimizar(3_000_000, d, [oferta_factory(institucion="Cara", tasa_mensual=0.02, comision=100_000),
                                oferta_factory(institucion="Barata", tasa_mensual=0.015)], objetivo="cuota")
    assert r.prestamos[0].institucion == "Barata"
