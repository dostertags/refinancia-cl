"""Generación del informe PDF con ReportLab (platypus) + código QR.

Privacidad: el QR apunta solo a la URL pública de la herramienta; NUNCA codifica montos ni renta
(un QR con datos financieros impreso/compartido sería una filtración).
"""
from __future__ import annotations

import io
from typing import List
from xml.sax.saxutils import escape

import qrcode
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.engine.rules import GLOSARIO
from app.schemas import ResultadoSimulacion


def esc(texto: object) -> str:
    """Escapa texto para Paragraph (mini-HTML de ReportLab). Sin esto, un nombre de institución con
    etiquetas rompe el PDF o hace que ReportLab intente cargar recursos (<img src=...>): hallazgo CRIT-001."""
    return escape(str(texto))


def parrafo(texto: object, estilo) -> Paragraph:
    return Paragraph(esc(texto), estilo)


def clp(v: float) -> str:
    return "$" + f"{round(v):,}".replace(",", ".")


def pct(v: float) -> str:
    return f"{v * 100:.2f}%".replace(".", ",")


def _tabla(filas: List[list], anchos=None) -> Table:
    t = Table(filas, colWidths=anchos, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a8a")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 8), ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f1f5f9")]),
    ]))
    return t


def _qr(url: str) -> Image:
    buf = io.BytesIO()
    qrcode.make(url).save(buf, format="PNG")
    buf.seek(0)
    return Image(buf, width=3 * cm, height=3 * cm)


def generar_informe(res: ResultadoSimulacion, url_qr: str = "https://refinancia.cl") -> bytes:
    est = getSampleStyleSheet()
    h1, h2, body = est["Title"], est["Heading2"], est["BodyText"]
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, title="Informe RefinanciaCL", author="RefinanciaCL",
                            leftMargin=2 * cm, rightMargin=2 * cm, topMargin=2 * cm, bottomMargin=2 * cm)
    s: list = [Paragraph("Informe de simulación - RefinanciaCL", h1),
               Paragraph(f"Fecha de cálculo: {res.fecha_calculo} | Renta considerada: {clp(res.renta_considerada)}"
                         + (f" | UF: {clp(res.valor_uf)}" if res.valor_uf else ""), body), Spacer(1, 8)]

    if res.aviso_ofertas:
        s.append(Paragraph(f"<b>Origen de las ofertas ({esc(res.fuente_ofertas)}):</b> {esc(res.aviso_ofertas)}", body))
    for a in res.alertas:
        s.append(Paragraph(f"<b>ALERTA:</b> {esc(a)}", body))
    for m in res.mensajes:
        s.append(parrafo(m, body))

    a = res.situacion_actual
    if a:
        s += [Paragraph("Situación actual", h2), _tabla([
            ["Deuda total", "Cuota mensual", "CAE ponderada", "CTC restante", "% de la renta"],
            [clp(a.deuda_total), clp(a.cuota_total), pct(a.cae_ponderada), clp(a.ctc_restante),
             f"{pct(a.pct_renta_comprometida)} ({a.semaforo})"]])]

    p = res.propuesta
    if p:
        s += [Paragraph("Recomendación", h2), _tabla([
            ["Ahorro total", "Ahorro mensual", "CAE nueva", "Reducción de CAE", "Nueva carga"],
            [clp(p.ahorro_total), clp(p.ahorro_mensual), pct(p.cae_nuevo), pct(p.reduccion_cae),
             f"{pct(p.pct_renta_comprometida)} ({p.semaforo})"]]), Spacer(1, 6)]
        filas = [["Institución", "Monto", "Plazo", "Cuota", "CAE", "CTC", "Intereses+seguros+gastos"]]
        for x in p.prestamos:
            filas.append([x.institucion, clp(x.monto), f"{x.plazo_meses} m", clp(x.cuota), pct(x.cae), clp(x.ctc), clp(x.costo_financiero)])
        s.append(_tabla(filas))
        if p.deudas_fuera:
            s.append(parrafo("Deudas que quedan fuera: " + ", ".join(f"{d.institucion} ({clp(d.cuota)}/mes)" for d in p.deudas_fuera), body))
        s += [Paragraph("Paso a paso", h2), Paragraph(
            "1) Cotiza formalmente cada oferta con la institución y pide la Simulación con CAE y CTC por escrito. "
            "2) Compara con esta simulación. 3) Solicita el prepago/pago de tus deudas actuales con el nuevo crédito "
            "y exige los certificados de deuda pagada. 4) Guarda los contratos y revisa tu derecho a retracto.", body)]

    if res.tarjetas_amortizacion:
        s += [Paragraph("Tarjetas: amortización forzosa a 24 meses (NCG 537)", h2), _tabla(
            [["Tarjeta", "Saldo", "Plazo", "Cuota"]] + [[t.institucion, clp(t.saldo), f"{t.plazo_meses} m", clp(t.cuota)] for t in res.tarjetas_amortizacion])]
    if res.sugerencias:
        s.append(Paragraph("Sugerencias", h2))
        s += [parrafo(f"- {x}", body) for x in res.sugerencias]

    s += [Paragraph("Verificación de reglas", h2), _tabla(
        [["Regla", "Cumple", "Detalle"]] + [[r.regla, "Sí" if r.cumple else "No", parrafo(r.detalle, body)] for r in res.reglas],
        anchos=[1.5 * cm, 1.8 * cm, 13 * cm])]
    s += [Paragraph("¿Qué significan estos términos?", h2)]
    s += [Paragraph(f"<b>{esc(k)}:</b> {esc(v)}", body) for k, v in GLOSARIO.items()]
    s += [Paragraph("Aviso legal", h2), parrafo(res.aviso_retracto, body), parrafo(res.disclaimer, body),
          Paragraph("Enlaces oficiales", h2)]
    s += [parrafo(f"{k}: {v}", body) for k, v in res.enlaces_oficiales.items()]
    s += [Spacer(1, 8), _qr(url_qr), Paragraph("Código QR: abre la herramienta (no contiene tus datos).", body)]
    doc.build(s)
    return buf.getvalue()
