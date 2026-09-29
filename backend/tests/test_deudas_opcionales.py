"""Reglas acordadas para RefinanciaCL:
 - Crédito/línea: monto y cuota obligatorios + (tasa o meses restantes, al menos uno; se calcula el que falte).
 - Tarjeta: saldo obligatorio + (pago mensual o tasa, al menos uno; con supuesto de 24 meses).
 - Casilla `incluir` (por defecto sí): lo excluido cuenta en "hoy" y en la cuota nueva, pero no en el total a refinanciar.
"""
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.engine import finance
from app.engine.deudas import resolver_deudas
from app.engine.optimizer import optimizar
from app.engine.simulator import simular
from app.main import app
from app.schemas import Deuda, Perfil, SimulacionRequest

client = TestClient(app)


def D(**kw):
    base = dict(institucion="Banco X", tipo="consumo", monto_actual=3_000_000, tasa_mensual=0.03, cuota_actual=153_000, plazo_restante_meses=31)
    base.update(kw)
    return Deuda(**base)


def req(perfil, deudas, ofertas, **kw):
    return SimulacionRequest(perfil=perfil, deudas=deudas, ofertas=ofertas, **kw)


# ---- Funciones financieras ---------------------------------------------------------------------

def test_tasa_desde_meses_ida_y_vuelta():
    assert finance.tasa_desde_meses(1_000_000, finance.cuota_francesa(1_000_000, 0.02, 24), 24) == pytest.approx(0.02, abs=1e-6)


def test_tasa_desde_meses_casos_borde():
    assert finance.tasa_desde_meses(1_200_000, 100_000, 12) == 0
    assert finance.tasa_desde_meses(3_000_000, 50_000, 12) is None          # no alcanza a pagar el saldo
    assert finance.tasa_desde_meses(1_000_000, 500_000, 3) is None          # implicaría más de 20% mensual


def test_meses_desde_cuota():
    assert finance.meses_desde_cuota(1_000_000, 0.015, 49_924) in (24, 25)
    assert finance.meses_desde_cuota(1_000_000, 0.02, 20_000) is None       # ni cubre los intereses
    assert finance.meses_desde_cuota(1_200_000, 0, 100_000) == 12


# ---- Validación del esquema (obligatorio / al menos uno) --------------------------------------------

def test_credito_sin_tasa_ni_meses_se_rechaza_con_mensaje_claro():
    with pytest.raises(ValidationError) as e:
        D(tasa_mensual=None, plazo_restante_meses=None)
    assert "tasa de interés o los meses que te faltan" in str(e.value)


@pytest.mark.parametrize("kw", [dict(tasa_mensual=None), dict(plazo_restante_meses=None)])
def test_credito_con_tasa_o_meses_es_valido(kw):
    D(**kw)


def test_credito_sin_cuota_se_rechaza():
    with pytest.raises(ValidationError) as e:
        D(cuota_actual=None)
    assert "cuota" in str(e.value).lower()


def test_tarjeta_sin_pago_ni_tasa_se_rechaza():
    with pytest.raises(ValidationError) as e:
        D(tipo="tarjeta", institucion="Ripley", cuota_actual=None, tasa_mensual=None, plazo_restante_meses=None)
    assert "Ripley" in str(e.value) and "pago mensual o su tasa" in str(e.value)


@pytest.mark.parametrize("kw", [dict(cuota_actual=100_000, tasa_mensual=None), dict(cuota_actual=None, tasa_mensual=0.035)])
def test_tarjeta_con_pago_o_tasa_es_valida(kw):
    D(tipo="tarjeta", monto_actual=2_000_000, plazo_restante_meses=None, **kw)


def test_incluir_es_verdadero_por_defecto():
    assert D().incluir is True


# ---- Resolución de datos faltantes -----------------------------------------------------------------------

def test_credito_solo_con_meses_calcula_la_tasa():
    r = resolver_deudas([D(tasa_mensual=None)])
    assert r.problemas == []
    assert r.deudas[0].tasa_mensual == pytest.approx(0.03, abs=0.004)
    assert any("a partir de los meses que le faltan" in s for s in r.supuestos)


def test_credito_solo_con_tasa_calcula_los_meses():
    r = resolver_deudas([D(plazo_restante_meses=None)])
    assert r.deudas[0].plazo_restante_meses in (30, 31)
    assert any("meses que le faltan" in s for s in r.supuestos)


def test_credito_con_ambos_no_agrega_supuestos():
    assert resolver_deudas([D()]).supuestos == []


def test_meses_imposibles_dan_problema():
    r = resolver_deudas([D(tasa_mensual=None, cuota_actual=50_000, plazo_restante_meses=12)])
    assert any("no alcanzas a pagar" in p for p in r.problemas)


def test_tarjeta_con_pago_sin_tasa_supone_24_meses():
    r = resolver_deudas([D(tipo="tarjeta", monto_actual=2_000_000, cuota_actual=100_000, tasa_mensual=None, plazo_restante_meses=None)])
    assert r.problemas == []
    assert r.deudas[0].tasa_mensual > 0
    assert any("24 meses" in s for s in r.supuestos)


def test_tarjeta_con_tasa_sin_pago_calcula_el_pago_a_24_meses():
    r = resolver_deudas([D(tipo="tarjeta", monto_actual=2_000_000, cuota_actual=None, tasa_mensual=0.035, plazo_restante_meses=None)])
    assert r.deudas[0].cuota_actual == pytest.approx(finance.cuota_francesa(2_000_000, 0.035, 24), abs=1)
    assert r.deudas[0].plazo_restante_meses == 24
    assert any("24 meses" in s for s in r.supuestos)


def test_tarjeta_pago_insuficiente_sin_tasa_pide_la_tasa():
    r = resolver_deudas([D(institucion="Ripley", tipo="tarjeta", monto_actual=2_000_000, cuota_actual=30_000, tasa_mensual=None, plazo_restante_meses=None)])
    assert any("Ripley" in p and "necesito su tasa" in p for p in r.problemas)


# ---- Simulador: total a refinanciar, casilla incluir -----------------------------------------------------------

def test_total_a_refinanciar_suma_credito_y_tarjetas(perfil, oferta_factory):
    tarjeta = D(institucion="Falabella", tipo="tarjeta", monto_actual=1_200_000, cuota_actual=60_000, tasa_mensual=0.035, plazo_restante_meses=None)
    r = simular(req(perfil, [D(), tarjeta], [oferta_factory()]))
    assert r.total_a_refinanciar == 4_200_000
    assert [p.institucion for p in r.partes_refinanciar] == ["Banco X", "Falabella"]
    assert r.excluidas == []


def test_deuda_excluida_no_entra_al_total_pero_cuenta_en_hoy_y_en_la_cuota_nueva(perfil, oferta_factory):
    tarjeta = D(institucion="Falabella", tipo="tarjeta", monto_actual=1_200_000, cuota_actual=60_000, tasa_mensual=0.035, plazo_restante_meses=None, incluir=False)
    r = simular(req(perfil, [D(), tarjeta], [oferta_factory()]))
    assert r.total_a_refinanciar == 3_000_000
    assert [e.institucion for e in r.excluidas] == ["Falabella"]
    assert r.situacion_actual.cuota_total == 213_000
    assert r.situacion_actual.deuda_total == 4_200_000
    assert r.propuesta.cuota_total >= 60_000 + r.propuesta.prestamos[0].cuota - 1
    assert not any("Falabella" in p.deudas_incluidas for p in r.propuesta.prestamos)


def test_la_cuota_de_lo_excluido_se_descuenta_del_tope_de_cuota(oferta_factory):
    # renta 800k -> tope 200k. La tarjeta excluida ya consume 190k: el crédito nuevo no cabe.
    p = Perfil(renta_liquida=800_000)
    tarjeta = D(institucion="Falabella", tipo="tarjeta", monto_actual=1_000_000, cuota_actual=190_000, tasa_mensual=0.03, plazo_restante_meses=None, incluir=False)
    r = simular(req(p, [D(monto_actual=1_000_000, cuota_actual=49_000, plazo_restante_meses=24), tarjeta], [oferta_factory()]))
    assert r.estado == "SIN_SOLUCION"


def test_si_todo_queda_excluido_lo_explica(perfil, oferta_factory):
    r = simular(req(perfil, [D(incluir=False)], [oferta_factory()]))
    assert r.estado == "SIN_SOLUCION"
    assert any("incluir" in m.lower() for m in r.mensajes)


def test_supuestos_llegan_al_resultado(perfil, oferta_factory):
    r = simular(req(perfil, [D(tasa_mensual=None)], [oferta_factory()]))
    assert r.estado in {"OK", "NO_CONVIENE"}
    assert any("tasa" in s for s in r.supuestos)


def test_datos_imposibles_dan_datos_inconsistentes(perfil, oferta_factory):
    r = simular(req(perfil, [D(tasa_mensual=None, cuota_actual=50_000, plazo_restante_meses=12)], [oferta_factory()]))
    assert r.estado == "DATOS_INCONSISTENTES"
    assert any("no alcanzas a pagar" in m for m in r.mensajes)


def test_incluir_tarjeta_cara_aumenta_el_ahorro(perfil, oferta_factory):
    tj = dict(institucion="Falabella", tipo="tarjeta", monto_actual=2_000_000, cuota_actual=100_000, tasa_mensual=0.035, plazo_restante_meses=None)
    con = simular(req(perfil, [D(), D(**tj)], [oferta_factory()]))
    sin = simular(req(perfil, [D(), D(**tj, incluir=False)], [oferta_factory()]))
    assert con.propuesta.ahorro_total > sin.propuesta.ahorro_total


# ---- Optimizador con deudas fijas -----------------------------------------------------------------------------------

def test_optimizador_suma_las_fijas_a_la_cuota_y_a_los_totales(oferta_factory):
    fija = D(institucion="Fija", tipo="tarjeta", monto_actual=1_000_000, cuota_actual=60_000, plazo_restante_meses=24, tasa_mensual=0.03)
    solo = optimizar(1_500_000, [D()], [oferta_factory()])
    con = optimizar(1_500_000, [D()], [oferta_factory()], fijas=[fija])
    assert con.cuota_total_nueva == pytest.approx(solo.cuota_total_nueva + 60_000, abs=1)
    assert con.ahorro_total == pytest.approx(solo.ahorro_total, abs=1)         # lo fijo no cambia el ahorro
    assert con.ahorro_mensual == pytest.approx(solo.ahorro_mensual, abs=1)


# ---- API ----------------------------------------------------------------------------------------------------------------

PAYLOAD = {"acepta_terminos": True, "perfil": {"renta_liquida": 1_500_000},
           "deudas": [{"institucion": "Banco A", "tipo": "consumo", "monto_actual": 3_000_000, "cuota_actual": 153_000, "plazo_restante_meses": 31}]}


def test_api_acepta_credito_sin_tasa_pero_con_meses():
    r = client.post("/api/simular", json=PAYLOAD)
    assert r.status_code == 200
    d = r.json()
    assert d["supuestos"] and d["total_a_refinanciar"] == 3_000_000


def test_api_acepta_tarjeta_con_solo_pago_mensual_e_incluir_false():
    p = {**PAYLOAD, "deudas": PAYLOAD["deudas"] + [{"institucion": "Falabella", "tipo": "tarjeta", "monto_actual": 2_000_000, "cuota_actual": 100_000, "incluir": False}]}
    r = client.post("/api/simular", json=p)
    assert r.status_code == 200
    assert r.json()["total_a_refinanciar"] == 3_000_000
    assert [e["institucion"] for e in r.json()["excluidas"]] == ["Falabella"]


def test_api_rechaza_credito_sin_tasa_ni_meses_en_espanol_sin_eco():
    p = {**PAYLOAD, "deudas": [{"institucion": "Banco A", "tipo": "consumo", "monto_actual": 7_654_321, "cuota_actual": 153_000}]}
    r = client.post("/api/simular", json=p)
    assert r.status_code == 422
    assert "tasa de interés o los meses que te faltan" in r.text
    assert "7654321" not in r.text and "Value error" not in r.text


def test_api_rechaza_tarjeta_sin_pago_ni_tasa():
    p = {**PAYLOAD, "deudas": [{"institucion": "Ripley", "tipo": "tarjeta", "monto_actual": 2_000_000}]}
    r = client.post("/api/simular", json=p)
    assert r.status_code == 422
    assert "pago mensual o su tasa" in r.text
