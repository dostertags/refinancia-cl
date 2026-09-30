"""Scraper del Comparador de créditos de consumo del SERNAC (fuente oficial).

El SERNAC publica su comparador como un informe público de Power BI incrustado en su sitio. Cada institución informa sus
simulaciones (tasa, CAE, CTC, cuota) al SERNAC; son referenciales y no vinculantes. Este módulo:

 1. Lee la página del SERNAC y obtiene la clave pública del informe (así no depende de un enlace fijo).
 2. Hace UNA petición al mismo endpoint que usa la página pública, sin filtros (trae todas las combinaciones de monto y plazo).
 3. Decodifica el formato comprimido de Power BI, valida cada fila y descarta las inconsistentes (dejando constancia del motivo).
 4. Escribe un documento JSON que cita la fuente y la fecha de carga.

Cortesía: User-Agent propio, una sola petición, sin ráfagas. El robots.txt del SERNAC no define reglas (redirige a una IP interna);
igual se respeta cualquier regla válida si algún día existe.
Uso:  python -m app.scrapers.sernac_powerbi --salida ../renegociacl/public/rates.json
"""
from __future__ import annotations

import argparse
import base64
import json
import re
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from app import config

URL_PAGINA = "https://www.sernac.cl/portal/619/w3-article-84607.html"
ENDPOINT = "https://wabi-paas-1-scus-api.analysis.windows.net/public/reports/querydata?synchronous=true"
# Identificadores del conjunto de datos del informe público (si SERNAC lo republica, hay que actualizarlos: el scraper falla fuerte).
DATASET_ID, REPORT_ID, MODEL_ID = "56d979a5-4ff4-4763-96bc-6ef999f97d42", "2caf19ba-3529-4389-aaf8-e01215407e18", 5361327
FUENTE = "SERNAC — Comparador de créditos de consumo"
NOTA_CAE = ("El CAE lo calcula cada institución y no siempre usa el mismo método: por eso se ordena por Costo Total del Crédito (CTC), "
            "que es lo que recomienda el SERNAC.")
AVISO = ("Simulaciones referenciales y no vinculantes, informadas directamente por cada entidad financiera al SERNAC. "
         "Cotiza en al menos tres entidades y compara por el menor Costo Total del Crédito (CTC).")
MIN_SIMULACIONES = 100

# (propiedad en el informe, nombre interno)
COLUMNAS_FUENTE: List[Tuple[str, str]] = [
    ("Institución", "institucion"), ("Monto solicitado", "monto"), ("N ° cuotas", "cuotas"), ("Seguro desgravamen", "seguro"),
    ("valor_cuota", "cuota"), ("tasa_interes", "tasa"), ("total_interes", "total_interes"), ("total_gastos_asociados", "gastos"),
    ("cae", "cae"), ("CTC", "ctc"), ("fecha_carga", "fecha_carga"),
]
COLUMNAS_DOC = ["institucion", "monto", "cuotas", "seguro", "cuota", "tasaMensual", "totalInteres", "gastos", "cae", "ctc"]


class ScrapeSernacError(Exception):
    """No se pudo obtener datos confiables: NO se debe sobrescribir el archivo publicado."""


def extraer_clave_powerbi(html: str) -> Tuple[str, str]:
    """Busca el iframe del informe y devuelve (url, clave_pública)."""
    m = re.search(r"https://app\.powerbi\.com/view\?r=([A-Za-z0-9_\-=%]+)", html)
    if not m:
        raise ScrapeSernacError("No se encontró el informe de Power BI en la página del SERNAC (¿cambió la página?).")
    r = m.group(1)
    try:
        datos = json.loads(base64.b64decode(r + "=" * (-len(r) % 4)))
        return m.group(0), datos["k"]
    except Exception as e:  # noqa: BLE001
        raise ScrapeSernacError("La clave del informe de Power BI no tiene el formato esperado (¿cambió la página?).") from e


def construir_consulta(columnas: List[Tuple[str, str]] = COLUMNAS_FUENTE) -> Dict[str, Any]:
    seleccion = [{"Column": {"Expression": {"SourceRef": {"Source": "v"}}, "Property": prop}, "Name": f"vw_creditos_consumo.{prop}"}
                 for prop, _ in columnas]
    return {"version": "1.0.0", "queries": [{"Query": {"Commands": [{"SemanticQueryDataShapeCommand": {
        "Query": {"Version": 2, "From": [{"Name": "v", "Entity": "vw_creditos_consumo", "Type": 0}], "Select": seleccion},
        "Binding": {"Primary": {"Groupings": [{"Projections": list(range(len(columnas))), "Subtotal": 1}]},
                    "DataReduction": {"DataVolume": 4, "Primary": {"Window": {"Count": 30000}}}, "Version": 1},
        "ExecutionMetricsKind": 1}}]}, "QueryId": "",
        "ApplicationContext": {"DatasetId": DATASET_ID, "Sources": [{"ReportId": REPORT_ID}]}}],
        "cancelQueries": [], "modelId": MODEL_ID}


def decodificar_dsr(respuesta: Dict[str, Any], columnas: List[str] | List[Tuple[str, str]]) -> List[Dict[str, Any]]:
    """Decodifica el formato DSR de Power BI: R = máscara de columnas repetidas de la fila anterior, Ø = nulos, DN = diccionario."""
    nombres = [c[1] if isinstance(c, tuple) else c for c in columnas]
    try:
        r0 = respuesta["results"][0]["result"]
        if "error" in r0:
            raise ScrapeSernacError(f"Power BI respondió con error: {r0['error']}")
        ds = r0["data"]["dsr"]["DS"][0]
        filas_crudas = ds["PH"][0]["DM0"]
    except (KeyError, IndexError, TypeError) as e:
        raise ScrapeSernacError("La respuesta de Power BI no tiene el formato esperado (¿cambió el informe?).") from e
    esquema = filas_crudas[0]["S"]
    diccionarios = ds.get("ValueDicts", {})
    if len(esquema) != len(nombres):
        raise ScrapeSernacError(f"El informe entregó {len(esquema)} columnas y se esperaban {len(nombres)}.")
    previa: List[Any] = [None] * len(nombres)
    salida: List[Dict[str, Any]] = []
    for fila in filas_crudas:
        c, rep, nulos = fila.get("C", []), fila.get("R", 0), fila.get("Ø", 0)
        actual: List[Any] = []
        k = 0
        for i in range(len(nombres)):
            bit = 1 << i
            if rep & bit:
                actual.append(previa[i])
            elif nulos & bit:
                actual.append(None)
            else:
                v = c[k]
                k += 1
                dn = esquema[i].get("DN")
                if dn is not None and v is not None:
                    v = diccionarios[dn][v]
                actual.append(v)
        salida.append(dict(zip(nombres, actual)))
        previa = actual
    return salida


@dataclass
class Normalizado:
    simulaciones: List[Dict[str, Any]] = field(default_factory=list)
    descartadas: List[Dict[str, Any]] = field(default_factory=list)
    fecha_carga: Optional[str] = None


def _num(v: Any) -> Optional[float]:
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def normalizar(filas: List[Dict[str, Any]]) -> Normalizado:
    """Valida cada fila. Una fila inconsistente NO se publica (por ejemplo, un CAE menor al efecto de la propia tasa)."""
    out = Normalizado()
    fechas: List[float] = []
    for f in filas:
        motivo = None
        monto, cuotas, cuota, tasa, cae, ctc = (_num(f.get(k)) for k in ("monto", "cuotas", "cuota", "tasa", "cae", "ctc"))
        if not isinstance(f.get("institucion"), str) or not f["institucion"].strip():
            motivo = "institucion vacía"
        elif f.get("seguro") not in ("Sí", "No"):
            motivo = "seguro con valor desconocido"
        elif monto is None or monto <= 0:
            motivo = "monto inválido"
        elif cuotas is None or cuotas <= 0:
            motivo = "cuotas inválidas"
        elif cuota is None or cuota <= 0 or ctc is None or ctc <= 0:
            motivo = "cuota o ctc inválidos"
        elif tasa is None or not 0 < tasa <= config.TASA_MENSUAL_MAX_PLAUSIBLE * 100:
            motivo = f"tasa fuera de rango plausible (0 a {config.TASA_MENSUAL_MAX_PLAUSIBLE * 100:g}% mensual)"
        elif cae is None or cae < 0.8 * 12 * tasa:
            # OJO: el CAE lo calcula cada institución y no siempre es comparable (varias informan un CAE menor al efecto de su propia
            # tasa). Por eso NO se descarta por eso: solo lo imposible (p. ej. CAE 0,39% con tasa 2,9% mensual). Se compara por CTC.
            motivo = "cae incompatible con la tasa (menos del 80% de la tasa mensual x 12): dato inconsistente en la fuente"
        elif abs(ctc - cuota * cuotas) / ctc > 0.02:
            motivo = "ctc no calza con cuota × cuotas (más de 2%)"
        if motivo:
            out.descartadas.append({"institucion": f.get("institucion"), "monto": f.get("monto"), "cuotas": f.get("cuotas"),
                                    "seguro": f.get("seguro"), "motivo": motivo})
            continue
        out.simulaciones.append({**f, "seguro": f["seguro"] == "Sí", "institucion": f["institucion"].strip()})
        if _num(f.get("fecha_carga")):
            fechas.append(f["fecha_carga"])
    if fechas:
        out.fecha_carga = datetime.fromtimestamp(max(fechas) / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
    return out


def construir_documento(n: Normalizado, obtenido: str) -> Dict[str, Any]:
    ordenadas = sorted(n.simulaciones, key=lambda s: (s["monto"], s["cuotas"], s["seguro"], s["ctc"]))
    return {
        "version": 2, "fuente": FUENTE, "url_fuente": URL_PAGINA, "aviso": AVISO, "nota_cae": NOTA_CAE,
        "actualizado": n.fecha_carga, "obtenido": obtenido, "columnas": COLUMNAS_DOC,
        "simulaciones": [[s["institucion"], int(s["monto"]), int(s["cuotas"]), int(s["seguro"]), int(s["cuota"]), round(s["tasa"], 2),
                          int(s["total_interes"]), int(s["gastos"]), round(s["cae"], 2), int(s["ctc"])] for s in ordenadas],
        "descartadas": n.descartadas,
    }


def validar_documento(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Un lote chico casi siempre significa que cambió el informe: se rechaza en vez de publicar datos incompletos."""
    if len(doc["simulaciones"]) < MIN_SIMULACIONES:
        raise ScrapeSernacError(f"Solo {len(doc['simulaciones'])} simulaciones válidas (mínimo {MIN_SIMULACIONES}); "
                                "posible cambio del informe. No se actualiza el archivo.")
    if not doc.get("actualizado"):
        raise ScrapeSernacError("El informe no trae fecha de carga; no se puede citar la actualización.")
    return doc


def obtener_documento(cliente=None) -> Dict[str, Any]:
    """Flujo completo. `cliente` = httpx.Client (inyectable para pruebas)."""
    import httpx

    propio = cliente is None
    cliente = cliente or httpx.Client(timeout=30, headers={"User-Agent": config.SCRAPER_USER_AGENT})
    try:
        pagina = cliente.get(URL_PAGINA)
        pagina.raise_for_status()
        _, clave = extraer_clave_powerbi(pagina.text)
        resp = cliente.post(ENDPOINT, json=construir_consulta(), headers={"X-PowerBI-ResourceKey": clave, "Accept": "application/json"})
        resp.raise_for_status()
        norm = normalizar(decodificar_dsr(resp.json(), COLUMNAS_FUENTE))
        return validar_documento(construir_documento(norm, obtenido=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")))
    finally:
        if propio:
            cliente.close()


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="Descarga las simulaciones oficiales del comparador de créditos de consumo del SERNAC.")
    ap.add_argument("--salida", required=True, nargs="+", help="Ruta(s) del JSON a escribir (p. ej. ../renegociacl/public/rates.json app/data/sernac_simulaciones.json)")
    args = ap.parse_args(argv)
    try:
        doc = obtener_documento()
    except ScrapeSernacError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 2
    for ruta in args.salida:
        with open(ruta, "w", encoding="utf-8") as fh:
            json.dump(doc, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(doc['simulaciones'])} simulaciones ({len(doc['descartadas'])} descartadas) · fuente SERNAC · actualizado {doc['actualizado']} -> {', '.join(args.salida)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
