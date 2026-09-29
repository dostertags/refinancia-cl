"""Servicios: ofertas (BD + frescura) e indicadores (UF/UTM) sin red."""
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from sqlalchemy import delete

from app import config
from app.db.models import OfertaDB
from app.db.session import SessionLocal, init_db
from app.schemas import Oferta
from app.services import indicadores, offers


@pytest.fixture(autouse=True)
def limpiar_bd():
    init_db()
    with SessionLocal() as s:
        s.execute(delete(OfertaDB))
        s.commit()
    yield


def of(nombre, tasa=0.015):
    return Oferta(institucion=nombre, tasa_mensual=tasa, plazo_max_meses=60, fuente="sernac", comision_conocida=False)


def test_sin_datos_scrapeados_cae_a_semilla_con_aviso():
    lista, aviso = offers.obtener_ofertas()
    assert all(o.fuente == "seed" for o in lista)
    assert "ILUSTRATIVAS" in aviso.upper()


def test_guardar_reemplaza_las_ofertas_antiguas():
    offers.guardar_ofertas([of("A"), of("B"), of("C")])
    offers.guardar_ofertas([of("A", 0.012), of("B"), of("C")])
    assert {o.institucion for o in offers.obtener_ofertas()[0]} == {"A", "B", "C"}
    offers.guardar_ofertas([of("A"), of("B"), of("D")])
    assert {o.institucion for o in offers.obtener_ofertas()[0]} == {"A", "B", "D"}


def test_ofertas_scrapeadas_conservan_comision_desconocida():
    offers.guardar_ofertas([of("A"), of("B"), of("C")])
    assert all(o.comision_conocida is False for o in offers.obtener_ofertas()[0])


def test_ofertas_viejas_se_descartan_y_vuelve_la_semilla():
    offers.guardar_ofertas([of("A"), of("B"), of("C")])
    vieja = datetime.now(timezone.utc) - timedelta(days=config.MAX_EDAD_OFERTAS_DIAS + 1)
    with SessionLocal() as s:
        for f in s.query(OfertaDB).all():
            f.actualizado = vieja.replace(tzinfo=None)
        s.commit()
    lista, aviso = offers.obtener_ofertas()
    assert all(o.fuente == "seed" for o in lista)
    assert "desactualizad" in aviso.lower()


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
