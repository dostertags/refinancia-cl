# RefinanciaCL

## Descripción

Este repositorio reúne dos herramientas gratuitas y de código abierto para ayudar a personas en Chile a entender y reducir el costo de sus deudas. **RefinanciaCL** es un simulador de refinanciamiento de créditos de consumo y tarjetas: calcula tu carga financiera, verifica reglas de endeudamiento y usa optimización matemática para encontrar la combinación de ofertas que minimiza el costo total o la cuota mensual. **RenegociaCL** es una calculadora simple de una sola página, publicada en renegociacl.web.app: ingresas cuánto debes, tu cuota y tu tasa, y te muestra opciones ordenadas por ahorro en pesos y meses, con gráficos, paso a paso y modo oscuro. Todo el cálculo de RenegociaCL ocurre en tu dispositivo, sin registro ni seguimiento. Son simulaciones educativas: no constituyen ofertas de crédito ni asesoría financiera, y sus reglas legales aún requieren revisión de un abogado. El código incluye pruebas automatizadas, documentación regulatoria y licencia MIT.

Simulador **educativo y open source (MIT)** que ayuda a personas naturales en Chile a ver si les conviene refinanciar sus
créditos de consumo y tarjetas. Calcula tu situación actual (CAE, CTC, carga financiera), valida reglas de endeudamiento
y busca, con programación lineal entera mixta (PuLP/CBC), la combinación de ofertas que minimiza el costo total **o** la
cuota mensual. Todos los cálculos son código determinista; ningún LLM toca los números.

> **Esta simulación no constituye una oferta de crédito ni es asesoría financiera.** Las condiciones finales dependen de
> la evaluación de cada institución. Lee [docs/LEGAL.md](docs/LEGAL.md) antes de publicar o usar con personas reales.

## Estado del proyecto (leer primero)

| Área | Estado |
|---|---|
| Motor de optimización, reglas R1–R7, cascada de relajación, modo "menor cuota" | Implementado, 177 tests de backend (92% de cobertura) |
| API FastAPI: sin estado, rate limit, cabeceras de seguridad, límites de entrada, errores sin eco de datos | Implementado y con tests de seguridad |
| PDF (ReportLab, texto escapado, QR sin datos), sin base de datos | Implementado y con tests |
| Frontend Next.js 16 (4 pasos, consentimiento, glosario, gráficos, móvil) | Compila, lint limpio, 35 tests de componentes; probado a mano en móvil (375 px) contra la API real |
| E2E Playwright (`frontend/e2e`) | Escrito, **no ejecutado** en este entorno (requiere `npx playwright install chromium`) |
| Scraper SERNAC (Power BI `querydata`, una petición HTTP) | Obtiene las simulaciones públicas del comparador, las valida y las guarda; probado con fixtures y ejecutado en vivo (870 simulaciones, 2026-09-29). Ver [docs/SERNAC_DATOS_REALES.md](docs/SERNAC_DATOS_REALES.md) |
| TIP/TMC de la CMF | **Pendiente** (requiere API key personal); no se inventan cifras |
| Subida de cartola PDF, score ML | No implementado |
| Docker, compose, CI | Escritos; **no se ejecutaron** `docker build` ni los workflows en este entorno |
| Base legal de topes y retracto | **Sin verificar por un abogado** (ver [docs/REGULACION.md](docs/REGULACION.md)) |

Las tasas de mercado salen **solo** de las simulaciones oficiales del comparador del SERNAC (fuente y fecha se muestran en la app). Si no hay datos, la app lo dice y no inventa tasas. Auditoría de cada cifra: [docs/CIFRAS.md](docs/CIFRAS.md).

## Privacidad (decisión de diseño)

El motor (PuLP/CBC) corre en el backend, por lo que los datos viajan a la API por HTTPS. Para minimizar el riesgo: la API
es **sin estado** (procesa en memoria y responde), no registra cuerpos de solicitud, los errores de validación no
devuelven el valor enviado, no hay cookies ni analytics, y la base de datos solo guarda datos públicos (ofertas, UF/UTM).
Hay tests que ejecutan una simulación con valores centinela y verifican que no aparezcan en BD ni logs. El QR del PDF
apunta a la herramienta y no contiene datos. Portar el motor al navegador (TS/WASM) lo llevaría a 100% cliente
(ver "Próximos pasos"). Política completa: `/privacidad`.

## Reglas de negocio

| Regla | Implementación | Comportamiento |
|---|---|---|
| R1 Deuda total ≤ 10× renta | `simulator.py`, `optimizer.py` (con comisiones) | Si se supera: alerta CMF, sin refinanciamiento, sugiere aval/codeudor + CMF/FOGAES |
| R2 Cuota ≤ 25% renta | MILP + alerta si la carga **actual** ya lo supera | Restricción dura; si no cabe, cascada y sugerencias |
| R3 Tarjetas en 24 meses (supuesto de la herramienta) | MILP; `finance.cuota_minima_tarjeta` (mayor entre amortización 24 m e intereses + comisiones); tarjetas dejadas fuera pagan al menos ese mínimo | Se verifica sobre el resultado real, no solo la bandera de la cascada |
| R4 CAE/CTC siempre | `Prestamo`, PDF, UI | CAE por TIR, CTC, cuota, intereses+seguros+gastos; CAE actual con la misma vara |
| R5 Aviso de retracto (sin plazo único afirmado) | `rules.AVISO_RETRACTO` | En cada resultado, UI y PDF |
| R6 No es oferta + consentimiento | `rules.DISCLAIMER`, casilla obligatoria, la API exige `acepta_terminos` | En cada resultado, UI y PDF |
| R7 Plazo máx. 60 meses (consumo) | `config.PLAZO_MAX_CONSUMO_MESES` | Se recorta y se avisa; aparece en la verificación de reglas |

Los topes son configurables (`.env.example`). Cascada sin solución: (1) tarjetas a más de 24 meses, (2) dejar deudas fuera,
(3) sugerir renta mínima, (4) alerta de sobreendeudamiento crítico. Además: datos incoherentes (cuota que no calza con
monto, tasa y plazo) → `DATOS_INCONSISTENTES` sin calcular ahorro; si refinanciar cuesta más → `NO_CONVIENE` sin propuesta.

Supuestos del modelo: cuota francesa; seguro como tasa mensual plana sobre el monto inicial; comisión fija por crédito
(varias deudas pueden consolidarse en un crédito y pagan una sola); plazos 6/12/18/24/36/48/60; el ahorro es nominal
(sin valor del dinero en el tiempo); deudas en UF usan la UF de hoy sin reajuste (se advierte).

## Estructura

```
backend/app/  config.py · schemas.py · main.py · middleware.py
  engine/     finance.py · rules.py · optimizer.py (MILP) · simulator.py
  scrapers/   sernac.py · robustez.py · pdf_boletines.py · indicadores_parser.py
  services/   offers.py · indicadores.py · report_pdf.py
  db/         models.py · session.py
backend/tests/  unitarios, integración, seguridad, scraper
frontend/       Next.js 16 · Tailwind · Recharts · react-hook-form + zod · tests/ · e2e/
docs/           REGULACION.md · LEGAL.md · SERNAC_DATOS_REALES.md
```

## Instalación

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload                          # http://localhost:8000/docs

# Frontend
cd frontend && npm install && npm run dev              # http://localhost:3000

# Todo con Docker
cp .env.example .env
docker compose up --build
```

Variables de entorno documentadas en [`.env.example`](.env.example). Actualizar tasas: `cd backend && python -m app.scrapers.sernac_powerbi --salida ../renegociacl/public/rates.json app/data/sernac_simulaciones.json`.

## API

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/simular` | Simulación sin estado. Requiere `acepta_terminos: true`. `objetivo`: `"costo"` (defecto) o `"cuota"`; `tarjetas_mas_de_24` |
| POST | `/api/informe` | Igual, devuelve el PDF |
| GET | `/api/ofertas` | Ofertas vigentes y aviso de origen |
| GET | `/api/indicadores` | UF/UTM del día (mindicador.cl) |
| POST | `/api/admin/scrape` | Dispara el scraper (`X-Admin-Token`; máx. 1 cada 20 h) |

Límites: 30 deudas, 20 ofertas, 30 solicitudes/min por IP. Las ofertas enviadas por el cliente se marcan como
`fuente: "usuario"` (nunca pueden hacerse pasar por SERNAC).

## Tests

```bash
cd backend && pytest                 # 177 tests, cobertura ≥ 80% (CI la exige)
cd frontend && npm test              # 35 tests (vitest + Testing Library)
cd frontend && npm run e2e           # Playwright (requiere ambos servidores y chromium)
```

Desarrollado con TDD: los tests fallaban (RED) antes de cada corrección. Una auditoría independiente previa encontró 8
hallazgos críticos; el historial está en [CHANGELOG.md](CHANGELOG.md).

## Limitaciones conocidas

- Las ofertas del SERNAC no informan comisiones ni seguros: el CAE/CTC de esas ofertas puede estar subestimado (se avisa).
- Ahorro nominal, sin descontar por tiempo; sin reajuste de UF; seguro sobre monto inicial.
- La renta e ingresos adicionales son autodeclarados y no se verifican.
- No sustituye la cotización formal ni la evaluación de riesgo de cada institución.
- Probado localmente con Python 3.10; el objetivo y el CI son 3.11+.
- `npm audit` sin vulnerabilidades en dependencias de producción; quedan 2 avisos moderados en herramientas de desarrollo (vitest/esbuild).

## Próximos pasos (v2)

1. **Motor 100% en el cliente** (TS/HiGHS-WASM) para que ninguna cifra salga del navegador.
2. **Validar el scraper contra el sitio real**, agregar Fuente 3 (CMF) y descubrimiento de boletines PDF, con alertas si cambia el DOM.
3. **Lectura de cartolas PDF** (pdfplumber + spaCy) con confirmación del usuario, procesando en memoria.
4. **Revisión legal** de los `TODO: verificar con abogado`, comisiones porcentuales y seguro sobre saldo insoluto.
5. **Ejecutar E2E y auditoría de accesibilidad (WCAG)** en CI, más un score de elegibilidad opcional.

## Contribuir y licencia

Ver [CONTRIBUTING.md](CONTRIBUTING.md) y [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Licencia MIT (`LICENSE`).
