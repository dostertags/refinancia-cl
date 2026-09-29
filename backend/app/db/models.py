"""Modelos SQLAlchemy. IMPORTANTE (privacidad): NO existe tabla de usuarios, rentas ni deudas.

Solo se persisten datos públicos de mercado: ofertas, indicadores y bitácora de scraping.
Cifrado en reposo: se delega al motor (PostgreSQL con disco/volumen cifrado, o pgcrypto);
TODO: documentar la configuración de cifrado del proveedor de despliegue elegido.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, Integer, String, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def _ahora() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)  # UTC naive, sin utcnow() obsoleto


class Base(DeclarativeBase):
    pass


class OfertaDB(Base):
    __tablename__ = "ofertas"
    __table_args__ = (UniqueConstraint("institucion", "fuente", name="uq_oferta_inst_fuente"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    institucion: Mapped[str] = mapped_column(String(120), index=True)
    tasa_mensual: Mapped[float] = mapped_column(Float)
    plazo_max_meses: Mapped[int] = mapped_column(Integer)
    comision: Mapped[float] = mapped_column(Float, default=0)
    seguro_desgravamen: Mapped[float] = mapped_column(Float, default=0)
    monto_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    fuente: Mapped[str] = mapped_column(String(30), default="sernac")
    comision_conocida: Mapped[bool] = mapped_column(Boolean, default=True)
    actualizado: Mapped[datetime] = mapped_column(DateTime, default=_ahora)


class BoletinHistoricoDB(Base):
    """Histórico de tasas extraídas de boletines PDF del SERNAC."""
    __tablename__ = "boletines_historico"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    periodo: Mapped[str] = mapped_column(String(20), index=True)
    institucion: Mapped[str] = mapped_column(String(120))
    tasa_mensual: Mapped[float] = mapped_column(Float)
    origen_url: Mapped[str] = mapped_column(String(500), default="")


class IndicadorDB(Base):
    __tablename__ = "indicadores"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    fecha: Mapped[str] = mapped_column(String(10), unique=True)
    uf: Mapped[float] = mapped_column(Float)
    utm: Mapped[float | None] = mapped_column(Float, nullable=True)


class TasaSistemaDB(Base):
    """Tasa promedio ponderada del sistema (benchmark CMF)."""
    __tablename__ = "tasas_sistema"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    fecha: Mapped[str] = mapped_column(String(10), index=True)
    producto: Mapped[str] = mapped_column(String(60))
    tasa_mensual: Mapped[float] = mapped_column(Float)


class ScrapeRunDB(Base):
    __tablename__ = "scrape_runs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    inicio: Mapped[datetime] = mapped_column(DateTime, default=_ahora)
    fuente: Mapped[str] = mapped_column(String(30))
    ok: Mapped[int] = mapped_column(Integer, default=0)
    filas: Mapped[int] = mapped_column(Integer, default=0)
    detalle: Mapped[dict] = mapped_column(JSON, default=dict)
