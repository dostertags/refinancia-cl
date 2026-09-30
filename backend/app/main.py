"""API FastAPI de RefinanciaCL.

Privacidad por diseño:
 - Los endpoints de simulación son sin estado: procesan la solicitud en memoria y responden.
 - No se loguea el cuerpo de las solicitudes (ni renta ni deudas) ni se escribe en BD/Redis.
 - Los errores de validación NO devuelven el valor enviado.
 - Sin cookies, sin analytics.
"""
from __future__ import annotations

import asyncio
import logging
import os
import secrets
import time
from typing import Optional

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from app import config
from app.engine.simulator import simular
from app.middleware import CabecerasSeguridadMiddleware, RateLimitMiddleware
from app.schemas import ResultadoSimulacion, SimulacionRequest
from app.services import indicadores, offers
from app.services.report_pdf import generar_informe

logger = logging.getLogger("refinancia")

# El MILP es CPU-bound: corre en un hilo aparte y con concurrencia acotada para no bloquear el event loop.
_CONCURRENCIA = asyncio.Semaphore(2)
_estado_scrape: dict = {"ultimo": None}

_MENSAJES_422 = {
    "missing": "Falta este dato.",
    "float_parsing": "Debe ser un número válido.",
    "int_parsing": "Debe ser un número entero válido.",
    "greater_than": "El valor debe ser mayor al mínimo permitido.",
    "greater_than_equal": "El valor es menor al mínimo permitido.",
    "less_than": "El valor supera el máximo permitido.",
    "less_than_equal": "El valor supera el máximo permitido.",
    "too_long": "Hay más elementos de los permitidos.",
    "literal_error": "Opción no válida.",
    "bool_parsing": "Debe ser sí o no.",
}


def crear_app() -> FastAPI:
    app = FastAPI(
        title="RefinanciaCL API", version="0.2.0",
        description="Simulador educativo de refinanciamiento (Chile). No constituye una oferta de crédito. "
                    "No almacena datos financieros del usuario.",
    )
    # Orden: el último agregado es el más externo (se ejecuta primero).
    app.add_middleware(
        CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
        allow_methods=["GET", "POST"], allow_headers=["Content-Type", "X-Admin-Token"], allow_credentials=False)
    app.add_middleware(RateLimitMiddleware, limite_por_minuto=config.RATE_LIMIT_PER_MIN)
    app.add_middleware(CabecerasSeguridadMiddleware, forzar_https=config.FORCE_HTTPS)

    @app.exception_handler(RequestValidationError)
    async def _validacion(_: Request, exc: RequestValidationError):
        # Nunca reenviamos `input` (podría contener renta/deudas del usuario).
        def mensaje(e: dict) -> str:
            # Los errores de nuestras reglas (ValueError de los modelos) ya vienen en español y sin datos del usuario.
            if e["type"] == "value_error":
                return str(e.get("ctx", {}).get("error", "Valor no válido."))
            return _MENSAJES_422.get(e["type"], "Valor no válido.")

        detalle = [{"campo": ".".join(str(x) for x in e["loc"] if x != "body"), "msg": mensaje(e)} for e in exc.errors()]
        return JSONResponse({"detail": detalle}, status_code=422)

    async def _resolver(req: SimulacionRequest) -> SimulacionRequest:
        """Completa ofertas (caché) y UF. Valida consentimiento. No toca datos del usuario."""
        if not req.acepta_terminos:
            raise HTTPException(422, "Debes aceptar que esta simulación es solo educativa y no una oferta de crédito.")
        updates = {}
        if req.ofertas is None:
            # Solo se usa el monto total a refinanciar para elegir la simulación publicada más cercana; no se guarda nada.
            monto = sum(d.monto_actual * (req.valor_uf or 0 if d.moneda == "UF" else 1) for d in req.deudas if d.incluir)
            updates["ofertas"] = offers.obtener_ofertas(monto or None)[0]
        else:  # el cliente no puede hacerse pasar por SERNAC ni por otra fuente
            updates["ofertas"] = [o.model_copy(update={"fuente": "usuario"}) for o in req.ofertas]
        if req.valor_uf is None and any(d.moneda == "UF" for d in req.deudas):
            uf = await indicadores.obtener_uf()
            if uf is None:
                raise HTTPException(503, "Tienes deudas en UF pero no pudimos obtener el valor de la UF. Ingresa el valor manualmente.")
            updates["valor_uf"] = uf
        return req.model_copy(update=updates)

    async def _correr(req: SimulacionRequest) -> ResultadoSimulacion:
        async with _CONCURRENCIA:
            try:
                return await run_in_threadpool(simular, req)
            except ValueError as e:
                raise HTTPException(422, str(e))

    @app.get("/health", tags=["sistema"])
    def health():
        return {"status": "ok"}

    @app.get("/api/ofertas", tags=["mercado"], summary="Tasas de mercado (simulaciones oficiales del SERNAC)")
    def ofertas_vigentes(monto: Optional[float] = Query(default=None, gt=0, le=1e9)):
        doc = offers.cargar_documento()
        lista, aviso = offers.obtener_ofertas(monto)
        return {"fuente": doc["fuente"] if doc else None, "url_fuente": doc["url_fuente"] if doc else None,
                "actualizado": doc["actualizado"] if doc else None, "aviso": aviso, "ofertas": lista}

    @app.get("/api/indicadores", tags=["mercado"], summary="UF y UTM del día")
    async def indicadores_dia():
        ind = await indicadores.obtener_indicadores()
        if ind is None:
            raise HTTPException(503, "No se pudieron obtener los indicadores (mindicador.cl)")
        # TODO: benchmark de tasas CMF (Fuente 3) aún no implementado: se informa como no disponible, sin inventar cifras.
        return {**ind.model_dump(), "tasa_sistema_referencial_mensual": None}

    @app.post("/api/simular", response_model=ResultadoSimulacion, tags=["simulación"],
              summary="Simula el refinanciamiento (sin estado, no guarda nada)")
    async def api_simular(req: SimulacionRequest):
        return await _correr(await _resolver(req))

    @app.post("/api/informe", tags=["simulación"], summary="Informe PDF descargable")
    async def api_informe(req: SimulacionRequest):
        res = await _correr(await _resolver(req))
        pdf = generar_informe(res, url_qr=os.getenv("PUBLIC_URL", "https://refinancia.cl"))
        return Response(pdf, media_type="application/pdf",
                        headers={"Content-Disposition": 'attachment; filename="informe-refinanciacl.pdf"'})

    @app.post("/api/admin/scrape", tags=["admin"], status_code=202, summary="Dispara el scraper (requiere token)")
    async def admin_scrape(tasks: BackgroundTasks, x_admin_token: str = Header(default="")):
        esperado = os.getenv("ADMIN_TOKEN", "")
        if not esperado or not secrets.compare_digest(x_admin_token, esperado):
            raise HTTPException(401, "Token inválido")
        # Cortesía con el SERNAC: como máximo un scrape cada MIN_HORAS_ENTRE_SCRAPES horas.
        ultimo: Optional[float] = _estado_scrape["ultimo"]
        if ultimo is not None and time.time() - ultimo < config.MIN_HORAS_ENTRE_SCRAPES * 3600:
            raise HTTPException(429, "Ya se ejecutó un scrape recientemente.",
                                headers={"Retry-After": str(int(config.MIN_HORAS_ENTRE_SCRAPES * 3600))})
        _estado_scrape["ultimo"] = time.time()
        tasks.add_task(_correr_scrape)
        return {"estado": "en_cola"}

    return app


async def _correr_scrape() -> None:
    from app.scrapers import sernac_powerbi
    try:
        doc = await run_in_threadpool(sernac_powerbi.obtener_documento)
        offers.guardar_documento(doc)  # validado y atómico; si algo falla se conserva el archivo anterior
        logger.info("Scrape SERNAC: %d simulaciones (fecha de carga %s)", len(doc["simulaciones"]), doc["actualizado"])
    except Exception:
        logger.exception("Falló el scrape de SERNAC; se conservan las tasas anteriores")


app = crear_app()
