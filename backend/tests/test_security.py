"""Tests de seguridad y privacidad (hallazgos CRIT-001/002/003, MAJ-006/008)."""
import logging
import sqlite3

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import config, main
from app.db.session import DATABASE_URL
from app.main import app
from app.middleware import RateLimitMiddleware
from tests.test_api import PAYLOAD
from tests.test_pdf import texto_pdf

client = TestClient(app)

CARGAS = ["<b>x", "</para><para>", "<font size=99999999>a", "<img src='http://127.0.0.1:9/x.png'/>",
          "<img src='file:///c:/windows/win.ini'/>", "&nbsp;<a href='javascript:alert(1)'>x</a>"]


def _payload_con_fuera(inst):
    return {"acepta_terminos": True, "perfil": {"renta_liquida": 400_000},
            "deudas": [{"institucion": inst, "monto_actual": 2_000_000, "tasa_mensual": 0.02, "cuota_actual": 50_000, "plazo_restante_meses": 60},
                       {"institucion": "B", "monto_actual": 1_000_000, "tasa_mensual": 0.025, "cuota_actual": 47_800, "plazo_restante_meses": 30}],
            "ofertas": [{"institucion": inst, "tasa_mensual": 0.012, "plazo_max_meses": 24}]}


@pytest.mark.parametrize("carga", CARGAS)
def test_pdf_no_interpreta_marcado_del_usuario(carga):
    r = client.post("/api/informe", json=_payload_con_fuera(carga))
    assert r.status_code == 200
    assert r.content.startswith(b"%PDF")


def test_pdf_muestra_el_texto_literal_escapado():
    r = client.post("/api/informe", json=_payload_con_fuera("<b>negrita"))
    assert "<b>negrita" in texto_pdf(r.content)


def test_limite_de_ofertas_y_deudas():
    ofertas = [{"institucion": f"o{i}", "tasa_mensual": 0.01, "plazo_max_meses": 60} for i in range(config.MAX_OFERTAS + 1)]
    assert client.post("/api/simular", json={**PAYLOAD, "ofertas": ofertas}).status_code == 422
    deudas = [PAYLOAD["deudas"][0]] * (config.MAX_DEUDAS + 1)
    assert client.post("/api/simular", json={**PAYLOAD, "deudas": deudas}).status_code == 422


def test_ofertas_del_cliente_quedan_marcadas_como_usuario():
    ofertas = [{"institucion": "Mi banco", "tasa_mensual": 0.01, "plazo_max_meses": 60, "fuente": "sernac"}]
    r = client.post("/api/simular", json={**PAYLOAD, "ofertas": ofertas}).json()
    assert r["fuente_ofertas"] == "usuario"  # el cliente no puede hacerse pasar por SERNAC


def test_resultado_con_semilla_lo_declara():
    r = client.post("/api/simular", json=PAYLOAD).json()
    assert r["fuente_ofertas"] in {"ilustrativas", "sernac"}
    assert r["aviso_ofertas"]


def test_exige_consentimiento_expreso():
    sin = {k: v for k, v in PAYLOAD.items() if k != "acepta_terminos"}
    assert client.post("/api/simular", json=sin).status_code == 422
    assert client.post("/api/informe", json=sin).status_code == 422


def test_rate_limit_devuelve_429():
    mini = FastAPI()
    mini.add_middleware(RateLimitMiddleware, limite_por_minuto=3)

    @mini.get("/x")
    def x():
        return {"ok": 1}

    c = TestClient(mini)
    codigos = [c.get("/x").status_code for _ in range(5)]
    assert codigos[:3] == [200, 200, 200] and codigos[3] == 429
    assert "retry-after" in c.get("/x").headers


def test_errores_422_no_devuelven_el_valor_enviado_y_estan_en_espanol():
    r = client.post("/api/simular", json={"acepta_terminos": True, "perfil": {"renta_liquida": "1234567-secreto"}, "deudas": []})
    assert r.status_code == 422
    assert "1234567-secreto" not in r.text
    assert "válid" in r.text.lower()


def test_cabeceras_de_seguridad():
    h = client.get("/health").headers
    assert h["x-content-type-options"] == "nosniff"
    assert h["x-frame-options"] == "DENY"
    assert "default-src 'none'" in h["content-security-policy"]
    assert h["referrer-policy"] == "no-referrer"
    assert h["cache-control"] == "no-store"


def test_https_forzado_redirige(monkeypatch):
    monkeypatch.setattr(config, "FORCE_HTTPS", True)
    r = TestClient(main.crear_app(), follow_redirects=False).get("/health", headers={"x-forwarded-proto": "http"})
    assert r.status_code in {307, 308}


def test_no_se_persisten_ni_se_loguean_datos_del_usuario(caplog):
    caplog.set_level(logging.DEBUG)
    renta, monto = 7_654_321, 6_543_210
    payload = {"acepta_terminos": True, "perfil": {"renta_liquida": renta},
               "deudas": [{"institucion": "Centinela", "monto_actual": monto, "tasa_mensual": 0.02, "cuota_actual": 346_000, "plazo_restante_meses": 24}]}
    assert client.post("/api/simular", json=payload).status_code == 200
    assert client.post("/api/informe", json=payload).status_code == 200
    con = sqlite3.connect(DATABASE_URL.replace("sqlite:///", ""))
    for (tabla,) in con.execute("select name from sqlite_master where type='table'").fetchall():
        volcado = str(con.execute(f"select * from {tabla}").fetchall())
        assert str(renta) not in volcado and str(monto) not in volcado and "Centinela" not in volcado
    assert str(renta) not in caplog.text and str(monto) not in caplog.text and "Centinela" not in caplog.text


def test_inyeccion_sql_y_xss_en_campos_de_texto_son_inertes():
    inst = "x'; DROP TABLE ofertas; --<script>alert(1)</script>"
    p = {**PAYLOAD, "deudas": [{**PAYLOAD["deudas"][0], "institucion": inst}]}
    client.get("/api/ofertas")  # asegura que la tabla exista
    r = client.post("/api/simular", json=p)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/json")  # JSON, nunca HTML
    con = sqlite3.connect(DATABASE_URL.replace("sqlite:///", ""))
    assert con.execute("select count(*) from sqlite_master where name='ofertas'").fetchone()[0] == 1


def test_scrape_exige_token_y_limita_frecuencia(monkeypatch):
    llamadas = []

    async def falso():
        llamadas.append(1)

    monkeypatch.setattr(main, "_correr_scrape", falso)
    main._estado_scrape["ultimo"] = None
    assert client.post("/api/admin/scrape", headers={"x-admin-token": "malo"}).status_code == 401
    assert client.post("/api/admin/scrape", headers={"x-admin-token": "token-de-prueba"}).status_code == 202
    assert client.post("/api/admin/scrape", headers={"x-admin-token": "token-de-prueba"}).status_code == 429


def test_indicadores_no_inventa_tasa_de_sistema(monkeypatch):
    from app.scrapers.indicadores_parser import Indicadores
    from app.services import indicadores

    async def falso():
        return Indicadores(uf=38_000.0, utm=67_000.0, fecha="2026-09-28")

    monkeypatch.setattr(indicadores, "obtener_indicadores", falso)
    assert client.get("/api/indicadores").json()["tasa_sistema_referencial_mensual"] is None
