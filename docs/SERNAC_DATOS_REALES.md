# Cómo conectar datos reales del SERNAC

> Estado: el scraper **nunca se probó contra el sitio real**. Trátalo como un punto de partida.

## 1. Requisitos

```bash
pip install -r backend/requirements.txt
playwright install chromium
```

## 2. Antes de ejecutarlo

- Revisa los términos de uso del SERNAC y de Power BI, y confirma que puedes automatizar la consulta.
- Define `SCRAPER_USER_AGENT` con un contacto real (`.env.example`).
- Ejecútalo en horario de baja demanda (el workflow `scrape.yml` corre a las 07:00 UTC, ~03:00–04:00 en Chile).

## 3. Cortesía y robustez ya implementadas

| Medida | Dónde |
|---|---|
| User-Agent propio con contacto | `config.SCRAPER_USER_AGENT` |
| Respeta `robots.txt` (aborta si no permite) | `robustez.permitido_por_robots` |
| Máx. 1 scrape cada 20 h (429 si se repite) | `POST /api/admin/scrape` |
| Reintentos con backoff exponencial (5 s, 10 s) | `robustez.con_reintentos` |
| `wait_for_selector` 30 s en iframe y tabla | `sernac.scrape_sernac` |
| Rechaza tasas fuera de 0–6% mensual | `sernac.normalizar_filas` |
| Rechaza lotes con < 3 ofertas (posible cambio de layout) y **no sobrescribe** lo guardado | `robustez.validar_lote` |
| Ofertas de más de 3 días se descartan y vuelve la semilla ilustrativa (con aviso) | `offers.obtener_ofertas` |

## 4. Ejecución

```bash
export ADMIN_TOKEN=un-valor-largo-y-aleatorio
curl -X POST http://localhost:8000/api/admin/scrape -H "X-Admin-Token: $ADMIN_TOKEN"
curl http://localhost:8000/api/ofertas        # verifica fuente "sernac"
```

## 5. Si el layout cambia

1. Abre el comparador con DevTools y revisa cómo renderiza Power BI la tabla (`<table>` o grilla ARIA
   `role="row"/"gridcell"`, ambas soportadas por `extraer_filas_html`).
2. Ajusta `_TablaParser` / los nombres de columnas (`institucion`, `tasa`, `plazo`) en `sernac.py`.
3. Agrega un HTML de ejemplo a `tests/test_scraper_hardening.py`.
4. Power BI virtualiza filas: si hay más filas que las visibles falta scroll incremental (`TODO` en el código).

## 6. Limitaciones de los datos

El comparador no informa comisiones ni seguros: esas ofertas quedan con `comision_conocida=False` y el resultado
advierte que el CAE/CTC reales pueden ser mayores. Si el comparador no informa plazo, se asume el máximo permitido (60 meses).
