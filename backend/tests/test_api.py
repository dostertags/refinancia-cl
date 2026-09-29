"""Tests de integración de la API FastAPI (sin red: ofertas desde semilla, UF inyectada)."""
import pytest
from fastapi.testclient import TestClient

from app import main
from app.main import app
from app.services import indicadores

client = TestClient(app)

PAYLOAD = {
    "acepta_terminos": True,
    "perfil": {"renta_liquida": 1_500_000, "region": "Metropolitana", "situacion_laboral": "dependiente"},
    "deudas": [{"institucion": "Banco A", "tipo": "consumo", "monto_actual": 3_000_000, "tasa_mensual": 0.03,
                "cuota_actual": 153_000, "plazo_restante_meses": 30}],
}


def test_health():
    assert client.get("/health").json() == {"status": "ok"}


def test_ofertas_devuelve_semilla_marcada_como_ilustrativa():
    r = client.get("/api/ofertas")
    assert r.status_code == 200
    assert len(r.json()["ofertas"]) > 0
    assert "aviso" in r.json()


def test_simular_usa_ofertas_en_cache_si_no_se_envian():
    r = client.post("/api/simular", json=PAYLOAD)
    assert r.status_code == 200
    data = r.json()
    assert data["estado"] in {"OK", "NO_CONVIENE"}
    assert "no constituye una oferta de crédito" in data["disclaimer"]


def test_simular_valida_entrada():
    bad = {**PAYLOAD, "perfil": {"renta_liquida": -5}}
    assert client.post("/api/simular", json=bad).status_code == 422


def test_simular_uf_usa_indicador_del_dia(monkeypatch):
    async def fake_uf():
        return 40_000.0
    monkeypatch.setattr(indicadores, "obtener_uf", fake_uf)
    payload = {**PAYLOAD, "deudas": [{**PAYLOAD["deudas"][0], "moneda": "UF", "monto_actual": 75, "cuota_actual": 3.8}]}
    r = client.post("/api/simular", json=payload)
    assert r.status_code == 200
    assert r.json()["situacion_actual"]["deuda_total"] == 3_000_000


def test_simular_uf_sin_indicador_da_error_claro(monkeypatch):
    async def fake_uf():
        return None
    monkeypatch.setattr(indicadores, "obtener_uf", fake_uf)
    payload = {**PAYLOAD, "deudas": [{**PAYLOAD["deudas"][0], "moneda": "UF", "monto_actual": 75, "cuota_actual": 3.8}]}
    assert client.post("/api/simular", json=payload).status_code == 503


def test_informe_pdf():
    r = client.post("/api/informe", json=PAYLOAD)
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF")


def test_scrape_requiere_token():
    assert client.post("/api/admin/scrape").status_code in {401, 403}


def test_simular_modo_cuota_y_objetivo_invalido():
    ok = client.post("/api/simular", json={**PAYLOAD, "objetivo": "cuota", "tarjetas_mas_de_24": True})
    assert ok.status_code == 200
    assert client.post("/api/simular", json={**PAYLOAD, "objetivo": "otro"}).status_code == 422
