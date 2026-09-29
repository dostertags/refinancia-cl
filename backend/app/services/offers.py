"""Acceso a ofertas del mercado: Redis (caché) -> PostgreSQL -> semilla ilustrativa.

Este módulo NO recibe ni guarda datos del usuario.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Tuple

from sqlalchemy import delete, select

from app import config
from app.db.models import OfertaDB
from app.db.session import SessionLocal, init_db
from app.schemas import Oferta

logger = logging.getLogger("refinancia.offers")
SEED = Path(__file__).resolve().parent.parent / "data" / "ofertas_seed.json"
CACHE_KEY = "refinancia:ofertas:v2"
CACHE_TTL = 24 * 3600
_db_lista = False


def _asegurar_bd() -> None:
    global _db_lista
    if not _db_lista:
        init_db()
        _db_lista = True


def _ahora() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _redis():
    url = os.getenv("REDIS_URL")
    if not url:
        return None
    try:
        import redis
        return redis.Redis.from_url(url, socket_timeout=1)
    except Exception:  # Redis es opcional: si falla, seguimos sin caché
        return None


def _semilla(motivo: str = "") -> Tuple[List[Oferta], str]:
    data = json.loads(SEED.read_text(encoding="utf-8"))
    return [Oferta(**o) for o in data["ofertas"]], (motivo + " " + data["aviso"]).strip()


def guardar_ofertas(ofertas: List[Oferta]) -> None:
    """Reemplaza el conjunto de ofertas de cada fuente (las que ya no están se eliminan: nada queda obsoleto)."""
    _asegurar_bd()
    with SessionLocal() as s:
        for fuente in {o.fuente for o in ofertas}:
            vigentes = {o.institucion for o in ofertas if o.fuente == fuente}
            s.execute(delete(OfertaDB).where(OfertaDB.fuente == fuente, OfertaDB.institucion.not_in(vigentes)))
        for o in ofertas:
            fila = s.scalar(select(OfertaDB).where(OfertaDB.institucion == o.institucion, OfertaDB.fuente == o.fuente))
            campos = o.model_dump(exclude={"cae_referencial"})
            campos["actualizado"] = _ahora()
            if fila:
                for k, v in campos.items():
                    setattr(fila, k, v)
            else:
                s.add(OfertaDB(**campos))
        s.commit()
    r = _redis()
    if r:
        try:
            r.delete(CACHE_KEY)
        except Exception:
            pass


def obtener_ofertas() -> Tuple[List[Oferta], str]:
    """Devuelve (ofertas, aviso). Cae a la semilla ilustrativa si no hay datos frescos."""
    r = _redis()
    if r:
        try:
            crudo = r.get(CACHE_KEY)
            if crudo:
                d = json.loads(crudo)
                return [Oferta(**o) for o in d["ofertas"]], d["aviso"]
        except Exception:
            logger.warning("Redis no disponible; se omite la caché")
    motivo = ""
    ofertas: List[Oferta] = []
    aviso = ""
    try:
        _asegurar_bd()
        limite = _ahora() - timedelta(days=config.MAX_EDAD_OFERTAS_DIAS)
        with SessionLocal() as s:
            filas = s.scalars(select(OfertaDB).where(OfertaDB.fuente != "seed")).all()
        frescas = [f for f in filas if f.actualizado >= limite]
        if filas and not frescas:
            motivo = f"Las ofertas guardadas están desactualizadas (más de {config.MAX_EDAD_OFERTAS_DIAS} días)."
        ofertas = [Oferta(institucion=f.institucion, tasa_mensual=f.tasa_mensual, plazo_max_meses=f.plazo_max_meses,
                          comision=f.comision, seguro_desgravamen=f.seguro_desgravamen, monto_max=f.monto_max,
                          fuente=f.fuente, comision_conocida=f.comision_conocida) for f in frescas]
        aviso = "Ofertas del Comparador de Créditos SERNAC."
    except Exception:
        logger.exception("BD no disponible")
    if not ofertas:
        ofertas, aviso = _semilla(motivo)
    if r:
        try:
            r.setex(CACHE_KEY, CACHE_TTL, json.dumps({"ofertas": [o.model_dump() for o in ofertas], "aviso": aviso}))
        except Exception:
            pass
    return ofertas, aviso
