"""Tests de la parte pura de los scrapers (parseo/normalización). El navegador real no se usa en CI."""
import pytest

from app.scrapers import indicadores_parser, pdf_boletines, sernac


@pytest.mark.parametrize("txt,esperado", [("1,85%", 0.0185), ("2.10 %", 0.021), ("  0,9%", 0.009), ("3", 0.03)])
def test_parsear_tasa(txt, esperado):
    assert sernac.parsear_tasa(txt) == pytest.approx(esperado)


@pytest.mark.parametrize("txt", ["", "n/d", "abc"])
def test_parsear_tasa_invalida(txt):
    assert sernac.parsear_tasa(txt) is None


def test_parsear_monto_clp():
    assert sernac.parsear_monto("$1.234.567") == 1_234_567
    assert sernac.parsear_monto("") is None


@pytest.mark.parametrize("crudo,esperado", [
    ("BANCO DE CHILE ", "Banco de Chile"),
    ("banco santander-chile", "Banco Santander"),
    ("Scotiabank Chile", "Scotiabank"),
    ("BANCOESTADO", "BancoEstado"),
    ("Falabella CMR", "Banco Falabella"),
])
def test_normalizar_institucion(crudo, esperado):
    assert sernac.normalizar_institucion(crudo) == esperado


def test_normalizar_filas_descarta_invalidas_y_deduplica():
    filas = [
        {"institucion": "BANCO DE CHILE", "tasa": "1,50%", "plazo": "60"},
        {"institucion": "Banco de Chile", "tasa": "1,40%", "plazo": "48"},   # duplicada: gana la menor tasa
        {"institucion": "Otro", "tasa": "n/d", "plazo": "12"},              # sin tasa: se descarta
    ]
    ofertas = sernac.normalizar_filas(filas)
    assert len(ofertas) == 1
    assert ofertas[0].institucion == "Banco de Chile"
    assert ofertas[0].tasa_mensual == pytest.approx(0.014)
    assert ofertas[0].fuente == "sernac"


def test_extraer_filas_de_tabla_html():
    html = """<table><tr><th>Institución</th><th>Tasa mensual</th><th>Plazo máximo</th></tr>
    <tr><td>Banco X</td><td>1,2%</td><td>72</td></tr></table>"""
    assert sernac.extraer_filas_html(html) == [{"institucion": "Banco X", "tasa": "1,2%", "plazo": "72"}]


def test_parse_indicadores_mindicador():
    data = {"uf": {"valor": 38_500.5}, "utm": {"valor": 67_000}, "fecha": "2026-09-28T03:00:00.000Z"}
    ind = indicadores_parser.parse_indicadores(data)
    assert ind.uf == 38_500.5 and ind.utm == 67_000 and ind.fecha == "2026-09-28"


def test_parse_indicadores_incompleto():
    assert indicadores_parser.parse_indicadores({}).uf is None


def test_filas_desde_tablas_pdf():
    tablas = [[["Institución", "Tasa promedio mensual", "Plazo"], ["Banco Y", "1,7%", "48"], [None, None, None]]]
    assert pdf_boletines.filas_desde_tablas(tablas) == [{"institucion": "Banco Y", "tasa": "1,7%", "plazo": "48"}]
