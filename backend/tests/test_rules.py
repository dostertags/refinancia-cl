import pytest

from app.engine import rules
from app.schemas import Perfil


def perfil(**kw):
    base = dict(renta_liquida=1_000_000, region="Metropolitana", situacion_laboral="dependiente")
    base.update(kw)
    return Perfil(**base)


def test_renta_dependiente_usa_renta_declarada():
    assert rules.renta_efectiva(perfil()) == 1_000_000


def test_renta_incluye_ingresos_adicionales():
    assert rules.renta_efectiva(perfil(ingresos_adicionales=200_000)) == 1_200_000


def test_renta_independiente_promedia_seis_meses():
    p = perfil(situacion_laboral="independiente", renta_ultimos_6_meses=[900_000, 1_100_000, 1_000_000, 800_000, 1_200_000, 1_000_000])
    assert rules.renta_efectiva(p) == pytest.approx(1_000_000)


def test_renta_independiente_sin_historial_usa_manual():
    assert rules.renta_efectiva(perfil(situacion_laboral="independiente")) == 1_000_000


def test_tope_endeudamiento_exacto_10x_cumple():
    assert rules.cumple_tope_endeudamiento(10_000_000, 1_000_000) is True


def test_tope_endeudamiento_sobre_10x_no_cumple():
    assert rules.cumple_tope_endeudamiento(10_000_001, 1_000_000) is False


def test_tope_cuota_25_pct():
    assert rules.cumple_tope_cuota(250_000, 1_000_000) is True
    assert rules.cumple_tope_cuota(250_001, 1_000_000) is False


def test_renta_invalida():
    with pytest.raises(ValueError):
        rules.cumple_tope_cuota(1, 0)
