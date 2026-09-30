"""Ofertas de mercado: simulaciones OFICIALES del Comparador de créditos de consumo del SERNAC.

Cada institución informa sus simulaciones (tasa, CAE, CTC, cuota) al SERNAC; son referenciales y no vinculantes. El scraper
(app/scrapers/sernac_powerbi.py) las guarda en un JSON con la fuente y la fecha de carga. Aquí se convierten en `Oferta`
calibradas para que el modelo (cuota francesa + seguro + comisión) reproduzca el CTC informado por la institución.

NO hay datos inventados: si el archivo falta o es inválido, no hay ofertas y se avisa. Este módulo no recibe datos del usuario
(solo el monto total a refinanciar, para elegir la simulación publicada más cercana).
"""
from __future__ import annotations

import json
import logging
import os
import tempfile
from datetime import date
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app import config
from app.engine import finance
from app.schemas import Oferta

logger = logging.getLogger("refinancia.offers")
CUOTAS_REFERENCIA = (48, 36, 60, 24, 12)  # plazos con los que se calibra, en orden de preferencia
MONTO_POR_DEFECTO = 5_000_000
_MINUSCULAS = {"DE", "DEL", "LA", "LOS", "LAS"}
_ESPECIALES = {"BANCOESTADO": "BancoEstado"}


def nombre_institucion(oficial: str) -> str:
    """'BANCO BICE' -> 'Banco BICE'. Solo cambia cómo se ve; el nombre oficial sigue en los datos."""
    def una(w: str) -> str:
        if w in _ESPECIALES:
            return _ESPECIALES[w]
        return w.capitalize() if (w in _MINUSCULAS or len(w) > 4) else w
    return " ".join(una(w) for w in oficial.strip().split())


def _pesos(v: float) -> str:
    return "$" + f"{round(v):,}".replace(",", ".")


def _fila_valida(f: Any) -> bool:
    return (isinstance(f, list) and len(f) >= 10 and isinstance(f[0], str) and all(isinstance(x, (int, float)) and not isinstance(x, bool) for x in f[1:3] + f[4:10])
            and f[3] in (0, 1) and f[1] > 0 and f[2] > 0 and f[4] > 0 and f[5] > 0 and f[9] > 0)


def validar_documento(doc: Any) -> Optional[Dict[str, Any]]:
    """Devuelve el documento v2 con solo las filas válidas, o None si no se puede usar."""
    if not isinstance(doc, dict) or doc.get("version") != 2:
        return None
    if not all(isinstance(doc.get(k), str) and doc[k].strip() for k in ("fuente", "url_fuente", "actualizado")):
        return None
    if not doc["url_fuente"].startswith("https://") or not isinstance(doc.get("simulaciones"), list):
        return None
    filas = [f for f in doc["simulaciones"] if _fila_valida(f)]
    return {**doc, "simulaciones": filas} if filas else None


def cargar_documento(ruta: Optional[Path] = None) -> Optional[Dict[str, Any]]:
    ruta = Path(ruta or config.SERNAC_DATA_PATH)
    try:
        return validar_documento(json.loads(ruta.read_text(encoding="utf-8")))
    except (OSError, ValueError):
        return None


def guardar_documento(doc: Dict[str, Any], ruta: Optional[Path] = None) -> None:
    """Escritura atómica: si algo falla, se conserva el archivo anterior."""
    valido = validar_documento(doc)
    if valido is None:
        raise ValueError("El documento de tasas no es válido; no se guarda.")
    ruta = Path(ruta or config.SERNAC_DATA_PATH)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=ruta.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(doc, fh, ensure_ascii=False, separators=(",", ":"))
        os.replace(tmp, ruta)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def _base_cercana(montos: List[int], monto: float) -> Optional[int]:
    """Monto publicado más cercano, si no está demasiado lejos (no se extrapola)."""
    if not montos:
        return None
    mejor = min(montos, key=lambda m: abs(m - monto))
    return mejor if abs(mejor - monto) <= max(1_000_000, 0.25 * monto) else None


def ofertas_desde_documento(doc: Dict[str, Any], monto: float, seguro: bool = True) -> Tuple[List[Oferta], Optional[Tuple[int, int]]]:
    """(ofertas, (monto_base, cuotas)) calibradas a la simulación publicada más cercana. ([], None) si no hay una cercana."""
    filas = [f for f in doc["simulaciones"] if bool(f[3]) == seguro]
    base = n_ref = None
    for n in CUOTAS_REFERENCIA:
        base = _base_cercana(sorted({f[1] for f in filas if f[2] == n}), monto)
        if base is not None:
            n_ref = n
            break
    if base is None or n_ref is None:
        return [], None
    ofertas: List[Oferta] = []
    for f in (f for f in filas if f[1] == base and f[2] == n_ref):
        inst, tasa, gastos, ctc = f[0], f[5] / 100, f[7], f[9]
        francesa = finance.cuota_francesa(base, tasa, n_ref)
        # seguro mensual (tasa plana sobre el monto) tal que cuota*n + comisión = CTC informado por la institución
        seg = max(((ctc - gastos) / n_ref - francesa) / base, 0.0)
        plazo_max = max(x[2] for x in filas if x[0] == inst and x[1] == base and x[2] <= 60)
        ofertas.append(Oferta(institucion=nombre_institucion(inst), tasa_mensual=tasa, plazo_max_meses=plazo_max,
                              comision=gastos * monto / base, seguro_desgravamen=seg, fuente="sernac",
                              fecha_datos=doc["actualizado"]))
    return ofertas, (base, n_ref)


def _fecha_chile(iso: str) -> str:
    try:
        return date.fromisoformat(iso).strftime("%d-%m-%Y")
    except ValueError:
        return iso


def obtener_ofertas(monto: Optional[float] = None, ruta: Optional[Path] = None, seguro: bool = True) -> Tuple[List[Oferta], str]:
    """(ofertas, aviso). Sin datos válidos no se inventa nada: lista vacía y un aviso que lo explica."""
    doc = cargar_documento(ruta)
    if doc is None:
        return [], "No hay tasas de mercado cargadas: no se puede comparar con el mercado."
    monto = monto or MONTO_POR_DEFECTO
    ofertas, ref = ofertas_desde_documento(doc, monto, seguro)
    montos = [f[1] for f in doc["simulaciones"]]
    if not ofertas or ref is None:
        return [], (f"No hay simulaciones publicadas para {_pesos(monto)} (el SERNAC publica desde {_pesos(min(montos))} hasta {_pesos(max(montos))}), "
                    "así que no se compara con el mercado.")
    aviso = (f"Ofertas: simulaciones oficiales del Comparador de créditos de consumo del SERNAC, cargadas el {_fecha_chile(doc['actualizado'])}; "
             f"son referenciales (cada institución las informó al SERNAC). Costos calibrados a {_pesos(ref[0])} a {ref[1]} cuotas. Fuente: {doc['url_fuente']}")
    try:
        dias = (date.today() - date.fromisoformat(doc["actualizado"])).days
    except ValueError:
        dias = 0
    if dias > config.MAX_EDAD_OFERTAS_DIAS:
        aviso = f"Los datos están desactualizados (más de {config.MAX_EDAD_OFERTAS_DIAS} días). " + aviso
    return ofertas, aviso
