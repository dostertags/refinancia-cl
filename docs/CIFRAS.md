# Auditoría de cifras y de su fuente

Cada número que muestra RefinanciaCL / RenegociaCL, de dónde sale y qué tan verificado está. Nada de esto fue revisado por un abogado.

## 1. Tasas de mercado (lo que antes era "0,97 % mensual")

- **La cifra 0,97 % mensual NO tenía fuente**: era un valor inventado (meta hipotética) y se eliminó. La herramienta ya no genera tasas hipotéticas.
- **Fuente actual**: Comparador de créditos de consumo del SERNAC (informe público en Power BI, https://www.sernac.cl/portal/619/w3-article-84607.html). Cada institución informa sus simulaciones al SERNAC.
- Obtención: `python -m app.scrapers.sernac_powerbi` (una sola petición al endpoint público del informe, con su clave de recurso pública). Reproducible; el flujo `.github/workflows/tasas.yml` lo repite a diario y solo guarda si hay cambios.
- Datos al 2026-09-29: 870 simulaciones válidas, 13 instituciones (bancos, cooperativas, CCAF), 78 filas descartadas por ser imposibles (p. ej. CAE menor a 0,8 × 12 × tasa, tasa > 6 % mensual, CTC ≠ cuota × cuotas).
- Se muestra la tasa **más baja** publicada y se ordena por **CTC** (costo total), no por CAE, porque cada institución calcula el CAE de forma distinta (`nota_cae` en el JSON).
- Escalado: las cuotas y el CTC se escalan linealmente al monto del usuario desde la simulación publicada más cercana (tolerancia máx(1 M, 25 %)); no se extrapola más allá. Es una aproximación.
- Pendiente: TIP/TMC de la CMF (requiere API key personal que debe registrar el usuario) y tasas directas de sitios de bancos (sin fuente pública estable).

## 2. Plazos y topes

| Cifra | Origen | Estado |
|---|---|---|
| 60 meses máximo en consumo | Plazo máximo publicado en el comparador SERNAC | Criterio de la herramienta; no verificado como norma |
| 24 meses en tarjetas | **Supuesto de la herramienta** para calcular pagos/tasas | La NCG 537 (CMF, 2025) regula la fórmula del pago mínimo (monto no financiable + 5 % del financiable), no un plazo de 24 meses |
| 10 × renta (sobreendeudamiento) | Criterio de la herramienta | No es norma de la CMF |
| 25 % de la renta como tope de cuota | Criterio de la herramienta | No es norma |
| Retracto | El SERNAC informa 10 días en varios casos; el "20 días" anterior no se pudo verificar y se eliminó | TODO: verificar con abogado |
| Semáforo de carga financiera 15 % / 25 % | Criterio de la herramienta | Educativo |

## 3. Cálculos

Cuota francesa, TIR para CAE y CTC son fórmulas estándar (`engine/finance.py`, `lib/amortizacion.ts`), con tests. No participa ningún LLM. UF/UTM vienen de mindicador.cl cuando hay conexión.

## 4. Limitaciones conocidas

- Las simulaciones del SERNAC son referenciales: no son ofertas ni garantizan aprobación.
- Los datos pueden tener hasta ~1 mes de antigüedad; la app avisa si superan 40 días.
- Los seguros/comisiones varían por institución; se comparan con y sin seguro de desgravamen.
