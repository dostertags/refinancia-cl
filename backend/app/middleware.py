"""Middlewares de seguridad: rate limiting, cabeceras, HTTPS forzado.

Sin dependencias externas (Redis opcional en producción, pero un límite por proceso ya frena abuso básico).
TODO: si se despliega con varias réplicas, mover el contador a Redis o al proxy (Fly.io/Railway/Cloudflare).
"""
from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Deque, Dict

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, RedirectResponse, Response

RUTAS_LIBRES = {"/health"}
RUTAS_DOCS = ("/docs", "/redoc", "/openapi.json")


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Ventana deslizante de 60 s por IP. Devuelve 429 con Retry-After."""

    def __init__(self, app, limite_por_minuto: int = 30):
        super().__init__(app)
        self.limite = limite_por_minuto
        self._hits: Dict[str, Deque[float]] = defaultdict(deque)

    async def dispatch(self, request: Request, call_next):
        if request.url.path in RUTAS_LIBRES:
            return await call_next(request)
        ip = request.client.host if request.client else "desconocido"
        ahora = time.monotonic()
        ventana = self._hits[ip]
        while ventana and ahora - ventana[0] > 60:
            ventana.popleft()
        if len(ventana) >= self.limite:
            espera = max(1, int(60 - (ahora - ventana[0])))
            return JSONResponse({"detail": "Demasiadas solicitudes. Intenta nuevamente en un minuto."},
                                status_code=429, headers={"Retry-After": str(espera)})
        ventana.append(ahora)
        if len(self._hits) > 10_000:  # evita crecer sin límite
            for k in [k for k, v in self._hits.items() if not v or ahora - v[-1] > 60]:
                self._hits.pop(k, None)
        return await call_next(request)


class CabecerasSeguridadMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, forzar_https: bool = False):
        super().__init__(app)
        self.forzar_https = forzar_https

    async def dispatch(self, request: Request, call_next) -> Response:
        if self.forzar_https and request.headers.get("x-forwarded-proto", request.url.scheme) != "https":
            return RedirectResponse(str(request.url.replace(scheme="https")), status_code=308)
        resp = await call_next(request)
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["X-Frame-Options"] = "DENY"
        resp.headers["Referrer-Policy"] = "no-referrer"
        resp.headers["Cache-Control"] = "no-store"  # respuestas con datos financieros: nunca en caché
        if not request.url.path.startswith(RUTAS_DOCS):  # Swagger necesita cargar scripts
            resp.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
        if self.forzar_https:
            resp.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return resp
