"""Scraper del Comparador de créditos de consumo del SERNAC (informe público de Power BI).

La fuente es oficial: cada institución informa sus simulaciones al SERNAC. El scraper hace UNA petición al mismo endpoint que usa
la página pública, decodifica el formato comprimido de Power BI y valida cada fila antes de publicarla.
"""
import base64
import json

import pytest

from app.scrapers import sernac_powerbi as sp

COLUMNAS = ["institucion", "monto", "cuotas", "seguro", "cuota", "tasa", "total_interes", "gastos", "cae", "ctc", "fecha_carga"]

# Respuesta real (recortada) del informe del SERNAC del 29-09-2026: 3 filas comprimidas con máscara de repetición.
RESPUESTA = {"results": [{"result": {"data": {"dsr": {"DS": [{
    "ValueDicts": {"D0": ["AHORROCOOP"], "D1": ["No", "Sí"]},
    "PH": [{"DM0": [
        {"C": [0, 500000, 12, 0, 48572, 1.98, 68564, 14300, 29.301775829432, 582864, 1790671514040],
         "S": [{"DN": "D0", "N": "G0", "T": 1}, {"N": "G1", "T": 4}, {"N": "G2", "T": 4}, {"DN": "D1", "N": "G3", "T": 1}, {"N": "G4", "T": 4},
               {"N": "G5", "T": 3}, {"N": "G6", "T": 4}, {"N": "G7", "T": 4}, {"N": "G8", "T": 3}, {"N": "G9", "T": 4}, {"N": "G10", "T": 7}]},
        {"C": [1, 49857, 70382, 34.500145330958, 598284], "R": 1191},
        {"C": [24, 0, 27130, 136820, 26.762701756361, 651120], "R": 1187},
    ]}]}]}}}}]}


def test_decodifica_el_formato_comprimido_de_power_bi():
    filas = sp.decodificar_dsr(RESPUESTA, COLUMNAS)
    assert len(filas) == 3
    assert filas[0] == {"institucion": "AHORROCOOP", "monto": 500000, "cuotas": 12, "seguro": "No", "cuota": 48572, "tasa": 1.98,
                        "total_interes": 68564, "gastos": 14300, "cae": 29.301775829432, "ctc": 582864, "fecha_carga": 1790671514040}
    # la segunda repite institución, monto, cuotas, tasa y gastos (bits de R)
    assert filas[1]["institucion"] == "AHORROCOOP" and filas[1]["seguro"] == "Sí" and filas[1]["cuota"] == 49857
    assert filas[2]["cuotas"] == 24 and filas[2]["seguro"] == "No" and filas[2]["ctc"] == 651120


def test_decodificador_rechaza_respuestas_con_error():
    with pytest.raises(sp.ScrapeSernacError):
        sp.decodificar_dsr({"results": [{"result": {"error": {"code": "x"}}}]}, COLUMNAS)
    with pytest.raises(sp.ScrapeSernacError):
        sp.decodificar_dsr({}, COLUMNAS)


def _html(url_r):
    return f'<html><iframe title="ComConsumo" src="https://app.powerbi.com/view?r={url_r}" width="100%"></iframe></html>'


def test_extrae_la_clave_publica_del_iframe_de_la_pagina():
    clave = {"k": "968cbe81-2caa-436d-a669-1eaade744dc8", "t": "7eb8b20a-0f87-4ae8-a73d-14b473245ee0"}
    r = base64.b64encode(json.dumps(clave).encode()).decode().rstrip("=")
    url, k = sp.extraer_clave_powerbi(_html(r))
    assert k == clave["k"] and url.startswith("https://app.powerbi.com/view?r=")


def test_sin_iframe_de_power_bi_falla_con_mensaje_claro():
    with pytest.raises(sp.ScrapeSernacError) as e:
        sp.extraer_clave_powerbi("<html>sin iframe</html>")
    assert "cambió la página" in str(e.value).lower()


def fila(**kw):
    base = dict(institucion="BANCO BICE", monto=2_000_000, cuotas=48, seguro="Sí", cuota=57_723, tasa=1.19, total_interes=679_762,
                gastos=18_228, cae=17.01, ctc=2_770_704, fecha_carga=1790671514040)
    base.update(kw)
    return base


def test_normaliza_filas_validas():
    n = sp.normalizar([fila()])
    assert n.descartadas == []
    s = n.simulaciones[0]
    assert s["institucion"] == "BANCO BICE" and s["seguro"] is True and s["tasa"] == 1.19


@pytest.mark.parametrize("cambio,motivo", [
    (dict(cae=0.39, tasa=2.90), "cae"),                  # dato real de la fuente: CAE 0,39% con tasa 2,9% mensual es imposible
    (dict(tasa=0), "tasa"), (dict(tasa=9.0), "tasa"),
    (dict(ctc=5_000_000), "ctc"),                        # CTC no calza con cuota × cuotas
    (dict(monto=-1), "monto"), (dict(cuotas=0), "cuotas"),
    (dict(seguro="Quizás"), "seguro"), (dict(institucion=""), "institucion"),
])
def test_descarta_filas_inconsistentes_con_el_motivo(cambio, motivo):
    n = sp.normalizar([fila(**cambio)])
    assert n.simulaciones == []
    assert motivo in n.descartadas[0]["motivo"].lower()


def test_no_descarta_cae_menor_al_efecto_de_la_tasa_porque_cada_institucion_lo_calcula_a_su_manera():
    # Dato real: AHORROCOOP informa tasa 1,98% mensual (26,5% anual efectivo) y CAE 25,27%.
    n = sp.normalizar([fila(institucion="AHORROCOOP", tasa=1.98, cae=25.27, cuotas=24, monto=1_000_000, cuota=53_506, ctc=1_284_144)])
    assert len(n.simulaciones) == 1 and n.descartadas == []


def test_fecha_de_actualizacion_es_la_mas_reciente_de_la_fuente():
    n = sp.normalizar([fila(fecha_carga=1790671514040), fila(institucion="OTRO", fecha_carga=1790671514143)])
    assert n.fecha_carga == "2026-09-29"


def test_documento_final_cita_la_fuente_y_es_valido():
    n = sp.normalizar([fila(), fila(institucion="OTRO", tasa=1.5, cae=20.0, cuota=60_000, ctc=2_880_000)])
    doc = sp.construir_documento(n, obtenido="2026-09-29T17:00:00Z")
    assert doc["version"] == 2
    assert "SERNAC" in doc["fuente"] and doc["url_fuente"].startswith("https://www.sernac.cl")
    assert doc["actualizado"] == "2026-09-29" and doc["obtenido"] == "2026-09-29T17:00:00Z"
    assert "referenciales" in doc["aviso"].lower()
    assert "ctc" in doc["nota_cae"].lower()
    assert doc["columnas"] == ["institucion", "monto", "cuotas", "seguro", "cuota", "tasaMensual", "totalInteres", "gastos", "cae", "ctc"]
    assert doc["simulaciones"][0] == ["BANCO BICE", 2_000_000, 48, 1, 57_723, 1.19, 679_762, 18_228, 17.01, 2_770_704]


def test_lote_sospechosamente_chico_no_se_publica():
    with pytest.raises(sp.ScrapeSernacError):
        sp.validar_documento(sp.construir_documento(sp.normalizar([fila()]), obtenido="2026-09-29T17:00:00Z"))


def test_la_consulta_pide_todas_las_columnas_sin_filtros():
    q = sp.construir_consulta(COLUMNAS_FUENTE := sp.COLUMNAS_FUENTE)
    texto = json.dumps(q, ensure_ascii=False)
    for prop in ["Institución", "Monto solicitado", "N ° cuotas", "valor_cuota", "tasa_interes", "cae", "CTC", "fecha_carga"]:
        assert prop in texto
    assert '"Where"' not in texto
    assert len(COLUMNAS_FUENTE) == 11
