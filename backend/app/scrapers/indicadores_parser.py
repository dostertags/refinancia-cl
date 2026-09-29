"""Parseo puro de la respuesta de https://mindicador.cl/api (Fuente 4: UF y UTM)."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class Indicadores(BaseModel):
    uf: Optional[float] = None
    utm: Optional[float] = None
    fecha: Optional[str] = None


def parse_indicadores(data: dict) -> Indicadores:
    def valor(clave: str) -> Optional[float]:
        try:
            return float(data[clave]["valor"])
        except (KeyError, TypeError, ValueError):
            return None

    fecha = data.get("fecha")
    return Indicadores(uf=valor("uf"), utm=valor("utm"), fecha=fecha[:10] if isinstance(fecha, str) else None)
