# RenegociaCL

Calculadora de una sola página para renegociar un crédito en Chile. Ingresas cuánto debes, tu cuota y tu tasa mensual; te
muestra de 3 a 5 opciones ordenadas por beneficio, en pesos y meses. Todo se calcula en el navegador: no hay backend, ni
registro, ni cookies de seguimiento.

> Simulación educativa: no es una oferta de crédito ni asesoría financiera.

## Qué calcula

- **Pagar menos intereses:** bajar la tasa manteniendo tu cuota (terminas antes), misma cantidad de meses con menor cuota, o
  subir un poco tu cuota sin renegociar nada.
- **Bajar mi cuota:** menor tasa con el mismo plazo, o alargar a 36/48/60 meses (te dice cuánto más pagas en total).
- **Tarjeta (opcional):** compara su tasa con la de tu crédito y calcula cuánto ahorrarías pasándola a un crédito más barato.
- Las tasas menores que muestra son **metas para negociar** (−15%, −25%, −35% de tu tasa) salvo que ingreses ofertas reales
  que te hayan dado; en ese caso usa esas, con sus gastos.

Supuestos: cuota fija (sistema francés), plazo máximo de 60 meses (consumo), ahorro nominal, sin comisiones salvo las que
ingreses. `# TODO: verificar con abogado` los topes de 60 meses y 24 meses de tarjeta (NCG 537).

## Tasas de mercado (CMF, SERNAC, bancos)

El navegador **no puede** consultar la CMF ni el comparador del SERNAC directamente (CORS, y el SERNAC usa Power BI). Por eso
la app lee `public/rates.json`, un archivo estático. Hoy está **vacío** (la app no inventa tasas y lo avisa):

```json
{ "actualizado": "2026-09-28", "fuente": "SERNAC", "ofertas": [ { "institucion": "Banco X", "tasaMensual": 0.0139 } ] }
```

Para tenerlo "en vivo", actualiza ese archivo con un proceso programado (por ejemplo el scraper del proyecto
`../backend/app/scrapers/sernac.py`, aún no probado contra el sitio real) y vuelve a desplegar.

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # 159 tests (matemática, formato, enlaces, contraste, interfaz)
npm run lint
```

## Cómo se verificó la matemática

`tests/matematica.test.ts` contrasta el motor contra una implementación de referencia independiente que imita a un banco
(cuota entera, interés redondeado al peso cada mes, última cuota ajustada): meses iguales y diferencia de total menor a
$0,5 por mes (menos de $250 en un crédito a 30 años). También prueba tasa 0%, plazos largos, abonos parciales, monotonía
(más cuota → menos meses y total), invariantes de la tabla de amortización y el CAE por TIR con gastos.

**No se contrastó con calculadoras reales de bancos, la CMF ni el SII** (no hay acceso a ellas desde el proyecto): antes de
prometer cifras exactas, compara 2 o 3 casos con la tabla de amortización de tu propio crédito.

## Funciones

Formato automático de pesos (entiende `$3.000.000,00`), tasa por mes o por año, ayudas "?" con teclado, gráficos con los
valores escritos, paso a paso de cada opción, fuentes y fecha de las tasas, aviso de resultados desactualizados, modo oscuro,
guardar como PDF (imprimir), enlace para compartir (los datos van en el fragmento `#d=`, que no llega a ningún servidor, pero
quien recibe el enlace los ve), comparación de hasta 3 créditos, preguntas frecuentes y abono único opcional.

## Lo que NO se incluyó (a propósito)

- **Analítica de qué créditos se buscan:** contradice la promesa de que los datos no salen del dispositivo. Si se quisiera,
  debería ser un contador anónimo y agregado, avisado en pantalla y con aceptación previa.
- **Logos de bancos:** no hay permiso de uso y sugerirían un respaldo que no existe.
- **Arrastrar y soltar para comparar:** se reemplazó por botones, que funcionan con teclado y lector de pantalla.
- **Contraste con calculadoras oficiales** (ver arriba) y pruebas en iPhone/Android reales (solo se probó a 375 px en el navegador).

## Despliegue en Firebase Hosting (proyecto `renegociacl`)

```bash
firebase login          # una vez
npm run deploy          # build estático (carpeta out/) + firebase deploy --only hosting
```

Queda en https://renegociacl.web.app. `firebase.json` agrega cabeceras de seguridad (CSP, HSTS, nosniff).
