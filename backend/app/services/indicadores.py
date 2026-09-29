"""UF / UTM del día (mindicador.cl). El benchmark de tasas CMF (Fuente 3) está pendiente: no se inventan cifras."""
from __future__ import annotations

import logging
import time
from typing import Optional

import httpx

from app.scrapers.indicadores_parser import Indicadores, parse_indicadores

logger = logging.getLogger("refinancia.indicadores")
URL = "https://mindicador.cl/api"
_TTL = 3600
_cache: dict = {"t": 0.0, "ind": None}


async def obtener_indicadores(transport: Optional[httpx.AsyncBaseTransport] = None) -> Optional[Indicadores]:
    if _cache["ind"] and time.time() - _cache["t"] < _TTL:
        return _cache["ind"]
    try:
        async with httpx.AsyncClient(timeout=10, transport=transport) as c:
            r = await c.get(URL)
            r.raise_for_status()
            ind = parse_indicadores(r.json())
    except (httpx.HTTPError, ValueError) as e:
        logger.warning("No se pudo obtener mindicador.cl: %s", type(e).__name__)
        return _cache["ind"]  # último valor conocido, si existe
    _cache.update(t=time.time(), ind=ind)
    return ind


async def obtener_uf() -> Optional[float]:
    ind = await obtener_indicadores()
    return ind.uf if ind else None
