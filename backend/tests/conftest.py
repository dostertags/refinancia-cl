import os
import tempfile

# Aislar la BD de tests ANTES de importar la app (evita crear refinancia.db en el repo).
_TMP = tempfile.mkdtemp(prefix="refinancia_test_")
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP}/test.db"
os.environ.setdefault("RATE_LIMIT_PER_MIN", "1000")
os.environ["ADMIN_TOKEN"] = "token-de-prueba"
os.environ.pop("REDIS_URL", None)

import pytest

from app.schemas import Deuda, Oferta, Perfil


@pytest.fixture
def perfil():
    return Perfil(renta_liquida=1_500_000, region="Metropolitana", situacion_laboral="dependiente")


def mk_deuda(**kw):
    base = dict(institucion="Banco X", tipo="consumo", monto_actual=1_000_000, tasa_mensual=0.03,
                cuota_actual=50_000, plazo_restante_meses=24)
    base.update(kw)
    return Deuda(**base)


def mk_oferta(**kw):
    base = dict(institucion="Oferta Z", tasa_mensual=0.015, plazo_max_meses=48, comision=0, seguro_desgravamen=0.0)
    base.update(kw)
    return Oferta(**base)


@pytest.fixture
def deuda_factory():
    return mk_deuda


@pytest.fixture
def oferta_factory():
    return mk_oferta
