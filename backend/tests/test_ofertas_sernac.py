"""Ofertas de mercado = simulaciones OFICIALES del Comparador de créditos de consumo del SERNAC (sin datos inventados)."""
import json
from datetime import date, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.engine import finance
from app.engine.simulator import simular
from app.main import app
from app.schemas import Perfil, SimulacionRequest
from app.services import offers

FIXTURE = Path(__file__).parent / "fixtures" / "sernac_subset.json"
DOC = json.loads(FIXTURE.read_text(encoding="utf-8"))
client = TestClient(app)


def test_documento_valido_se_carga_y_se_valida():
    assert offers.validar_documento(DOC)["version"] == 2


@pytest.mark.parametrize("cambio", [dict(version=1), dict(actualizado=None), dict(url_fuente=""), dict(simulaciones=[])])
def test_documentos_invalidos_se_rechazan(cambio):
    assert offers.validar_documento({**DOC, **cambio}) is None


def test_ofertas_calibradas_al_costo_total_informado_por_la_institucion():
    ofertas, ref = offers.ofertas_desde_documento(DOC, monto=5_000_000)
    assert ref == (5_000_000, 48)
    bice = next(o for o in ofertas if o.institucion == "Banco BICE")
    assert bice.tasa_mensual == pytest.approx(0.0117)
    assert bice.fuente == "sernac" and bice.fecha_datos == "2026-09-29"
    assert bice.comision == pytest.approx(43_300)                  # "Total gastos" informado
    cuota = finance.cuota_francesa(5_000_000, bice.tasa_mensual, 48, bice.seguro_desgravamen)
    assert cuota * 48 + bice.comision == pytest.approx(6_893_328, abs=2)   # CTC informado


def test_todas_las_instituciones_del_monto_y_plazo_de_referencia():
    ofertas, _ = offers.ofertas_desde_documento(DOC, monto=5_000_000)
    assert {o.institucion for o in ofertas} == {"Banco BICE", "Santander Chile", "BancoEstado", "Banco Chile"}
    assert all(12 <= o.plazo_max_meses <= 60 for o in ofertas)


def test_la_comision_se_escala_al_monto_pero_la_tasa_no():
    a, _ = offers.ofertas_desde_documento(DOC, monto=5_000_000)
    b, ref = offers.ofertas_desde_documento(DOC, monto=4_000_000)
    assert ref[0] == 5_000_000
    bice_a = next(o for o in a if o.institucion == "Banco BICE")
    bice_b = next(o for o in b if o.institucion == "Banco BICE")
    assert bice_b.comision == pytest.approx(bice_a.comision * 0.8)
    assert bice_b.tasa_mensual == bice_a.tasa_mensual


def test_sin_simulaciones_cercanas_al_monto_no_hay_ofertas():
    assert offers.ofertas_desde_documento(DOC, monto=30_000_000) == ([], None)


def test_sin_seguro_usa_las_simulaciones_sin_seguro():
    con, _ = offers.ofertas_desde_documento(DOC, monto=5_000_000, seguro=True)
    sin, _ = offers.ofertas_desde_documento(DOC, monto=5_000_000, seguro=False)
    b_con = next(o for o in con if o.institucion == "Banco BICE")
    b_sin = next(o for o in sin if o.institucion == "Banco BICE")
    assert b_sin.seguro_desgravamen <= b_con.seguro_desgravamen


def test_obtener_ofertas_cita_fuente_fecha_y_es_referencial(tmp_path):
    ruta = tmp_path / "doc.json"
    ruta.write_text(json.dumps({**DOC, "actualizado": date.today().isoformat()}), encoding="utf-8")
    ofertas, aviso = offers.obtener_ofertas(5_000_000, ruta=ruta)
    assert ofertas
    assert "SERNAC" in aviso and "referenciales" in aviso.lower()
    assert date.today().strftime("%d-%m-%Y") in aviso


def test_datos_viejos_se_usan_pero_con_advertencia(tmp_path):
    vieja = (date.today() - timedelta(days=200)).isoformat()
    ruta = tmp_path / "doc.json"
    ruta.write_text(json.dumps({**DOC, "actualizado": vieja}), encoding="utf-8")
    ofertas, aviso = offers.obtener_ofertas(5_000_000, ruta=ruta)
    assert ofertas and "desactualizad" in aviso.lower()


def test_sin_archivo_no_se_inventa_nada(tmp_path):
    ofertas, aviso = offers.obtener_ofertas(5_000_000, ruta=tmp_path / "no_existe.json")
    assert ofertas == [] and "no hay tasas de mercado" in aviso.lower()


def test_monto_fuera_de_lo_publicado_lo_explica(tmp_path):
    ruta = tmp_path / "doc.json"
    ruta.write_text(json.dumps(DOC), encoding="utf-8")
    ofertas, aviso = offers.obtener_ofertas(30_000_000, ruta=ruta)
    assert ofertas == [] and "no hay simulaciones publicadas" in aviso.lower()


def test_guardar_documento_es_atomico_y_rechaza_documentos_invalidos(tmp_path):
    ruta = tmp_path / "doc.json"
    offers.guardar_documento(DOC, ruta=ruta)
    assert json.loads(ruta.read_text(encoding="utf-8"))["actualizado"] == "2026-09-29"
    with pytest.raises(ValueError):
        offers.guardar_documento({**DOC, "simulaciones": []}, ruta=ruta)
    assert json.loads(ruta.read_text(encoding="utf-8"))["actualizado"] == "2026-09-29"   # no se pisó


def test_simulacion_usa_ofertas_reales_y_lo_declara(perfil, deuda_factory):
    r = simular(SimulacionRequest(perfil=perfil, deudas=[deuda_factory(monto_actual=5_000_000, tasa_mensual=0.03, cuota_actual=200_000, plazo_restante_meses=32)],
                                  ofertas=offers.ofertas_desde_documento(DOC, 5_000_000)[0]))
    assert r.fuente_ofertas == "sernac"
    assert "29-09-2026" in r.aviso_ofertas and "SERNAC" in r.aviso_ofertas
    assert r.estado == "OK"
    assert {p.institucion for p in r.propuesta.prestamos} <= {"Banco BICE", "Santander Chile", "BancoEstado", "Banco Chile"}


def test_api_sin_ofertas_del_cliente_usa_el_archivo_oficial():
    payload = {"acepta_terminos": True, "perfil": {"renta_liquida": 3_000_000},
               "deudas": [{"institucion": "Mi banco", "tipo": "consumo", "monto_actual": 5_000_000, "tasa_mensual": 0.03, "cuota_actual": 200_000, "plazo_restante_meses": 32}]}
    r = client.post("/api/simular", json=payload).json()
    assert r["fuente_ofertas"] == "sernac"
    assert "SERNAC" in r["aviso_ofertas"]


def test_endpoint_de_ofertas_cita_fuente():
    r = client.get("/api/ofertas", params={"monto": 5_000_000}).json()
    assert r["fuente"].startswith("SERNAC") and r["url_fuente"].startswith("https://www.sernac.cl")
    assert r["actualizado"] == "2026-09-29"
    assert r["ofertas"] and "aviso" in r
