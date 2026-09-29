"""Utilidades de cortesía y robustez del scraper (puras, testeables sin red ni navegador)."""
from __future__ import annotations

import asyncio
import logging
from typing import Awaitable, Callable, List, Sequence, TypeVar
from urllib.robotparser import RobotFileParser

from app import config

logger = logging.getLogger("refinancia.scraper")
T = TypeVar("T")


class ScrapeError(Exception):
    """El scrape no produjo datos confiables: NO se debe sobrescribir lo guardado."""


def permitido_por_robots(robots_txt: str, url: str, user_agent: str) -> bool:
    rp = RobotFileParser()
    rp.parse(robots_txt.splitlines())
    return rp.can_fetch(user_agent, url)


async def con_reintentos(
    fn: Callable[[], Awaitable[T]], intentos: int = 3, base_s: float = 2.0,
    dormir: Callable[[float], Awaitable[None]] = asyncio.sleep,
) -> T:
    """Reintenta con backoff exponencial (base, 2*base, 4*base...). Propaga el último error."""
    for k in range(intentos):
        try:
            return await fn()
        except Exception as e:  # noqa: BLE001 - cualquier fallo transitorio de red/DOM se reintenta
            if k == intentos - 1:
                raise
            espera = base_s * (2 ** k)
            logger.warning("Intento %d/%d falló (%s); reintento en %ss", k + 1, intentos, type(e).__name__, espera)
            await dormir(espera)
    raise AssertionError("inalcanzable")


def validar_lote(ofertas: Sequence) -> List:
    """Un lote vacío o sospechosamente chico casi siempre significa que cambió el layout: se rechaza."""
    if len(ofertas) < config.MIN_FILAS_SCRAPE:
        raise ScrapeError(f"Solo se extrajeron {len(ofertas)} ofertas (mínimo {config.MIN_FILAS_SCRAPE}); "
                          "posible cambio de layout del comparador. No se actualizan los datos.")
    return list(ofertas)
