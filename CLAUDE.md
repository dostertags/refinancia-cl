# RefinanciaCL — guía para Claude

Simulador educativo de refinanciamiento (Chile). Backend FastAPI + motor MILP (PuLP), frontend Next.js 14.

## Comandos
- Backend tests: `cd backend && ../.venv/Scripts/python -m pytest` (Windows) — cobertura ≥ 80%.
- Backend dev: `uvicorn app.main:app --reload` (en `backend/`).
- Frontend: `cd frontend && npm test | npm run build | npm run dev`.

## Arquitectura
`schemas.py` (Pydantic) → `engine/simulator.py` (reglas R1–R6, casos borde) → `engine/optimizer.py` (MILP + cascada) →
`engine/finance.py` (cuota, CAE por TIR, CTC). API en `main.py`; PDF en `services/report_pdf.py`;
scrapers en `scrapers/` (parte pura testeada, Playwright sin probar en vivo).

## Convenciones
- Tasas = fracciones mensuales (0.02 = 2%). Montos en CLP float; UF se convierte al inicio del simulador.
- Textos de usuario y comentarios en español de Chile. Dudas legales: `# TODO: verificar con abogado`.
- **Nunca** cálculos financieros con LLM. **Nunca** persistir renta/deudas ni loguear cuerpos de solicitud.
- TDD: test primero (RED), implementación mínima (GREEN), refactor.
- Entorno local: Python 3.10 (el proyecto apunta a 3.11+; evitar sintaxis 3.11-only).
- En Windows, heredocs bash con acentos/comillas fallaron: usar la herramienta Write para archivos.

## Actualización (auditoría)
- Config en `backend/app/config.py` (topes, límites, tiempos). Middlewares en `app/middleware.py`.
- Seguridad: escapar SIEMPRE texto de usuario en `report_pdf` (`esc`/`parrafo`); nunca devolver `input` en errores 422.
- Tests aíslan la BD en `tests/conftest.py`. Suite: `pytest -o addopts="" -W ignore` (147 tests).
- Frontend: Next 16 / React 19, `npm run lint` usa eslint flat config; tests con jsdom + Testing Library.
- Doc legal/regulatoria: `docs/`. Nada verificado por abogado.
