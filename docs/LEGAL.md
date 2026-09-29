# Riesgos legales y limitaciones (pendientes de revisión de un abogado)

Este documento lista lo que **no** está resuelto. No es asesoría legal.

## Qué hace el proyecto para reducir riesgo

- Se presenta siempre como **simulación educativa**, no como oferta de crédito ni asesoría financiera (pie de página,
  casilla de consentimiento obligatoria, cada resultado y el PDF). La API rechaza solicitudes sin `acepta_terminos`.
- Declara el origen de las ofertas y advierte cuando son ilustrativas o ingresadas por el usuario.
- No almacena datos financieros del usuario (ver política de privacidad en `/privacidad`).
- Un resultado peor que la situación actual **nunca** se presenta como recomendación (`NO_CONVIENE`).

## Preguntas abiertas (no verificadas)

1. **¿Podría interpretarse como asesoría financiera regulada o requerir inscripción/registro ante la CMF?** No lo sé.
2. **¿Se podría confundir con un prestamista o intermediario?** El texto lo evita, pero la evaluación corresponde a un abogado.
3. **Base legal de los topes** (10× renta, 25%, 24 meses NCG 537, 60 meses, retracto de 20 días): ver [REGULACION.md](REGULACION.md).
4. **Normativa sobre sobreendeudamiento:** el proyecto no ha verificado qué leyes recientes le aplican (por ejemplo, la
   auditoría mencionó la Ley 21.673 y no pude confirmar su contenido).
5. **Protección de datos:** Ley 19.628 y Ley 21.719 (datos personales). Aunque no se almacenan datos, sí se procesan en
   tránsito; falta una evaluación formal (base de licitud, encargado de tratamiento, transferencias internacionales según
   dónde se despliegue).
6. **Scraping del SERNAC:** el scraper respeta `robots.txt`, se identifica y limita su frecuencia, pero no se revisaron los
   términos de uso del sitio ni del servicio Power BI. Confirma permiso antes de ejecutarlo en producción.
7. **Uso indebido:** el PDF podría usarse para aparentar una "aprobación". Mitigaciones: lleva disclaimer visible, las
   ofertas del usuario se marcan como no verificadas y no hay logos ni nombres de instituciones sin origen declarado.
   Riesgo residual: bajo pero no nulo.
8. **Declaración de responsabilidad:** el usuario acepta que sus datos son de su responsabilidad y no verificados.
   Falta revisar su redacción con un abogado.

## Recomendación

No publicar una instancia abierta al público general hasta completar la revisión legal. Publicar el código (MIT) con este
documento es razonable; operar el servicio con usuarios reales requiere resolver los puntos 1, 3, 4 y 5.
