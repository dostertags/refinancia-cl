import io

import pdfplumber

from app.engine.simulator import simular
from app.schemas import SimulacionRequest
from app.services.report_pdf import generar_informe


def texto_pdf(pdf_bytes: bytes) -> str:
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        return "\n".join(p.extract_text() or "" for p in pdf.pages)


def test_informe_incluye_avisos_legales_y_enlaces(perfil, deuda_factory, oferta_factory):
    res = simular(SimulacionRequest(perfil=perfil, deudas=[deuda_factory(), deuda_factory(institucion="B")],
                                    ofertas=[oferta_factory()]))
    txt = texto_pdf(generar_informe(res, url_qr="https://example.org/refinancia"))
    assert "20 días corridos" in txt
    assert "no constituye una oferta de crédito" in txt
    assert "sernac.cl" in txt.lower() and "cmfchile.cl" in txt.lower() and "fogaes" in txt.lower()
    assert "CAE" in txt and "CTC" in txt


def test_informe_para_sobreendeudado_no_muestra_propuesta(perfil, deuda_factory, oferta_factory):
    from app.schemas import Perfil
    p = Perfil(renta_liquida=300_000)
    res = simular(SimulacionRequest(perfil=p, deudas=[deuda_factory(monto_actual=9_000_000)], ofertas=[oferta_factory()]))
    txt = texto_pdf(generar_informe(res, url_qr="https://example.org"))
    assert "sobreendeudado" in txt.lower()
    assert "Ahorro total" not in txt
