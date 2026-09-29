"""Configuración centralizada (variables de entorno con defaults seguros).

Los topes regulatorios viven aquí y no dispersos por el código (hallazgo MIN-002).
# TODO: verificar con abogado cada tope regulatorio antes de uso con datos reales.
"""
from __future__ import annotations

import os


def _f(nombre: str, defecto: float) -> float:
    return float(os.getenv(nombre, defecto))


def _i(nombre: str, defecto: int) -> int:
    return int(os.getenv(nombre, defecto))


# --- Reglas de negocio ---
TOPE_ENDEUDAMIENTO_VECES_RENTA = _f("TOPE_ENDEUDAMIENTO_VECES_RENTA", 10)   # R1
TOPE_CUOTA_PCT_RENTA = _f("TOPE_CUOTA_PCT_RENTA", 0.25)                      # R2
MESES_MAX_TARJETA = _i("MESES_MAX_TARJETA", 24)                              # R3 (NCG 537)
PLAZO_MAX_CONSUMO_MESES = _i("PLAZO_MAX_CONSUMO_MESES", 60)                  # R7
SEMAFORO_VERDE_HASTA = _f("SEMAFORO_VERDE_HASTA", 0.15)                      # verde: < 15%
SEMAFORO_AMARILLO_HASTA = _f("SEMAFORO_AMARILLO_HASTA", 0.25)                # amarillo: 15%-25%

# --- Validación de datos ---
TOLERANCIA_COHERENCIA_CUOTA = _f("TOLERANCIA_COHERENCIA_CUOTA", 0.30)        # cuota declarada vs. teórica
CAE_MAXIMO_REPORTABLE = 10.0                                                 # 1000%: tope cuando la TIR no converge
TASA_MENSUAL_MAX_PLAUSIBLE = _f("TASA_MENSUAL_MAX_PLAUSIBLE", 0.06)          # scraper: descarta > 6% mensual
MAX_OFERTAS = _i("MAX_OFERTAS", 20)
MAX_DEUDAS = _i("MAX_DEUDAS", 30)

# --- Operación / seguridad ---
SOLVER_TIME_LIMIT_S = _i("SOLVER_TIME_LIMIT_S", 8)
RATE_LIMIT_PER_MIN = _i("RATE_LIMIT_PER_MIN", 30)
FORCE_HTTPS = os.getenv("FORCE_HTTPS", "0") == "1"
MAX_EDAD_OFERTAS_DIAS = _i("MAX_EDAD_OFERTAS_DIAS", 3)
MIN_HORAS_ENTRE_SCRAPES = _f("MIN_HORAS_ENTRE_SCRAPES", 20)
MIN_FILAS_SCRAPE = _i("MIN_FILAS_SCRAPE", 3)
SCRAPER_USER_AGENT = os.getenv(
    "SCRAPER_USER_AGENT", "RefinanciaCL-bot/0.1 (+https://github.com/refinanciacl; simulador educativo open source)")
