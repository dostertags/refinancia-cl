# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [0.4.1] — Tarjetas y cálculo completo (RenegociaCL)

- Se puede calcular solo con tarjetas (sin crédito de consumo). Una tarjeta incompleta ya no se ignora: se muestra un error que dice qué falta.
- "Ver cómo se calcula" muestra todos los meses con totales; las opciones del SERNAC traen el desglose capital + intereses + comisiones + seguros.
- El titular de la tasa más competitiva coincide con el rango publicado. Nuevo barrido de 1.500 casos de consistencia (254 tests).

## [0.4.0] — Tasas de mercado reales y auditoría de cifras

- **Se eliminó la tasa "0,97 % mensual"**: era una meta hipotética sin fuente. Ya no se inventan tasas.
- Las tasas de mercado vienen del comparador oficial del SERNAC (870 simulaciones, 13 instituciones), con fuente, fecha y enlace visibles; se destaca la tasa más competitiva y se ordena por CTC.
- Nuevo scraper `sernac_powerbi` (una petición HTTP) y flujo `tasas.yml`. Se quitaron Playwright, base de datos, Redis y las ofertas de ejemplo.
- Afirmaciones legales corregidas: "24 meses NCG 537" es un supuesto de la herramienta; retracto sin "20 días"; 10× renta y 25 % son criterios de la herramienta. Ver `docs/CIFRAS.md`.
- RenegociaCL abre en modo oscuro por defecto.

## [0.3.0] — Tasa opcional y tarjetas que se suman al refinanciamiento

Aplica a los dos proyectos (RenegociaCL y RefinanciaCL).

- **La tasa de interés ya no es obligatoria.** Crédito: saldo y cuota obligatorios, más **tasa o meses restantes (al menos uno)**; la que falta se calcula.
- **Tarjetas:** saldo obligatorio, más **pago mensual o tasa (al menos uno)**; lo que falte se calcula suponiendo pago en 24 meses (norma CMF) y se le avisa a la persona. Sin ninguno de los dos no se inventa nada.
- **El total de las tarjetas se suma a la deuda a refinanciar** (`Deuda a refinanciar = crédito + tarjetas incluidas`) y se muestra con su desglose.
- **Casilla "Incluir en el refinanciamiento"** por deuda (marcada por defecto). Lo desmarcado sigue igual, cuenta en lo que pagas hoy y en la cuota nueva, y ocupa parte del tope de cuota.
- RenegociaCL: hasta 3 tarjetas, aviso si conviene dejar una tarjeta barata fuera, y datos de tarjeta sin saldo se avisan en vez de ignorarse.
- RefinanciaCL: nuevo módulo `engine/deudas.py`, esquema con validación en español y sin eco de datos, `supuestos`, `total_a_refinanciar`, `partes_refinanciar` y `excluidas` en la respuesta.
- **Cada campo dice "Obligatorio", "Una de las dos" u "Opcional"** (visible y leído por lectores de pantalla) y un cuadro "Qué necesitas" explica las reglas antes de llenar el formulario.
- Tests: RenegociaCL 205, RefinanciaCL backend 177 (92% de cobertura) y frontend 35.

## [0.2.0] — Correcciones de la auditoría

### Seguridad y privacidad
- **PDF:** todo texto del usuario se escapa antes de `Paragraph` (antes: error 500 y SSRF vía `<img src=...>`).
- API sin bloqueo del event loop (solver en hilo, concurrencia acotada), **rate limit por IP** (429 + `Retry-After`),
  límites de 30 deudas y 20 ofertas, cabeceras de seguridad (CSP, nosniff, DENY, no-store), HTTPS forzado opcional con HSTS.
- Errores 422 en español y **sin devolver el valor enviado**.
- Tests con valores centinela verifican que renta/deudas no llegan a BD ni logs; tests de inyección SQL/XSS.
- Frontend actualizado a Next 16 / React 19: `npm audit` sin vulnerabilidades (antes 1 crítica y 1 alta).
- `docker-compose` exige `POSTGRES_PASSWORD`; healthcheck; `.env.example`.

### Correcciones financieras y regulatorias
- Resultados declaran el **origen de las ofertas** (`fuente_ofertas`, `aviso_ofertas`); las ofertas ilustrativas y las del
  usuario se advierten en UI y PDF; el cliente no puede hacerse pasar por SERNAC.
- **R3 completa:** cuota mínima de tarjeta = mayor entre amortización a 24 meses e intereses + comisiones; tarjetas dejadas
  fuera pagan al menos ese mínimo; la regla se verifica sobre el resultado real.
- **R7 (60 meses)** visible en la verificación de reglas y con aviso cuando se recorta un plazo.
- **Coherencia de datos:** `DATOS_INCONSISTENTES` si la cuota no calza con monto, tasa y plazo (antes: ahorros falsos).
- **CAE actual** calculada por TIR de flujos reales (misma vara que la CAE nueva); se explica cuando el ahorro viene de
  pagar más rápido y cuando la cuota mensual sube.
- `NO_CONVIENE` ya no entrega una propuesta peor que la actual.
- Alertas: carga actual > 25%, deudas en UF sin reajuste, ingresos adicionales no verificados, cuota de tarjeta bajo el mínimo.
- Deuda de monto $0 → mensaje educativo. Semáforo: verde estrictamente < 15%.
- Modo **"menor cuota posible"** (`objetivo="cuota"`, opción de tarjetas > 24 meses).
- Textos legales: los topes se declaran "criterios de esta herramienta"; consentimiento expreso obligatorio (UI y API).

### Rendimiento
- Grilla de plazos reducida y `gapRel` en CBC: 20 deudas × 8 ofertas pasó de 11,3 s a < 1 s.

### Scraper
- User-Agent propio, robots.txt, reintentos con backoff, validación de rangos, rechazo de lotes chicos, soporte de grilla
  ARIA, ofertas obsoletas descartadas, límite de frecuencia. **Sigue sin probarse contra el sitio real.**
- El benchmark CMF ya no devuelve una cifra inventada (`null`).

### Frontend
- Glosario de CAE/CTC/retracto/NCG 537, explicación "¿Y ahora qué hago?", etiquetas asociadas (accesibilidad),
  gráficos separados, disclaimers legibles, mensajes de error de la API en español.
- 21 tests de componentes y E2E Playwright escrito (no ejecutado).

### Documentación
- `docs/REGULACION.md`, `docs/LEGAL.md`, `docs/SERNAC_DATOS_REALES.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`.

## [0.1.0] — Versión inicial
Motor MILP, API, PDF, frontend de 4 pasos, scraper base, Docker y CI.
