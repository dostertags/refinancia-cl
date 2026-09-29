"""Scraper del Comparador de Créditos SERNAC (Fuente 1).

Decisión técnica: los datos viven en un iframe de Power BI (no hay HTML estático), así que
usamos Playwright: navegar -> esperar el iframe -> leer la tabla renderizada del DOM.
El parseo/normalización está separado en funciones puras (testeables sin navegador).
"""
from __future__ import annotations

import asyncio
import logging
import re
import unicodedata
from html.parser import HTMLParser
from typing import Dict, List, Optional

from app import config
from app.schemas import Oferta
from app.scrapers.robustez import ScrapeError, con_reintentos, permitido_por_robots, validar_lote

logger = logging.getLogger("refinancia.scraper.sernac")

URL_SERNAC = "https://www.sernac.cl/portal/619/w3-article-84607.html"
TIMEOUT_MS = 30_000  # wait_for_selector del iframe de Power BI

# Alias -> nombre canónico (extensible). TODO: mantener con datos reales del comparador.
_ALIAS = {
    "banco de chile": "Banco de Chile", "banco santander chile": "Banco Santander", "banco santander": "Banco Santander",
    "santander": "Banco Santander", "scotiabank chile": "Scotiabank", "scotiabank": "Scotiabank",
    "bancoestado": "BancoEstado", "banco estado": "BancoEstado", "banco bci": "BCI", "bci": "BCI",
    "banco itau chile": "Banco Itaú", "itau": "Banco Itaú", "banco falabella": "Banco Falabella",
    "falabella cmr": "Banco Falabella", "cmr falabella": "Banco Falabella", "banco ripley": "Banco Ripley",
}


def _limpiar(txt: str) -> str:
    txt = unicodedata.normalize("NFKD", txt).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", re.sub(r"[-_]", " ", txt)).strip().lower()


def normalizar_institucion(crudo: str) -> str:
    clave = _limpiar(crudo)
    if clave in _ALIAS:
        return _ALIAS[clave]
    return " ".join(w.capitalize() if w not in {"de", "del", "la"} else w for w in crudo.strip().lower().split())


def parsear_tasa(txt: str) -> Optional[float]:
    """'1,85%' -> 0.0185 (fracción mensual)."""
    m = re.search(r"\d+(?:[.,]\d+)?", txt or "")
    if not m:
        return None
    return float(m.group().replace(",", ".")) / 100


def parsear_monto(txt: str) -> Optional[int]:
    digitos = re.sub(r"[^\d]", "", txt or "")
    return int(digitos) if digitos else None


def normalizar_filas(filas: List[Dict[str, str]]) -> List[Oferta]:
    """Valida, normaliza y deduplica por institución (gana la menor tasa).

    Se descartan tasas fuera de rango plausible (0 < t <= TASA_MENSUAL_MAX_PLAUSIBLE): un dato corrupto
    no debe llegar a la simulación. El comparador no informa comisiones ni seguros -> comision_conocida=False.
    Si falta el plazo se asume el máximo permitido (R7), y así queda documentado.
    """
    mejores: Dict[str, Oferta] = {}
    for f in filas:
        tasa = parsear_tasa(f.get("tasa", ""))
        if tasa is None or tasa <= 0 or tasa > config.TASA_MENSUAL_MAX_PLAUSIBLE:
            continue
        plazo = parsear_monto(f.get("plazo", "")) or config.PLAZO_MAX_CONSUMO_MESES
        nombre = normalizar_institucion(f.get("institucion", ""))
        if not nombre:
            continue
        oferta = Oferta(institucion=nombre, tasa_mensual=tasa, plazo_max_meses=min(plazo, config.PLAZO_MAX_CONSUMO_MESES),
                        fuente="sernac", comision_conocida=False)
        if nombre not in mejores or tasa < mejores[nombre].tasa_mensual:
            mejores[nombre] = oferta
    return list(mejores.values())


_VOID = {"br", "img", "input", "hr", "meta", "link"}
_ROL_FILA = {"row"}
_ROL_CELDA = {"columnheader", "gridcell", "cell", "rowheader"}


class _TablaParser(HTMLParser):
    """Soporta <table> y grillas ARIA (div role=row/gridcell), que es como Power BI renderiza sus tablas."""

    def __init__(self):
        super().__init__()
        self.filas: List[List[str]] = []
        self._pila: List[tuple] = []  # (tag, tipo) con tipo in {"fila", "celda", None}
        self._celda: Optional[List[str]] = None
        self._fila: Optional[List[str]] = None

    def handle_starttag(self, tag, attrs):
        if tag in _VOID:
            return
        rol = dict(attrs).get("role", "")
        tipo = None
        if tag == "tr" or rol in _ROL_FILA:
            tipo, self._fila = "fila", []
        elif tag in ("td", "th") or rol in _ROL_CELDA:
            tipo, self._celda = "celda", []
        self._pila.append((tag, tipo))

    def handle_data(self, data):
        if self._celda is not None:
            self._celda.append(data)

    def handle_endtag(self, tag):
        while self._pila:
            t, tipo = self._pila.pop()
            if tipo == "celda" and self._fila is not None and self._celda is not None:
                self._fila.append("".join(self._celda).strip())
                self._celda = None
            elif tipo == "fila" and self._fila is not None:
                self.filas.append(self._fila)
                self._fila = None
            if t == tag:
                break


def extraer_filas_html(html: str) -> List[Dict[str, str]]:
    """Convierte una tabla HTML/ARIA en dicts {institucion, tasa, plazo} detectando columnas por encabezado."""
    p = _TablaParser()
    p.feed(html)
    if len(p.filas) < 2:
        return []
    enc = [_limpiar(c) for c in p.filas[0]]

    def col(*claves: str) -> Optional[int]:
        for i, c in enumerate(enc):
            if any(k in c for k in claves):
                return i
        return None

    ci, ct, cp = col("institucion", "banco", "emisor"), col("tasa"), col("plazo")
    if ci is None or ct is None:
        return []
    out = []
    for fila in p.filas[1:]:
        if len(fila) <= max(ci, ct):
            continue
        out.append({"institucion": fila[ci], "tasa": fila[ct], "plazo": fila[cp] if cp is not None and cp < len(fila) else ""})
    return out


async def _robots_txt() -> str:
    import httpx
    origen = "/".join(URL_SERNAC.split("/")[:3])
    async with httpx.AsyncClient(timeout=10, headers={"User-Agent": config.SCRAPER_USER_AGENT}) as c:
        r = await c.get(f"{origen}/robots.txt")
        return r.text if r.status_code == 200 else ""


async def scrape_sernac() -> List[Oferta]:
    """Navega el comparador con Playwright y devuelve ofertas validadas.

    Cortesía: se identifica con User-Agent propio, respeta robots.txt, hace UNA navegación (con reintentos y
    backoff exponencial) y el endpoint que lo dispara limita la frecuencia. Corre en horario de baja demanda
    (cron 07:00 UTC ~ 03:00-04:00 hora de Chile). Si el layout cambia (pocas filas) lanza ScrapeError y NO
    se sobrescriben las ofertas guardadas. Requiere `playwright install chromium`.
    """
    from playwright.async_api import async_playwright  # import diferido: no es necesario en tests

    if not permitido_por_robots(await _robots_txt(), URL_SERNAC, config.SCRAPER_USER_AGENT):
        raise ScrapeError("robots.txt del SERNAC no permite esta ruta al bot; se aborta.")

    async def navegar() -> str:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            try:
                ctx = await browser.new_context(user_agent=config.SCRAPER_USER_AGENT)
                page = await ctx.new_page()
                await page.goto(URL_SERNAC, wait_until="domcontentloaded", timeout=TIMEOUT_MS)
                # El contenido está en un iframe de Power BI: esperamos el iframe y luego la tabla/grilla.
                await page.wait_for_selector("iframe", timeout=TIMEOUT_MS)
                frame = next((f for f in page.frames if "powerbi" in f.url.lower()), None)
                if frame is None:
                    raise ScrapeError("No se encontró el iframe de Power BI (¿cambió la página?)")
                await frame.wait_for_selector("table, [role='grid']", timeout=TIMEOUT_MS)
                await asyncio.sleep(2)  # pausa cortés: deja terminar de renderizar y evita ráfagas
                return await frame.inner_html("body")
            finally:
                await browser.close()

    html = await con_reintentos(navegar, intentos=3, base_s=5)
    # TODO: Power BI virtualiza filas (grilla ARIA); si hay más filas que las visibles, agregar scroll incremental.
    return validar_lote(normalizar_filas(extraer_filas_html(html)))
