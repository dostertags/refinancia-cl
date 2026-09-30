# Contexto regulatorio (Chile) y qué está verificado

> **Aviso:** este documento describe las reglas que el proyecto implementa y su origen. **Ninguna ha sido validada por un
> abogado.** No es asesoría legal. Antes de usar la herramienta con público real, pide una revisión legal.

## Reglas implementadas y su origen

| Regla | Origen | Estado de verificación |
|---|---|---|
| R1: deuda total ≤ 10× renta líquida | Definida en el enunciado del proyecto | **No verificada**: no consta como norma vigente; se trata como *criterio de la herramienta* |
| R2: cuota total ≤ 25% de la renta | Definida en el enunciado del proyecto | **No verificada**: *criterio de la herramienta* |
| R3: tarjetas en 24 meses | **Supuesto de la herramienta**. La NCG 537 (CMF, 2025) regula el pago mínimo (monto no financiable + 5 % del financiable), no un plazo de 24 meses | La atribución anterior a la NCG 537 era incorrecta y se eliminó |
| R4: mostrar siempre CAE y CTC | Práctica de información al consumidor (SERNAC financiero) | Razonable; falta citar artículo exacto |
| R5: aviso de retracto | El SERNAC informa 10 días en varios casos; el plazo depende del contrato | **No verificada** para repactaciones; ya no se afirma "20 días" |
| R6: no es oferta de crédito; consentimiento expreso | Decisión de producto | Prudencia; no sustituye asesoría legal |
| R7: plazo máx. 60 meses en consumo | Indicado por el dueño del proyecto | **No verificada**: puede ser práctica bancaria y no un tope legal |

Todos los topes son configurables por variables de entorno (`.env.example`) y están marcados con
`# TODO: verificar con abogado` en el código.

## Definiciones usadas

- **CAE**: TIR mensual de los flujos reales (monto recibido menos comisión al inicio, cuotas mensuales), anualizada
  `(1+i)^12 − 1`. Se calcula por bisección.
- **CTC** (en esta herramienta): total pagado = Σ cuotas + gastos iniciales. `costo_financiero = CTC − monto`.
- **Carga financiera**: Σ cuotas / renta líquida. Semáforo: verde < 15%, amarillo 15–25%, rojo > 25%.

## Preguntas legales abiertas

Ver [LEGAL.md](LEGAL.md).
