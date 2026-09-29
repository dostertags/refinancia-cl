"""Fuente 2: boletines PDF del SERNAC (Estudios de precio). Extracción de tablas con pdfplumber.

Se eligió pdfplumber sobre camelot: solo Python puro (camelot exige Ghostscript/OpenCV, pesado en Docker).
"""
from __future__ import annotations

from typing import Dict, List, Optional

from app.scrapers.sernac import _limpiar


def filas_desde_tablas(tablas: List[List[List[Optional[str]]]]) -> List[Dict[str, str]]:
    """Convierte tablas crudas de pdfplumber en dicts {institucion, tasa, plazo}."""
    out: List[Dict[str, str]] = []
    for tabla in tablas:
        if len(tabla) < 2:
            continue
        enc = [_limpiar(c or "") for c in tabla[0]]

        def col(*claves):
            return next((i for i, c in enumerate(enc) if any(k in c for k in claves)), None)

        ci, ct, cp = col("institucion", "banco"), col("tasa"), col("plazo")
        if ci is None or ct is None:
            continue
        for fila in tabla[1:]:
            if not fila or not (fila[ci] or "").strip():
                continue
            out.append({"institucion": (fila[ci] or "").strip(), "tasa": (fila[ct] or "").strip(),
                        "plazo": (fila[cp] or "").strip() if cp is not None else ""})
    return out


def extraer_boletin(ruta_pdf: str) -> List[Dict[str, str]]:
    import pdfplumber

    tablas = []
    with pdfplumber.open(ruta_pdf) as pdf:
        for pagina in pdf.pages:
            tablas.extend(pagina.extract_tables())
    return filas_desde_tablas(tablas)
