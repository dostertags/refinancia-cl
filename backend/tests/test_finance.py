"""Tests de las funciones financieras puras (TDD: escritos antes de la implementación)."""
import pytest

from app.engine import finance


def test_cuota_francesa_valor_conocido():
    # 1.000.000 al 2% mensual a 12 meses -> 94.559,6
    assert finance.cuota_francesa(1_000_000, 0.02, 12) == pytest.approx(94_559.6, abs=0.5)


def test_cuota_francesa_tasa_cero_es_lineal():
    assert finance.cuota_francesa(1_200_000, 0.0, 12) == pytest.approx(100_000)


def test_cuota_francesa_incluye_seguro_mensual_sobre_monto():
    base = finance.cuota_francesa(1_000_000, 0.02, 12)
    con_seguro = finance.cuota_francesa(1_000_000, 0.02, 12, seguro_mensual=0.001)
    assert con_seguro == pytest.approx(base + 1_000, abs=0.01)


def test_cuota_francesa_rechaza_plazo_invalido():
    with pytest.raises(ValueError):
        finance.cuota_francesa(1_000_000, 0.02, 0)


def test_cae_sin_gastos_equivale_a_tasa_efectiva_anual():
    cuota = finance.cuota_francesa(1_000_000, 0.02, 12)
    assert finance.calcular_cae(1_000_000, cuota, 12) == pytest.approx(1.02**12 - 1, abs=1e-6)


def test_cae_sube_con_comision():
    cuota = finance.cuota_francesa(1_000_000, 0.02, 12)
    sin = finance.calcular_cae(1_000_000, cuota, 12)
    con = finance.calcular_cae(1_000_000, cuota, 12, comision=50_000)
    assert con > sin


def test_ctc_es_total_pagado_mas_comision():
    assert finance.ctc_prestamo(cuota=100_000, n=12, comision=30_000) == 1_230_000


def test_tasa_mensual_a_cae():
    assert finance.tasa_mensual_a_cae(0.02) == pytest.approx(0.268242, abs=1e-5)


def test_amortizacion_forzosa_tarjeta_24_meses():
    cuota = finance.amortizacion_forzosa_tarjeta(2_400_000, 0.03)
    assert cuota == pytest.approx(finance.cuota_francesa(2_400_000, 0.03, 24))


@pytest.mark.parametrize("pct,esperado", [(0.10, "verde"), (0.149, "verde"), (0.15, "amarillo"), (0.20, "amarillo"), (0.25, "amarillo"), (0.26, "rojo")])
def test_semaforo(pct, esperado):
    assert finance.semaforo(pct) == esperado


def test_uf_a_clp():
    assert finance.uf_a_clp(100, 40_000) == 4_000_000


def test_cuota_minima_tarjeta_es_el_mayor_entre_amortizacion_e_intereses():
    saldo, t = 2_000_000, 0.03
    assert finance.cuota_minima_tarjeta(saldo, t) == pytest.approx(finance.amortizacion_forzosa_tarjeta(saldo, t))
    assert finance.cuota_minima_tarjeta(saldo, t, comisiones=500_000) == pytest.approx(saldo * t + 500_000)
