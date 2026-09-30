"""UF / UTM del día (mindicador.cl) sin red."""
import httpx
import pytest

from app.services import indicadores


async def test_indicadores_ok_y_cache():
    indicadores._cache.update(t=0.0, ind=None)
    cuenta = {"n": 0}

    def handler(req):
        cuenta["n"] += 1
        return httpx.Response(200, json={"uf": {"valor": 38_000.5}, "utm": {"valor": 67_000}, "fecha": "2026-09-28T03:00:00.000Z"})

    ind = await indicadores.obtener_indicadores(transport=httpx.MockTransport(handler))
    assert ind.uf == 38_000.5
    await indicadores.obtener_indicadores(transport=httpx.MockTransport(handler))
    assert cuenta["n"] == 1  # la segunda llamada sale de la caché


async def test_indicadores_falla_de_red_devuelve_none():
    indicadores._cache.update(t=0.0, ind=None)
    assert await indicadores.obtener_indicadores(transport=httpx.MockTransport(lambda r: httpx.Response(500))) is None
