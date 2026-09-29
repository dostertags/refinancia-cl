"""Hallazgo MAJ-003: robustez y cortesía del scraper (parte pura, sin navegador)."""
import pytest

from app.scrapers import sernac
from app.scrapers.robustez import ScrapeError, con_reintentos, permitido_por_robots, validar_lote


def test_robots_bloquea_ruta_prohibida():
    robots = "User-agent: *\nDisallow: /portal/619/\n"
    assert permitido_por_robots(robots, sernac.URL_SERNAC, "RefinanciaCL-bot") is False


def test_robots_vacio_o_permisivo_permite():
    assert permitido_por_robots("", sernac.URL_SERNAC, "RefinanciaCL-bot") is True
    assert permitido_por_robots("User-agent: *\nDisallow: /admin/\n", sernac.URL_SERNAC, "RefinanciaCL-bot") is True


async def test_reintentos_con_backoff_exponencial():
    esperas, intentos = [], []

    async def dormir(s):
        esperas.append(s)

    async def flaky():
        intentos.append(1)
        if len(intentos) < 3:
            raise RuntimeError("caído")
        return "ok"

    assert await con_reintentos(flaky, intentos=4, base_s=2, dormir=dormir) == "ok"
    assert esperas == [2, 4]


async def test_reintentos_se_rinde_y_propaga():
    async def dormir(s):
        pass

    async def siempre():
        raise RuntimeError("caído")

    with pytest.raises(RuntimeError):
        await con_reintentos(siempre, intentos=3, base_s=1, dormir=dormir)


def test_normalizar_descarta_tasas_implausibles():
    filas = [{"institucion": "A", "tasa": "50%", "plazo": "60"}, {"institucion": "B", "tasa": "1,4%", "plazo": "60"}]
    assert [o.institucion for o in sernac.normalizar_filas(filas)] == ["B"]


def test_oferta_sin_plazo_asume_tope_y_marca_comision_desconocida():
    o = sernac.normalizar_filas([{"institucion": "A", "tasa": "1,4%", "plazo": ""}])[0]
    assert o.plazo_max_meses == 60
    assert o.comision_conocida is False and o.fuente == "sernac"


def test_validar_lote_rechaza_lote_sospechosamente_chico():
    with pytest.raises(ScrapeError):
        validar_lote([])
    with pytest.raises(ScrapeError):
        validar_lote(sernac.normalizar_filas([{"institucion": "A", "tasa": "1,4%", "plazo": "60"}]))


def test_extrae_filas_de_grilla_aria_estilo_powerbi():
    html = """<div role="grid"><div role="row"><div role="columnheader">Institución</div><div role="columnheader">Tasa mensual</div>
    <div role="columnheader">Plazo</div></div>
    <div role="row"><div role="gridcell">Banco Z</div><div role="gridcell">1,3%</div><div role="gridcell">48</div></div></div>"""
    assert sernac.extraer_filas_html(html) == [{"institucion": "Banco Z", "tasa": "1,3%", "plazo": "48"}]


def test_layout_desconocido_da_cero_filas():
    assert sernac.extraer_filas_html("<div>nada de tablas</div>") == []
