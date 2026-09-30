# Datos reales del SERNAC

Fuente: Comparador de créditos de consumo del SERNAC (informe público Power BI), https://www.sernac.cl/portal/619/w3-article-84607.html

## Cómo se obtienen
Una sola petición POST al endpoint `querydata` del informe con su clave de recurso pública (extraída de la página). Sin navegador ni Playwright.

```bash
cd backend
python -m app.scrapers.sernac_powerbi --salida ../renegociacl/public/rates.json app/data/sernac_simulaciones.json
```

Escribe el mismo documento (esquema v2) para RenegociaCL y para RefinanciaCL, de forma atómica y solo si pasa la validación (>= 100 simulaciones, con fecha).

## Cortesía y robustez
- User-Agent propio (`SCRAPER_USER_AGENT`); una petición por ejecución; `.github/workflows/tasas.yml` corre 1 vez al día en baja demanda (el SERNAC actualiza cada mes).
- Descarta filas imposibles (CAE, tasa > 6 % mensual, CTC incoherente) y las lista en `descartadas`.
- Si el informe cambia de estructura, la validación falla y **no se sobrescribe** lo guardado.
- Los datos de más de 40 días generan un aviso en la app.

## Antes de automatizar
Revisa los términos de uso del SERNAC. Los datos son referenciales. Ver [CIFRAS.md](CIFRAS.md).
