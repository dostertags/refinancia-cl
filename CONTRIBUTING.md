# Guía para contribuir

¡Gracias por ayudar! Este proyecto maneja temas financieros sensibles: la prioridad es **no dañar a los usuarios**.

## Principios innegociables
1. **Nada de cálculos financieros con LLM**: todo es código determinista y testeado.
2. **Privacidad primero**: no persistir ni loguear renta, deudas ni datos personales. Sin cookies de seguimiento ni analytics.
3. **Nunca presentarlo como oferta de crédito ni asesoría.** No quites ni escondas disclaimers.
4. **No inventes datos**: si una fuente no está disponible, devuelve `null`/aviso, no una cifra.
5. Dudas legales: marca `# TODO: verificar con abogado` y documenta en `docs/REGULACION.md`.

## Flujo de trabajo (TDD)
1. Abre un issue describiendo el problema o mejora.
2. Escribe primero el test y comprueba que **falla por la razón correcta** (RED).
3. Implementa lo mínimo para que pase (GREEN); luego refactoriza.
4. Cobertura mínima 80% (el CI la exige).

```bash
cd backend && pip install -r requirements-dev.txt && pytest
cd frontend && npm install && npm test && npm run lint && npm run build
```

## Convenciones
- Español de Chile en textos de usuario y comentarios. Tasas como fracciones mensuales (0.02 = 2%).
- Parámetros regulatorios en `backend/app/config.py`, nunca "números mágicos" dispersos.
- Python con type hints; Pydantic en los bordes; sin lógica financiera en el frontend.
- Los scrapers separan la parte pura (parseo, testeable) de la navegación.

## Pull requests
Describe qué cambia y por qué, adjunta la salida de los tests y menciona si tocas reglas regulatorias.
Reportes de seguridad: abre un aviso privado de seguridad en GitHub en vez de un issue público.
